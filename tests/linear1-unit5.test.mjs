import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";

import { buildSite, readPayload, root } from "./helpers.mjs";

const CHAPTER = path.join(root, "אלגברה לינארית 1", "פרק 5 - שדות סופיים");
// Every numbered item in chapter 5 of the book, in book order.
const STATEMENTS = [
  "5.1.1", "5.1.2",
  "5.2.1", "5.2.2", "5.2.3", "5.2.4", "5.2.5", "5.2.6", "5.2.7", "5.2.8", "5.2.9", "5.2.10", "5.2.11", "5.2.12",
  "5.3.1", "5.3.2", "5.3.3", "5.3.4", "5.3.5", "5.3.6",
  "5.4.1", "5.4.2",
  "5.5.1",
  "5.6.1", "5.6.2", "5.6.3", "5.6.4", "5.6.5", "5.6.6", "5.6.7"
];
const SECTIONS = ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6"];

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

test("every numbered item of chapter 5 is indexed, in book order", () => {
  for (const number of STATEMENTS) assert.ok(payload.statements[number], number);
  const indexed = Object.keys(payload.statements).filter((number) => number.startsWith("5."));
  assert.deepEqual(indexed, STATEMENTS);
});

test("chapter 5 is its own group in volume B, gateway first and the recipes last", () => {
  const group = payload.navGroups.find((item) => item.number === 5);
  assert.equal(group.subtitle, "שדות סופיים");
  const titles = group.pageIds.map((id) => path.basename(payload.pages.find((page) => page.id === id).path, ".md"));
  assert.equal(titles[0], "שער-פרק-5");
  assert.equal(titles.at(-1), "מתכוני-עבודה-פרק-5");
  assert.deepEqual(titles.slice(1, -1).map((title) => title.split("-")[0]), SECTIONS);
});

test("each note cites volume B once, at the top", () => {
  for (const [name, text] of notes) {
    const lines = text.match(/^> מקור:.*$/gm) || [];
    assert.equal(lines.length, 1, name);
    assert.match(lines[0], /כרך ב/, name);
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

test("divisibility is written with \\mid, never with a bare bar", () => {
  for (const [name, text] of notes) {
    for (const [math] of text.matchAll(/\$[^$\n]+\$/g)) {
      // Column specs like {cc|c} draw the bar of an augmented matrix, not a divisor.
      // An absolute value |b| is fine too.
      const body = math.replace(/\\begin\{array\}\{[^}]*\}/g, "").replace(/\|-?[a-z0-9]+\|/gi, "");
      assert.doesNotMatch(body, /[a-z0-9]\s*\|\s*[a-z0-9]/i, `${name}: ${math}`);
    }
  }
});

test("chapter 5 links three useful results from its gateway, and shows the Z_n table", () => {
  const group = payload.navGroups.find((item) => item.number === 5);
  const gateway = payload.pages.find((page) => page.id === group.gatewayId);
  assert.match(gateway.html, /שלושה משפטים שכדאי להכיר/);
  assert.match(gateway.html, /data-demo="zn-table"/);
  for (const number of ["5.2.3", "5.3.6", "5.4.1"]) {
    assert.ok(gateway.links.includes(payload.statements[number].pageId), number);
  }
});

test("chapter 5 has its own flashcards", () => {
  const cards = payload.flashcards.filter((card) => card.unit === "unit-5");
  assert.ok(cards.length >= 25, String(cards.length));
});

test("the optional sections say so", () => {
  for (const number of ["5.5", "5.6"]) assert.match(section(number), /חומר רשות/, number);
});

test("the recipes note has five recipes, the common mistakes and a self-check", () => {
  const text = note("מתכוני");
  assert.equal(count(text, /^## מתכון /gm), 5);
  assert.match(text, /^## טעויות נפוצות/m);
  assert.match(text, /^## כרטיס דיוק/m);
  assert.ok(count(text, /^> \[!solution\]- /gm) >= 5);
});

test("the gateway shows what each note answers, with pages", () => {
  const text = note("שער");
  assert.match(text, /^## מה שואל כל פתק/m);
  assert.match(text, /\| \[\[5\.6-האלגוריתם-של-אוקלידס\]\] \|.*עמ׳ 33–39/);
  for (const number of SECTIONS) assert.ok(text.includes(`[[${number}-`), number);
});

test("the course map lists chapter 5 under volume B", () => {
  const map = fs.readFileSync(path.join(root, "אלגברה לינארית 1", "אלגברה לינארית 1 - מפת הקורס.md"), "utf8");
  assert.match(map, /## כרך ב\s+### פרק 5: שדות סופיים/);
  assert.match(map, /\[\[מתכוני-עבודה-פרק-5\]\]/);
});
