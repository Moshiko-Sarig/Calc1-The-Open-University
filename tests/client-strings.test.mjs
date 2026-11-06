import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { COURSES } from "../tools/courses.mjs";
import { root } from "./helpers.mjs";

const FILES = ["web-app/assets/app.js", "web-app/assets/study.js", "web-app/assets/exams.js"];

// Code only: the words of the comments may name the course they were written for.
function codeLines(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return source.split("\n").filter((line) => !line.trim().startsWith("//"));
}

function assertAbsent(pattern, files = FILES) {
  for (const file of files) {
    const hits = codeLines(file).filter((line) => pattern.test(line));
    assert.deepEqual(hits.map((line) => line.trim().slice(0, 80)), [], `${pattern} found in ${file}`);
  }
}

test("the client has no calculus course identity written into it", () => {
  assertAbsent(/אינפי/);
  assertAbsent(/20474/);
  assertAbsent(/המספרים הממשיים/);
});

test("the client says unit words only through the course's own words", () => {
  // "פתרון יחיד" is ordinary mathematics, not the word for a unit of the course.
  assertAbsent(/יחידה|יחידות/);
});

test("the theorem-list wording comes from the course", () => {
  assertAbsent(/מהרשימה לבחינה|משפטים לבחינה|שברשימה לבחינה/, ["web-app/assets/app.js", "web-app/assets/study.js"]);
});

test("per-course progress keys go through the course's prefix", () => {
  assertAbsent(/"infi-(?:recent|expanded|nav-collapsed|srs-v1|puzzle-v1)"/);
});

test("the shared reading preferences keep their existing keys", () => {
  const source = fs.readFileSync(path.join(root, "web-app/assets/app.js"), "utf8");
  assert.match(source, /"infi-theme"/);
  assert.match(source, /"infi-text-size"/);
});

test("the page template has no unit word written into it", () => {
  assert.doesNotMatch(fs.readFileSync(path.join(root, "web-app/index.html"), "utf8"), /יחיד/);
});

test("every course defines the same words, so no sentence is left with a hole", () => {
  const [first, ...rest] = COURSES;
  for (const course of rest) {
    assert.deepEqual(Object.keys(course.words).sort(), Object.keys(first.words).sort());
  }
  for (const course of COURSES) {
    for (const key of ["courseCode", "demosLead", "theoremBand", "examUseNote", "searchExample"]) assert.ok(course[key], `${course.id}.${key}`);
    assert.ok(course.sources.length > 0);
  }
});

test("the course switch shrinks to its mark where the header is tight, keeping its name for screen readers", () => {
  const css = fs.readFileSync(path.join(root, "web-app/assets/site.css"), "utf8");
  const tight = [...css.matchAll(/@media \(max-width: 1240px\) \{([\s\S]*?)\n\}/g)].map((match) => match[1]).join("\n");
  assert.match(tight, /\.primary-nav \.course-switch-name \{[^}]*clip-path/);
  const source = fs.readFileSync(path.join(root, "web-app/assets/app.js"), "utf8");
  assert.match(source, /<span class="course-switch-name">/);
  assert.match(source, /title="כל הקורסים"/);
});

test("the search hint offers a number from the course being read", () => {
  assertAbsent(/5\.29/);
  assert.equal(COURSES.find((course) => course.id === "infi").searchExample, "5.29");
  assert.equal(COURSES.find((course) => course.id === "linear1").searchExample, "1.10.5");
});

test("a page with new code and cached old content asks for a refresh instead of going blank", () => {
  const source = fs.readFileSync(path.join(root, "web-app/assets/app.js"), "utf8");
  const guard = source.indexOf("if (!data.course)");
  assert.ok(guard > 0 && guard < source.indexOf("const course = data.course"), "guard must run before the first read of data.course");
  assert.match(source.slice(guard, guard + 300), /רעננו את הדף/);
});

test("infi keeps every storage prefix existing visitors already have", () => {
  assert.equal(COURSES.find((course) => course.id === "infi").storagePrefix, "infi");
});
