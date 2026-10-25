// Local production QA server, including the same CSP as the VPS configuration.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { routeRequest, defaultLanguage } from './routing.mjs';
const root = path.resolve('dist');
const port = Number(process.env.PORT || 4321);
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};
createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-cache');
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const routed = routeRequest(pathname, req.headers.host || 'localhost');
    if (routed && routed.status !== 404) {
      res.writeHead(routed.status, routed.location ? { Location: routed.location } : {});
      res.end();
      return;
    }
    const language = defaultLanguage(req.headers.host || 'localhost');
    const actual =
      pathname === '/sitemap.xml'
        ? '/sitemap-' + language + '.xml'
        : pathname === '/robots.txt'
          ? '/robots-' + language + '.txt'
          : pathname;
    let file = path.resolve(root, '.' + actual);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      if (routed?.status === 404) throw new Error('Not found');
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const body = await readFile(file);
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.writeHead(200);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      const errorLang = pathname.startsWith('/en/')
        ? 'en'
        : pathname.startsWith('/ru/')
          ? 'ru'
          : language;
      res.end(await readFile(path.join(root, errorLang, '404.html')));
    }
  } catch {
    res.writeHead(400);
    res.end();
  }
}).listen(port, '127.0.0.1', () =>
  console.log('Toolsiano production QA: http://127.0.0.1:' + port),
);
