/**
 * server.mjs — минималистичный статический сервер для локальной разработки.
 * Запуск: npm run dev  ->  http://localhost:3000
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(ROOT, safePath);

    if (!filePath.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep) && filePath !== ROOT.replace(/[/\\]$/, '')) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath).catch(() => null);
    }
    if (!info) {
      filePath = join(ROOT, 'index.html');
      info = await stat(filePath).catch(() => null);
    }
    if (!info) {
      res.writeHead(404).end('Not found');
      return;
    }

    const body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500).end(`Server error: ${error.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`\n  NEON TETRIS dev server\n  -> http://localhost:${PORT}\n`);
});
