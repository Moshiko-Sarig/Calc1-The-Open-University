import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";

import { buildSite, readPayload, root } from "./helpers.mjs";

const CHAPTER = path.join(root, "אלגברה לינארית 1", "פרק 2 - המרחב Fn");
const STATEMENTS = [
  "2.2.1", "2.2.2",
  "2.3.1", "2.3.2", "2.3.3", "2.3.4", "2.3.5", "2.3.6", "2.3.7", "2.3.8", "2.3.9", "2.3.10", "2.3.11",
  "2.5.1", "2.5.2", "2.5.3",
  "2.6.1", "2.6.2", "2.6.3", "2.6.4", "2.6.5", "2.6.6", "2.6.7",
  "2.7.1", "2.7.2", "2.7.3", "2.7.4", "2.7.5", "2.7.6", "2.7.7", "2.7.8", "2.7.9", "2.7.10", "2.7.11"
];

let payload;
let notes;
const note = (prefix) => notes.find(([name]) => name.startsWith(prefix))[1];

before(() => {
  buildSite();
  payload = readPayload("docs/linear1");
  notes = fs
    .readdirSync(CHAPTER)
    .filter((name) => name.endsWith(".md"))
    .map((name) => [name, fs.readFileSync(path.join(CHAPTER, name), "utf8")]);
});

test("every numbered statement of chapter 2 is indexed", () => {
  for (const number of STATEMENTS) assert.ok(payload.statements[number], number);
});

test("each note cites the book once, at the top, naming the volume", () => {
  for (const [name, text] of notes) {
    const lines = text.match(/^> מקור:.*$/gm) || [];
    assert.equal(lines.length, 1, name);
    assert.match(lines[0], /כרך א/, name);
  }
});

test("a sequence with repeats is not ruled out as an ordered basis by fiat", () => {
  assert.doesNotMatch(note("2.7"), /סדרה עם חזרות אינה בסיס סדור/);
});

test("the coordinates in the non-standard basis example are derived", () => {
  assert.match(note("2.7"), /s\+2t=y/);
});

test("the field note says why division matters, without the stray rebuttal aside", () => {
  assert.doesNotMatch(note("2.1"), /אין להסיק שמחוץ לשדה/);
});

test("the R³ remark reports what the book does", () => {
  assert.doesNotMatch(note("2.2"), /הרעיון דומה/);
});

test("claim 2.3.2 explains the b on the line case as part of the flow", () => {
  assert.doesNotMatch(note("2.3"), /דיוק ביחס לנוסח הספר/);
});

const CORE_NOTES = ["2.5", "2.6", "2.7"];
const count = (text, pattern) => (text.match(pattern) || []).length;

test("chapter 2 links three useful results from its gateway", () => {
  const group = payload.navGroups.find((item) => item.number === 2);
  const gateway = payload.pages.find((page) => page.id === group.gatewayId);
  assert.match(gateway.html, /שלושה משפטים שכדאי להכיר/);
  for (const number of ["2.5.3", "2.6.3", "2.7.11"]) {
    assert.ok(gateway.links.includes(payload.statements[number].pageId), number);
  }
});

test("every marked proof in 2.5–2.7 has a plan just before it", () => {
  for (const prefix of CORE_NOTES) {
    const text = note(prefix);
    assert.equal(count(text, /^> \[!plan\]/gm), count(text, /<!-- infi-proof:/g), prefix);
    assert.ok(count(text, /<!-- infi-proof:/g) >= 1, prefix);
  }
});

test("the core notes explain in simple words and end with a worked self-check", () => {
  for (const prefix of CORE_NOTES) {
    const text = note(prefix);
    assert.ok(count(text, /^> \[!simple\]- /gm) >= 3, prefix);
    assert.match(text, /^## כרטיס דיוק/m, prefix);
    assert.ok(count(text, /^> \[!solution\]- /gm) >= 4, prefix);
  }
});

test("no box sits inside a proof in the core notes", () => {
  for (const prefix of CORE_NOTES) {
    for (const [, body] of note(prefix).matchAll(/<!-- infi-proof: [^>]+-->([\s\S]*?)<!-- \/infi-proof -->/g)) {
      assert.doesNotMatch(body, /^> /m, prefix);
    }
  }
});

test("chapter 2 has its own flashcards", () => {
  const cards = payload.flashcards.filter((card) => card.unit === "unit-2");
  assert.ok(cards.length >= 15, String(cards.length));
});

const EARLY_NOTES = ["2.1", "2.2", "2.3", "2.4"];

test("the early notes explain in simple words and end with a worked self-check", () => {
  for (const prefix of EARLY_NOTES) {
    const text = note(prefix);
    assert.ok(count(text, /^> \[!simple\]- /gm) >= 2, prefix);
    assert.match(text, /^## כרטיס דיוק/m, prefix);
    assert.ok(count(text, /^> \[!solution\]- /gm) >= 4, prefix);
    assert.equal(count(text, /^> \[!plan\]/gm), count(text, /<!-- infi-proof:/g), prefix);
    for (const [, body] of text.matchAll(/<!-- infi-proof: [^>]+-->([\s\S]*?)<!-- \/infi-proof -->/g)) {
      assert.doesNotMatch(body, /^> /m, prefix);
    }
  }
});

test("the proofs of the early notes are marked where the theorems are", () => {
  assert.match(note("2.2"), /<!-- infi-proof: 2\.2\.1 -->/);
  for (const number of ["2.3.3", "2.3.7", "2.3.8"]) assert.ok(note("2.3").includes(`<!-- infi-proof: ${number} -->`), number);
});

const NOTE_DEMOS = { "2.5": ["reach-target", "rows-columns"], "2.6": ["dependence"], "2.7": ["basis-coordinates"] };

test("each core note has its own illustration, and the repeated one is gone", () => {
  for (const [prefix, names] of Object.entries(NOTE_DEMOS)) {
    for (const name of names) assert.ok(note(prefix).includes(`<!-- infi-demo: ${name} -->`), `${prefix} ${name}`);
  }
  for (const [name, text] of notes) assert.doesNotMatch(text, /infi-demo: span-basis/, name);
});

test("the new illustrations exist in the client and in the gallery", () => {
  const demos = fs.readFileSync(path.join(root, "web-app/assets/demos.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "web-app/assets/app.js"), "utf8");
  for (const name of Object.values(NOTE_DEMOS).flat()) {
    assert.ok(demos.includes(`DEMOS["${name}"]`), name);
    assert.match(app, new RegExp(`name: "${name}"[\\s\\S]*?sketch:`), name);
  }
  assert.doesNotMatch(demos + app, /span-basis/);
});

test("the working recipes note comes last in the study order and is complete", () => {
  const group = payload.navGroups.find((item) => item.number === 2);
  const titles = group.pageIds.map((id) => path.basename(payload.pages.find((page) => page.id === id).path, ".md"));
  assert.equal(titles.at(-1), "מתכוני-עבודה-פרק-2");
  const text = note("מתכוני");
  for (const number of ["2.5.3", "2.6.5", "2.7.3", "2.7.11", "2.7.9"]) assert.ok(text.includes(number), number);
  assert.ok(count(text, /^## מתכון /gm) === 4);
  assert.match(text, /^## טעויות נפוצות/m);
  assert.match(text, /^## כרטיס דיוק/m);
  assert.ok(count(text, /^> \[!solution\]- /gm) >= 5);
});

test("the gateway shows what each note answers, with pages", () => {
  const text = note("שער");
  assert.match(text, /^## מה שואל כל פתק/m);
  assert.match(text, /\| \[\[2\.7-בסיסים-ל-Fn\]\] \|.*עמ׳ 191–201/);
});
