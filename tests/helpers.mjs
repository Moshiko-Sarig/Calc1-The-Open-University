import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function buildSite() {
  execFileSync(process.execPath, [path.join(root, "tools/build-site.mjs")], { cwd: root, stdio: "pipe" });
}

export function readPayload(dir) {
  const source = fs.readFileSync(path.join(root, dir, "assets", "content.js"), "utf8");
  return JSON.parse(source.slice(source.indexOf("=") + 1).trim().replace(/;$/, ""));
}
