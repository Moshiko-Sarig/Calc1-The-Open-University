// Compares two builds of a course, so refactoring the engine can prove that a
// course's content did not change. CLI: node tools/compare-build.mjs <a> <b>
import { isDeepStrictEqual } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT_KEYS = ["pages", "statements", "examTheorems", "pastTheorems", "navGroups", "units", "flashcards", "graph", "exams"];

function readPayload(dir) {
  const source = fs.readFileSync(path.join(dir, "assets", "content.js"), "utf8");
  const json = source.slice(source.indexOf("=") + 1).trim().replace(/;$/, "");
  return JSON.parse(json);
}

export function compareContent(dirA, dirB) {
  const a = readPayload(dirA);
  const b = readPayload(dirB);
  const differences = CONTENT_KEYS.filter((key) => !isDeepStrictEqual(a[key], b[key]));
  const htmlA = fs.readFileSync(path.join(dirA, "index.html"));
  const htmlB = fs.readFileSync(path.join(dirB, "index.html"));
  if (!htmlA.equals(htmlB)) differences.push("index.html");
  return { same: differences.length === 0, differences };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dirA, dirB] = process.argv.slice(2);
  if (!dirA || !dirB) {
    console.error("usage: node tools/compare-build.mjs <dirA> <dirB>");
    process.exit(2);
  }
  const { same, differences } = compareContent(dirA, dirB);
  console.log(same ? "same" : `different: ${differences.join(", ")}`);
  process.exit(same ? 0 : 1);
}
