import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";

import { buildSite, readPayload, root } from "./helpers.mjs";

const CHAPTER = path.join(root, "אלגברה לינארית 1", "פרק 3 - מטריצות");
// Every numbered item in the book's list for chapter 3 (section 3.7 has none).
const STATEMENTS = [
  "3.1.1",
  "3.2.1", "3.2.2", "3.2.3", "3.2.4", "3.2.5", "3.2.6",
  "3.3.1", "3.3.2", "3.3.3", "3.3.4", "3.3.5", "3.3.6", "3.3.7",
  "3.4.1", "3.4.2", "3.4.3", "3.4.4", "3.4.5",
  "3.5.1", "3.5.2", "3.5.3", "3.5.4", "3.5.5", "3.5.6",
  "3.6.1", "3.6.2", "3.6.3", "3.6.4", "3.6.5", "3.6.6", "3.6.7", "3.6.8",
  "3.8.1", "3.8.2", "3.8.3", "3.8.4",
  "3.9.1", "3.9.2", "3.9.3", "3.9.4", "3.9.5", "3.9.6", "3.9.7", "3.9.8", "3.9.9", "3.9.10",
  "3.10.1", "3.10.2", "3.10.3", "3.10.4", "3.10.5", "3.10.6", "3.10.7"
];
const KEY_THEOREMS = [
  "3.3.7", "3.4.3", "3.4.5", "3.5.1", "3.5.5", "3.6.4", "3.6.8", "3.8.1", "3.8.3", "3.8.4",
  "3.9.3", "3.9.5", "3.9.7", "3.9.10", "3.10.1", "3.10.3", "3.10.6"
];
const SECTIONS = ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10"];
const CORE_NOTES = ["3.4", "3.5", "3.6", "3.8", "3.9", "3.10"];
const NOTE_DEMOS = { "3.4": "matrix-product", "3.9": "inverse-steps", "3.10": "linear-map" };

let payload;
let notes;
const note = (prefix) => notes.find(([name]) => name.startsWith(prefix))[1];
const section = (number) => notes.find(([name]) => name.startsWith(`${number}-`))[1];
const count = (text, pattern) => (text.match(pattern) || []).length;

before(() => {
  buildSite();
  payload = readPayload("docs/linear1");
  notes = fs
    .readdirSync(CHAPTER)
    .filter((name) => name.endsWith(".md"))
    .map((name) => [name, fs.readFileSync(path.join(CHAPTER, name), "utf8")]);
});

test("every numbered item of chapter 3 is indexed, notations included, in book order", () => {
  for (const number of STATEMENTS) assert.ok(payload.statements[number], number);
  const indexed = Object.keys(payload.statements).filter((number) => number.startsWith("3."));
  assert.deepEqual(indexed, STATEMENTS);
});

test("the extra statement kind stays with linear algebra", () => {
  const infi = readPayload("docs/infi");
  assert.equal(infi.statements["1.50"], undefined);
});

test("chapter 3 is its own group, gateway first and the recipes last", () => {
  const group = payload.navGroups.find((item) => item.number === 3);
  assert.equal(group.subtitle, "מטריצות");
  const titles = group.pageIds.map((id) => path.basename(payload.pages.find((page) => page.id === id).path, ".md"));
  assert.equal(titles[0], "שער-פרק-3");
  assert.equal(titles.at(-1), "מתכוני-עבודה-פרק-3");
  assert.deepEqual(titles.slice(1, -1).map((title) => title.split("-")[0]), SECTIONS);
});

test("each note cites the book once, at the top, naming the volume", () => {
  for (const [name, text] of notes) {
    const lines = text.match(/^> מקור:.*$/gm) || [];
    assert.equal(lines.length, 1, name);
    assert.match(lines[0], /כרך א/, name);
  }
});

test("every section note explains simply and ends with a worked self-check", () => {
  for (const number of SECTIONS) {
    const text = section(number);
    const simple = CORE_NOTES.includes(number) ? 3 : 2;
    assert.ok(count(text, /^> \[!simple\]- /gm) >= simple, number);
    assert.match(text, /^## כרטיס דיוק/m, number);
    assert.ok(count(text, /^> \[!solution\]- /gm) >= 4, number);
  }
});

test("every marked proof has a plan, and no box sits inside a proof", () => {
  for (const [name, text] of notes) {
    assert.equal(count(text, /^> \[!plan\]/gm), count(text, /<!-- infi-proof:/g), name);
    for (const [, body] of text.matchAll(/<!-- infi-proof: [^>]+-->([\s\S]*?)<!-- \/infi-proof -->/g)) {
      assert.doesNotMatch(body, /^> /m, name);
    }
  }
});

test("each key theorem of chapter 3 is listed and linked to its marked proof", () => {
  const rows = payload.examTheorems.filter((row) => row.number.startsWith("3."));
  assert.deepEqual(rows.map((row) => row.number), KEY_THEOREMS);
  for (const row of rows) assert.ok(row.proofPageId, row.number);
});

test("chapter 3 has its own flashcards", () => {
  const cards = payload.flashcards.filter((card) => card.unit === "unit-3");
  assert.ok(cards.length >= 25, String(cards.length));
});

test("the new illustrations sit in their notes, in the client and in the gallery", () => {
  const demos = fs.readFileSync(path.join(root, "web-app/assets/demos.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "web-app/assets/app.js"), "utf8");
  for (const [number, name] of Object.entries(NOTE_DEMOS)) {
    assert.ok(section(number).includes(`<!-- infi-demo: ${name} -->`), `${number} ${name}`);
    assert.ok(demos.includes(`DEMOS["${name}"]`), name);
    assert.match(app, new RegExp(`name: "${name}"[\\s\\S]*?sketch:`), name);
  }
});

test("the recipes note has four recipes, the common mistakes and a self-check", () => {
  const text = note("מתכוני");
  assert.equal(count(text, /^## מתכון /gm), 4);
  assert.match(text, /^## טעויות נפוצות/m);
  assert.match(text, /^## כרטיס דיוק/m);
  assert.ok(count(text, /^> \[!solution\]- /gm) >= 5);
});

test("the gateway shows what each note answers, with pages", () => {
  const text = note("שער");
  assert.match(text, /^## מה שואל כל פתק/m);
  assert.match(text, /\| \[\[3\.10-אפיונים-של-הפיכות\]\] \|.*עמ׳ 292–298/);
  for (const number of SECTIONS) assert.ok(text.includes(`[[${number}-`), number);
});

test("the course map lists chapter 3", () => {
  const map = fs.readFileSync(path.join(root, "אלגברה לינארית 1", "אלגברה לינארית 1 - מפת הקורס.md"), "utf8");
  assert.match(map, /### פרק 3: מטריצות/);
  assert.match(map, /\[\[מתכוני-עבודה-פרק-3\]\]/);
});
