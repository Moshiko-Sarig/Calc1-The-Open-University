import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";

import { buildSite, readPayload, root } from "./helpers.mjs";

const CHAPTER = path.join(root, "אלגברה לינארית 1", "פרק 4 - דטרמיננטות");
// Every numbered item in the book's list for chapter 4.
const STATEMENTS = [
  "4.1.1", "4.1.2", "4.1.3", "4.1.4",
  "4.2.1", "4.2.2",
  "4.3.1", "4.3.2", "4.3.3", "4.3.4", "4.3.5", "4.3.6", "4.3.7", "4.3.8",
  "4.4.1", "4.4.2",
  "4.5.1", "4.5.2", "4.5.3", "4.5.4",
  "4.6.1",
  "4.7.1", "4.7.2", "4.7.3", "4.7.4",
  "4.8.1", "4.8.2", "4.8.3", "4.8.4", "4.8.5", "4.8.6", "4.8.7", "4.8.8",
  "4.9.1", "4.9.2", "4.9.3", "4.9.4", "4.9.5", "4.9.6"
];
const SECTIONS = ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9"];

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

test("every numbered item of chapter 4 is indexed, in book order", () => {
  for (const number of STATEMENTS) assert.ok(payload.statements[number], number);
  const indexed = Object.keys(payload.statements).filter((number) => number.startsWith("4."));
  assert.deepEqual(indexed, STATEMENTS);
});

test("chapter 4 is its own group, gateway first and the recipes last", () => {
  const group = payload.navGroups.find((item) => item.number === 4);
  assert.equal(group.subtitle, "דטרמיננטות");
  const titles = group.pageIds.map((id) => path.basename(payload.pages.find((page) => page.id === id).path, ".md"));
  assert.equal(titles[0], "שער-פרק-4");
  assert.equal(titles.at(-1), "מתכוני-עבודה-פרק-4");
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
    assert.ok(count(text, /^> \[!simple\]- /gm) >= 2, number);
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

test("chapter 4 links three useful results from its gateway", () => {
  const group = payload.navGroups.find((item) => item.number === 4);
  const gateway = payload.pages.find((page) => page.id === group.gatewayId);
  assert.match(gateway.html, /שלושה משפטים שכדאי להכיר/);
  for (const number of ["4.3.6", "4.4.1", "4.5.1"]) {
    assert.ok(gateway.links.includes(payload.statements[number].pageId), number);
  }
});

test("chapter 4 has its own flashcards", () => {
  const cards = payload.flashcards.filter((card) => card.unit === "unit-4");
  assert.ok(cards.length >= 25, String(cards.length));
});

test("the optional sections say so, and the area picture sits in 4.9", () => {
  for (const number of ["4.8", "4.9"]) assert.match(section(number), /חומר רשות/, number);
  assert.ok(section("4.9").includes("<!-- infi-demo: linear-map -->"));
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
  assert.match(text, /\| \[\[4\.9-פונקציית-נפח\]\] \|.*עמ׳ 380–392/);
  for (const number of SECTIONS) assert.ok(text.includes(`[[${number}-`), number);
});

test("the course map lists chapter 4", () => {
  const map = fs.readFileSync(path.join(root, "אלגברה לינארית 1", "אלגברה לינארית 1 - מפת הקורס.md"), "utf8");
  assert.match(map, /### פרק 4: דטרמיננטות/);
  assert.match(map, /\[\[מתכוני-עבודה-פרק-4\]\]/);
});
