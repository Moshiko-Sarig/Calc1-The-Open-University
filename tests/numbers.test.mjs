import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";

import { buildCourse } from "../tools/build-site.mjs";
import { COURSES } from "../tools/courses.mjs";
import { compareNumbers, NUMBER_SOURCE, numberFromKey, numberKey } from "../tools/lib/numbers.mjs";
import { root } from "./helpers.mjs";

test("numberKey and numberFromKey round-trip every dot and hyphen", () => {
  assert.equal(numberKey("1.47"), "1-47");
  assert.equal(numberKey("1.10.5"), "1-10-5");
  assert.equal(numberFromKey("1-47"), "1.47");
  assert.equal(numberFromKey("1-10-5"), "1.10.5");
});

test("compareNumbers sorts by value, so 1.10.1 comes after 1.2.9", () => {
  assert.deepEqual(["1.10.1", "1.2.9", "1.1.1"].sort(compareNumbers), ["1.1.1", "1.2.9", "1.10.1"]);
  assert.deepEqual(["2.1", "1.47", "1.5"].sort(compareNumbers), ["1.5", "1.47", "2.1"]);
});

test("NUMBER_SOURCE takes a whole number at both depths", () => {
  const regex = new RegExp(NUMBER_SOURCE);
  assert.equal("משפט 1.10.5 ב".match(regex)[0], "1.10.5");
  assert.equal("טענה 1.47 ב".match(regex)[0], "1.47");
});

// The regexes in the browser code cannot import the module, so run them as written.
function browserRegex(name) {
  const source = fs.readFileSync(path.join(root, "web-app/assets/study.js"), "utf8");
  const kinds = source.match(/const KINDS = ("[^"]+");/)[1];
  const line = source.match(new RegExp(`const ${name} = ([^\\n]+);`))[1];
  return new Function("KINDS", `return ${line};`)(JSON.parse(kinds));
}

test("the study tools read a three-level reference whole", () => {
  const named = browserRegex("NAMED_REF");
  assert.deepEqual([..."לפי משפט 1.10.5 נקבל".matchAll(named)].map((m) => m[2]), ["1.10.5"]);
  assert.deepEqual([..."לפי משפט 2.12 נקבל".matchAll(named)].map((m) => m[2]), ["2.12"]);
  const bare = browserRegex("BARE_REF");
  assert.deepEqual([..."(1.10.5) ו-(2.12)".matchAll(bare)].map((m) => m[1]), ["1.10.5", "2.12"]);
});

test("a statement's short name loses the whole number, at both depths", () => {
  const source = fs.readFileSync(path.join(root, "web-app/assets/study.js"), "utf8");
  const kinds = JSON.parse(source.match(/const KINDS = ("[^"]+");/)[1]);
  const body = source.match(/function cleanName\(html\) \{([\s\S]*?)\n  \}/)[1];
  const cleanName = new Function("html", "KINDS", body);
  assert.equal(cleanName("הגדרה 1.10.2: מטריצת מדרגות", kinds), "מטריצת מדרגות");
  assert.equal(cleanName("משפט 1.47: מקסימום", kinds), "מקסימום");
  assert.equal(cleanName("שם יפה (1.10.5)", kinds), "שם יפה");
});

test("the statement preview turns a three-level anchor back into its number", () => {
  const source = fs.readFileSync(path.join(root, "web-app/assets/app.js"), "utf8");
  assert.doesNotMatch(source, /\.replace\("-", "\."\)/);
});

const NOTE = `---
tags: [לינארית1, פרק1]
---

# פתק בדיקה

## משפט 1.10.5

ניסוח המשפט.

<!-- infi-proof: 1.10.5 -->

**הוכחה**: שלב ראשון. ∎

<!-- /infi-proof -->

**הגדרה 1.11.1**: פסקה שנפתחת במספר.

## משפטים 1.2.1–1.2.5

הטווח הזה אינו משפט אחד.

## ההגדרה (1.3.2)

מספר בסוגריים בכותרת.
`;

const LIST = `# רשימת משפטים לבדיקה

| מספר | סוג | התוכן | ההוכחה בכספת |
|---|---|---|---|
| 1.10.5 | משפט | כל מטריצה ניתנת לדירוג | [[פתק בדיקה]] |
`;

let payload;

before(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "numbers-"));
  const vault = path.join(dir, "vault");
  fs.mkdirSync(path.join(vault, "פרק 1 - בדיקה"), { recursive: true });
  fs.mkdirSync(path.join(vault, "00 - מרכז הכספת"), { recursive: true });
  fs.writeFileSync(path.join(vault, "פרק 1 - בדיקה", "פתק בדיקה.md"), NOTE);
  fs.writeFileSync(path.join(vault, "00 - מרכז הכספת", "רשימת משפטים לבדיקה.md"), LIST);
  const linear = COURSES.find((course) => course.id === "linear1");
  payload = buildCourse({ ...linear, theoremListTitle: "רשימת משפטים לבדיקה", vaultDir: vault, outDir: path.join(dir, "out") });
});

test("a heading with a three-level number is indexed under the whole number", () => {
  assert.equal(payload.statements["1.10.5"]?.kind, "משפט");
  assert.equal(payload.statements["1.10"], undefined);
});

test("a paragraph that opens with a three-level number gets a whole anchor", () => {
  assert.equal(payload.statements["1.11.1"]?.anchor, "stmt-1-11-1");
  assert.equal(payload.statements["1.11"], undefined);
});

test("a bare number in a heading is indexed whole", () => {
  assert.equal(payload.statements["1.3.2"]?.kind, "הגדרה");
});

test("a range in a heading is not a statement", () => {
  assert.equal(payload.statements["1.2.1"], undefined);
  assert.equal(payload.statements["1.2.5"], undefined);
});

test("a three-level proof marker creates a proof block", () => {
  const html = payload.pages.map((page) => page.html).join("");
  assert.match(html, /id="proof-1-10-5" data-proof="1\.10\.5"/);
});

test("the theorem list links a three-level row to its proof", () => {
  assert.equal(payload.examTheorems.length, 1);
  assert.equal(payload.examTheorems[0].number, "1.10.5");
  assert.ok(payload.examTheorems[0].proofPageId);
  assert.equal(payload.examTheorems[0].proofAnchor, "proof-1-10-5");
});
