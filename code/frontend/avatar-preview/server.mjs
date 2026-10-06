import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const avatar = resolve(root, "../assets/avatar/local");
const port = Number(process.env.AVATAR_PREVIEW_PORT ?? 4175);
const publicFiles = new Set(["index.html", "styles.css", "app.mjs"]);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".moc": "application/octet-stream",
  ".moc3": "application/octet-stream",
  ".mtn": "text/plain; charset=utf-8",
};

const server = createServer(async (request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    if (!/^(127\.0\.0\.1|localhost):\d+$/u.test(request.headers.host ?? "")) {
      response.writeHead(403).end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    let directory = root;
    let path = pathname === "/" ? "index.html" : pathname.slice(1);
    const mounts = {
      "/vendor/": resolve(avatar, "viewer-runtime"),
      "/assets/legacy/": resolve(avatar, "kurisu"),
      "/assets/modern/": resolve(avatar, "modern/Kurisu"),
    };
    const mount = Object.keys(mounts).find((prefix) =>
      pathname.startsWith(prefix),
    );
    if (mount) {
      directory = mounts[mount];
      path = pathname.slice(mount.length);
    } else if (!publicFiles.has(path)) {
      response.writeHead(404).end();
      return;
    }
    const file = await realpath(resolve(directory, path));
    const allowedRoot = await realpath(directory);
    if (!file.startsWith(allowedRoot + sep) || !types[extname(file)]) {
      response.writeHead(404).end();
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file)],
      "Content-Length": bytes.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; media-src 'none'; object-src 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === "HEAD" ? undefined : bytes);
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Prévia dos avatares: http://127.0.0.1:${port}`);
});
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
