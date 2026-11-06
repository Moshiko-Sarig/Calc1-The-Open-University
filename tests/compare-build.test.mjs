import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { compareContent } from "../tools/compare-build.mjs";

function makeBuild(payload, html = "<html></html>") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compare-build-"));
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "assets", "content.js"), `window.COURSE_DATA = ${JSON.stringify(payload)};\n`);
  fs.writeFileSync(path.join(dir, "index.html"), html);
  return dir;
}

const payload = (extra = {}) => ({
  generatedAt: "2026-01-01T00:00:00.000Z",
  pages: [{ id: "p-1", html: "<p>א</p>" }],
  statements: {},
  ...extra
});

test("builds that differ only in generatedAt, course and courses are the same", () => {
  const a = makeBuild(payload());
  const b = makeBuild(payload({ generatedAt: "2030-01-01T00:00:00.000Z", course: { id: "infi" }, courses: [{ id: "infi" }] }));
  assert.deepEqual(compareContent(a, b), { same: true, differences: [] });
});

test("a changed page html is reported under pages", () => {
  const a = makeBuild(payload());
  const b = makeBuild(payload({ pages: [{ id: "p-1", html: "<p>ב</p>" }] }));
  const result = compareContent(a, b);
  assert.equal(result.same, false);
  assert.ok(result.differences.includes("pages"));
});

test("a changed index.html is reported byte for byte", () => {
  const a = makeBuild(payload(), "<html>a</html>");
  const b = makeBuild(payload(), "<html>b</html>");
  const result = compareContent(a, b);
  assert.equal(result.same, false);
  assert.ok(result.differences.includes("index.html"));
});

test("a key that exists on one side only is reported", () => {
  const a = makeBuild(payload());
  const b = makeBuild(payload({ flashcards: [{ id: "fc" }] }));
  assert.ok(compareContent(a, b).differences.includes("flashcards"));
});
