// Long pages in parts.
//
// A long note is shown a few phone screens at a time (features.parts). The
// page HTML stays whole: the build only decides where each part starts, as a
// list of heading ids. A part starts at an h2, or at a top-level h3 inside an
// h2 section that is too tall to be one part.
//
// Heights are estimated in pixels on a 375px-wide phone with every folding
// box closed, from the page HTML alone. The weights were fitted against the
// measured heights of all 933 sections of the calculus course (median error 6%).

export const PHONE_SCREEN = 812;

export const PART_RULES = {
  // A page shorter than this stays whole.
  pageMin: 7 * PHONE_SCREEN,
  // What a part aims at, and what it should not pass when it can be helped.
  target: 4 * PHONE_SCREEN,
  max: 6 * PHONE_SCREEN,
  // A part shorter than this joins a neighbour.
  min: 1.5 * PHONE_SCREEN
};

// Height of each kind of block. Text is per character of what the reader sees.
const W = {
  char: 0.9,
  block: 30,
  heading: 55,
  subheading: 49,
  display: 77,
  demo: 508,
  diagram: 414,
  graph: 491,
  row: 12.5,
  folded: 102,
  proof: 264,
  callout: 0
};

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;

// The HTML a reader sees with every closed <details> folded: each closed box
// keeps its <summary> and loses its body. Open boxes (<details open>) stay.
export function foldedView(html) {
  let out = "";
  let last = 0;
  let depth = 0;
  let skipDepth = 0; // > 0 while inside the body of a closed box
  const closedAt = new Set(); // depths of closed boxes whose summary is still being read
  for (const match of html.matchAll(TAG)) {
    const [whole, slash, rawName, attrs] = match;
    const name = rawName.toLowerCase();
    if (!skipDepth) out += html.slice(last, match.index);
    last = match.index + whole.length;
    if (name === "details") {
      if (!slash) {
        depth += 1;
        if (!skipDepth) {
          out += whole;
          if (!/\sopen\b/.test(attrs)) closedAt.add(depth);
        }
      } else {
        if (skipDepth === depth) {
          skipDepth = 0;
          out += whole;
        } else if (!skipDepth) out += whole;
        closedAt.delete(depth);
        depth -= 1;
      }
      continue;
    }
    if (!skipDepth) out += whole;
    if (name === "summary" && slash && closedAt.has(depth) && !skipDepth) {
      closedAt.delete(depth);
      skipDepth = depth;
    }
  }
  if (!skipDepth) out += html.slice(last);
  return out;
}

const count = (html, pattern) => (html.match(pattern) || []).length;

// The measurable parts of a piece of HTML, as the folded page shows it.
export function blockFeatures(html) {
  let view = foldedView(html);
  const features = {
    demo: count(view, /data-demo="/g),
    graph: count(view, /data-desmos="/g),
    diagram: count(view, /class="mermaid"/g),
    display: count(view, /class="math math-display"/g),
    row: count(view, /<tr[\s>]/g),
    // The closed boxes the reader sees, not the ones hidden inside them.
    folded: count(view, /<details\b(?![^>]*\sopen)/g),
    proof: count(view, /class="proof"/g),
    callout: count(view, /<(?:blockquote|details) class="callout/g),
    heading: count(view, /<h2[\s>]/g),
    subheading: count(view, /<h[34][\s>]/g),
    block: count(view, /<(?:p|li|tr)[\s>]/g)
  };
  // Figures and display formulas take their own height; their source is not text.
  view = view
    .replace(/<figure\b[\s\S]*?<\/figure>/g, "")
    .replace(/<pre class="mermaid"[\s\S]*?<\/pre>/g, "")
    .replace(/<div class="math math-display"[^>]*>[\s\S]*?<\/div>/g, "")
    // An inline formula shows about a third of its TeX.
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, tex) => "x".repeat(Math.max(1, Math.round(tex.length / 3))));
  const text = view
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, "x")
    .replace(/\s+/g, " ")
    .trim();
  features.char = text.length;
  return features;
}

export function blockHeight(html) {
  const features = blockFeatures(html);
  return Math.round(Object.entries(W).reduce((sum, [key, weight]) => sum + weight * (features[key] || 0), 0));
}

// Top-level children of an HTML fragment: [{ tag, attrs, start, end }].
function topLevel(html) {
  const out = [];
  let depth = 0;
  let open = null;
  const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "source", "wbr", "col"]);
  for (const match of html.matchAll(TAG)) {
    const [whole, slash, rawName, attrs] = match;
    const name = rawName.toLowerCase();
    if (VOID.has(name) || whole.endsWith("/>")) continue;
    if (!slash) {
      if (depth === 0) open = { tag: name, attrs, start: match.index };
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0 && open) {
        out.push({ ...open, end: match.index + whole.length });
        open = null;
      }
    }
  }
  return out;
}

const idOf = (attrs) => (attrs.match(/\sid="([^"]+)"/) || [])[1] || "";
const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/\\\(|\\\)/g, "").replace(/\s+/g, " ").trim();

// The page cut into blocks a part can start at: the content before the first
// h2, then each h2 section. A section close to the part maximum is cut again
// at its top-level h3 headings.
export function pageBlocks(html, rules = PART_RULES) {
  const blocks = [];
  const children = topLevel(html);
  let intro = "";
  for (const child of children) {
    const piece = html.slice(child.start, child.end);
    if (child.tag !== "section") {
      intro += piece;
      continue;
    }
    const kind = (child.attrs.match(/class="([^"]+)"/) || [])[1] || "";
    const id = (child.attrs.match(/aria-labelledby="([^"]+)"/) || [])[1] || "";
    const inner = piece.replace(/^<section[^>]*>/, "").replace(/<\/section>$/, "");
    const titleMatch = inner.match(/^<h2[^>]*>([\s\S]*?)<\/h2>/);
    const height = blockHeight(piece);
    const closing = /section-(?:card|related|review)/.test(kind);
    if (height <= rules.max * 0.9 || !id) {
      blocks.push({ id, level: 2, title: plain(titleMatch?.[1] || ""), height, closing });
      continue;
    }
    // Too tall for one part: cut at the h3 headings that sit directly in the section.
    const parts = topLevel(inner);
    let current = { id, level: 2, title: plain(titleMatch?.[1] || ""), html: "", closing };
    const cut = [];
    for (const part of parts) {
      const chunk = inner.slice(part.start, part.end);
      const h3 = part.tag === "h3" && idOf(part.attrs);
      if (h3 && current.html) {
        cut.push(current);
        current = { id: h3, level: 3, title: plain(chunk), html: "", closing: false };
      }
      current.html += chunk;
    }
    cut.push(current);
    for (const block of cut) blocks.push({ id: block.id, level: block.level, title: block.title, height: blockHeight(block.html), closing: block.closing });
  }
  if (intro.trim()) blocks.unshift({ id: "", level: 0, title: "", height: blockHeight(intro), closing: false });
  return blocks;
}

// Where each part starts, as heading ids, or null when the page stays whole.
// mode "notes" packs sections greedily up to the target; mode "topics" (topic
// sheets and exam-prep pages) starts a part at every h2 and only merges short ones.
export function groupParts(blocks, { mode = "notes", rules = PART_RULES } = {}) {
  const total = blocks.reduce((sum, block) => sum + block.height, 0);
  if (total < rules.pageMin) return null;
  const parts = [];
  for (const block of blocks) {
    const current = parts.at(-1);
    const sum = current ? current.height : 0;
    // A closing section (summary, links, review) stays with the part before it
    // when it fits there.
    const startsHere =
      !current ||
      (block.id &&
        (block.closing
          ? sum + block.height > rules.max
          : mode === "topics" && block.level === 2
            ? true
            : sum + block.height > rules.target * 1.15) &&
        sum >= (block.level === 3 ? rules.min / 2 : 0));
    // The content before the first heading always opens the first part.
    if (startsHere && !(current && current.blocks.every((b) => !b.id))) parts.push({ blocks: [block], height: block.height });
    else {
      current.blocks.push(block);
      current.height += block.height;
    }
  }
  // A short part joins a neighbour (the previous one, or the next for the
  // first part) when both fit in one part. Otherwise it takes blocks from that
  // neighbour until it is long enough, as long as the neighbour stays so too.
  const sumOf = (list) => list.reduce((total, block) => total + block.height, 0);
  for (let i = 0; i < parts.length; i += 1) {
    if (parts.length < 2 || parts[i].height >= rules.min) continue;
    const j = i === 0 ? 1 : i - 1;
    if (parts[i].height + parts[j].height <= rules.max) {
      const [a, b] = j < i ? [j, i] : [i, j];
      parts[a] = { blocks: [...parts[a].blocks, ...parts[b].blocks], height: parts[a].height + parts[b].height };
      parts.splice(b, 1);
      i = -1;
      continue;
    }
    const donor = parts[j].blocks;
    const short = parts[i].blocks;
    while (sumOf(short) < rules.min && donor.length > 1) {
      const moving = j < i ? donor.at(-1) : donor[0];
      const rest = sumOf(donor) - moving.height;
      if (rest < rules.min || !(j < i ? moving.id : donor[1].id)) break;
      if (j < i) short.unshift(donor.pop());
      else short.push(donor.shift());
    }
    parts[i].height = sumOf(short);
    parts[j].height = sumOf(donor);
  }
  if (parts.length < 2) return null;
  return parts.map((part) => ({
    id: part.blocks.find((block) => block.id)?.id || "",
    title: part.blocks.find((block) => block.id)?.title || "",
    height: part.height
  }));
}
