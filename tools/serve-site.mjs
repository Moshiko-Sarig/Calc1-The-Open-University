import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");
const port = Number(process.argv[2] || process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://localhost:${port}`);
  let target = path.normalize(path.join(docs, decodeURIComponent(url.pathname)));
  if (!target.startsWith(docs)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  if (!existsSync(target) || statSync(target).isDirectory()) {
    target = path.join(docs, "index.html");
  }
  const ext = path.extname(target).toLowerCase();
  response.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  createReadStream(target).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Infinitesimal vault site: http://127.0.0.1:${port}/`);
});
