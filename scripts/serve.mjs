import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.js': 'text/javascript; charset=utf-8' };

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    // Match Cloudflare static HTML handling: /how-we-work serves how-we-work.html.
    const htmlPath = pathname === '/' ? '/index.html' : !extname(pathname) ? `${pathname.replace(/\/$/, '')}.html` : pathname;
    const file = resolve(root, `.${htmlPath}`);
    if (!file.startsWith(root.endsWith(sep) ? root : `${root}${sep}`) || !types[extname(file)]) {
      response.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(file);
    // Mirror the site's global static-asset headers so local QA also catches CSP failures.
    const headerFile = await readFile(resolve(root, '_headers'), 'utf8');
    const headers = Object.fromEntries(headerFile.split(/\r?\n/).filter(line => /^\s+[^:]+:/.test(line)).map(line => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
    }));
    response.writeHead(200, { ...headers, 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Ottomated preview: http://localhost:${server.address().port}`);
});
