#!/usr/bin/env node
/**
 * Tiny static file server for local development (no dependencies).
 *
 * Browsers refuse to load ES modules from file:// URLs, so the demo has to
 * be served over HTTP. Any static server works (python3 -m http.server,
 * VS Code Live Server, ...); this one only needs Node.
 *
 *   node server/launch.js            -> http://localhost:8080
 *   node server/launch.js 3000       -> http://localhost:3000
 *
 * @module server/launch
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The project folder; only files inside it are served. */
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** Port from the command line, the PORT environment variable, or 8080. */
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

/** Content type per file extension; other files are sent as `application/octet-stream`. */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * The HTTP server. It answers every request with the file at that path (a folder serves its
 * `index.html`), `403` for a path outside ROOT, and `404` for a missing file.
 */
const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    // Resolve inside ROOT only; reject any path that escapes it.
    let filePath = normalize(join(ROOT, decodeURIComponent(pathname)));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) filePath = join(filePath, 'index.html');
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`ZeroPlot: http://localhost:${server.address().port}/`);
});
