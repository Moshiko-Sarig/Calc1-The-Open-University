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
