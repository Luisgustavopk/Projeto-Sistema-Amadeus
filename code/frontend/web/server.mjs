import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = dirname(fileURLToPath(import.meta.url));
const vendorFiles = new Set([
  'pixi.min.js',
  'live2d.min.js',
  'live2dcubismcore.min.js',
  'live2d-display.min.js',
]);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.moc3': 'application/octet-stream',
};

/** Only UI files and the selected local rig are public. No API or proxy. */
export function createWebServer({
  root = resolve(webRoot, 'dist'),
  models = resolve(root, 'live2d/amadeus'),
  vendor = resolve(root, 'live2d/runtime'),
} = {}) {
  return createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      if (!/^(127\.0\.0\.1|localhost):\d+$/u.test(request.headers.host ?? '')) {
        response.writeHead(403).end();
        return;
      }
      const url = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      let directory = root;
      let path = ['/', '/login', '/index.html'].includes(pathname)
        ? 'index.html'
        : pathname.slice(1);
      if (pathname.startsWith('/live2d/amadeus/')) {
        directory = models;
        path = pathname.slice('/live2d/amadeus/'.length);
        if (!['.json', '.png', '.moc3'].includes(extname(path))) {
          response.writeHead(404).end();
          return;
        }
      } else if (pathname.startsWith('/live2d/runtime/')) {
        directory = vendor;
        path = pathname.slice('/live2d/runtime/'.length);
        if (!vendorFiles.has(path)) {
          response.writeHead(404).end();
          return;
        }
      } else if (
        path !== 'index.html' &&
        !/^assets\/[\w.-]+\.(?:js|css|png|svg)$/u.test(path) &&
        !/^media\/[\w./-]+\.(?:png|svg)$/u.test(path)
      ) {
        response.writeHead(404).end();
        return;
      }
      const [file, boundary] = await Promise.all([
        realpath(resolve(directory, path)),
        realpath(directory),
      ]);
      if (!file.startsWith(boundary + sep) || !mime[extname(file)]) {
        response.writeHead(404).end();
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': mime[extname(file)],
        'Content-Length': info.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; media-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      });
      if (request.method === 'HEAD') response.end();
      else {
        const stream = createReadStream(file);
        stream.on('error', () => response.destroy());
        response.on('close', () => stream.destroy());
        stream.pipe(response);
      }
    } catch {
      if (!response.headersSent) response.writeHead(404).end();
      else response.destroy();
    }
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.AMADEUS_WEB_PORT ?? 4176);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Porta inválida.');
  const server = createWebServer();
  server.listen(port, '127.0.0.1', () =>
    console.log('Amadeus · http://127.0.0.1:' + port),
  );
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => server.close());
}
