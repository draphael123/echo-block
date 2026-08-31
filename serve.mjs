import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = process.env.PORT || 5833;
const ROOT = import.meta.dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json',
};

http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let p = normalize(join(ROOT, url === '/' ? 'index.html' : url));
    if (!p.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    const s = await stat(p);
    if (s.isDirectory()) p = join(p, 'index.html');
    const body = await readFile(p);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(p).toLowerCase()] || 'application/octet-stream',
      // No caching, ever. A stale cached module is indistinguishable from a
      // logic bug and costs an hour every time.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Cache-Control': 'no-store' }).end('not found');
  }
}).listen(PORT, () => console.log(`echo-block → http://localhost:${PORT}`));
