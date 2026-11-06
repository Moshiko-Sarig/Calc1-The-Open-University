import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { COURSES, SITE } from "./courses.mjs";
import { compareNumbers, NUMBER_KEY_SOURCE, NUMBER_SOURCE, numberFromKey, numberKey } from "./lib/numbers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webAppDir = path.join(root, "web-app");
const docsDir = path.join(root, "docs");

// The course being built, and the directories derived from it.
let course = null;
let vaultDir = "";
let outDir = "";
let generatedAssetDirs = [];

const collator = new Intl.Collator("he", { numeric: true, sensitivity: "base" });

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function hashId(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function normalizeKey(value) {
  return String(value || "")
    .replace(/\.md$/i, "")
    .replaceAll("\\", "/")
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase("he");
}

function shouldPublish(filePath) {
  const rel = path.relative(vaultDir, filePath);
  const segments = rel.split(path.sep);
  if (!filePath.endsWith(".md")) return false;
  if (segments.some((segment) => segment.startsWith("."))) return false;
  if (segments[0] === "Templates") return false;
  if (segments[0] === "00 - מרכז הכספת" && segments[1] === "ניהול") return false;
  return true;
}

function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body: raw };
  const block = raw.slice(3, end).trim();
  const body = raw.slice(raw.indexOf("\n", end + 1) + 1);
  const meta = {};

  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    meta[key.trim()] = parseYamlValue(value.trim());
  }

  return { meta, body };
}

function parseYamlValue(value) {
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((part) => part.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return value.replace(/^["']|["']$/g, "");
}

function extractTitle(body, filePath) {
  const heading = body.match(/^#\s+(.+)$/m);
  if (heading) return stripInline(heading[1]).trim();
  return path.basename(filePath, ".md");
}

function extractHeadings(body) {
  return Array.from(body.matchAll(/^(#{2,4})\s+(.+)$/gm)).map((match) => ({
    level: match[1].length,
    title: stripInline(match[2]).trim()
  }));
}

// Heading ids. The same function is used for headings and for the
// "#heading" part of wiki links, so [[note#heading]] lands on the section.
function slugify(value) {
  const text = String(value || "")
    .replace(/\$\$?([^$]*)\$\$?/g, "$1")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}^_\\]/g, " ")
    .normalize("NFKC")
    .toLocaleLowerCase("he")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return text || "section";
}

function uniqueSlug(value) {
  const base = slugify(value);
  let slug = base;
  let counter = 2;
  while (renderContext.slugs.has(slug)) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  renderContext.slugs.add(slug);
  return slug;
}

function stripInline(value) {
  return String(value)
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/<[^>]+>/g, "");
}

function unitInfo(relPath) {
  const first = relPath.split("/")[0];
  const unitMatch = first.match(new RegExp(`^${course.unitWord}\\s+(\\d+)`));
  if (unitMatch) {
    const number = Number(unitMatch[1]);
    const title = course.unitTitles[number];
    return {
      unitId: `unit-${number}`,
      unitName: title ? `${course.unitWord} ${number} - ${title}` : first,
      unitVolume: course.unitVolumes[number] || "",
      unitOrder: number + 10
    };
  }
  if (first === "00 - מרכז הכספת") return { unitId: "center", unitName: "מרכז הכספת", unitOrder: 1 };
  if (!relPath.includes("/")) return { unitId: "overview", unitName: "שער ומקורות", unitOrder: 0 };
  return { unitId: "other", unitName: first, unitOrder: 99 };
}

function wordCount(value) {
  const text = stripMarkdown(value);
  return text.split(/\s+/).filter(Boolean).length;
}

function stripMarkdown(value) {
  return stripInline(
    String(value)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^---[\s\S]*?\n---/g, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/[#>|-]/g, " ")
      .replace(/\|/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(body) {
  return Array.from(body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g)).map((match) =>
    match[1].trim()
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Inline text is HTML-escaped before links are parsed, so link parts must be
// unescaped to resolve them and must not be escaped a second time.
function unescapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

// Math is LTR content embedded in RTL Hebrew prose. It is wrapped in an
// isolated LTR element so the bidi algorithm never reorders or mirrors it,
// and it is tokenized before any Markdown processing so `*`, `_`, `[`, `|`
// inside TeX are never mistaken for emphasis, links or table cells.
function renderMathInline(tex) {
  return `<span class="math math-inline" dir="ltr">\\(${escapeHtml(tex.trim())}\\)</span>`;
}

function renderMathDisplay(tex, tag = "div") {
  return `<${tag} class="math math-display" dir="ltr">\\[${escapeHtml(tex.trim())}\\]</${tag}>`;
}

function findClosingDollar(text, from, delimiter) {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text.startsWith(delimiter, index)) {
      if (delimiter === "$" && text[index + 1] === "$") continue;
      return index;
    }
  }
  return -1;
}

function protectMath(value, tokens) {
  const text = String(value);
  let output = "";
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (char === "\\" && text[index + 1] === "$") {
      output += "$";
      index += 2;
      continue;
    }
    if (char !== "$") {
      output += char;
      index += 1;
      continue;
    }

    const display = text[index + 1] === "$";
    const delimiter = display ? "$$" : "$";
    const start = index + delimiter.length;
    const end = findClosingDollar(text, start, delimiter);
    const tex = end >= 0 ? text.slice(start, end) : "";

    if (end < 0 || !tex.trim()) {
      output += delimiter;
      index = start;
      continue;
    }

    const token = `@@MATH${tokens.length}@@`;
    tokens.push(display ? renderMathDisplay(tex, "span") : renderMathInline(tex));
    output += token;
    index = end + delimiter.length;
  }

  return output;
}

function renderInline(value, resolveLink) {
  const tokens = [];
  const mathTokens = [];
  let text = String(value).replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE${tokens.length}@@`;
    tokens.push(`<code dir="auto">${escapeHtml(code)}</code>`);
    return token;
  });

  text = protectMath(text, mathTokens);
  text = escapeHtml(text);

  text = text.replace(/!\[\[([^\]]+)\]\]/g, (_, rawTarget) => {
    const target = rawTarget.trim();
    return `<span class="dead-link">${escapeHtml(target)}</span>`;
  });

  text = text.replace(/\[\[([^\]|#]*)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g, (_, rawTarget, anchor, label) => {
    const target = unescapeHtml(rawTarget.trim());
    const page = target ? resolveLink(target) : renderContext.current;
    const textLabel = label || rawTarget.trim() || anchor || "";
    if (!page) return `<span class="dead-link" title="הפתק אינו מתפרסם באתר">${textLabel}</span>`;
    const hash = anchor ? `/${encodeURIComponent(slugify(unescapeHtml(anchor)))}` : "";
    return `<a href="#/page/${page.id}${hash}">${textLabel}</a>`;
  });

  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, href) => {
    return `<img src="${escapeAttribute(unescapeHtml(href))}" alt="${alt}" loading="lazy" />`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    return `<a href="${escapeAttribute(unescapeHtml(href))}" target="_blank" rel="noreferrer">${label}</a>`;
  });

  text = text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^\*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  // Browsers may break a line on either side of an inline formula box, which
  // leaves a lone "." at the start of the next line or "ב-" dangling at the
  // end of the previous one. Keep a formula together with a Hebrew prefix
  // (ב-, ש-, של-), an opening bracket and trailing punctuation. The
  // punctuation is glued in an inner run of its own, so on a narrow screen
  // the prefix can still let go first (see markWideFormulas in app.js).
  text = text.replace(
    /((?<![א-ת])[א-ת]{1,4}[-־])?([(\[]?)(@@MATH\d+@@)([.,;:!?)\]]*)/g,
    (match, prefix = "", open = "", token, punctuation = "") => {
      if (!prefix && !open && !punctuation) return match;
      const core = `${open}${token}${punctuation}`;
      if (prefix && core !== token) return `<span class="nobr">${prefix}<span class="nobr">${core}</span></span>`;
      return `<span class="nobr">${prefix}${core}</span>`;
    }
  );

  mathTokens.forEach((html, index) => {
    text = text.replaceAll(`@@MATH${index}@@`, html);
  });
  tokens.forEach((html, index) => {
    text = text.replaceAll(`@@CODE${index}@@`, html);
  });

  return text;
}

function isDisplayMathStart(line) {
  return /^\s*\$\$/.test(line);
}

// Reads a $$ ... $$ block that starts at lines[index]. Returns the TeX, any
// text that follows the closing $$ on the same line, and the next line index.
function readDisplayMath(lines, index) {
  const first = lines[index].trim().slice(2);
  const sameLineEnd = findClosingDollar(first, 0, "$$");
  if (sameLineEnd >= 0) {
    return { tex: first.slice(0, sameLineEnd), rest: first.slice(sameLineEnd + 2).trim(), next: index + 1 };
  }

  const buffer = [first];
  let cursor = index + 1;
  while (cursor < lines.length) {
    const end = findClosingDollar(lines[cursor], 0, "$$");
    if (end >= 0) {
      buffer.push(lines[cursor].slice(0, end));
      return { tex: buffer.join("\n"), rest: lines[cursor].slice(end + 2).trim(), next: cursor + 1 };
    }
    buffer.push(lines[cursor]);
    cursor += 1;
  }
  return { tex: buffer.join("\n"), rest: "", next: cursor };
}

function indentOf(line) {
  return line.match(/^\s*/)[0].replace(/\t/g, "    ").length;
}

// Lists keep one level of nesting and accept indented continuation lines,
// so a long Hebrew bullet that wraps in the source stays one bullet.
function renderList(lines, start, resolveLink) {
  const itemPattern = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const baseIndent = indentOf(lines[start]);
  const ordered = /^\s*\d+[.)]\s+/.test(lines[start]);
  const items = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) break;
    const match = line.match(itemPattern);
    const indent = indentOf(line);

    if (match) {
      if (indent < baseIndent - 1) break;
      if (indent <= baseIndent + 1) {
        const sameKind = /^\d/.test(match[2]) === ordered;
        if (!sameKind) break;
        items.push({ text: match[3], children: [] });
        index += 1;
        continue;
      }
      if (items.length) {
        const nested = renderList(lines, index, resolveLink);
        items.at(-1).children.push(nested.html);
        index = nested.next;
        continue;
      }
    }

    if (indent > baseIndent && items.length && !isDisplayMathStart(line)) {
      items.at(-1).text += ` ${line.trim()}`;
      index += 1;
      continue;
    }

    break;
  }

  const tag = ordered ? "ol" : "ul";
  // A numbered list that resumes after a display formula ("2. ..." after
  // "$$...$$") keeps its numbering.
  const first = ordered ? Number(lines[start].match(/^\s*(\d+)/)[1]) : 1;
  const startAttr = ordered && first > 1 ? ` start="${first}"` : "";
  const body = items
    .map((item) => `<li${statementAttrs(item.text)}>${renderInline(item.text, resolveLink)}${item.children.join("")}</li>`)
    .join("");
  return { html: `<${tag}${startAttr}>${body}</${tag}>`, next: index };
}

function renderMarkdown(body, resolveLink) {
  const cleaned = body.replace(/<!--\s*codex-enhanced:[\s\S]*?-->/g, "").trim();
  const lines = cleaned.split(/\r?\n/);
  const html = [];
  let i = 0;
  let openProofs = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // <!-- infi-demo: name --> places an interactive demo (assets/demos.js).
    // It is invisible in Obsidian; other one-line HTML comments are dropped.
    // <!-- infi-proof: 2.12 --> ... <!-- /infi-proof --> marks the proof of a
    // theorem from the exam list for the study tools (step by step, puzzle).
    const comment = line.trim().match(/^<!--([\s\S]*?)-->$/);
    if (comment) {
      const directive = comment[1].trim();
      const demo = directive.match(/^infi-demo:\s*([\w-]+)\s*$/);
      const proof = directive.match(new RegExp(`^infi-proof:\\s*(${NUMBER_SOURCE})\\s*$`));
      if (demo) html.push(renderDemo(demo[1]));
      else if (proof) {
        html.push(`<div class="proof" id="${proofAnchor(proof[1])}" data-proof="${proof[1]}">`);
        openProofs += 1;
      } else if (directive === "/infi-proof" && openProofs) {
        html.push("</div>");
        openProofs -= 1;
      }
      i += 1;
      continue;
    }

    // "question::answer" lines of a flashcards note become question cards.
    if (renderContext.current?.tags?.includes("flashcards") && FLASHCARD_LINE.test(line)) {
      const cards = [];
      while (i < lines.length && FLASHCARD_LINE.test(lines[i])) {
        const [, question, answer] = lines[i].match(FLASHCARD_LINE);
        cards.push(`<div class="qa-card"><p class="qa-q">${renderInline(question, resolveLink)}</p><p class="qa-a">${renderInline(answer, resolveLink)}</p></div>`);
        i += 1;
      }
      html.push(`<div class="qa-list">${cards.join("")}</div>`);
      continue;
    }

    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const lang = fence[1] || "text";
      const block = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        block.push(lines[i]);
        i += 1;
      }
      i += 1;
      html.push(renderCodeBlock(lang, block.join("\n")));
      continue;
    }

    if (isDisplayMathStart(line)) {
      const block = readDisplayMath(lines, i);
      if (block.tex.trim()) html.push(renderMathDisplay(block.tex));
      if (block.rest) html.push(`<p>${renderInline(block.rest, resolveLink)}</p>`);
      i = block.next;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const raw = heading[2].trim() === "Dataview" ? "כל הפתקים כאן" : heading[2].replace(/\s+#flashcards\S*/g, "");
      const content = markExamBadge(renderInline(raw, resolveLink));
      const id = level >= 2 && level <= 4 ? ` id="${escapeAttribute(uniqueSlug(heading[2]))}"` : "";
      html.push(`<h${level}${id}>${content}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      html.push("<hr />");
      i += 1;
      continue;
    }

    if (isTableStart(lines, i)) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      html.push(renderTable(tableLines, resolveLink));
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      const first = quote.find((part) => part.trim()) || "";
      const typed = renderTypedCallout(quote, resolveLink);
      if (typed) {
        html.push(typed);
        continue;
      }
      const kind = /^\s*(\*\*)?מקור/.test(first) ? "callout callout-source" : "callout";
      html.push(`<blockquote class="${kind}">${renderMarkdown(quote.join("\n"), resolveLink)}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const list = renderList(lines, i, resolveLink);
      html.push(list.html);
      i = list.next;
      continue;
    }

    const paragraph = [line.trim()];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim()) &&
      !isTableStart(lines, i) &&
      !isDisplayMathStart(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*<!--[\s\S]*-->\s*$/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    html.push(`<p${statementAttrs(paragraph.join(" "))}>${renderInline(paragraph.join(" "), resolveLink)}</p>`);
  }
  while (openProofs > 0) {
    html.push("</div>");
    openProofs -= 1;
  }

  return html.join("\n");
}

function isTableStart(lines, index) {
  const current = lines[index]?.trim();
  const next = lines[index + 1]?.trim();
  return Boolean(current?.startsWith("|") && next && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(next));
}

function renderTable(lines, resolveLink) {
  const rows = lines
    .filter((_, index) => index !== 1)
    .map(splitTableRow);

  if (!rows.length) return "";
  const [head, ...body] = rows;
  return `<div class="table-wrap"><table>
    <thead><tr>${head.map((cell) => `<th>${renderInline(cell, resolveLink)}</th>`).join("")}</tr></thead>
    <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, resolveLink)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

function splitTableRow(line) {
  const cells = [];
  let cell = "";
  let inMath = false;
  const trimmed = line.trim();

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    const next = trimmed[index + 1];

    // Obsidian escapes a literal pipe inside a table cell as "\|". Keep it as
    // a plain "|" so MathJax draws |x| and not the norm symbol ‖x‖.
    if (char === "\\" && next === "|") {
      cell += "|";
      index += 1;
      continue;
    }

    if (char === "\\" && next) {
      cell += char + next;
      index += 1;
      continue;
    }

    if (char === "$") {
      inMath = !inMath;
      cell += char;
      continue;
    }

    if (char === "|" && !inMath) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell.trim());
  if (cells[0] === "") cells.shift();
  if (cells.at(-1) === "") cells.pop();
  return cells;
}

// Hebrew readers scan right to left, so left-to-right flowcharts are mirrored.
function rtlMermaid(code) {
  return code.replace(/^(\s*(?:flowchart|graph)\s+)LR\b/m, "$1RL");
}

// The page being rendered and the full page list, so Dataview blocks can be
// evaluated at build time instead of showing raw query code on the site.
const renderContext = { pages: [], current: null, slugs: new Set() };
const PLUGIN_MARKER = "<!--plugin-block-->";

// "(…, ברשימת המשפטים לבחינה)" in a heading becomes a visible badge.
function markExamBadge(html) {
  const badge = `<span class="badge badge-exam">ברשימה לבחינה</span>`;
  return html
    .replace(/\(([^()]*?),\s*ברשימת המשפטים לבחינה\)/g, (_, inner) => `(${inner}) ${badge}`)
    .replace(/\(ברשימת המשפטים לבחינה\)/g, badge)
    .replace(/—\s*ברשימת המשפטים לבחינה/g, badge);
}

// Wraps every h2 and the content up to the next h2 in a <section>, gives
// special sections a class, and drops sections that held only plugin blocks.
function sectionize(html) {
  const parts = html.split(/\n(?=<h2[ >])/);
  return parts
    .map((part) => {
      if (!part.startsWith("<h2")) return part.replaceAll(PLUGIN_MARKER, "");
      const heading = part.match(/^<h2[^>]*>([\s\S]*?)<\/h2>/);
      const id = (part.match(/^<h2 id="([^"]+)"/) || [])[1] || "";
      const body = part.slice(heading ? heading[0].length : 0);
      if (!body.replaceAll(PLUGIN_MARKER, "").trim()) return "";
      const title = (heading ? heading[1] : "").replace(/<[^>]+>/g, "");
      let kind = "note-section";
      if (/כרטיס דיוק/.test(title)) kind += " section-card";
      else if (/^\s*קשרים\s*$/.test(title)) kind += " section-related";
      else if (/בדיקת שליטה|חזרה|שלוש נקודות/.test(title)) kind += " section-review";
      const labelled = id ? ` aria-labelledby="${id}"` : "";
      return `<section class="${kind}"${labelled}>${part.replaceAll(PLUGIN_MARKER, "")}</section>`;
    })
    .filter(Boolean)
    .join("\n");
}

// Obsidian-style typed callouts: "> [!simple]- title" opens a box. A "-"
// after the type makes it fold closed, "+" folds open; with neither it is a
// plain box. Unknown types fall back to an ordinary blockquote.
const calloutTypes = {
  simple: "במילים פשוטות",
  hint: "רמז",
  solution: "פתרון",
  exam: "במבחן",
  plan: "התוכנית בשלוש שורות"
};

function renderTypedCallout(quote, resolveLink) {
  const start = quote.findIndex((part) => part.trim());
  const head = start < 0 ? null : quote[start].match(/^\s*\[!(\w+)\]([+-]?)\s*(.*)$/);
  if (!head || !calloutTypes[head[1].toLowerCase()]) return null;
  const type = head[1].toLowerCase();
  const title = renderInline(head[3].trim() || calloutTypes[type], resolveLink);
  const body = renderMarkdown(quote.slice(start + 1).join("\n"), resolveLink);
  const cls = `callout callout-${type}`;
  if (!head[2]) {
    return `<div class="${cls}"><p class="callout-title">${title}</p><div class="callout-body">${body}</div></div>`;
  }
  // The first plain-words box of a note opens by itself, so a beginner meets
  // the intuition before folding anything open.
  const firstSimple = type === "simple" && !renderContext.openedSimple;
  if (firstSimple) renderContext.openedSimple = true;
  const open = head[2] === "+" || firstSimple ? " open" : "";
  return `<details class="${cls}"${open}><summary class="callout-title">${title}</summary><div class="callout-body">${body}</div></details>`;
}

const pluginLabels = {
  "desmos-live": "גרף Desmos",
};

function pageFileName(page) {
  return path.basename(page.path, ".md");
}

// Supports the query shapes used in this vault:
//   LIST | TABLE ...  FROM "folder" [OR "folder" ...] | FROM #tag
//   WHERE file.name != this.file.name | [!]contains(file.name, "text")
function evaluateDataview(code) {
  const fromMatch = code.match(/^\s*FROM\s+(.+)$/m);
  if (!fromMatch) return null;
  const sources = fromMatch[1].split(/\s+OR\s+/i).map((part) => part.trim());
  const folders = sources.filter((part) => /^".*"$/.test(part)).map((part) => part.slice(1, -1));
  const tags = sources.filter((part) => part.startsWith("#")).map((part) => part.slice(1));
  if (!folders.length && !tags.length) return null;

  const conditions = [];
  const whereMatch = code.match(/^\s*WHERE\s+(.+)$/m);
  if (whereMatch) {
    for (const clause of whereMatch[1].split(/\s+AND\s+/i)) {
      const text = clause.trim();
      const contains = text.match(/^(!?)contains\(file\.name,\s*"([^"]*)"\)$/);
      if (/^file\.name\s*!=\s*this\.file\.name$/.test(text)) {
        conditions.push((page) => page !== renderContext.current);
      } else if (contains) {
        const negate = contains[1] === "!";
        conditions.push((page) => pageFileName(page).includes(contains[2]) !== negate);
      } else {
        return null;
      }
    }
  }

  return renderContext.pages
    .filter((page) => {
      const inFolder = folders.some((folder) => page.path.startsWith(`${folder}/`));
      const hasTag = tags.some((tag) => (page.tags || []).includes(tag));
      return inFolder || hasTag;
    })
    .filter((page) => conditions.every((condition) => condition(page)))
    .sort((a, b) => collator.compare(a.path, b.path));
}

function renderDataview(code) {
  const results = evaluateDataview(code);
  if (!results) {
    return `<details class="plugin-block"><summary>רשימת פתקים</summary><pre><code>${escapeHtml(code)}</code></pre></details>`;
  }
  if (!results.length) return `<p class="dataview-empty">אין פתקים מתאימים.</p>`;
  const items = results
    .map(
      (page) =>
        `<li><a href="#/page/${page.id}" data-page-link="${page.id}">${escapeHtml(page.title)}</a><small>${escapeHtml(page.unitName)}</small></li>`
    )
    .join("");
  return `<div class="dataview-result"><div class="dataview-caption">רשימה אוטומטית · ${results.length} פתקים</div><ul>${items}</ul></div>`;
}

// ---------------------------------------------------------------------------
// Study tools: proofs, statements and flashcards
// ---------------------------------------------------------------------------

const STATEMENT_KINDS = ["משפט", "טענה", "למה", "הגדרה", "מסקנה", "אקסיומה"];
const STATEMENT_LEAD = new RegExp(`^\\*\\*(${STATEMENT_KINDS.join("|")})\\s+(${NUMBER_SOURCE})`);
const FLASHCARD_LINE = /^\s*(?:[-*]\s+)?([^:\n][^\n]*?)::([^\n]+)$/;

const proofAnchor = (number) => `proof-${numberKey(number)}`;

// A paragraph or list item that opens with "**משפט 4.42**" gets an anchor,
// so the study tools can quote that statement.
function statementAttrs(text) {
  const lead = String(text).trim().match(STATEMENT_LEAD);
  if (!lead) return "";
  const id = `stmt-${numberKey(lead[2])}`;
  if (renderContext.slugs.has(id)) return "";
  renderContext.slugs.add(id);
  return ` id="${id}" data-kind="${lead[1]}"`;
}

const stripTags = (html) => html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

// Where each numbered theorem, definition or claim is stated: a heading that
// names it ("## יחידות הגבול (משפט 2.12)", "## ההגדרה (2.9)") or a paragraph
// that opens with it. Proof headings are skipped; unit notes only.
function buildStatements(pages) {
  const index = {};
  const kindWord = new RegExp(`(?:^|[\\s(])ה?(${STATEMENT_KINDS.join("|")})(?=[\\s(:,]|$)`);
  const named = new RegExp(`(${STATEMENT_KINDS.join("|")})\\s+(${NUMBER_SOURCE})(?![\\d.–-])`, "g");
  const bare = new RegExp(`\\((${NUMBER_SOURCE})\\)`, "g");
  const stmtAnchor = new RegExp(` id="stmt-(${NUMBER_KEY_SOURCE})" data-kind="([^"]+)"`, "g");
  for (const page of pages) {
    if (!/^unit-/.test(page.groupId || "")) continue;
    const headings = page.html.matchAll(/<h([2-4]) id="([^"]+)">([\s\S]*?)<\/h\1>/g);
    for (const [, , anchor, inner] of headings) {
      const text = stripTags(inner);
      if (/הוכח/.test(text) || /\d\s*[–-]\s*\d/.test(text)) continue;
      const found = [...text.matchAll(named)].map((m) => [m[1], m[2]]);
      const kind = text.match(kindWord)?.[1];
      if (!found.length && kind) for (const m of text.matchAll(bare)) found.push([kind, m[1]]);
      for (const [k, number] of found) {
        if (!index[number]) index[number] = { number, kind: k, pageId: page.id, anchor, titleHtml: inner.replace(/<span class="badge[^>]*>[\s\S]*?<\/span>/g, "").trim() };
      }
    }
  }
  for (const page of pages) {
    if (!/^unit-/.test(page.groupId || "")) continue;
    for (const [, number, kind] of page.html.matchAll(stmtAnchor)) {
      const key = numberFromKey(number);
      if (!index[key]) index[key] = { number: key, kind, pageId: page.id, anchor: `stmt-${number}`, titleHtml: "" };
    }
  }
  if (!course.sortStatementsByNumber) return index;
  return Object.fromEntries(Object.entries(index).sort(([a], [b]) => compareNumbers(a, b)));
}

// The 35 theorems of the official exam list, from the table rows of the
// exam list note: number, kind, the statement in short, and the proof.
function buildExamTheorems(examPage, resolver, pages) {
  if (!examPage?.body) return [];
  const proofPage = new Map();
  const proofMark = new RegExp(`data-proof="(${NUMBER_SOURCE})"`, "g");
  const rowNumber = new RegExp(`^(${NUMBER_SOURCE})\\s*(\\([^)]*\\))?`);
  for (const page of pages) for (const [, number] of page.html.matchAll(proofMark)) proofPage.set(number, page.id);
  const rows = [];
  for (const line of examPage.body.split("\n")) {
    const cells = splitTableRow(line);
    const row = cells.length < 4 ? null : cells[0].match(rowNumber);
    if (!row) continue;
    const [, number, part = ""] = row;
    const target = cells[3].match(/\[\[([^\]|#]+)/)?.[1];
    const note = target ? resolver(target.trim()) : null;
    rows.push({
      number,
      count: Number.parseInt(cells[4], 10) || 0,
      part: part.trim(),
      kind: cells[1].trim(),
      statementHtml: renderInline(cells[2].trim(), resolver),
      noteId: note?.id || "",
      proofPageId: proofPage.get(number) || "",
      proofAnchor: proofPage.has(number) ? proofAnchor(number) : ""
    });
  }
  return rows;
}

// Flashcards: the vault's "question::answer" lines, with the unit of the
// heading they are under.
function hashText(text) {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function collectFlashcards(page, body, resolver) {
  if (!page.tags?.includes("flashcards")) return [];
  const cards = [];
  let unit = "";
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^```/.test(line)) fence = !fence;
    if (fence) continue;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) unit = heading[1].match(new RegExp(`${course.unitWord}\\s*(\\d+)`))?.[1] || "";
    const card = line.match(FLASHCARD_LINE);
    if (!card) continue;
    cards.push({
      id: `fc-${hashText(card[1].trim())}`,
      unit: unit ? `unit-${unit}` : "",
      frontHtml: renderInline(card[1].trim(), resolver),
      backHtml: renderInline(card[2].trim(), resolver),
      pageId: page.id
    });
  }
  return cards;
}

const DEMO_NAMES = new Set(["sup", "epsilon-n", "nested-intervals", "epsilon-delta", "bisection", "uniform", "secant", "mvt", "row-reduction", "solution-count"]);

function renderDemo(name) {
  if (!DEMO_NAMES.has(name)) throw new Error(`Unknown infi-demo "${name}"`);
  return `<figure class="demo" id="demo-${name}" data-demo="${name}"><noscript><p>ההמחשה האינטראקטיבית דורשת JavaScript.</p></noscript></figure>`;
}

// A Desmos block from the vault is drawn natively on the notebook grid by
// assets/demos.js; the JSON travels in a data attribute.
function renderDesmos(code) {
  let spec;
  try {
    spec = JSON.parse(code);
  } catch {
    return PLUGIN_MARKER;
  }
  const list = spec?.expressions?.list;
  if (!Array.isArray(list) || !list.length) return PLUGIN_MARKER;
  const keep = { graph: { viewport: spec.graph?.viewport }, expressions: { list } };
  return `<figure class="demo" data-desmos="${escapeAttribute(JSON.stringify(keep))}"><noscript><p>הגרף דורש JavaScript.</p></noscript></figure>`;
}

function renderCodeBlock(lang, code) {
  if (lang === "mermaid") return `<div class="diagram-wrap"><pre class="mermaid">${escapeHtml(rtlMermaid(code))}</pre></div>`;
  if (lang === "dataview") return renderDataview(code);
  if (lang === "desmos-live") return renderDesmos(code);
  const safe = escapeHtml(code);
  if (pluginLabels[lang]) {
    // TikZ / Desmos / Mathematica only render inside Obsidian. On the site the
    // block is dropped; a section left empty by this is removed in sectionize().
    return PLUGIN_MARKER;
  }
  return `<pre><code class="language-${escapeAttribute(lang)}">${safe}</code></pre>`;
}

function makeResolver(pages, aliases) {
  return (target) => {
    const clean = normalizeKey(target.split("#")[0]);
    if (aliases.has(clean)) return pages.get(aliases.get(clean));
    const last = clean.split("/").pop();
    if (aliases.has(last)) return pages.get(aliases.get(last));
    return null;
  };
}

function collectPages() {
  const files = walk(vaultDir)
    .filter(shouldPublish)
    .sort((a, b) => collator.compare(path.relative(vaultDir, a), path.relative(vaultDir, b)));

  return files.map((filePath) => {
    const raw = fs.readFileSync(filePath, "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const rel = toPosix(path.relative(vaultDir, filePath));
    const title = extractTitle(body, filePath);
    const info = unitInfo(rel);
    const aliases = Array.isArray(meta.aliases) ? meta.aliases : [];
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    return {
      id: `p-${hashId(rel)}`,
      sourcePath: filePath,
      path: rel,
      title,
      aliases,
      tags,
      body,
      headings: extractHeadings(body),
      rawLinks: extractLinks(body),
      wordCount: wordCount(body),
      searchText: stripMarkdown(body).slice(0, 6000),
      ...info
    };
  });
}

function buildAliases(pages) {
  const aliases = new Map();
  for (const page of pages) {
    const keys = [
      page.title,
      path.basename(page.path, ".md"),
      page.path.replace(/\.md$/i, ""),
      ...page.aliases
    ];
    for (const key of keys) {
      const normalized = normalizeKey(key);
      if (normalized && !aliases.has(normalized)) aliases.set(normalized, page.id);
    }
  }
  return aliases;
}

function buildUnits(pages) {
  const units = new Map();
  for (const page of pages) {
    if (!units.has(page.unitId)) {
      units.set(page.unitId, {
        id: page.unitId,
        name: page.unitName,
        volume: page.unitVolume || "",
        order: page.unitOrder,
        count: 0
      });
    }
    units.get(page.unitId).count += 1;
  }
  return Array.from(units.values()).sort((a, b) => a.order - b.order || collator.compare(a.name, b.name));
}

function copyDirectory(source, target, skip = () => false) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    const rel = toPosix(path.relative(source, sourcePath));
    if (skip(rel, entry)) continue;
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath, (childRel, childEntry) => skip(toPosix(path.join(rel, childRel)), childEntry));
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function copyStaticApp() {
  if (!fs.existsSync(webAppDir)) {
    throw new Error(`Web app source not found: ${webAppDir}`);
  }
  // Generated per course: never carry another course's content or scans along.
  copyDirectory(webAppDir, outDir, (rel) => rel === "landing.html" || /^assets\/(?:content\.js$|figures(?:\/|$)|exams(?:\/|$))/.test(rel));
}

// web-app/index.html is a template; each course fills in its own identity.
function renderIndexHtml() {
  const tokens = {
    SITE_TITLE: `${course.siteName} · ${course.fullName}`,
    SITE_DESCRIPTION: course.description,
    SITE_NAME: course.siteName,
    SITE_TAGLINE: course.tagline,
    BRAND_MARK: course.brandMark,
    THE_UNITS: course.words.theUnits,
    THE_UNITS_AND_NOTES: `${course.words.units} ופתקים`,
    FOOTER_NOTICE: course.footerNotice
  };
  const scripts = course.scripts.map((name) => `    <script defer src="./assets/${name}"></script>\n`).join("");
  return fs
    .readFileSync(path.join(webAppDir, "index.html"), "utf8")
    .replace(/^[ \t]*\{\{COURSE_SCRIPTS\}\}\r?\n/m, scripts)
    .replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => tokens[name]);
}

function writeRootIndex(html) {
  const withBase = html.includes("<base ")
    ? html
    : html.replace("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />", "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <base href=\"./docs/\" />");
  fs.writeFileSync(path.join(root, "index.html"), withBase, "utf8");
}

function writeGeneratedContent(payload) {
  for (const assetDir of generatedAssetDirs) {
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(path.join(assetDir, "content.js"), `window.COURSE_DATA = ${JSON.stringify(payload)};\n`, "utf8");
  }
}

// Past exams: exams/exams.json (tags typed from the scans) and the page
// scans, pNNN.jpg by page of the exam booklet, copied next to the figures.
// An exam lists its pages in reading order; a few photographed exams were
// bound out of order.
function loadExams() {
  if (!course.examsDir) return [];
  const file = path.join(path.resolve(root, course.examsDir), "exams.json");
  if (!fs.existsSync(file)) return [];
  const exams = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const exam of exams) {
    exam.images = exam.pages.map((page) => `assets/exams/p${String(page).padStart(3, "0")}.jpg`);
  }
  return exams;
}

function copyExams() {
  if (!course.examsDir) return;
  const examsDir = path.resolve(root, course.examsDir);
  if (!fs.existsSync(examsDir)) return;
  for (const assetDir of generatedAssetDirs) {
    const out = path.join(assetDir, "exams");
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    for (const entry of fs.readdirSync(examsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".jpg")) fs.copyFileSync(path.join(examsDir, entry.name), path.join(out, entry.name));
    }
  }
}

function copyFigures() {
  if (!course.figuresDir) return;
  const figuresDir = path.resolve(root, course.figuresDir);
  if (!fs.existsSync(figuresDir)) return;
  for (const assetDir of generatedAssetDirs) {
    const outputFiguresDir = path.join(assetDir, "figures");
    fs.mkdirSync(outputFiguresDir, { recursive: true });
    for (const entry of fs.readdirSync(figuresDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      fs.copyFileSync(path.join(figuresDir, entry.name), path.join(outputFiguresDir, entry.name));
    }
  }
}

// ---------------------------------------------------------------------------
// Navigation: titles, groups, study order
// ---------------------------------------------------------------------------

const leadingSymbols = /^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u;

// Short, TeX-free title for menus, cards and search results.
function navTitleFor(page) {
  let title = page.title.replace(leadingSymbols, "");
  if (/\$/.test(title)) title = path.basename(page.path, ".md");
  if (/מפת הקורס/.test(title)) return "מפת הקורס";
  return title
    .replace(/\s+\(עדכון[^)]*\)\s*$/, "")
    .replace(course.titleSuffix, "")
    .trim();
}

const startOrder = () => [
  course.theoremListTitle,
  "מסקנות משאלות הספר",
  "שיטות המרצה",
  "מפת הקורס",
  "תיקונים לספרי הקורס",
  "תבניות הוכחה",
  "מפת תלות משפטים",
  "אינדקס דוגמאות נגד",
  "כרטיסי חזרה",
  "מפת מוח",
  "כספת העל",
  "מקורות וחומרי גלם",
  "גרפים והמחשות"
];

function rankBy(list, title) {
  const index = list.findIndex((key) => title.includes(key));
  return index < 0 ? list.length : index;
}

// The study order of a unit is the numbered "ציר לימוד" list in its gateway.
function studyOrder(gateway, resolver) {
  if (!gateway?.body) return [];
  const match = gateway.body.match(/^##\s+ציר לימוד\s*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m);
  if (!match) return [];
  return Array.from(match[1].matchAll(/\[\[([^\]|#]+)/g))
    .map((m) => resolver(m[1])?.id)
    .filter(Boolean);
}

function buildNavGroups(pages, resolver) {
  const byUnit = new Map();
  for (const page of pages) {
    const groupId = page.unitId === "center" || page.unitId === "overview" ? "start" : page.unitId;
    page.groupId = groupId;
    if (!byUnit.has(groupId)) byUnit.set(groupId, []);
    byUnit.get(groupId).push(page);
  }

  const groups = [];
  const start = (byUnit.get("start") || []).sort(
    (a, b) => rankBy(startOrder(), a.title) - rankBy(startOrder(), b.title) || collator.compare(a.title, b.title)
  );
  groups.push({ id: "start", title: "מרכז הלימוד", subtitle: "מפות, רשימות וכלי חזרה", pageIds: start.map((p) => p.id) });

  const unitIds = Array.from(byUnit.keys())
    .filter((id) => /^unit-\d+$/.test(id))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
  for (const id of unitIds) {
    const list = byUnit.get(id);
    if (!list) continue;
    const gateway = list.find((page) => /^שער /.test(page.title));
    const ordered = [];
    if (gateway) ordered.push(gateway.id);
    for (const pid of studyOrder(gateway, resolver)) {
      if (list.some((page) => page.id === pid) && !ordered.includes(pid)) ordered.push(pid);
    }
    for (const page of list.sort((a, b) => collator.compare(a.title, b.title))) {
      if (!ordered.includes(page.id)) ordered.push(page.id);
    }
    const sample = list[0];
    const number = id.startsWith("unit-") ? Number(id.slice(5)) : null;
    groups.push({
      id,
      number,
      title: `${course.unitWord} ${number}`,
      subtitle: course.unitTitles[number],
      volume: sample.unitVolume || "",
      gatewayId: gateway?.id || ordered[0],
      pageIds: ordered
    });
  }

  return groups;
}

// Previous / next follow the study order: inside the learning hub, and across
// units 1 → 8 as one continuous course.
function linkSequence(groups, pagesById) {
  const courseIds = groups.filter((g) => g.number).flatMap((g) => g.pageIds);
  const sequences = [courseIds, ...groups.filter((g) => !g.number).map((g) => g.pageIds)];
  for (const sequence of sequences) {
    sequence.forEach((id, index) => {
      const page = pagesById.get(id);
      page.prevId = sequence[index - 1] || "";
      page.nextId = sequence[index + 1] || "";
    });
  }
}

function firstParagraph(html) {
  // Callouts and figures (demos, graphs and their <noscript> text) are not the summary.
  const withoutCallouts = html.replace(/<blockquote[\s\S]*?<\/blockquote>/g, "").replace(/<figure[\s\S]*?<\/figure>/g, "");
  const match = withoutCallouts.match(/<p>([\s\S]*?)<\/p>/);
  return match ? match[1].replace(/<a [^>]*>([\s\S]*?)<\/a>/g, "$1") : "";
}

function findByTitle(pages, includes) {
  return pages.find((page) => includes.some((value) => page.title.includes(value)))?.id || "";
}

// What the client needs to know about the course (no build paths or RegExps).
function publicCourseInfo() {
  const { id, siteName, fullName, courseCode, tagline, unitWord, words, storagePrefix, theoremListTitle, theoremListLabel, demosLead, theoremBand, sources, examUseNote, searchExample, features } = course;
  return { id, siteName, fullName, courseCode, tagline, unitWord, words, storagePrefix, theoremListTitle, theoremListLabel, demosLead, theoremBand, sources, examUseNote, searchExample, features };
}

export function buildCourse(nextCourse) {
  course = nextCourse;
  vaultDir = path.resolve(root, course.vaultDir);
  outDir = path.resolve(root, course.outDir);
  generatedAssetDirs = [path.join(outDir, "assets")];
  Object.assign(renderContext, { pages: [], current: null, slugs: new Set(), openedSimple: false });

  if (!fs.existsSync(vaultDir)) {
    throw new Error(`Vault not found: ${vaultDir}`);
  }

  // A course's folder is entirely generated, so it starts clean.
  fs.rmSync(outDir, { recursive: true, force: true });
  copyStaticApp();
  fs.writeFileSync(path.join(outDir, "index.html"), renderIndexHtml(), "utf8");

  const pages = collectPages();
  const aliases = buildAliases(pages);
  const resolver = makeResolver(new Map(pages.map((page) => [page.id, page])), aliases);

  for (const page of pages) {
    page.links = Array.from(new Set(page.rawLinks.map((target) => resolver(target)?.id).filter(Boolean)));
  }

  const units = buildUnits(pages);
  const backlinks = new Map(pages.map((page) => [page.id, []]));
  for (const page of pages) {
    for (const target of page.links) backlinks.get(target)?.push(page.id);
  }

  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const navGroups = buildNavGroups(pages, resolver);
  linkSequence(navGroups, pagesById);

  const examList = pages.find((page) => page.title.includes(course.theoremListTitle));
  // Only unit notes count: the exam list also links to hub pages in its footer.
  const examLinked = new Set(
    (examList ? examList.links : []).filter((id) => /^unit-/.test(pagesById.get(id)?.groupId || ""))
  );

  renderContext.pages = pages;
  const examBody = examList?.body || "";
  const flashcards = [];
  for (const page of pages) {
    page.backlinks = Array.from(new Set(backlinks.get(page.id) || []));
    renderContext.current = page;
    renderContext.slugs = new Set();
    renderContext.openedSimple = false;

    // The note's own "# title" becomes the page header, not a second h1.
    const h1 = page.body.match(/^\s*#\s+(.+)\s*$/m);
    let body = page.body;
    if (h1 && body.trimStart().startsWith("# ")) body = body.replace(h1[0], "");
    page.titleHtml = renderInline((h1 ? h1[1] : page.title).replace(leadingSymbols, ""), resolver);
    page.navTitle = navTitleFor(page);
    page.html = sectionize(renderMarkdown(body, resolver));
    flashcards.push(...collectFlashcards(page, body, resolver));
    page.summaryHtml = firstParagraph(page.html);
    page.readMinutes = Math.max(1, Math.round(page.wordCount / 170));
    page.hasExamTheorem = examLinked.has(page.id);
    delete page.body;
    delete page.rawLinks;
    delete page.sourcePath;
    delete page.unitOrder;
    delete page.headings;
  }

  const statements = buildStatements(pages);
  // The official list comes first; theorems under "## הופיעו במבחנים…" were
  // asked in past exams but are not on the current list.
  const [officialBody, pastBody = ""] = examBody.split(/^##\s+הופיעו במבחנים.*$/m);
  const examTheorems = buildExamTheorems({ body: officialBody }, resolver, pages);
  const pastTheorems = buildExamTheorems({ body: pastBody }, resolver, pages);
  const exams = loadExams();
  for (const row of [...examTheorems, ...pastTheorems]) {
    row.exams = exams.flatMap((exam) =>
      exam.questions.filter((q) => (q.prove || []).includes(row.number)).map((q) => ({ exam: exam.n, q: q.q }))
    );
  }
  const missingProofs = examTheorems.filter((row) => !row.proofPageId).map((row) => row.number);
  if (missingProofs.length) console.warn(`Exam theorems without a marked proof: ${missingProofs.join(", ")}`);

  const edges = pages.flatMap((page) => page.links.map((target) => ({ source: page.id, target })));
  const graph = {
    nodes: pages.map((page) => ({
      id: page.id,
      title: page.navTitle,
      unitId: page.unitId,
      groupId: page.groupId,
      degree: page.links.length + page.backlinks.length
    })),
    edges
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    notice: course.notice,
    course: publicCourseInfo(),
    homeHref: `${toPosix(path.relative(outDir, docsDir))}/`,
    homePageId: findByTitle(pages, ["כספת העל", "Central Note"]) || pages[0]?.id,
    mapPageId: findByTitle(pages, ["מפת הקורס"]),
    dependencyPageId: findByTitle(pages, ["מפת תלות"]),
    proofPageId: findByTitle(pages, ["תבניות הוכחה"]),
    examListPageId: findByTitle(pages, [course.theoremListTitle]),
    counterPageId: findByTitle(pages, ["דוגמאות נגד"]),
    units,
    navGroups,
    stats: {
      formulaCount: pages.reduce((sum, page) => sum + (page.searchText.match(/\$/g)?.length || 0), 0)
    },
    graph,
    statements,
    examTheorems,
    pastTheorems,
    exams,
    flashcards,
    pages
  };

  writeGeneratedContent(payload);
  copyFigures();
  copyExams();
  console.log(`Built ${course.id}: ${pages.length} pages, ${edges.length} graph edges -> ${path.relative(root, outDir)}`);
  return payload;
}

// ---------------------------------------------------------------------------
// The home page: one card per course
// ---------------------------------------------------------------------------

function courseStats(item, payload) {
  const units = payload.navGroups.filter((group) => group.number).length;
  const theorems = payload.examTheorems.length;
  const exams = payload.exams.length;
  return [
    units === 1 ? item.words.oneUnit : `${units} ${item.words.units}`,
    `${payload.pages.length} פתקים`,
    theorems ? `${theorems} ${item.words.theorems}` : "",
    item.features.exams && exams ? `${exams} מבחני עבר` : ""
  ].filter(Boolean);
}

const hrefFromHome = (item) => `${toPosix(path.relative(docsDir, path.resolve(root, item.outDir)))}/`;

export function renderCourseCards(results) {
  return results
    .map(
      ({ course: item, payload }) => `        <a class="course-card" href="${hrefFromHome(item)}">
          <span class="course-card-top">
            <span class="brand-mark" aria-hidden="true">${escapeHtml(item.brandMark)}</span>
            <span class="course-card-code">קורס ${escapeHtml(item.courseCode)}</span>
          </span>
          <h2>${escapeHtml(item.fullName)}</h2>
          <p>${escapeHtml(item.summary)}</p>
          <span class="course-card-stats">${courseStats(item, payload).map((stat) => `<span class="course-card-stat">${escapeHtml(stat)}</span>`).join(" · ")}</span>
          <span class="course-card-go">לכניסה לקורס <span aria-hidden="true">←</span></span>
        </a>`
    )
    .join("\n");
}

function writeHomePage(results) {
  const legacy = results.find(({ course: item }) => item.legacyRoot)?.course;
  const tokens = {
    SITE_NAME: SITE.name,
    SITE_MARK: SITE.mark,
    SITE_TAGLINE: SITE.tagline,
    SITE_INTRO: SITE.intro,
    SITE_DESCRIPTION: SITE.description,
    FOOTER_NOTICE: SITE.footerNotice,
    LEGACY_HREF: legacy ? hrefFromHome(legacy) : "",
    COURSE_CARDS: renderCourseCards(results)
  };
  const html = fs
    .readFileSync(path.join(webAppDir, "landing.html"), "utf8")
    .replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => tokens[name]);
  fs.mkdirSync(path.join(docsDir, "assets"), { recursive: true });
  fs.copyFileSync(path.join(webAppDir, "assets", "site.css"), path.join(docsDir, "assets", "site.css"));
  fs.writeFileSync(path.join(docsDir, "index.html"), html, "utf8");
  fs.writeFileSync(path.join(docsDir, ".nojekyll"), "", "utf8");
  writeRootIndex(html);
}

export function buildSite(courses = COURSES) {
  for (const item of courses) {
    if (!fs.existsSync(path.resolve(root, item.vaultDir))) throw new Error(`Vault not found: ${item.vaultDir}`);
  }
  // Everything under docs/ is generated, so a course that moves leaves nothing behind.
  fs.rmSync(docsDir, { recursive: true, force: true });
  writeHomePage(courses.map((item) => ({ course: item, payload: buildCourse(item) })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) buildSite();
