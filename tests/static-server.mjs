// Serve only static files, with GitHub Pages-style directory redirects and 404s.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve(".output/public");
const base = "/kanji-quest/";
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost:4173");
    if (url.pathname === base.slice(0, -1)) {
      response.writeHead(301, { location: `${base}${url.search}` }).end();
      return;
    }
    if (!url.pathname.startsWith(base)) {
      response.writeHead(404).end("Not found");
      return;
    }
    let filename = resolve(root, decodeURIComponent(url.pathname.slice(base.length)));
    if (filename !== root && !filename.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    if ((await stat(filename)).isDirectory()) {
      if (!url.pathname.endsWith("/")) {
        response.writeHead(301, { location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      filename = resolve(filename, "index.html");
    }
    const body = await readFile(filename);
    response.writeHead(200, { "content-type": mimeTypes[extname(filename)] || "application/octet-stream" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    response.end(await readFile(resolve(root, "404.html")).catch(() => "Not found"));
  }
}).listen(4173, "127.0.0.1");
