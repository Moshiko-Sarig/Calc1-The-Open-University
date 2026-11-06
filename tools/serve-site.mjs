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
  const isDirectory = existsSync(target) && statSync(target).isDirectory();
  const hasIndex = isDirectory && existsSync(path.join(target, "index.html"));
  // A course in a subfolder needs the slash, or its relative assets resolve one level too high.
  if (hasIndex && !url.pathname.endsWith("/")) {
    response.writeHead(301, { Location: `${url.pathname}/` });
    response.end();
    return;
  }
  if (hasIndex) target = path.join(target, "index.html");
  else if (!existsSync(target) || isDirectory) target = path.join(docs, "index.html");
  const ext = path.extname(target).toLowerCase();
  response.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  createReadStream(target).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Infinitesimal vault site: http://127.0.0.1:${port}/`);
});
