import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";

import { buildSite, readPayload, root } from "./helpers.mjs";

before(buildSite);

const infi = () => readPayload("docs/infi");
const titleOf = (payload, id) => payload.pages.find((page) => page.id === id)?.navTitle || "";
const group = (payload, id) => payload.navGroups.find((item) => item.id === id);

test("every infi page sits in exactly one menu group", () => {
  const payload = infi();
  const seen = new Map();
  for (const item of payload.navGroups) for (const id of item.pageIds) seen.set(id, (seen.get(id) || 0) + 1);
  for (const page of payload.pages) assert.equal(seen.get(page.id), 1, `${page.navTitle} is in ${seen.get(page.id) || 0} groups`);
});

test("infi groups run exam prep, the units, topic practice, then tools", () => {
  const ids = infi().navGroups.map((item) => item.id);
  assert.equal(ids[0], "start");
  assert.deepEqual(ids.slice(1, 10), Array.from({ length: 9 }, (_, n) => `unit-${n}`));
  assert.deepEqual(ids.slice(10), ["practice", "tools"]);
});

test("exam prep holds the study guides in the order the layout gives", () => {
  const payload = infi();
  const prep = group(payload, "start");
  assert.equal(prep.title, "הכנה לבחינה");
  assert.equal(prep.landing, true);
  assert.equal(prep.gatewayId, undefined);
  const titles = prep.pageIds.map((id) => titleOf(payload, id));
  assert.deepEqual(
    titles.map((title) => title.replace(/\s+[-—].*$/, "")),
    ["איך עוברים את הבחינה בשקט", "רשימת המשפטים לבחינה", "תרגול בסגנון 2026", "למידה לפי תבניות", "שאלות מהמאגר", "מסקנות משאלות הספר", "שיטות המרצה"]
  );
});

test("topic practice keeps its gateway and only the topic sheets", () => {
  const payload = infi();
  const practice = group(payload, "practice");
  assert.equal(titleOf(payload, practice.gatewayId), "שער תרגול לפי נושאים");
  assert.equal(practice.pageIds[0], practice.gatewayId);
  const sheets = practice.pageIds.slice(1).map((id) => titleOf(payload, id));
  assert.equal(sheets.length, 11);
  for (const title of sheets) assert.match(title, /^שאלות ממבחנים - /);
});

test("vault working pages are out of the menu but still listed and searchable", () => {
  const payload = infi();
  const tools = group(payload, "tools");
  const hidden = tools.hiddenIds.map((id) => titleOf(payload, id));
  for (const name of ["כספת העל", "מפת מוח", "מקורות וחומרי גלם", "כרטיסי חזרה"]) {
    assert.ok(hidden.some((title) => title.includes(name)), `${name} is hidden`);
  }
  // Still in the group's pages, which "all pages" lists, and still pages of the site.
  for (const id of tools.hiddenIds) {
    assert.ok(tools.pageIds.includes(id));
    assert.ok(payload.pages.some((page) => page.id === id));
  }
  // Out of every previous/next chain.
  for (const page of payload.pages) {
    assert.ok(!tools.hiddenIds.includes(page.prevId), `${page.navTitle} leads back to a hidden page`);
    assert.ok(!tools.hiddenIds.includes(page.nextId), `${page.navTitle} leads on to a hidden page`);
  }
});

test("the client filters hidden pages from the tree only, and lists groups without a gateway", () => {
  const js = fs.readFileSync(path.join(root, "docs/infi/assets/app.js"), "utf8");
  assert.match(js, /filter\(\(id\) => !group\.hiddenIds\?\.includes\(id\)\)/);
  assert.match(js, /next\.view === "group" && groupById\.get\(next\.id\)\?\.landing/);
  // About finds the sources page wherever it sits.
  assert.match(js, /data\.pages\.find\(\(page\) => page\.navTitle\.includes\("מקורות וחומרי גלם"\)\)/);
});

test("the preparation chapter gets a study path like every other chapter", () => {
  const js = fs.readFileSync(path.join(root, "docs/infi/assets/app.js"), "utf8");
  assert.match(js, /function mountLearningPath\(page, group, gateway\) \{\s*\/\/[^\n]*\n\s*if \(!isUnit\(group\)\) return;/);
});

test("infi has the short home page, the practice hub and practice in the phone header", () => {
  const payload = infi();
  assert.equal(payload.course.features.hubs, true);
  assert.match(payload.course.examDate, /^\d{4}-\d{2}-\d{2}$/);
  const css = fs.readFileSync(path.join(root, "docs/infi/assets/site.css"), "utf8");
  assert.match(css, /html\[data-hubs\] \.primary-nav > \[data-nav="practice"\]/);
  const study = fs.readFileSync(path.join(root, "docs/infi/assets/study.js"), "utf8");
  assert.match(study, /route\.id === "proofs"/);
});

test("linear1 keeps its folder groups and its old home page and hub", () => {
  const payload = readPayload("docs/linear1");
  assert.equal(payload.course.features.hubs, undefined);
  assert.equal(payload.course.examDate, undefined);
  assert.equal(payload.course.pageBlurbs, undefined);
  for (const item of payload.navGroups) {
    assert.equal(item.landing, undefined);
    assert.equal(item.hiddenIds, undefined);
  }
  assert.equal(group(payload, "start")?.title, "מרכז הלימוד");
});
