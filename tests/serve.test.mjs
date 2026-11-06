import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { after, before, test } from "node:test";

import { buildSite, root } from "./helpers.mjs";

const PORT = 4197;
const url = (pathname) => `http://127.0.0.1:${PORT}${pathname}`;
let server;

before(async () => {
  buildSite();
  server = spawn(process.execPath, [path.join(root, "tools/serve-site.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((resolve, reject) => {
    server.stdout.once("data", resolve);
    server.once("exit", (code) => reject(new Error(`server exited with ${code}`)));
  });
});

after(() => {
  server.removeAllListeners("exit");
  server.kill();
});

test("GET /linear1/ serves the linear algebra site", async () => {
  const response = await fetch(url("/linear1/"));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /20109/);
});

test("GET /linear1 redirects to the trailing slash so relative assets resolve", async () => {
  const response = await fetch(url("/linear1"), { redirect: "manual" });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/linear1/");
});

test("GET / serves the home page with every course on it", async () => {
  const html = await (await fetch(url("/"))).text();
  assert.match(html, /class="course-card"/);
  assert.match(html, /20474/);
  assert.match(html, /20109/);
});

test("GET /infi/ serves the calculus site", async () => {
  const html = await (await fetch(url("/infi/"))).text();
  assert.match(html, /data-course-tree/);
  assert.match(html, /20474/);
});

test("GET /infi redirects to the trailing slash", async () => {
  const response = await fetch(url("/infi"), { redirect: "manual" });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/infi/");
});

test("GET of a linear1 asset serves that course's own content", async () => {
  const response = await fetch(url("/linear1/assets/content.js"));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /"id":"linear1"/);
});

test("an unknown path falls back to the home page", async () => {
  const response = await fetch(url("/no/such/path/"));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /class="course-card"/);
});
