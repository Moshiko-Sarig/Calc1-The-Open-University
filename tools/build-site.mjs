import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vaultDir = path.join(root, "חשבון אינפיסימטלי 1");
const webAppDir = path.join(root, "web-app");
const docsDir = path.join(root, "docs");
const webAssetsDir = path.join(webAppDir, "assets");
const docsAssetsDir = path.join(docsDir, "assets");
const figuresDir = path.join(root, "figures");
const generatedAssetDirs = [webAssetsDir, docsAssetsDir];

const collator = new Intl.Collator("he", { numeric: true, sensitivity: "base" });

const notice =
  "אתר לימודי לא רשמי. הפתקים מבוססים על חומרי הקורס 20474 של האוניברסיטה הפתוחה ועל סיכום הרצאות אינפי 1מ של אביב צנזור מהטכניון. כל הזכויות בחומרי המקור שמורות לבעליהן.";

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
  const unitMatch = first.match(/^יחידה\s+(\d+)/);
  if (unitMatch) {
    return { unitId: `unit-${unitMatch[1]}`, unitName: first, unitOrder: Number(unitMatch[1]) + 10 };
  }
  if (first === "00 - מרכז הכספת") return { unitId: "center", unitName: "מרכז הכספת", unitOrder: 1 };
  if (first.startsWith("נושאים משלימים")) return { unitId: "supplement", unitName: first, unitOrder: 30 };
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

  text = text.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const page = resolveLink(target);
    const textLabel = label || target;
    if (!page) return `<span class="dead-link">${escapeHtml(textLabel)}</span>`;
    return `<a href="#/page/${page.id}" data-page-link="${page.id}">${escapeHtml(textLabel)}</a>`;
  });

  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, href) => {
    return `<img src="${escapeAttribute(href)}" alt="${escapeAttribute(alt)}" loading="lazy" />`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    return `<a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${label}</a>`;
  });

  text = text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^\*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

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
  const body = items
    .map((item) => `<li>${renderInline(item.text, resolveLink)}${item.children.join("")}</li>`)
    .join("");
  return { html: `<${tag}>${body}</${tag}>`, next: index };
}

function renderMarkdown(body, resolveLink) {
  const cleaned = body.replace(/<!--\s*codex-enhanced:[\s\S]*?-->/g, "").trim();
  const lines = cleaned.split(/\r?\n/);
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
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
      const content = renderInline(heading[2], resolveLink);
      html.push(`<h${level}>${content}</h${level}>`);
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
      html.push(`<blockquote>${renderMarkdown(quote.join("\n"), resolveLink)}</blockquote>`);
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
      !/^\s*\d+[.)]\s+/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(" "), resolveLink)}</p>`);
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

function renderCodeBlock(lang, code) {
  if (lang === "mermaid") return `<div class="diagram-wrap"><pre class="mermaid">${escapeHtml(rtlMermaid(code))}</pre></div>`;
  const safe = escapeHtml(code);
  if (["dataview", "tikz", "desmos-live", "mathematica-plot"].includes(lang)) {
    return `<details class="plugin-block"><summary>בלוק ${escapeHtml(lang)} מהכספת</summary><pre><code>${safe}</code></pre></details>`;
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
      units.set(page.unitId, { id: page.unitId, name: page.unitName, order: page.unitOrder, count: 0 });
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
  copyDirectory(webAppDir, docsDir, (rel) => rel === "assets/content.js" || rel.startsWith("assets/figures/"));
}

function writeRootIndex() {
  const source = path.join(webAppDir, "index.html");
  if (!fs.existsSync(source)) return;
  const html = fs.readFileSync(source, "utf8");
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

function copyFigures() {
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

function findByTitle(pages, includes) {
  return pages.find((page) => includes.some((value) => page.title.includes(value)))?.id || "";
}

function main() {
  if (!fs.existsSync(vaultDir)) {
    throw new Error(`Vault not found: ${vaultDir}`);
  }

  copyStaticApp();
  writeRootIndex();

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

  for (const page of pages) {
    page.backlinks = Array.from(new Set(backlinks.get(page.id) || []));
    page.html = renderMarkdown(page.body, resolver);
    delete page.body;
    delete page.rawLinks;
    delete page.sourcePath;
    delete page.unitOrder;
  }

  const edges = pages.flatMap((page) => page.links.map((target) => ({ source: page.id, target })));
  const graph = {
    nodes: pages.map((page) => ({
      id: page.id,
      title: page.title,
      unitId: page.unitId,
      degree: page.links.length + page.backlinks.length
    })),
    edges
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    notice,
    homePageId: findByTitle(pages, ["כספת העל", "Central Note"]) || pages[0]?.id,
    mapPageId: findByTitle(pages, ["מפת הקורס"]),
    dependencyPageId: findByTitle(pages, ["מפת תלות"]),
    proofPageId: findByTitle(pages, ["תבניות הוכחה"]),
    counterPageId: findByTitle(pages, ["דוגמאות נגד"]),
    units,
    stats: {
      formulaCount: pages.reduce((sum, page) => sum + (page.searchText.match(/\$/g)?.length || 0), 0)
    },
    graph,
    pages
  };

  writeGeneratedContent(payload);
  fs.writeFileSync(path.join(docsDir, ".nojekyll"), "", "utf8");
  copyFigures();
  console.log(`Built ${pages.length} pages, ${edges.length} graph edges -> ${path.relative(root, docsDir)}`);
}

main();
