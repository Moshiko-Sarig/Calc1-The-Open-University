import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";

import { compareNumbers } from "../tools/lib/numbers.mjs";
import { buildSite, readPayload, root } from "./helpers.mjs";

const CHAPTER = path.join(root, "אלגברה לינארית 1", "פרק 1 - מערכות משוואות לינאריות");
const range = (section, last) => Array.from({ length: last }, (_, i) => `1.${section}.${i + 1}`);

let payload;
let notes;

before(() => {
  buildSite();
  payload = readPayload("docs/linear1");
  notes = fs.readdirSync(CHAPTER).filter((name) => name.endsWith(".md") && !name.startsWith("שער "));
});

test("the fields note states all of section 1.2", () => {
  for (const number of range(2, 9)) assert.ok(payload.statements[number], number);
});

test("the echelon note states all of section 1.10", () => {
  for (const number of range(10, 6)) assert.ok(payload.statements[number], number);
});

test("the marked proofs of the two pilot notes exist", () => {
  const html = payload.pages.map((page) => page.html).join("");
  for (const number of ["1.2.2", "1.2.4", "1.2.6", "1.10.5"]) assert.ok(html.includes(`data-proof="${number}"`), number);
});

const ALL_STATEMENTS = [
  ...range(1, 9),
  ...range(2, 9),
  ...range(3, 5),
  ...range(4, 2),
  ...range(5, 3),
  ...range(7, 3),
  ...range(8, 1),
  ...range(10, 6),
  ...range(11, 3),
  ...range(12, 3),
  ...range(13, 2),
  ...range(14, 4)
];

const KEY_THEOREMS = ["1.1.6", "1.2.2", "1.2.4", "1.2.6", "1.7.3", "1.10.5", "1.11.2", "1.11.3", "1.12.1", "1.12.2", "1.13.1", "1.14.1", "1.14.2", "1.14.3", "1.14.4"];

const NOTES = [
  "פעולות על קבוצה",
  "שדות",
  "ה-n-יות",
  "משוואות לינאריות",
  "מערכות לינאריות ומטריצת המקדמים",
  "שקילות ופעולות אלמנטריות",
  "שיטת החילוץ",
  "מטריצות מדרגות ומשפט הדירוג",
  "ההצגה הקנונית",
  "כמות הפתרונות",
  "מערכות הומוגניות",
  "מערכות מסדר n על n"
];

test("the chapter states all 50 numbered items of the book", () => {
  assert.equal(ALL_STATEMENTS.length, 50);
  const missing = ALL_STATEMENTS.filter((number) => !payload.statements[number]);
  assert.deepEqual(missing, []);
});

test("statements reach the client in the book's order, so definition cards do too", () => {
  assert.deepEqual(Object.keys(payload.statements).filter((number) => number.startsWith("1.")), ALL_STATEMENTS);
  assert.deepEqual([...ALL_STATEMENTS].sort(compareNumbers), ALL_STATEMENTS);
});

test("each key theorem is linked to its marked proof", () => {
  assert.deepEqual(payload.examTheorems.map((row) => row.number).sort(compareNumbers), KEY_THEOREMS);
  for (const row of payload.examTheorems) assert.ok(row.proofPageId, row.number);
});

test("the key theorem list says plainly that it is not official", () => {
  const list = payload.pages.find((page) => page.id === payload.examListPageId);
  assert.match(list.html, /לא רשימה רשמית/);
});

test("the chapter has at least 25 flashcards, all under chapter 1", () => {
  assert.ok(payload.flashcards.length >= 25, String(payload.flashcards.length));
  const authored = payload.flashcards.filter((card) => card.unit);
  assert.ok(authored.length >= 25);
  for (const card of authored) assert.equal(card.unit, "unit-1");
});

test("the gateway's study order covers all twelve notes, in order", () => {
  const group = payload.navGroups.find((item) => item.number === 1);
  const titles = group.pageIds.map((id) => path.basename(payload.pages.find((page) => page.id === id).path, ".md"));
  assert.deepEqual(titles.slice(1), NOTES);
});

test("both demos live in their notes", () => {
  const html = (title) => payload.pages.find((page) => path.basename(page.path, ".md") === title).html;
  assert.match(html("שיטת החילוץ"), /data-demo="row-reduction"/);
  assert.match(html("כמות הפתרונות"), /data-demo="solution-count"/);
});

test("every note ends its study with a self-check that has worked solutions", () => {
  for (const name of notes) {
    const text = fs.readFileSync(path.join(CHAPTER, name), "utf8");
    assert.match(text, /^## כרטיס דיוק/m, name);
    assert.match(text, /^> \[!solution\]- /m, name);
  }
});

test("every note in the chapter opens by citing its source in the book", () => {
  assert.ok(notes.length >= 2);
  for (const name of notes) {
    const text = fs.readFileSync(path.join(CHAPTER, name), "utf8");
    assert.match(text, /^> מקור: כרך א, סעי(?:ף|פים) /m, name);
  }
});

test("every wiki link in the course resolves to a note", () => {
  const known = new Set(payload.pages.flatMap((page) => [page.title, path.basename(page.path, ".md"), ...(page.aliases || [])]));
  const vault = path.join(root, "אלגברה לינארית 1");
  const files = fs.readdirSync(vault, { recursive: true }).filter((name) => name.endsWith(".md"));
  for (const file of files) {
    const text = fs.readFileSync(path.join(vault, file), "utf8");
    for (const [, target] of text.matchAll(/\[\[([^\]|#]+)/g)) assert.ok(known.has(target.trim()), `${file}: [[${target}]]`);
  }
});

test("an augmented matrix reaches the page with its TeX whole", () => {
  const html = payload.pages.map((page) => page.html).join("");
  assert.match(html, /\\left\[\\begin\{array\}\{cccc\|c\}/);
  assert.doesNotMatch(html, /\{cccc<\/?td/);
});

test("notes do not put arrows between Hebrew words", () => {
  for (const name of notes) {
    const text = fs.readFileSync(path.join(CHAPTER, name), "utf8");
    const outsideMath = text.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, "");
    assert.doesNotMatch(outsideMath, /[⟹⟸⟵⟶⇒⇐→←]/, name);
  }
});

test("no box sits inside a proof block", () => {
  for (const name of notes) {
    const text = fs.readFileSync(path.join(CHAPTER, name), "utf8");
    for (const [, proof] of text.matchAll(/<!-- infi-proof: [\d.]+ -->([\s\S]*?)<!-- \/infi-proof -->/g)) {
      assert.doesNotMatch(proof, /^> \[!/m, name);
    }
  }
});

test("chapter 2 illustrations are drawn on the squared-paper gallery", () => {
  const app = fs.readFileSync(path.join(root, "web-app/assets/app.js"), "utf8");
  for (const name of ["vector-sum", "parametric-line", "span-basis"]) {
    assert.match(app, new RegExp(`name: "${name}"[\\s\\S]*?sketch:`), name);
    assert.ok(
      payload.pages.some((page) => page.groupId === "unit-2" && page.html.includes(`data-demo="${name}"`)),
      name
    );
  }
});
