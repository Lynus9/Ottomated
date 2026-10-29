// Browser integration checks using Node's built-in CDP client. No test dependencies.
// Every non-local request is intercepted; Formspree never receives a submission.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { verifyProcess } from './process.mjs';

if (typeof WebSocket === 'undefined') throw new Error('Browser tests require Node.js 22 or newer.');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.preview', 'contact-tests');
await mkdir(output, { recursive: true });
const candidates = [process.env.BROWSER_EXECUTABLE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
let executable;
for (const path of candidates) { try { await access(path); executable = path; break; } catch {} }
assert.ok(executable, 'Install Edge/Chrome or set BROWSER_EXECUTABLE to its full path.');
for (const file of ['public/contact.js', 'public/process.js', 'scripts/serve.mjs']) {
  assert.equal(spawnSync(process.execPath, ['--check', file], { cwd: root }).status, 0, `${file} parses`);
}

const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
let ws;
let send;
const report = [];
const calls = [];
const exceptions = [];
let mock = { status: 200, body: { ok: true } };
let held;
try {
  const [startup] = await once(server.stdout, 'data');
  const origin = startup.toString().match(/http:\/\/localhost:\d+/)?.[0];
  assert.ok(origin, 'Local server started');
  const profile = join(output, `browser-${process.pid}`);
  browser = spawn(executable, ['--headless', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
  }
  assert.ok(port, 'Headless browser started (sandbox restrictions may require permission).');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await once(ws, 'open');
  let id = 0;
  const pending = new Map();
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timer = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timed out: ${method}`)); }, 10000);
    pending.set(next, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  async function respond(requestId, response = mock) {
    if (response.fail) return send('Fetch.failRequest', { requestId, errorReason: 'Failed' });
    return send('Fetch.fulfillRequest', { requestId, responseCode: response.status,
      responseHeaders: [{ name: 'Content-Type', value: response.raw ? 'text/html' : 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin }],
      body: Buffer.from(response.raw || JSON.stringify(response.body)).toString('base64') });
  }
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      if (!task) return;
      clearTimeout(task.timer);
      pending.delete(message.id);
      message.error ? task.reject(message.error) : task.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params);
    } else if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      let response;
      if (new URL(request.url).origin === origin) response = send('Fetch.continueRequest', { requestId });
      else if (request.url === 'https://formspree.io/f/mzeevpda') {
        calls.push(request);
        if (mock.hold) held = requestId;
        else response = respond(requestId);
      } else response = send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      response?.catch(error => exceptions.push(String(error)));
    }
  });
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(30); }
    throw new Error(`Condition timed out: ${expression}`);
  }
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  async function key(key, shift = false) {
    const modifiers = shift ? 8 : 0;
    const windowsVirtualKeyCode = { Tab: 9, Escape: 27, Enter: 13 }[key];
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, modifiers, windowsVirtualKeyCode });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, modifiers, windowsVirtualKeyCode });
  }
  async function screenshot(name, fullPage = false) {
    await delay(240);
    const metrics = fullPage ? await send('Page.getLayoutMetrics') : null;
    const { data } = await send('Page.captureScreenshot', { format: 'png', ...(metrics ? { captureBeyondViewport: true, clip: { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 } } : {}) });
    await writeFile(join(output, `${name}.png`), Buffer.from(data, 'base64'));
  }
  async function open() { await click('#contact-trigger'); await waitFor("document.querySelector('dialog').open && document.activeElement.id === 'contact-name'"); }
  async function close() { await key('Escape'); await waitFor("!document.querySelector('dialog').open && !document.querySelector('dialog').classList.contains('is-closing')"); }
  async function fill() {
    await evaluate(`for (const [name, value] of Object.entries({name:'Test Person', email:'test@example.com', message:'Mocked contact test — do not send.'})) {
      const field = document.querySelector('[name="'+name+'"]'); field.value = value; field.dispatchEvent(new Event('input', {bubbles:true}));
    }`);
  }
  const submit = () => click('.contact-send');
  async function settled() { await waitFor("!document.querySelector('#contact-form').hasAttribute('aria-busy')"); }
  async function preserved() {
    assert.equal(await evaluate("document.querySelector('[name=message]').value"), 'Mocked contact test — do not send.');
    assert.equal(await evaluate("document.querySelector('#contact-success').hidden"), true);
    assert.ok(await evaluate("document.querySelector('#contact-error').textContent.length > 0"));
    assert.equal(await evaluate("document.querySelector('.contact-send').disabled"), false);
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await send('Page.navigate', { url: origin });
  await waitFor("!!document.querySelector('#contact-trigger') && !document.querySelector('#contact-trigger').hidden");
  const response = await fetch(origin);
  assert.ok(response.headers.get('content-security-policy').includes('connect-src https://formspree.io/f/mzeevpda'));
  assert.equal((await fetch(`${origin}/contact.js`)).status, 200);
  report.push('Production CSP applied locally; script loads; Formspree endpoint is permitted.');

  for (const [width, height] of [[1440,900], [390,844], [320,568], [768,1024], [844,390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(50);
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight"), `Landing fits ${width}x${height}`);
    assert.equal(await evaluate("document.querySelector('h1').textContent"), 'Ottomated');
    assert.ok(await evaluate("document.querySelector('.buddy').getAnimations().length > 0"));
    if (width === 1440) await screenshot('landing-desktop');
    await open();
    assert.ok(await evaluate("(() => { const r = document.querySelector('dialog').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()"), `Modal fits ${width}x${height}`);
    if ([1440,390,320].includes(width)) await screenshot(`modal-${width}`);
    await close();
    assert.equal(await evaluate('document.activeElement.id'), 'contact-trigger');
  }
  report.push('Landing, animation, and modal fit five desktop/mobile/tablet/landscape viewports.');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await open();
  const { nodes } = await send('Accessibility.getFullAXTree');
  assert.ok(nodes.some(node => node.role?.value === 'dialog' && node.name?.value === 'Contact us'));
  for (const label of ['Name', 'Email', 'Message']) {
    assert.ok(nodes.some(node => node.role?.value === 'textbox' && node.name?.value === label && node.properties?.some(p => p.name === 'required' && p.value.value === true)), `${label} has an accessible required label`);
  }
  await evaluate("document.querySelector('.contact-close').focus()");
  await key('Tab', true);
  assert.equal(await evaluate('document.activeElement.className'), 'contact-send');
  await key('Tab');
  assert.equal(await evaluate('document.activeElement.className'), 'contact-close');
  await click('.contact-close');
  await waitFor("!document.querySelector('dialog').open");
  await open();
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: 10, y: 10, button: 'left', clickCount: 1 });
  await waitFor("!document.querySelector('dialog').open");
  report.push('X, Escape, outside click, focus restoration, Tab trapping, and accessible dialog/field labels work.');

  await open();
  await submit();
  assert.equal(await evaluate("document.querySelectorAll('[aria-invalid=true]').length"), 3);
  assert.equal(await evaluate('document.activeElement.id'), 'contact-name');
  assert.equal(calls.length, 0);
  await fill();
  await evaluate("document.querySelector('[name=email]').value='invalid-email'");
  await submit();
  assert.equal(await evaluate('document.activeElement.id'), 'contact-email');
  assert.equal(calls.length, 0);
  await fill();
  await evaluate("document.querySelector('[name=message]').value='   '");
  await submit();
  assert.equal(await evaluate('document.activeElement.id'), 'contact-message');
  assert.equal(calls.length, 0);
  report.push('Empty fields, whitespace-only messages, and malformed email are rejected before networking.');

  await fill();
  mock = { status: 422, body: { errors: [{ field: 'email', message: 'Please use a different email address.' }] } };
  await submit(); await settled(); await preserved();
  assert.equal(await evaluate("document.querySelector('#email-error').textContent"), mock.body.errors[0].message);
  assert.equal(await evaluate('document.activeElement.id'), 'contact-email');
  await screenshot('field-error');
  const request = calls.at(-1);
  assert.equal(request.method, 'POST');
  assert.equal(Object.entries(request.headers).find(([key]) => key.toLowerCase() === 'accept')[1], 'application/json');
  for (const name of ['name','email','message']) assert.ok(request.postData.includes(`name="${name}"`), `${name} in FormData`);
  report.push('FormData fields and Accept header are correct; server field errors are shown accessibly.');

  for (const response of [
    { status: 500, raw: '<html>Server unavailable</html>' },
    { status: 429, body: { errors: [{ message: 'Please try again later.' }] } },
    { status: 200, body: { ok: false } },
    { status: 200, raw: '<html>Unexpected response</html>' },
    { fail: true },
  ]) {
    mock = response; await fill(); await submit(); await settled(); await preserved();
  }
  await close(); await open(); await preserved();
  report.push('422/429/500, network failure, and unconfirmed 200 responses keep the message and never show success; drafts survive closing.');

  mock = { hold: true };
  await fill(); await submit();
  await waitFor("document.querySelector('#contact-form').getAttribute('aria-busy') === 'true'");
  for (let i=0; i<100 && !held; i++) await delay(10);
  assert.ok(held);
  assert.equal(await evaluate("document.querySelector('.contact-send').textContent"), 'Sending...');
  assert.equal(await evaluate("document.querySelector('.contact-send').disabled"), true);
  const count = calls.length;
  await evaluate("document.querySelector('#contact-form').dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}))");
  await close();
  await click('#contact-trigger');
  assert.equal(await evaluate('document.activeElement.className'), 'contact-close');
  assert.equal(calls.length, count);
  await respond(held, { status: 200, body: { ok: true } });
  held = undefined;
  await settled();
  assert.equal(await evaluate("document.querySelector('#contact-success').hidden"), false);
  assert.equal(await evaluate('document.activeElement.id'), 'contact-success-title');
  assert.equal(await evaluate("document.querySelector('#contact-success h2').textContent"), 'Message sent!');
  assert.equal(await evaluate("document.querySelector('#contact-success p').textContent"), "Thanks for reaching out. We'll be in touch soon.");
  await screenshot('success');
  await click('#contact-success button');
  await waitFor("!document.querySelector('dialog').open");
  await open();
  assert.equal(await evaluate("document.querySelector('[name=message]').value"), '');
  report.push('Pending requests disable editing/sending; duplicate submits and close/reopen do not resend; confirmed acceptance shows the exact success copy.');

  await close();
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await open();
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  await close();
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  report.push('Reduced-motion disables animations; no uncaught browser errors.');
  await verifyProcess({ origin, send, evaluate, waitFor, click, key, screenshot, report });
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  console.log(report.map(line => `PASS ${line}`).join('\n'));
  console.log(`${calls.length} mocked submissions; zero live Formspree submissions. Screenshots: .preview/contact-tests/`);
} finally {
  if (send && ws?.readyState === WebSocket.OPEN) {
    try { await send('Browser.close'); } catch {}
    ws.close();
  } else browser?.kill();
  server.kill();
}
