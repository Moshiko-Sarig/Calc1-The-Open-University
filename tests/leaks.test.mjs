import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";

import { allNoteFiles, findCopiedRuns, findLeaks, publishedPaths, readSourceText, SOURCE_DIR, trackedTextFiles } from "../tools/check-source-leaks.mjs";
import { COURSES } from "../tools/courses.mjs";
import { buildSite, root } from "./helpers.mjs";

function tempDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leaks-"));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

const git = (...args) => execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString();

test("a watermark line is a leak", () => {
  const dir = tempDir({ "note.md": "File #12345 belongs to Someone- do not distribute" });
  assert.equal(findLeaks([dir]).length, 1);
});

test("the stamped address form is a leak", () => {
  const dir = tempDir({ "note.md": "123456789 someoneatgmail.com" });
  assert.equal(findLeaks([dir]).length, 1);
});

test("a stamp in any text format is a leak, not only in the usual web files", () => {
  const dir = tempDir({ "notes.tex": "File #12345 belongs to Someone- do not distribute", "table.csv": "someoneatgmail.com" });
  assert.equal(findLeaks([dir]).length, 2);
});

test("a PDF anywhere in the published tree is a leak", () => {
  const dir = tempDir({ "book.pdf": "%PDF-1.4" });
  assert.equal(findLeaks([dir]).length, 1);
});

test("an image copied from the source folder is a leak, even under another name", () => {
  const source = tempDir({ "p0001.png": "same-bytes" });
  const dir = tempDir({ "figure.png": "same-bytes", "own-figure.png": "other-bytes" });
  const leaks = findLeaks([dir], { sourceDir: source });
  assert.equal(leaks.length, 1);
  assert.match(leaks[0], /figure\.png/);
});

test("in a course without figures, any raster image is a leak, with or without the source folder", () => {
  const dir = tempDir({ "page-90.jpg": "re-encoded", "p0090.png": "scan", "icon.svg": "<svg/>" });
  assert.equal(findLeaks([dir], { forbidImages: true }).length, 2);
  assert.deepEqual(findLeaks([dir]), []);
});

test("a path that does not exist is an error, not a clean result", () => {
  assert.throws(() => findLeaks([path.join(os.tmpdir(), "no-such-course-folder")]), /does not exist/);
});

test("ordinary notes are clean", () => {
  const dir = tempDir({ "note.md": "# שדות\n\nכל שדה הוא קבוצה עם שתי פעולות." });
  assert.deepEqual(findLeaks([dir]), []);
});

const words = (count) => Array.from({ length: count }, (_, i) => `מילה${i}`).join(" ");

test("a run of twelve words from the source is flagged", () => {
  assert.equal(findCopiedRuns(`פתיחה ${words(12)} סיום`, `משהו ${words(12)} אחר`).length, 1);
});

test("a run of eleven words from the source is not flagged", () => {
  assert.deepEqual(findCopiedRuns(`פתיחה ${words(11)} סיום`, `משהו ${words(11)} אחר`), []);
});

test("punctuation and math do not hide a copied run", () => {
  const note = `${words(6)}, $x+y=1$ ${words(12).split(" ").slice(6).join(" ")}.`;
  assert.equal(findCopiedRuns(note, words(12)).length, 1);
});

before(buildSite);

test("the home page publishes no stamps", () => {
  assert.deepEqual(findLeaks([path.join(root, "docs", "index.html"), path.join(root, "index.html")]), []);
});

test("publishedPaths covers every course's vault and output, and they all exist", () => {
  for (const course of COURSES) {
    const { paths, forbidImages } = publishedPaths(course);
    assert.ok(paths.some((item) => item.endsWith(course.vaultDir)), course.id);
    for (const item of paths) assert.ok(fs.existsSync(item), item);
    assert.equal(forbidImages, !course.figuresDir, course.id);
  }
});

test("every course that has no figures publishes no images and no stamps", () => {
  for (const course of COURSES.filter((item) => !item.figuresDir)) {
    const { paths, forbidImages, imageAllowlist } = publishedPaths(course);
    assert.deepEqual(findLeaks(paths, { forbidImages, imageAllowlist, sourceDir: SOURCE_DIR }), []);
  }
});

test("no tracked file in the repository carries a stamp", () => {
  const files = trackedTextFiles();
  assert.ok(files.some((file) => file.endsWith("README.md")), "the scan must really read the repository");
  assert.deepEqual(findLeaks(files), []);
});

test("the private source folder is ignored by git", () => {
  assert.equal(git("check-ignore", "tmp/linear1-source/p0090.png").trim(), "tmp/linear1-source/p0090.png");
  assert.equal(git("ls-files", "tmp").trim(), "");
});

test("the internal plan stays out of the public repository", () => {
  assert.equal(git("check-ignore", "plans/2026-11-05-linear-algebra-1.md").trim(), "plans/2026-11-05-linear-algebra-1.md");
  assert.equal(git("ls-files", "plans").trim(), "");
});

test("no note repeats twelve words of the book", { skip: !fs.existsSync(SOURCE_DIR) && "no local source text" }, () => {
  const source = readSourceText(SOURCE_DIR);
  assert.ok(source.length > 100000, "the source folder must really hold the book's text");
  const hits = allNoteFiles(path.join(root, "אלגברה לינארית 1")).flatMap((file) =>
    findCopiedRuns(fs.readFileSync(file, "utf8"), source).map((run) => `${path.basename(file)}: ${run}`)
  );
  assert.deepEqual(hits, []);
});
