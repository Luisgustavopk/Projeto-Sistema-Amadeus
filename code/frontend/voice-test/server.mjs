import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const allowed = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.mjs": "app.mjs",
  "/report.mjs": "report.mjs",
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

export function createTestServer() {
  return createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");

  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }

    const path = new URL(request.url, "http://127.0.0.1").pathname;
    let root = directory;
    let name = allowed[path];

    if (path.startsWith("/call-client/")) {
      root = resolve(directory, "../call-client");
      name = path.slice("/call-client/".length);
      if (!/^[a-z-]+\.(mjs|js)$/.test(name)) name = null;
    }

    if (!name) {
      response.writeHead(404).end();
      return;
    }

    const file = await realpath(resolve(root, name));
    if (!file.startsWith((await realpath(root)) + sep)) {
      response.writeHead(404).end();
      return;
    }

    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404).end();
  }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
createTestServer().listen(8080, "127.0.0.1", () => {
  console.log("Teste de voz: http://127.0.0.1:8080");
}).on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? "A porta 5173 já está em uso. Encerre o servidor de teste anterior." : error.message);
  process.exitCode = 1;
});

}
