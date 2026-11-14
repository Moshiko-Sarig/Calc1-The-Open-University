// Checks exam solution files (exams/solutions/<n>.md) against the format in
// exams/solutions/README.md: frontmatter, question order, the box structure of every
// unit, the multiple-choice line, box syntax, and a few style rules.
// Usage: node tools/check-exam-solutions.mjs [file.md ...]
// With no arguments it checks every exams/solutions/<n>.md. Exits 1 on any ERROR.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOLUTIONS_DIR = path.join(root, "exams", "solutions");

const BOX_HEADER = /^>\s*\[!(\w+)\](-?)/;
const MC_LINE = /^<!--\s*mc:\s*(.*?)\s*-->\s*$/;
const MC_BODY = /^(?:\d+=(?:true|false)(?:\s+\d+=(?:true|false))*|answer=[א-ת])$/;
const SIMPLE_LABELS = ["**בשורה אחת**", "**תמונה בראש**", "**עם מספרים**"];
const BAD_PHRASES = ["ברור ש", "קל לראות", "חובה"];
const ARROWS = /[⟹⇒→⟸⇐]/;

// Required box type, whether it is folded ("-"), and how many of it a unit has.
const UNIT_BOXES = [
  { type: "simple", folded: true, min: 1, max: 1 },
  { type: "graph", folded: true, min: 0, max: 2 },
  { type: "hint", folded: true, min: 2, max: 3 },
  { type: "plan", folded: false, min: 1, max: 1 },
  { type: "solution", folded: true, min: 1, max: 1 },
  { type: "mistake", folded: true, min: 1, max: 1 }
];

const exams = JSON.parse(fs.readFileSync(path.join(root, "exams", "exams.json"), "utf8"));

// Replaces $...$ and $$...$$ with spaces (keeping newlines) so line numbers still match.
const blankMath = (text) => text.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, (m) => m.replace(/[^\n]/g, " "));

// Splits the file into boxes: { type, folded, line, lines: [text...] }.
function parseBoxes(lines, issues) {
  const boxes = [];
  let open = null;
  lines.forEach((text, i) => {
    const line = i + 1;
    const header = text.match(BOX_HEADER);
    if (header) {
      open = { type: header[1], folded: header[2] === "-", line, lines: [text] };
      boxes.push(open);
    } else if (text.startsWith(">") && open) {
      open.lines.push(text);
    } else {
      if (open && text.trim() !== "") issues.push({ level: "ERROR", line, msg: `line follows the [!${open.type}] box without a blank line or ">"` });
      open = null;
    }
  });
  return boxes;
}

// Finds the "## שאלה N" and "### סעיף ..." sections, with the boxes that fall inside each.
function parseQuestions(lines, boxes) {
  const questions = [];
  let question = null;
  let unit = null;
  lines.forEach((text, i) => {
    const line = i + 1;
    const q = text.match(/^##\s+שאלה\s+(\d+)\s*$/);
    const part = text.match(/^###\s+סעיף\s+(\S+)/);
    if (q) {
      question = { q: Number(q[1]), line, mc: lines[i + 1] ?? "", parts: [], head: { boxes: [] } };
      questions.push(question);
      unit = question.head;
    } else if (part && question) {
      unit = { name: part[1], line, boxes: [] };
      question.parts.push(unit);
    } else if (/^##\s/.test(text)) {
      question = null;
      unit = null;
    }
    const box = boxes.find((b) => b.line === line);
    if (box && unit) unit.boxes.push(box);
  });
  return questions;
}

// A graph box holds one ```desmos-live block of JSON or an <!-- infi-demo: name --> marker.
function checkGraph(label, box, issues) {
  const body = box.lines.slice(1).map((text) => text.replace(/^> ?/, "")).join("\n");
  if (/<!--\s*infi-demo:\s*[\w-]+\s*-->/.test(body)) return;
  const fence = body.match(/```desmos-live\n([\s\S]*?)\n```/);
  if (!fence) {
    issues.push({ level: "ERROR", line: box.line, msg: `${label}: [!graph] box needs a \`\`\`desmos-live block or an infi-demo marker` });
    return;
  }
  try {
    const list = JSON.parse(fence[1]).expressions?.list;
    if (!Array.isArray(list) || !list.length) throw new Error("expressions.list is empty");
  } catch (error) {
    issues.push({ level: "ERROR", line: box.line, msg: `${label}: [!graph] JSON is invalid (${error.message})` });
  }
}

function checkUnit(label, unit, issues) {
  const boxes = unit.boxes.filter((b) => b.type !== "question");
  const known = new Set(UNIT_BOXES.map((u) => u.type));
  const at = unit.line ?? boxes[0]?.line ?? 0;
  for (const box of boxes) {
    if (!known.has(box.type)) issues.push({ level: "ERROR", line: box.line, msg: `${label}: unexpected box [!${box.type}]` });
  }
  for (const spec of UNIT_BOXES) {
    const found = boxes.filter((b) => b.type === spec.type);
    if (found.length < spec.min || found.length > spec.max) {
      const want = spec.min === spec.max ? `${spec.min}` : `${spec.min} to ${spec.max}`;
      issues.push({ level: "ERROR", line: found[0]?.line ?? at, msg: `${label}: has ${found.length} [!${spec.type}] box(es), expected ${want}` });
    }
    for (const box of found) {
      if (box.folded !== spec.folded) issues.push({ level: "ERROR", line: box.line, msg: `${label}: [!${spec.type}] must be written [!${spec.type}]${spec.folded ? "-" : ""}` });
    }
  }
  const order = boxes.map((b) => b.type).filter((t) => known.has(t)).join(",");
  if (!/^simple(,graph){0,2},hint,hint(,hint)?,plan,solution,mistake$/.test(order) && UNIT_BOXES.every((s) => boxes.filter((b) => b.type === s.type).length >= s.min)) {
    issues.push({ level: "ERROR", line: at, msg: `${label}: boxes are out of order (${order}); expected simple, graph (optional), hints, plan, solution, mistake` });
  }
  const graphs = boxes.filter((b) => b.type === "graph");
  if (!graphs.length) issues.push({ level: "WARNING", line: at, msg: `${label}: no [!graph] box; add one unless no picture fits` });
  for (const box of graphs) checkGraph(label, box, issues);
  const simple = boxes.find((b) => b.type === "simple");
  if (simple) {
    const body = simple.lines.join("\n");
    for (const part of SIMPLE_LABELS) {
      if (!body.includes(part)) issues.push({ level: "ERROR", line: simple.line, msg: `${label}: [!simple] box is missing ${part}` });
    }
  }
}

// The text of the question that belongs to one part, found by its bold "**א.**" label.
function partText(questionText, name) {
  const start = questionText.search(new RegExp(`\\*\\*${name}\\.\\*\\*`));
  if (start < 0) return null;
  const rest = questionText.slice(start + 1);
  const next = rest.search(/\*\*[א-ת]\.\*\*/);
  return next < 0 ? questionText.slice(start) : questionText.slice(start, start + 1 + next);
}

function checkFile(file) {
  const issues = [];
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");

  // Frontmatter and the exam it names.
  let exam = null;
  const frontEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  const examLine = frontEnd > 0 ? lines.slice(1, frontEnd).join("\n").match(/^exam:\s*(\d+)\s*$/m) : null;
  if (!examLine) issues.push({ level: "ERROR", line: 1, msg: "frontmatter with `exam: <n>` is missing" });
  else {
    exam = exams.find((e) => e.n === Number(examLine[1]));
    if (!exam) issues.push({ level: "ERROR", line: 2, msg: `exam ${examLine[1]} is not in exams.json` });
    if (path.basename(file) !== `${examLine[1]}.md`) issues.push({ level: "ERROR", line: 2, msg: `file name ${path.basename(file)} does not match exam ${examLine[1]}` });
  }

  const boxes = parseBoxes(lines, issues);
  const questions = parseQuestions(lines, boxes);
  if (questions.length === 0) issues.push({ level: "ERROR", line: 1, msg: "no `## שאלה N` sections found" });
  // The build allows nothing between the frontmatter and the first question.
  const firstQuestion = lines.findIndex((text) => /^## שאלה \d+\s*$/.test(text));
  const stray = lines.slice(frontEnd + 1, firstQuestion < 0 ? lines.length : firstQuestion).findIndex((text) => text.trim());
  if (stray >= 0) issues.push({ level: "ERROR", line: frontEnd + 2 + stray, msg: "content before the first `## שאלה N`; the build rejects it" });
  // Outside the boxes the build accepts only headings, comments and the similar-questions line.
  lines.forEach((text, i) => {
    if (i <= frontEnd || !text.trim() || /^(>|#|<!--|\*\*שאלות דומות\*\*)/.test(text)) return;
    issues.push({ level: "ERROR", line: i + 1, msg: `unexpected line outside a box ("${text.trim().slice(0, 30)}"); the build rejects it` });
  });

  let previous = 0;
  const seen = new Set();
  for (const question of questions) {
    const label = `question ${question.q}`;
    const info = exam?.questions.find((x) => x.q === question.q);
    if (seen.has(question.q)) issues.push({ level: "ERROR", line: question.line, msg: `${label} appears twice` });
    else if (question.q < previous) issues.push({ level: "ERROR", line: question.line, msg: `${label} is out of order (after question ${previous})` });
    seen.add(question.q);
    previous = Math.max(previous, question.q);
    if (exam && !info) issues.push({ level: "ERROR", line: question.line, msg: `${label} is not a question of exam ${exam.n}` });

    const questionBox = question.head.boxes.find((b) => b.type === "question");
    if (!questionBox) issues.push({ level: "ERROR", line: question.line, msg: `${label}: [!question] box is missing` });

    // The mc line sits directly under the heading, for every multiple-choice question.
    if (info?.format === "אמריקאית") {
      const mc = question.mc.match(MC_LINE);
      if (!mc) issues.push({ level: "ERROR", line: question.line + 1, msg: `${label} is multiple choice: the line after the heading must be <!-- mc: ... -->` });
      else if (!MC_BODY.test(mc[1])) issues.push({ level: "ERROR", line: question.line + 1, msg: `${label}: bad mc value "${mc[1]}" (use "1=true 2=false" or "answer=<letter>")` });
    }

    const units = question.parts.length > 0 ? question.parts.map((p) => ({ ...p, label: `${label}, part ${p.name}` })) : [{ ...question.head, line: question.line, label }];
    const questionText = questionBox ? questionBox.lines.join("\n") : "";
    for (const unit of units) {
      checkUnit(unit.label, unit, issues);
      // A prove-or-refute part must open its solution with the verdict.
      const own = unit.name ? partText(questionText, unit.name) : questionText;
      const solution = unit.boxes.find((b) => b.type === "solution");
      if (own?.includes("הוכיחו או הפריכו") && solution && !solution.lines.join("\n").includes("**התשובה:")) {
        issues.push({ level: "WARNING", line: solution.line, msg: `${unit.label}: prove-or-refute solution has no **התשובה: ...** line` });
      }
    }
  }

  if (exam) {
    const missing = exam.questions.map((x) => x.q).filter((n) => !seen.has(n));
    if (missing.length > 0) issues.push({ level: "WARNING", line: 0, msg: `questions not written yet: ${missing.join(", ")}` });
  }

  // Style: phrases anywhere, arrows only outside math.
  lines.forEach((line, i) => {
    for (const phrase of BAD_PHRASES) {
      if (line.includes(phrase)) issues.push({ level: "WARNING", line: i + 1, msg: `avoid the phrase "${phrase}"` });
    }
  });
  blankMath(text).split("\n").forEach((line, i) => {
    const arrow = line.match(ARROWS);
    if (arrow) issues.push({ level: "WARNING", line: i + 1, msg: `arrow ${arrow[0]} outside math; write it in words` });
  });

  return issues;
}

const args = process.argv.slice(2);
const files = args.length > 0 ? args : fs.readdirSync(SOLUTIONS_DIR).filter((f) => f.endsWith(".md") && f !== "README.md").sort().map((f) => path.join(SOLUTIONS_DIR, f));

let errors = 0;
for (const file of files) {
  const issues = checkFile(file).sort((a, b) => a.line - b.line);
  const count = (level) => issues.filter((i) => i.level === level).length;
  errors += count("ERROR");
  console.log(`${file}: ${count("ERROR")} error(s), ${count("WARNING")} warning(s)`);
  for (const issue of issues) console.log(`  ${issue.level}${issue.line ? ` line ${issue.line}` : ""}: ${issue.msg}`);
}
process.exit(errors > 0 ? 1 : 0);
