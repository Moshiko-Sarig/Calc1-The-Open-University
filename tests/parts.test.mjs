import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";

import { blockHeight, foldedView, groupParts, pageBlocks, PART_RULES, PHONE_SCREEN } from "../tools/lib/parts.mjs";
import { buildSite, readPayload, root } from "./helpers.mjs";

before(buildSite);

const screens = (n) => n * PHONE_SCREEN;
const block = (id, height, extra = {}) => ({ id, level: 2, title: id, height, closing: false, ...extra });

test("a closed box counts by its title only; an open box counts whole", () => {
  const closed = '<details class="callout"><summary>כותרת</summary><div class="callout-body"><p>גוף ארוך מאוד</p></div></details>';
  const open = '<details class="callout" open><summary>כותרת</summary><div class="callout-body"><p>גוף</p></div></details>';
  assert.equal(foldedView(closed), '<details class="callout"><summary>כותרת</summary></details>');
  assert.equal(foldedView(open), open);
  // A closed box inside a closed box disappears with its parent's body.
  const nested = `<details><summary>א</summary><p>ב</p>${closed}</details><p>ג</p>`;
  assert.equal(foldedView(nested), "<details><summary>א</summary></details><p>ג</p>");
});

test("a demo or a diagram weighs more than a line of text", () => {
  assert.ok(blockHeight('<figure class="demo" data-demo="x"></figure>') > blockHeight("<p>שורה אחת של טקסט</p>") * 5);
  assert.ok(blockHeight('<div class="diagram-wrap"><pre class="mermaid">graph</pre></div>') > 300);
});

test("a short page stays whole", () => {
  assert.equal(groupParts([block("a", screens(2)), block("b", screens(3))]), null);
});

test("notes are packed by height and a section is never cut between parts", () => {
  const blocks = ["a", "b", "c", "d", "e", "f"].map((id) => block(id, screens(2)));
  const parts = groupParts(blocks);
  assert.ok(parts.length >= 3);
  for (const part of parts) assert.ok(part.height <= PART_RULES.max, `${part.id} is ${part.height}`);
  assert.deepEqual(parts.map((part) => part.id), ["a", "c", "e"]);
});

test("a closing section stays with the part before it", () => {
  const blocks = [block("a", screens(3)), block("b", screens(3)), block("c", screens(3)), block("summary", screens(0.8), { closing: true })];
  const parts = groupParts(blocks);
  assert.ok(!parts.some((part) => part.id === "summary"));
});

test("topic pages start a part at every h2 and fold short ones into a neighbour", () => {
  const blocks = [block("a", screens(2)), block("b", screens(2)), block("tiny", screens(0.5)), block("c", screens(2)), block("d", screens(2))];
  const parts = groupParts(blocks, { mode: "topics" });
  assert.deepEqual(
    parts.map((part) => part.id),
    ["a", "b", "c", "d"]
  );
});

test("a section close to the part maximum is cut at its own h3 headings", () => {
  const long = "<p>" + "מילה ".repeat(4000) + "</p>";
  const html = `<section class="note-section" aria-labelledby="big"><h2 id="big">גדול</h2>${long}<h3 id="one">אחת</h3>${long}<h3 id="two">שתיים</h3>${long}</section>`;
  const blocks = pageBlocks(html);
  assert.deepEqual(blocks.map((b) => b.id), ["big", "one", "two"]);
  assert.deepEqual(blocks.map((b) => b.level), [2, 3, 3]);
});

const infi = () => readPayload("docs/infi");

test("every infi part starts at a heading of its page, and the first at the first heading", () => {
  const payload = infi();
  const split = payload.pages.filter((page) => page.parts);
  assert.ok(split.length > 40, `${split.length} pages in parts`);
  for (const page of split) {
    assert.ok(page.parts.length >= 2, page.navTitle);
    assert.equal(new Set(page.parts).size, page.parts.length, `${page.navTitle} repeats a part`);
    const firstHeading = page.html.match(/<h2 id="([^"]+)"/)?.[1];
    assert.equal(page.parts[0], firstHeading, `${page.navTitle} starts at its first heading`);
    for (const id of page.parts) {
      assert.ok(page.html.includes(`<h2 id="${id}"`) || page.html.includes(`<h3 id="${id}"`), `${page.navTitle}: ${id} is a heading`);
    }
  }
});

test("the longest infi pages are in parts of a few phone screens", () => {
  const payload = infi();
  for (const title of ["למידה לפי תבניות", "תרגול בסגנון 2026", "גבול של סדרה", "רציפות במידה שווה ומשפט קנטור"]) {
    const page = payload.pages.find((item) => item.navTitle === title);
    assert.ok(page?.parts?.length >= 3, `${title} is in parts`);
    for (const part of groupParts(pageBlocks(page.html), { mode: page.groupId === "practice" || page.groupId === "start" ? "topics" : "notes" })) {
      assert.ok(part.height <= PART_RULES.max * 1.1, `${title}: a part of ${(part.height / PHONE_SCREEN).toFixed(1)} screens`);
    }
  }
});

test("the theorem list stays whole, and the calm exam guide is in parts too", () => {
  const payload = infi();
  const list = payload.pages.find((page) => page.title.includes(payload.course.theoremListTitle));
  assert.equal(list.parts, undefined);
  const calm = payload.pages.find((item) => item.tags?.includes("calm-page"));
  assert.ok(calm.parts?.length >= 3, calm.navTitle);
});

test("topic sheets start a part at every h2 that is long enough to stand alone", () => {
  const payload = infi();
  const sheet = payload.pages.find((page) => page.navTitle === "שאלות ממבחנים - פונקציות");
  const h2s = [...sheet.html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
  // Every part starts at an h2 of the sheet, in the sheet's order.
  assert.ok(sheet.parts.every((id) => h2s.includes(id)));
  assert.deepEqual([...sheet.parts].sort((a, b) => h2s.indexOf(a) - h2s.indexOf(b)), sheet.parts);
});

test("linear1 has no parts", () => {
  const payload = readPayload("docs/linear1");
  assert.equal(payload.course.features.parts, undefined);
  assert.ok(payload.pages.every((page) => page.parts === undefined));
});

test("every way to a heading opens the part that holds it", () => {
  const js = fs.readFileSync(path.join(root, "docs/infi/assets/app.js"), "utf8");
  // A link or the contents list, a search hit, the study path.
  assert.match(js, /function scrollToSection\(section, smooth\) \{[\s\S]{0,200}showPartOf\(target\)/);
  assert.match(js, /function revealMatch[\s\S]{0,1500}showPartOf\(hit\)/);
  assert.match(js, /const jumped = showPartOf\(target\)/);
  // Find-in-page opens a hidden part, and a saved reading position skips hidden ones.
  assert.match(js, /addEventListener\("beforematch"/);
  assert.match(js, /inOtherPart\(heading\)\) continue/);
  const css = fs.readFileSync(path.join(root, "docs/infi/assets/site.css"), "utf8");
  assert.match(css, /@media print \{\s*\.note-part\.is-staged,\s*\.note-part\[hidden\]/);
});
