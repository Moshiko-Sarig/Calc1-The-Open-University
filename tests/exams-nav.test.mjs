import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { before, test } from "node:test";

import { buildSite, readPayload, root } from "./helpers.mjs";

before(buildSite);

test("initial data omits solution bodies and each versioned exam file restores them", () => {
  const assets = path.join(root, "docs/infi/assets");
  const readData = (file) => {
    const source = fs.readFileSync(path.join(assets, file), "utf8");
    return JSON.parse(source.slice(source.indexOf("=") + 1).trim().replace(/;$/, ""));
  };
  const fast = readData("content-fast.js");
  const full = readData("content.js");
  assert.ok(fs.statSync(path.join(assets, "content-fast.js")).size < fs.statSync(path.join(assets, "content.js")).size / 2);
  for (const exam of fast.exams) {
    const context = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(assets, "exam-studies", `${exam.n}.js`), "utf8"), context);
    const original = full.exams.find((item) => item.n === exam.n);
    for (const question of exam.questions) {
      const expected = original.questions.find((item) => item.q === question.q).study;
      if (!expected) continue;
      assert.equal(question.study.available, true);
      assert.equal(JSON.stringify(context.window.EXAM_STUDIES[exam.n][question.q]), JSON.stringify(expected));
    }
  }
});

// Render the shipped IIFE with a small DOM surface; browser checks cover layout
// and interactions. Keep this fixture independent of the number of solutions.
function render(route, ratings = {}) {
  const data = readPayload("docs/infi");
  const node = { value: "", offsetHeight: 60, style: { setProperty() {} }, addEventListener() {}, querySelectorAll: () => [] };
  const host = { innerHTML: "", querySelector: () => node, querySelectorAll: () => [] };
  const window = { COURSE_DATA: data, InfiApp: {
    data, groups: [], pages: new Map(), setTitle() {}, escapeHtml: (value) => String(value),
    queueTypeset: () => Promise.resolve()
  } };
  const context = vm.createContext({ window, URLSearchParams,
    localStorage: { getItem: () => JSON.stringify(ratings) },
    ResizeObserver: class { observe() {} disconnect() {} }, clearInterval() {},
    requestAnimationFrame() {}
  });
  vm.runInContext(fs.readFileSync(path.join(root, "docs/infi/assets/exams.js"), "utf8"), context);
  window.InfiExams.render(host, { query: new URLSearchParams(), ...route });
  return { html: host.innerHTML, data };
}

test("exam list has a year/semester/moed picker, a folded full list, then search, review and folded statistics", () => {
  const { html, data } = render({});
  assert.match(html, /data-pick="year"/);
  assert.match(html, /data-pick="sem"/);
  assert.match(html, /data-pick="moed"/);
  assert.equal([...html.matchAll(/class="exam-row" data-exam=/g)].length, data.exams.length);
  const years = [...html.matchAll(/<span class="exam-rows-y">(\d+)<\/span>/g)].map((match) => match[1]);
  assert.deepEqual(years, [...years].sort().reverse());
  assert.match(html, /<details class="exam-all-list">/);
  assert.ok(html.indexOf('id="allTitle"') < html.indexOf('id="findTitle"'));
  assert.ok(html.indexOf('id="findTitle"') < html.indexOf('id="reviewTitle"'));
  assert.ok(html.indexOf('id="reviewTitle"') < html.indexOf('class="exam-statistics"'));
  const stats = html.slice(html.indexOf('<details class="exam-statistics">'));
  assert.match(stats, /id="freqTitle"/);
  assert.match(stats, /id="heatTitle"/);
  for (const exam of data.exams) {
    assert.ok(html.includes(`href="#/exams/${exam.n}"`));
    assert.ok(html.includes(`href="#/exams/${exam.n}/sim"`));
  }
});

test("the options menu explains each part of the page, with review counts, the MC route and a level picker", () => {
  const { html } = render({}, { "41/3": { value: "partial", at: 1 }, "41/6": { value: "got", at: 2 } });
  const nav = html.match(/<nav class="exam-options"[\s\S]*?<\/nav>/)[0];
  for (const id of ["allTitle", "reviewTitle", "findTitle", "examStats"]) assert.ok(nav.includes(`data-exam-section="${id}"`));
  assert.match(nav, /לחזרה \(1\)/);
  assert.match(nav, /href="#\/exams\/practice-mc"/);
  assert.match(nav, /data-nav-level/);
  const row = html.match(/<li class="exam-row" data-exam="41">[\s\S]*?<\/li>/)[0];
  assert.match(row, /פתרונות/);
  assert.match(row, /חלקית: 1/);
  assert.match(row, /הבנתי: 1/);
});

test("exam overview and study routes have question tabs with solution and rating marks", () => {
  for (const section of [undefined, "q3"]) {
    const { html, data } = render({ id: "41", section }, { "41/3": { value: "stuck", at: 1 } });
    const exam = data.exams.find((item) => item.n === 41);
    const tabs = html.match(/<nav class="exam-actions exam-question-nav"[\s\S]*?<\/nav>/)[0];
    assert.equal([...tabs.matchAll(/data-question-tab=/g)].length, exam.questions.length);
    for (const q of exam.questions) {
      assert.ok(tabs.includes(`href="#/exams/41/q${q.q}"`));
      assert.ok(tabs.includes(q.study ? "יש פתרון" : "סריקה"));
    }
    assert.match(tabs, /נתקעתי/);
    assert.match(html, /href="#\/exams">כל המבחנים/);
    if (section) {
      assert.match(tabs, /data-question-tab="3" aria-current="page"/);
      assert.match(html, /href="#\/exams\/41\/q2">השאלה הקודמת/);
      assert.match(html, /href="#\/exams\/41\/q4">השאלה הבאה/);
    }
  }
});

test("generated home entry computes its solution count and the phone header keeps exams visible", () => {
  const js = fs.readFileSync(path.join(root, "docs/infi/assets/app.js"), "utf8");
  assert.match(js, /filter\(\(exam\) => exam.questions.some\(\(q\) => q.study\)\)\.length/);
  assert.match(js, /class="home-exams-entry" href="#\/exams"/);
  assert.ok(js.indexOf('class="home-exams-entry"') < js.indexOf('class="home-encouragement"'));
  const css = fs.readFileSync(path.join(root, "docs/infi/assets/site.css"), "utf8");
  assert.match(css, /\.primary-nav > :not\(\[data-nav="exams"\]\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
