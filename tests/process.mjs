import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function verifyProcess({ origin, send, evaluate, waitFor, click, key, screenshot, report }) {
  for (const path of ['/how-we-work', '/how-we-work/', '/how-we-work.html']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, `${path} resolves directly`);
    assert.ok((await response.text()).includes('<title>How We Work | Ottomated</title>'));
    assert.ok(response.headers.get('content-security-policy'));
  }
  assert.equal((await fetch(`${origin}/not-a-page`)).status, 404);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await click('.process-link');
  await waitFor("location.pathname === '/how-we-work' && document.title === 'How We Work | Ottomated'");
  await send('Page.reload');
  await waitFor("!!document.querySelector('.timeline-enhanced')");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('main h2')].map(h => h.textContent)"), ['Discovery', 'Proposal', 'Implementation', 'Handoff & Support']);
  assert.equal(await evaluate("document.querySelector('.process-intro p').textContent"), 'From understanding your challenges to delivering practical automation.');
  assert.ok(await evaluate("document.querySelector('meta[name=description]').content.includes('four-step process')"));
  const { nodes } = await send('Accessibility.getFullAXTree');
  assert.ok(nodes.some(n => n.role?.value === 'list' && n.name?.value === 'Our four-step process'));
  assert.equal(nodes.filter(n => n.role?.value === 'listitem').length, 4);
  report.push('How We Work loads directly, from the homepage, and after refresh, with correct metadata and a semantic four-step list.');

  for (const [width, height] of [[1440,900], [390,844], [320,568], [768,1024], [844,390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate('scrollTo(0, 0)');
    await delay(250);
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `No horizontal overflow at ${width}x${height}`);
    assert.ok(await evaluate("[...document.querySelectorAll('.step-content')].every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && getComputedStyle(el).opacity === '1'; })"), 'All copy stays readable');
    const initial = await evaluate("document.querySelector('.timeline-fill').getBoundingClientRect().height");
    if ([1440,390].includes(width)) await screenshot(`process-${width}`, true);
    await evaluate('scrollTo(0, document.documentElement.scrollHeight)');
    await waitFor("document.querySelectorAll('.process-step.is-reached').length === 4");
    await delay(250);
    const final = await evaluate("document.querySelector('.timeline-fill').getBoundingClientRect().height");
    assert.ok(final > initial, 'Line extends as the visitor scrolls');
    assert.ok(await evaluate("Math.abs(document.querySelector('.timeline-fill').getBoundingClientRect().height - document.querySelector('.timeline-track').getBoundingClientRect().height) < 1"), 'Line reaches the final step');
    await evaluate('scrollTo(0, 0)');
    await delay(250);
    assert.ok(await evaluate("document.querySelector('.timeline-fill').getBoundingClientRect().height") < final, 'Progress follows scrolling back up');
  }
  report.push('Process page fits five viewport sizes; the line advances/reverses on scroll and all four steps become highlighted.');

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await waitFor("!document.querySelector('.timeline-enhanced')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.step-number')).transitionDuration"), '0s');
  assert.equal(await evaluate('document.getAnimations().length'), 0);
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.reload');
  await delay(150);
  assert.equal(await evaluate("document.querySelectorAll('main li').length"), 4);
  assert.ok(await evaluate("getComputedStyle(document.querySelector('.process-step'), '::before').height !== '0px'"));
  await screenshot('process-static-no-js', true);
  await send('Emulation.setScriptExecutionDisabled', { value: false });
  await send('Page.reload');
  await waitFor("!!document.querySelector('.home-link')");
  await evaluate("document.querySelector('.home-link').focus()");
  await key('Enter');
  await waitFor("location.pathname === '/' && !!document.querySelector('#contact-trigger') && !document.querySelector('#contact-trigger').hidden");
  await click('#contact-trigger');
  await waitFor("document.querySelector('dialog').open && document.activeElement.id === 'contact-name'");
  await key('Escape');
  await waitFor("!document.querySelector('dialog').open && !document.querySelector('dialog').classList.contains('is-closing')");
  report.push('Reduced-motion and no-JavaScript show the complete static process; keyboard navigation returns home with the contact form intact.');
}
