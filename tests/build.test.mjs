import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";

import { buildCourse, renderCourseCards } from "../tools/build-site.mjs";
import { COURSES } from "../tools/courses.mjs";
import { compareContent } from "../tools/compare-build.mjs";
import { buildSite, readPayload, root } from "./helpers.mjs";

const out = (...parts) => path.join(root, "docs", "linear1", ...parts);
const baseline = path.join(root, "tmp", "baseline-docs");

before(buildSite);

test("linear1 gets its own index.html with its own course identity", () => {
  const html = fs.readFileSync(out("index.html"), "utf8");
  assert.match(html, /20109/);
  assert.doesNotMatch(html, /20474/);
  assert.doesNotMatch(html, /\{\{/);
});

const landing = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("the calculus vault's mark is the infinity sign, on its site and on its card", () => {
  assert.match(fs.readFileSync(path.join(root, "docs", "infi", "index.html"), "utf8"), /<span class="brand-mark" aria-hidden="true">∞<\/span>/);
  assert.match(landing("docs", "index.html"), /<span class="course-cover-mark" aria-hidden="true">∞<\/span>/);
  assert.match(fs.readFileSync(out("index.html"), "utf8"), /<span class="brand-mark" aria-hidden="true">λ<\/span>/);
});

test("the site is called שואפים לאינסוף, with the infinity sign as its mark", () => {
  const html = landing("docs", "index.html");
  assert.match(html, /<title>שואפים לאינסוף/);
  assert.match(html, /<span class="brand-mark" aria-hidden="true">∞<\/span>\s*<span class="brand-text">\s*<strong>שואפים לאינסוף<\/strong>/);
  assert.doesNotMatch(html, /כספות הקורסים/);
});

test("no published page has leftover template tokens", () => {
  for (const file of ["docs/index.html", "docs/infi/index.html", "docs/linear1/index.html", "index.html"]) {
    assert.doesNotMatch(landing(file), /\{\{/, file);
  }
});

test("the home page has one card for every course, each opening that course's folder", () => {
  const html = landing("docs", "index.html");
  assert.equal(html.match(/class="course-card"/g).length, COURSES.length);
  assert.match(html, /href="infi\/"[\s\S]*?חשבון אינפיניטסימלי 1/);
  assert.match(html, /href="linear1\/"[\s\S]*?אלגברה לינארית 1/);
});

test("each card counts what that course really has", () => {
  const html = landing("docs", "index.html");
  const infi = readPayload("docs/infi");
  assert.match(html, new RegExp(`${infi.pages.length} פתקים`));
  assert.match(html, new RegExp(`${infi.exams.length} מבחני עבר`));
  assert.match(html, new RegExp(`${readPayload("docs/linear1").pages.length} פתקים`));
});

test("every course is a notebook with its own cover colour", () => {
  const html = landing("docs", "index.html");
  for (const course of COURSES) {
    assert.match(course.coverColor, /^#[0-9a-f]{6}$/i, course.id);
    assert.ok(html.includes(`style="--cover:${course.coverColor}"`), course.id);
  }
  assert.equal(new Set(COURSES.map((course) => course.coverColor)).size, COURSES.length);
});

test("a returning reader can continue, through a link that stays hidden until the script fills it", () => {
  const html = landing("docs", "index.html");
  for (const course of COURSES) {
    assert.ok(html.includes(`data-resume="${course.storagePrefix}"`), course.id);
  }
  assert.equal(html.match(/class="course-resume"[^>]*\bhidden\b/g).length, COURSES.length);
  assert.match(html, /-recent/);
});

test("a new course in the configuration gets a card without touching the page", () => {
  const extra = { ...COURSES[1], id: "extra", fullName: "קורס חדש", courseCode: "99999", outDir: "docs/extra", summary: "תקציר חדש" };
  const html = renderCourseCards([{ course: extra, payload: readPayload("docs/linear1") }]);
  assert.equal(html.match(/class="course-card"/g).length, 1);
  assert.match(html, /href="extra\/"/);
  assert.match(html, /קורס חדש/);
  assert.match(html, /תקציר חדש/);
  assert.match(html, /99999/);
});

test("a stat on a card never breaks between its number and its word", () => {
  const html = landing("docs", "index.html");
  assert.match(html, /<span class="course-card-stat">\d+ מבחני עבר<\/span>/);
  assert.match(fs.readFileSync(path.join(root, "web-app/assets/site.css"), "utf8"), /\.course-card-stat \{\s*white-space: nowrap;/);
});

test("card text is escaped", () => {
  const extra = { ...COURSES[1], fullName: 'א"ב <ג>', outDir: "docs/extra" };
  const html = renderCourseCards([{ course: extra, payload: readPayload("docs/linear1") }]);
  assert.doesNotMatch(html, /<ג>/);
});

test("an old link to a calculus page is sent on to the calculus site, hash and all", () => {
  const html = landing("docs", "index.html");
  const head = html.slice(0, html.indexOf("</head>"));
  assert.match(head, /location\.replace\("infi\/" \+ location\.hash\)/);
});

test("the home page stays the entrance: only a link to a specific calculus page is sent on", () => {
  const head = landing("docs", "index.html").split("</head>")[0];
  const oldLink = new RegExp(head.match(/\/\^(#\\\/\.)\/\.test\(location\.hash\)/)[1]);
  for (const hash of ["", "#", "#/"]) assert.equal(oldLink.test(hash), false, hash);
  for (const hash of ["#/page/p-1", "#/exams/3/q2", "#/index"]) assert.equal(oldLink.test(hash), true, hash);
});

test("an old link pasted while already on the home page is sent on too", () => {
  const html = landing("docs", "index.html");
  const head = html.slice(0, html.indexOf("</head>"));
  assert.match(head, /addEventListener\("hashchange", forwardOldLink\)/);
});

test("the root page shows the home page, with its assets under docs", () => {
  const html = landing("index.html");
  assert.match(html, /<base href="\.\/docs\/" \/>/);
  assert.match(html, /class="course-card"/);
});

test("nothing is left behind from when calculus lived at the root of the site", () => {
  for (const file of ["app.js", "content.js", "study.js", "exams.js", "demos.js"]) {
    assert.equal(fs.existsSync(path.join(root, "docs", "assets", file)), false, file);
  }
  assert.ok(fs.existsSync(path.join(root, "docs", "assets", "site.css")));
  assert.ok(fs.existsSync(path.join(root, "docs", "infi", "assets", "exams")));
  assert.ok(fs.existsSync(path.join(root, "docs", ".nojekyll")));
});

test("course folders do not carry the home page template", () => {
  assert.equal(fs.existsSync(path.join(root, "docs", "infi", "landing.html")), false);
  assert.equal(fs.existsSync(out("landing.html")), false);
});

test("linear1 content is built separately from infi", () => {
  const payload = readPayload("docs/linear1");
  assert.equal(payload.course.id, "linear1");
  assert.equal(payload.course.unitWord, "פרק");
  assert.ok(payload.pages.every((page) => !page.path.includes("אינפי")));
  assert.equal(readPayload("docs/infi").course.id, "infi");
});

test("infi scans and figures are not copied into linear1", () => {
  assert.equal(fs.existsSync(out("assets", "exams")), false);
  assert.equal(fs.existsSync(out("assets", "figures")), false);
});

test("a chapter folder becomes a unit named with the course's own word", () => {
  const group = readPayload("docs/linear1").navGroups.find((item) => item.number === 1);
  assert.equal(group.title, "פרק 1");
  assert.equal(group.subtitle, "מערכות משוואות לינאריות");
  assert.equal(group.volume, "כרך א");
});

test("only a course that uses the row-reduction engine loads it", () => {
  assert.match(fs.readFileSync(out("index.html"), "utf8"), /<script defer src="\.\/assets\/linalg\.js"><\/script>/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "docs", "index.html"), "utf8"), /linalg/);
});

test("the linear algebra demos are known to the build", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "demos-"));
  const vault = path.join(dir, "vault", "פרק 1 - בדיקה");
  fs.mkdirSync(vault, { recursive: true });
  fs.writeFileSync(path.join(vault, "פתק.md"), "# פתק\n\n<!-- infi-demo: row-reduction -->\n\n<!-- infi-demo: solution-count -->\n");
  const linear = COURSES.find((course) => course.id === "linear1");
  const payload = buildCourse({ ...linear, vaultDir: path.join(dir, "vault"), outDir: path.join(dir, "out") });
  assert.match(payload.pages[0].html, /data-demo="row-reduction"/);
  assert.match(payload.pages[0].html, /data-demo="solution-count"/);
});

test("each course links back to the home page with a relative address", () => {
  assert.equal(readPayload("docs/infi").homeHref, "../");
  assert.equal(readPayload("docs/linear1").homeHref, "../");
});

test("the client renders the way home in the header, the drawer and the cover", () => {
  const source = fs.readFileSync(path.join(root, "web-app/assets/app.js"), "utf8");
  assert.equal(source.match(/courseSwitchLink\("[a-z-]+"\)/g)?.length, 3);
  assert.match(source, /כל הקורסים/);
});

test("infi statements keep their order, so its definition cards do not move", { skip: !fs.existsSync(baseline) && "no local baseline in tmp/" }, () => {
  const before = JSON.parse(fs.readFileSync(path.join(baseline, "assets", "content.js"), "utf8").replace(/^[^=]*=/, "").trim().replace(/;$/, ""));
  assert.deepEqual(Object.keys(readPayload("docs/infi").statements), Object.keys(before.statements));
});

test("infi content is unchanged from the baseline build", { skip: !fs.existsSync(baseline) && "no local baseline in tmp/" }, () => {
  assert.deepEqual(compareContent(baseline, path.join(root, "docs", "infi")), { same: true, differences: [] });
});
