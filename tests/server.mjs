// Tiny static server for the site, like GitHub Pages: folders serve index.html, missing files get 404.html.
// Module: startServer(root, port = 0) -> { server, base }.   CLI: node tests/server.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.gif': 'image/gif', '.webmanifest': 'application/manifest+json',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

export function startServer(root, port = 0) {
  root = path.resolve(root);
  const server = http.createServer((req, res) => {
    let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
    let f = path.join(root, p);
    if (f !== root && !f.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    try { if (fs.statSync(f).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { location: p + '/' }); return res.end(); }
      f = path.join(f, 'index.html');
    } } catch {}
    fs.readFile(f, (e, d) => {
      if (e) return fs.readFile(path.join(root, '404.html'), (e2, d2) => { res.writeHead(404, { 'content-type': TYPES['.html'] }); res.end(d2 || 'not found'); });
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : d);
    });
  });
  return new Promise(resolve => server.listen(port, () => resolve({ server, base: `http://localhost:${server.address().port}` })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { base } = await startServer(root, +process.argv[2] || 8765);
  console.log('serving', root, 'at', base);
}
