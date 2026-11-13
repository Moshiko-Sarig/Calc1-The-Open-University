import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";

import { buildCourse, parseExamSolutions } from "../tools/build-site.mjs";
import { COURSES } from "../tools/courses.mjs";
import { buildSite, readPayload, root } from "./helpers.mjs";

const exams = JSON.parse(fs.readFileSync(path.join(root, "exams/exams.json"), "utf8"));
const exam = exams.find((item) => item.n === 41);
const source = fs.readFileSync(path.join(root, "exams/solutions/41.md"), "utf8");

before(buildSite);

test("41.md splits into question 3's two parts, with three hints each, and question 6's MC answers", () => {
  const studies = parseExamSolutions(source, exam);
  assert.deepEqual(Object.keys(studies), ["3", "6"]);
  assert.deepEqual(studies[3].parts.map((part) => part.label), ["א", "ב"]);
  assert.deepEqual(studies[3].parts.map((part) => part.hints.length), [3, 3]);
  for (const part of [...studies[3].parts, ...studies[6].parts]) {
    assert.match(part.simple, /<details class="callout callout-simple" open>/);
    assert.match(part.simple, /בשורה אחת/);
    assert.match(part.simple, /תמונה בראש/);
    assert.match(part.simple, /עם מספרים/);
  }
  assert.deepEqual(studies[6].mc, { 1: false, 2: false });
  assert.equal(studies[3].parts[0].steps.length, 4);
  assert.equal(studies[3].parts[1].steps.length, 4);
  assert.equal(studies[6].parts[0].steps.length, 2);
  assert.match(studies[3].parts[0].steps[0], /התשובה: לא נכון/);
  assert.match(studies[3].parts[0].steps[2], /למה\?/);
  assert.match(studies[3].question, /class="math math-inline" dir="ltr"/);
  assert.match(studies[3].parts[0].mistakes, /callout-mistake/);
});

test("letter answers and similar questions use the existing callout, link and math pipeline", () => {
  const raw = "## שאלה 6\n<!-- mc: answer=ב -->\n\n> [!question] השאלה\n> $x$\n\n> [!simple]- במילים פשוטות\n> **בשורה אחת**: נספור אחד.\n\n> [!solution]- פתרון\n> **שלב 1**: $x=1$\n\n**שאלות דומות**: [שאלה](#/exams/41/q3)\n";
  const study = parseExamSolutions(raw, exam)[6];
  assert.deepEqual(study.mc, { answer: "ב" });
  assert.match(study.similar, /href="#\/exams\/41\/q3"/);
  assert.match(study.parts[0].solution, /callout-solution/);
});

test("malformed questions, missing solutions and MC metadata fail with the source filename", () => {
  for (const [raw, message] of [
    [source.replace("## שאלה 3", "## שאלה 99"), /41.md: question 99 is not in exams.json/],
    ["## שאלה 3\n\n> [!question]\n> טקסט\n", /question 3: missing solution box/],
    [source.replace("1=false", "1=maybe"), /malformed mc comment/],
    [source.replace("exam: 41", "exam: 42"), /metadata 42 does not match/],
    [source + "\n## שאלה 3\n", /duplicate question 3/],
    [source.replace(/> \[!simple\]- במילים פשוטות\n(?:>.*\n)+/g, ""), /question 3, part א: missing simple box/]
  ]) assert.throws(() => parseExamSolutions(raw, exam), message);
});

test("a course build rejects bad solution files from a temporary fixture", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exam-solutions-"));
  try {
    const vault = path.join(dir, "vault");
    const solutions = path.join(dir, "exams", "solutions");
    fs.mkdirSync(vault);
    fs.mkdirSync(solutions, { recursive: true });
    fs.writeFileSync(path.join(vault, "פתק.md"), "# פתק\n\nבדיקה\n");
    fs.writeFileSync(path.join(dir, "exams", "exams.json"), JSON.stringify([exam]));
    const config = { ...COURSES[0], vaultDir: vault, examsDir: path.join(dir, "exams"), outDir: path.join(dir, "out") };
    fs.writeFileSync(path.join(solutions, "999.md"), source);
    assert.throws(() => buildCourse(config), /999.md: unknown exam 999/);
    fs.rmSync(path.join(solutions, "999.md"));
    fs.writeFileSync(path.join(solutions, "41.md"), "## שאלה 3\n\n> [!question]\n> שאלה\n");
    assert.throws(() => buildCourse(config), /41.md: question 3: missing solution box/);
    fs.writeFileSync(path.join(solutions, "41.md"), source.replace("## שאלה 3", "## שאלה 99"));
    assert.throws(() => buildCourse(config), /question 99 is not in exams.json/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("generated docs carry study markup and the study, trainer and simulation UI", () => {
  const built = readPayload("docs/infi").exams.find((item) => item.n === 41);
  assert.match(built.questions.find((q) => q.q === 3).study.question, /callout-question/);
  for (const q of [3, 6]) {
    for (const part of built.questions.find((item) => item.q === q).study.parts) assert.match(part.simple, /callout-simple" open/);
  }
  assert.deepEqual(built.questions.find((q) => q.q === 6).study.mc, { 1: false, 2: false });
  const js = fs.readFileSync(path.join(root, "docs/infi/assets/exams.js"), "utf8");
  assert.ok(js.indexOf("${part.simple}") < js.indexOf("<div data-hints"), "plain words precede hints");
  for (const marker of ["data-study-part", "data-next-hint", "data-next-step", "data-rating", "data-mc-statement", "data-sim-time", "data-score"]) assert.ok(js.includes(marker), marker);
  assert.match(fs.readFileSync(path.join(root, "docs/infi/assets/site.css"), "utf8"), /\.callout-mistake/);
});
