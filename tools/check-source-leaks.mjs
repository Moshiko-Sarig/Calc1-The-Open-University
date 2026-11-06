// Guards the public site against material from the private course book: the
// watermark and stamped identifiers, the PDF, page images, and long verbatim runs.
// Patterns describe the stamp's form, so no one's actual identifiers live in this repo.
// The book's text and page scans are local only (tmp/linear1-source/), so the verbatim
// check and the exact-image check need that folder. Everything else also runs in CI.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_DIR = path.join(root, "tmp", "linear1-source");

const FORBIDDEN_TEXT = [/belongs to[^\n]{0,40}do not distribute/i, /File #\d+/, /\S+atgmail\.com/];
const IMAGE_FILE = /\.(?:png|jpe?g|webp|gif)$/i;
const BINARY_FILE = /\.(?:png|jpe?g|webp|gif|ico|woff2?|ttf|otf|pdf)$/i;
// These describe the stamp in order to catch it, so they match their own patterns.
const SCAN_EXEMPT = /^(?:plans|tools|tests)\//;

function walk(target) {
  if (!fs.existsSync(target)) throw new Error(`${target} does not exist`);
  if (!fs.statSync(target).isDirectory()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => walk(path.join(target, entry.name)));
}

export const allNoteFiles = (dir) => walk(dir).filter((file) => file.endsWith(".md"));

const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// What a course publishes. A course with no figures of its own has no reason to hold
// any raster image, so one there is treated as a page of the book, however it was encoded.
export function publishedPaths(course) {
  // Only the exact user-supplied exam crops are allowed, never book pages or
  // arbitrary new images. Source-book hash checks below still take precedence.
  const imageAllowlist = new Map();
  if (course.archiveDir) {
    const report = JSON.parse(fs.readFileSync(path.join(root, course.archiveDir, "import-report.json"), "utf8"));
    for (const image of report.images) {
      imageAllowlist.set(path.resolve(root, course.outDir, "assets/archive", image.path), image.sha256);
    }
  }
  return {
    paths: [path.resolve(root, course.vaultDir), path.resolve(root, course.outDir)],
    forbidImages: !course.figuresDir,
    imageAllowlist
  };
}

// Every tracked file that can hold text, so a stamp is caught wherever it ends up.
export function trackedTextFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 1 << 28 })
    .toString()
    .split("\0")
    .filter((file) => file && !SCAN_EXEMPT.test(file) && !BINARY_FILE.test(file))
    .map((file) => path.join(root, file))
    .filter((file) => fs.existsSync(file));
}

export function findLeaks(paths, { sourceDir, forbidImages = false, imageAllowlist = new Map() } = {}) {
  const sourceImages = new Set(sourceDir && fs.existsSync(sourceDir) ? walk(sourceDir).filter((file) => IMAGE_FILE.test(file)).map(sha) : []);
  const leaks = [];
  for (const file of paths.flatMap(walk)) {
    if (/\.pdf$/i.test(file)) leaks.push(`${file}: PDF file`);
    else if (IMAGE_FILE.test(file)) {
      const digest = sha(file);
      if (sourceImages.has(digest)) leaks.push(`${file}: page image from the source`);
      else if (forbidImages && imageAllowlist.get(path.resolve(file)) !== digest) leaks.push(`${file}: raster image in a course with no figures`);
    } else if (!BINARY_FILE.test(file)) {
      const text = fs.readFileSync(file, "utf8");
      const pattern = FORBIDDEN_TEXT.find((candidate) => candidate.test(text));
      if (pattern) leaks.push(`${file}: matches ${pattern}`);
    }
  }
  return leaks;
}

function tokens(text) {
  return text
    .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, " ")
    .normalize("NFKC")
    .replace(/[֑-ׇ]/g, "")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

// Runs of at least minWords words that also appear in the source, in order.
export function findCopiedRuns(noteText, sourceText, minWords = 12) {
  const shingle = (list, start) => list.slice(start, start + minWords).join(" ");
  const source = tokens(sourceText);
  const seen = new Set();
  for (let i = 0; i + minWords <= source.length; i += 1) seen.add(shingle(source, i));

  const note = tokens(noteText);
  const runs = [];
  let i = 0;
  while (i + minWords <= note.length) {
    if (!seen.has(shingle(note, i))) {
      i += 1;
      continue;
    }
    let end = i + minWords;
    while (end < note.length && seen.has(note.slice(end - minWords + 1, end + 1).join(" "))) end += 1;
    runs.push(note.slice(i, end).join(" "));
    i = end;
  }
  return runs;
}

export function readSourceText(dir) {
  return walk(dir)
    .filter((file) => /p\d+\.txt$/.test(file))
    .sort()
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
}
