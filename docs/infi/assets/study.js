/* Study tools: proofs step by step with "why?" notes, a proof puzzle for the
 * exam theorems, and flashcards with spaced repetition.
 *
 * Proofs are the vault's <!-- infi-proof: N --> blocks (div.proof). A proof
 * is split into steps: list items, paragraphs, and the sentences of long
 * paragraphs (a "." outside formulas followed by a space); a display formula
 * belongs to the step before it. app.js passes its helpers in
 * window.InfiApp. Progress is kept in this browser only (localStorage).
 */
(() => {
  "use strict";

  const course = window.COURSE_DATA.course;
  const words = course.words;
  const SRS_KEY = `${course.storagePrefix}-srs-v1`;
  const PUZZLE_KEY = `${course.storagePrefix}-puzzle-v1`;
  const NEW_PER_DAY = 12;
  const KINDS = "משפט|טענה|למה|הגדרה|מסקנה|אקסיומה";
  const NAMED_REF = new RegExp(`(?:^|[^\\u05d0-\\u05ea])[בלמהו]?(${KINDS})\\s+(\\d+(?:\\.\\d+){1,2})(?![\\d])`, "g");
  const BARE_REF = /\((\d+(?:\.\d+){1,2})\)/g;

  const app = () => window.InfiApp;
  const esc = (text) => app().escapeHtml(text);

  function readStore(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: progress lasts for this visit only */
    }
  }

  // Days since the epoch in local time, so "today" turns over at midnight.
  const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);

  function shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Theorems, statements and names
  // ---------------------------------------------------------------------------

  const GENERIC_NAME = new RegExp(`^ה?(${KINDS})(\\s+ה?(ראשון|שני|שלישי|מרכזי))?$`);

  function cleanName(html) {
    const text = (html || "")
      .replace(/<span class="badge[\s\S]*?<\/span>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(new RegExp(`\\((?:[^()]*?(?:${KINDS})[^()]*?|\\s*\\d+(?:\\.\\d+){1,2}[^()]*)\\)`, "g"), "")
      .replace(new RegExp(`^(?:${KINDS})\\s+\\d+(?:\\.\\d+){1,2}\\s*[—–:-]?\\s*`), "")
      .replace(/^דוגמה(?:\s+מלאה)?\s+\d+\s*[—–:-]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    return text;
  }

  // A short name for a numbered statement: its heading without the number,
  // or the note's title when the heading is generic ("המשפט (8.6)").
  function statementName(number) {
    const { data, pages } = app();
    const st = data.statements[number];
    if (!st) return "";
    const name = cleanName(st.titleHtml);
    return !name || GENERIC_NAME.test(name) || name.length < 3 ? pages.get(st.pageId)?.navTitle || "" : name;
  }

  function theoremName(t) {
    const fromIndex = statementName(t.number);
    if (fromIndex) return fromIndex;
    const short = t.statementHtml.replace(/<[^>]+>/g, "");
    return short.length <= 48 ? short : app().pages.get(t.noteId)?.navTitle || "";
  }

  // The statement as it appears in the note (heading section or paragraph).
  function statementParts(number) {
    const { data, pages, sectionPreview } = app();
    const st = data.statements[number];
    const page = st && pages.get(st.pageId);
    const found = page ? sectionPreview(page, st.anchor) : null;
    return found?.parts?.length ? found.parts : null;
  }

  function theorems() {
    return app().data.examTheorems || [];
  }

  function theoremByNumber(number) {
    return theorems().find((t) => t.number === number);
  }

  function proofHref(t) {
    const { pages, pageHref } = app();
    const page = pages.get(t.proofPageId);
    return page ? pageHref(page, t.proofAnchor) : "#/practice";
  }

  function unitLabel(pageId) {
    const { pages, groupById, groupHeading } = app();
    const page = pages.get(pageId);
    return page ? groupHeading(groupById.get(page.groupId)) : "";
  }

  // ---------------------------------------------------------------------------
  // Splitting a proof into steps
  // ---------------------------------------------------------------------------

  const SKIP_TEXT = ".math, mjx-container, .why-btn, .why-note";

  function sentenceSpans(paragraph) {
    const doc = paragraph.ownerDocument;
    const texts = [];
    const walker = doc.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement.closest(SKIP_TEXT)) texts.push(node);
    }
    // a boundary right after a "." that is followed by whitespace, lifted
    // out of the inline elements that end there (</strong>, a glued formula)
    const lift = (node, offset) => {
      let container = node;
      let at = offset;
      while (container !== paragraph && at === (container.nodeType === 3 ? container.data.length : container.childNodes.length)) {
        const parent = container.parentNode;
        at = Array.prototype.indexOf.call(parent.childNodes, container) + 1;
        container = parent;
      }
      return [container, at];
    };
    const cuts = [];
    texts.forEach((node, index) => {
      const text = node.data;
      for (let i = 0; i < text.length; i += 1) {
        if (text[i] !== ".") continue;
        const next = i + 1 < text.length ? text[i + 1] : texts[index + 1]?.data[0];
        if (next !== undefined && /\s/.test(next)) cuts.push(lift(node, i + 1));
      }
    });
    if (!cuts.length) return [];
    const ranges = [];
    let start = [paragraph, 0];
    for (const cut of cuts) {
      const range = doc.createRange();
      range.setStart(...start);
      range.setEnd(...cut);
      ranges.push(range);
      start = cut;
    }
    const tail = doc.createRange();
    tail.setStart(...start);
    tail.setEnd(paragraph, paragraph.childNodes.length);
    ranges.push(tail);
    // a fragment shorter than a real sentence ("**הוכחה.**") joins the next
    const merged = [];
    let pending = null;
    for (const range of ranges) {
      if (pending) {
        range.setStart(pending.startContainer, pending.startOffset);
        pending = null;
      }
      if (range.toString().trim().length < 28) pending = range;
      else merged.push(range);
    }
    if (pending) {
      if (merged.length) merged[merged.length - 1].setEnd(pending.endContainer, pending.endOffset);
      else merged.push(pending);
    }
    if (merged.length < 2) return [];
    const spans = [];
    for (const range of merged.slice().reverse()) {
      const span = doc.createElement("span");
      span.className = "pstep";
      span.append(range.extractContents());
      range.insertNode(span);
      spans.unshift(span);
    }
    return spans;
  }

  // A paragraph that only says "**הוכחה.**" (or "**הוכחה (המקרה העולה).**")
  // is a label, not a step: it stays visible and is not a puzzle strip.
  const isProofLabel = (block) => block.matches("p") && /^\s*הוכח/.test(block.textContent) && plainText(block).trim().length < 40 && !/[=<>]/.test(plainText(block));

  // Steps in order; each step is the list of elements shown together.
  function segmentProof(proof, { sentences = true } = {}) {
    const steps = [];
    for (const block of Array.from(proof.children)) {
      if (!steps.length && isProofLabel(block)) continue;
      if (block.matches(".math-display")) {
        if (steps.length) steps[steps.length - 1].push(block);
        else steps.push([block]);
      } else if (block.matches("ol, ul")) {
        for (const item of Array.from(block.children)) steps.push([item]);
      } else if (block.matches("p") && sentences) {
        const spans = sentenceSpans(block);
        if (spans.length) spans.forEach((span) => steps.push([span]));
        else steps.push([block]);
      } else {
        steps.push([block]);
      }
    }
    return steps;
  }

  // ---------------------------------------------------------------------------
  // "Why?" references of a step: links and numbered statements it cites
  // ---------------------------------------------------------------------------

  function plainText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll?.("mjx-container, .why-btn, .why-note").forEach((node) => node.remove());
    clone.querySelectorAll?.(".math").forEach((node) => node.replaceWith(" "));
    return clone.textContent || "";
  }

  function stepRefs(elements, own) {
    const { data, pages } = app();
    const refs = [];
    const seen = new Set();
    for (const el of elements) {
      const text = plainText(el);
      for (const m of text.matchAll(NAMED_REF)) {
        const number = m[2];
        if (number === own || seen.has(number) || !data.statements[number]) continue;
        seen.add(number);
        refs.push({ number, kind: m[1] });
      }
      for (const m of text.matchAll(BARE_REF)) {
        const number = m[1];
        if (number === own || seen.has(number) || !data.statements[number]) continue;
        seen.add(number);
        refs.push({ number, kind: data.statements[number].kind });
      }
      el.querySelectorAll?.('a[href^="#/page/"]').forEach((a) => {
        const href = a.getAttribute("href");
        const pageId = href.split("/")[2];
        if (seen.has(href) || !pages.has(pageId)) return;
        seen.add(href);
        refs.push({ href, pageId, label: a.textContent.trim() });
      });
    }
    // a cited number makes a link to the same note redundant
    const statementPages = new Set(refs.filter((r) => r.number).map((r) => data.statements[r.number].pageId));
    return refs.filter((r) => r.number || !statementPages.has(r.pageId)).slice(0, 3);
  }

  function whyNote(refs) {
    const { data, pages, pageHref, sectionPreview } = app();
    const note = document.createElement("span");
    note.className = "why-note";
    note.setAttribute("role", "note");
    for (const ref of refs) {
      const item = document.createElement("span");
      item.className = "why-item";
      let title;
      let parts = null;
      let href;
      if (ref.number) {
        const st = data.statements[ref.number];
        const page = pages.get(st.pageId);
        title = `${st.kind} ${ref.number}${statementName(ref.number) ? ` · ${esc(statementName(ref.number))}` : ""}`;
        parts = sectionPreview(page, st.anchor)?.parts;
        href = pageHref(page, st.anchor);
      } else {
        const page = pages.get(ref.pageId);
        const slug = ref.href.split("/")[3];
        const section = slug ? sectionPreview(page, decodeURIComponent(slug)) : null;
        title = esc(ref.label || page.navTitle);
        parts = section?.parts;
        href = ref.href;
        if (!parts?.length && page.summaryHtml) {
          const p = document.createElement("p");
          p.innerHTML = page.summaryHtml;
          parts = [p];
        }
      }
      item.innerHTML = `<span class="why-title"><a href="${href}">${title}</a></span>`;
      const body = document.createElement("span");
      body.className = "why-body";
      for (const part of (parts || []).slice(0, 2)) {
        const block = document.createElement("span");
        block.className = "why-block";
        block.innerHTML = part.matches?.("p, li") ? part.innerHTML : part.outerHTML;
        body.append(block);
      }
      item.append(body);
      note.append(item);
    }
    note.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    return note;
  }

  // ---------------------------------------------------------------------------
  // Proofs on note pages: the toolbar and the step-by-step mode
  // ---------------------------------------------------------------------------

  function decorate(root) {
    const firstCards = root.querySelector(".prose .qa-list");
    if (firstCards && !root.querySelector(".qa-practice")) {
      const link = document.createElement("p");
      link.className = "qa-practice";
      link.innerHTML = `<a class="proof-btn" href="#/practice/cards">לתרגל את הכרטיסים בחזרה מרווחת</a>`;
      const section = firstCards.closest(".note-section");
      (section?.querySelector("h2") || firstCards).before(link);
    }
    root.querySelectorAll(".prose .proof[data-proof]").forEach((proof) => {
      if (proof.previousElementSibling?.classList.contains("proof-bar")) return;
      const number = proof.dataset.proof;
      const t = theoremByNumber(number);
      const bar = document.createElement("div");
      bar.className = "proof-bar";
      bar.innerHTML = `
        <span class="proof-bar-label">הוכחת ${esc(t?.kind || "משפט")} ${esc(number)}</span>
        <span class="proof-bar-actions">
          <button type="button" class="proof-btn" data-step-start>שלב אחר שלב</button>
          ${t ? `<a class="proof-btn is-quiet" href="#/practice/proof/${encodeURIComponent(number)}">פאזל הוכחה</a>` : ""}
        </span>
        <span class="proof-bar-status visually-hidden" aria-live="polite"></span>`;
      proof.before(bar);
      bar.querySelector("[data-step-start]").addEventListener("click", () => startStepping(proof, bar));
    });
  }

  function startStepping(proof, bar) {
    const number = proof.dataset.proof;
    if (!proof.stepState) {
      const steps = segmentProof(proof);
      proof.stepState = { steps, shown: 1 };
      steps.forEach((elements, index) => {
        const refs = stepRefs(elements, number);
        if (!refs.length) return;
        const host = elements[0].matches("li, .pstep") ? elements[0] : elements[elements.length - 1];
        const button = document.createElement("button");
        button.type = "button";
        button.className = "why-btn";
        button.innerHTML = `למה?<span class="visually-hidden"> (שלב ${index + 1})</span>`;
        button.setAttribute("aria-expanded", "false");
        button.addEventListener("click", () => toggleWhy(button, refs, host));
        if (host.matches(".math-display")) host.after(button);
        else host.append(button);
        elements.whyButton = button;
      });
    }
    proof.classList.add("is-stepping");
    proof.stepState.shown = 1;
    bar.classList.add("is-stepping");
    const actions = bar.querySelector(".proof-bar-actions");
    actions.innerHTML = `
      <button type="button" class="proof-btn is-quiet" data-step="prev">הקודם</button>
      <span class="proof-count" dir="rtl"></span>
      <button type="button" class="proof-btn" data-step="next">השלב הבא</button>
      <button type="button" class="proof-btn is-quiet" data-step="all">הכול</button>
      <button type="button" class="proof-btn is-quiet" data-step="stop">סיום</button>`;
    actions.querySelector('[data-step="prev"]').addEventListener("click", () => showSteps(proof, bar, proof.stepState.shown - 1));
    actions.querySelector('[data-step="next"]').addEventListener("click", () => showSteps(proof, bar, proof.stepState.shown + 1, true));
    actions.querySelector('[data-step="all"]').addEventListener("click", () => showSteps(proof, bar, proof.stepState.steps.length));
    actions.querySelector('[data-step="stop"]').addEventListener("click", () => stopStepping(proof, bar));
    showSteps(proof, bar, 1);
    actions.querySelector('[data-step="next"]').focus();
  }

  function showSteps(proof, bar, count, highlight = false) {
    const state = proof.stepState;
    const total = state.steps.length;
    state.shown = Math.max(1, Math.min(total, count));
    state.steps.forEach((elements, index) => {
      const visible = index < state.shown;
      for (const el of elements) {
        el.classList.toggle("is-hidden", !visible);
        el.classList.remove("is-new");
      }
      if (elements.whyButton) elements.whyButton.hidden = !visible;
    });
    // hide whole blocks whose every step is still hidden (an empty list)
    proof.querySelectorAll(":scope > ol, :scope > ul, :scope > p").forEach((block) => {
      const parts = block.matches("p") ? block.querySelectorAll(":scope > .pstep") : block.children;
      if (!parts.length) return;
      block.classList.toggle("is-hidden", Array.from(parts).every((part) => part.classList.contains("is-hidden")));
    });
    if (highlight) for (const el of state.steps[state.shown - 1]) el.classList.add("is-new");
    const counter = bar.querySelector(".proof-count");
    if (counter) counter.textContent = `שלב ${state.shown} מתוך ${total}`;
    bar.querySelector('[data-step="prev"]').disabled = state.shown <= 1;
    bar.querySelector('[data-step="next"]').disabled = state.shown >= total;
    bar.querySelector(".proof-bar-status").textContent = state.shown >= total ? `כל ${total} השלבים מוצגים.` : `שלב ${state.shown} מתוך ${total}.`;
    if (highlight) {
      const last = state.steps[state.shown - 1][0];
      const box = last.getBoundingClientRect();
      if (box.bottom > window.innerHeight - 80) last.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    app().alignSheetGrid();
  }

  function stopStepping(proof, bar) {
    proof.classList.remove("is-stepping");
    proof.querySelectorAll(".is-hidden, .is-new").forEach((el) => el.classList.remove("is-hidden", "is-new"));
    proof.querySelectorAll(".why-note").forEach((note) => note.remove());
    proof.querySelectorAll(".why-btn").forEach((button) => {
      button.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
    bar.classList.remove("is-stepping");
    const actions = bar.querySelector(".proof-bar-actions");
    const number = proof.dataset.proof;
    actions.innerHTML = `
      <button type="button" class="proof-btn" data-step-start>שלב אחר שלב</button>
      ${theoremByNumber(number) ? `<a class="proof-btn is-quiet" href="#/practice/proof/${encodeURIComponent(number)}">פאזל הוכחה</a>` : ""}`;
    actions.querySelector("[data-step-start]").addEventListener("click", () => startStepping(proof, bar));
    actions.querySelector("[data-step-start]").focus();
    app().alignSheetGrid();
  }

  function toggleWhy(button, refs, host) {
    const open = button.getAttribute("aria-expanded") === "true";
    const existing = button.whyNote;
    if (open && existing) {
      existing.remove();
      button.whyNote = null;
      button.setAttribute("aria-expanded", "false");
      app().alignSheetGrid();
      return;
    }
    const note = whyNote(refs);
    button.whyNote = note;
    button.after(note);
    button.setAttribute("aria-expanded", "true");
    app()
      .queueTypeset([note])
      .then(() => app().alignSheetGrid());
  }

  // ---------------------------------------------------------------------------
  // Proof puzzle
  // ---------------------------------------------------------------------------

  // Steps of a proof as HTML strips, without the "שלב 3" labels that would
  // give the order away, and with links turned into plain text.
  function puzzleStrips(t) {
    const { pages } = app();
    const page = pages.get(t.proofPageId);
    if (!page) return [];
    const template = document.createElement("template");
    template.innerHTML = page.html;
    const source = template.content.querySelector(`.proof[data-proof="${CSS.escape(t.number)}"]`);
    if (!source) return [];
    let proof = source.cloneNode(true);
    let steps = segmentProof(proof);
    if (steps.length > 12) {
      proof = source.cloneNode(true);
      steps = segmentProof(proof, { sentences: false });
    }
    return steps.map((elements, index) => {
      const box = document.createElement("div");
      for (const el of elements) {
        const piece = el.matches("li, .pstep") ? Object.assign(document.createElement("p"), { innerHTML: el.innerHTML }) : el.cloneNode(true);
        box.append(piece);
      }
      box.querySelectorAll("a").forEach((a) => a.replaceWith(...a.childNodes));
      box.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      const lead = box.querySelector("strong");
      if (lead && box.firstElementChild?.firstChild === lead) lead.innerHTML = lead.innerHTML.replace(/^\s*שלב\s*\d+\s*[:.—–-]?\s*/, "");
      return { index, html: box.innerHTML };
    });
  }

  const mistakesText = (n) => (n === 0 ? "בלי טעויות" : n === 1 ? "טעות אחת" : `${n} טעויות`);

  function puzzleProgress() {
    return readStore(PUZZLE_KEY, {});
  }

  function renderPuzzle(root, number) {
    const { setTitle, queueTypeset } = app();
    const t = theoremByNumber(number);
    if (!t) return renderHub(root);
    const strips = puzzleStrips(t);
    const name = theoremName(t);
    setTitle(`פאזל הוכחה: ${t.kind} ${t.number}`);
    const statement = statementParts(t.number);
    root.innerHTML = `
      <div class="practice">
        <nav class="breadcrumbs" aria-label="מיקום באתר"><ol><li><a href="#/">בית</a></li><li><a href="#/practice">תרגול</a></li><li aria-current="page">פאזל הוכחה</li></ol></nav>
        <header class="practice-head">
          <p class="practice-kicker">פאזל הוכחה · ${esc(unitLabel(t.noteId))}</p>
          <h1 id="pageTitle" tabindex="-1">${esc(t.kind)} ${esc(t.number)}${t.part ? ` ${esc(t.part)}` : ""}${name ? `: ${esc(name)}` : ""}</h1>
          <div class="practice-statement prose"></div>
        </header>
        <section class="puzzle" aria-labelledby="puzzleTitle">
          <h2 id="puzzleTitle" class="visually-hidden">בניית ההוכחה</h2>
          <ol class="puzzle-proof" aria-label="ההוכחה שנבנתה"></ol>
          <p class="puzzle-status" aria-live="polite"></p>
          <div class="puzzle-pool" role="group" aria-label="השלבים שנותרו"></div>
          <div class="puzzle-actions">
            <button type="button" class="demo-btn is-quiet" data-hint>רמז</button>
            <button type="button" class="demo-btn is-quiet" data-reshuffle>ערבוב מחדש</button>
            <a class="demo-btn is-quiet" href="${proofHref(t)}">להוכחה בדף</a>
          </div>
        </section>
      </div>`;
    const statementBox = root.querySelector(".practice-statement");
    if (statement) statementBox.append(...statement.map((part) => part.cloneNode(true)));
    else statementBox.innerHTML = `<p>${t.statementHtml}</p>`;
    statementBox.querySelectorAll(".proof").forEach((node) => node.remove());

    const proofList = root.querySelector(".puzzle-proof");
    const pool = root.querySelector(".puzzle-pool");
    const status = root.querySelector(".puzzle-status");
    const state = { next: 0, mistakes: 0, hints: 0 };

    if (strips.length < 3) {
      status.innerHTML = `ההוכחה הזו קצרה מדי לפאזל. נסו אותה <a href="${proofHref(t)}">שלב אחר שלב בדף</a>.`;
      root.querySelector(".puzzle-actions [data-hint]").hidden = true;
      root.querySelector(".puzzle-actions [data-reshuffle]").hidden = true;
      queueTypeset([root]);
      return;
    }

    function deal() {
      state.next = 0;
      state.mistakes = 0;
      state.hints = 0;
      proofList.replaceChildren();
      pool.replaceChildren();
      let order = shuffle(strips);
      if (order.every((strip, i) => strip.index === i)) order = order.reverse();
      for (const strip of order) {
        // A strip holds paragraphs and display math, which a <button> may not
        // contain; it is a focusable element with the button role instead.
        const card = document.createElement("div");
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        card.className = "strip";
        card.dataset.index = String(strip.index);
        card.style.setProperty("--tilt", `${(Math.random() * 1.6 - 0.8).toFixed(2)}deg`);
        card.innerHTML = strip.html;
        card.addEventListener("click", () => choose(card));
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            choose(card);
          }
        });
        pool.append(card);
      }
      status.textContent = `בחרו את השלב הראשון של ההוכחה (${strips.length} שלבים).`;
      queueTypeset([root]);
    }

    function choose(card) {
      const index = Number(card.dataset.index);
      pool.querySelectorAll(".is-hint").forEach((node) => node.classList.remove("is-hint"));
      if (index !== state.next) {
        state.mistakes += 1;
        card.classList.remove("is-wrong");
        void card.offsetWidth;
        card.classList.add("is-wrong");
        status.textContent = `לא זה השלב ה-${state.next + 1}. נסו שוב. (${mistakesText(state.mistakes)} עד עכשיו)`;
        return;
      }
      const item = document.createElement("li");
      item.className = "strip-placed";
      item.append(...card.childNodes);
      proofList.append(item);
      card.remove();
      state.next += 1;
      if (state.next < strips.length) {
        status.textContent = `נכון. שלב ${state.next} מתוך ${strips.length}. מה בא אחר כך?`;
        pool.querySelector(".strip")?.focus();
      } else finish();
    }

    function finish() {
      const progress = puzzleProgress();
      const entry = progress[t.number] || { done: 0, best: null };
      entry.done += 1;
      entry.best = entry.best === null ? state.mistakes : Math.min(entry.best, state.mistakes);
      entry.last = today();
      progress[t.number] = entry;
      writeStore(PUZZLE_KEY, progress);
      const list = theorems();
      const nextTheorem = list[(list.indexOf(t) + 1) % list.length];
      status.innerHTML = `<strong>ההוכחה בנויה!</strong> ${mistakesText(state.mistakes)}${state.hints ? `, ${state.hints === 1 ? "רמז אחד" : `${state.hints} רמזים`}` : ""}. השיא שלכם במשפט הזה: ${mistakesText(entry.best)}.`;
      root.querySelector(".puzzle-actions").innerHTML = `
        <button type="button" class="demo-btn" data-again>שוב, בערבוב חדש</button>
        <a class="demo-btn is-quiet" href="#/practice/proof/${encodeURIComponent(nextTheorem.number)}">למשפט הבא (${esc(nextTheorem.number)})</a>
        <a class="demo-btn is-quiet" href="#/practice">לכל המשפטים</a>`;
      root.querySelector("[data-again]").addEventListener("click", () => renderPuzzle(root, number));
      root.querySelector("[data-again]").focus();
    }

    root.querySelector("[data-hint]").addEventListener("click", () => {
      const card = pool.querySelector(`.strip[data-index="${state.next}"]`);
      if (!card) return;
      state.hints += 1;
      card.classList.add("is-hint");
      card.focus();
      status.textContent = "הנה השלב הבא, מסומן.";
    });
    root.querySelector("[data-reshuffle]").addEventListener("click", deal);
    deal();
  }

  // ---------------------------------------------------------------------------
  // Flashcards with spaced repetition (an SM-2 style schedule)
  // ---------------------------------------------------------------------------

  function deck() {
    const { data, pages, pageHref } = app();
    const cards = [];
    for (const card of data.flashcards || []) {
      cards.push({ id: card.id, unit: card.unit, kind: "שאלה", front: card.frontHtml, back: () => `<p>${card.backHtml}</p>`, href: pageHref(pages.get(card.pageId)) });
    }
    for (const t of theorems()) {
      const name = theoremName(t);
      cards.push({
        id: `thm-${t.number}`,
        unit: pages.get(t.noteId)?.groupId || "",
        kind: "ניסוח",
        front: `<span class="card-number">${esc(t.kind)} ${esc(t.number)}${t.part ? ` ${esc(t.part)}` : ""}</span>${name ? `<span class="card-name">${esc(name)}</span>` : ""}<span class="card-prompt">מה הניסוח המדויק?</span>`,
        back: () => {
          const parts = statementParts(t.number);
          return parts ? parts.map((part) => part.outerHTML).join("") : `<p>${t.statementHtml}</p>`;
        },
        href: proofHref(t)
      });
    }
    for (const [number, st] of Object.entries(data.statements || {})) {
      if (st.kind !== "הגדרה") continue;
      const page = pages.get(st.pageId);
      if (!page) continue;
      const name = statementName(number);
      cards.push({
        id: `def-${number}`,
        unit: page.groupId,
        kind: "הגדרה",
        front: `<span class="card-number">הגדרה ${esc(number)}</span><span class="card-name">${esc(name)}</span><span class="card-prompt">מה ההגדרה?</span>`,
        back: () => (statementParts(number) || []).map((part) => part.outerHTML).join(""),
        href: pageHref(page, st.anchor)
      });
    }
    const unitOrder = (unit) => Number((unit || "").replace("unit-", "")) || 99;
    return cards.sort((a, b) => unitOrder(a.unit) - unitOrder(b.unit));
  }

  function srsState() {
    const state = readStore(SRS_KEY, null) || {};
    return { cards: state.cards || {}, introduced: state.introduced || {} };
  }

  function schedule(previous, rating) {
    const card = { ivl: 0, ease: 2.5, reps: 0, lapses: 0, due: today(), ...previous };
    if (rating === 1) {
      card.reps = 0;
      card.lapses += 1;
      card.ivl = 0;
      card.ease = Math.max(1.3, card.ease - 0.2);
      card.due = today();
      return card;
    }
    if (rating === 2) {
      card.ivl = card.reps === 0 ? 1 : Math.max(1, Math.round(card.ivl * 1.2));
      card.ease = Math.max(1.3, card.ease - 0.15);
    } else if (rating === 3) {
      card.ivl = card.reps === 0 ? 1 : card.reps === 1 ? 3 : Math.max(card.ivl + 1, Math.round(card.ivl * card.ease));
    } else {
      card.ivl = card.reps === 0 ? 4 : Math.max(card.ivl + 2, Math.round(card.ivl * card.ease * 1.3));
      card.ease += 0.15;
    }
    card.reps += 1;
    card.due = today() + card.ivl;
    return card;
  }

  function intervalLabel(days) {
    if (days <= 0) return "עוד היום";
    if (days === 1) return "מחר";
    if (days === 2) return "יומיים";
    if (days < 30) return `${days} ימים`;
    const months = Math.round(days / 30);
    return months === 1 ? "חודש" : `${months} חודשים`;
  }

  // Due reviews first, then up to NEW_PER_DAY cards never seen before.
  function dueQueue(unitFilter = "") {
    const state = srsState();
    const day = today();
    const all = deck().filter((card) => !unitFilter || card.unit === unitFilter);
    const due = all.filter((card) => state.cards[card.id] && state.cards[card.id].due <= day).sort((a, b) => state.cards[a.id].due - state.cards[b.id].due);
    const introducedToday = state.introduced[day] || 0;
    const fresh = all.filter((card) => !state.cards[card.id]).slice(0, Math.max(0, NEW_PER_DAY - introducedToday));
    return { due, fresh, all, state };
  }

  function srsSummary() {
    const { due, fresh, all, state } = dueQueue();
    const learned = all.filter((card) => state.cards[card.id]?.reps > 0).length;
    return { due: due.length, fresh: fresh.length, total: all.length, learned };
  }

  function renderCards(root) {
    const { setTitle, queueTypeset, groups } = app();
    setTitle("כרטיסי חזרה");
    const units = groups.filter((group) => group.number);
    root.innerHTML = `
      <div class="practice">
        <nav class="breadcrumbs" aria-label="מיקום באתר"><ol><li><a href="#/">בית</a></li><li><a href="#/practice">תרגול</a></li><li aria-current="page">כרטיסי חזרה</li></ol></nav>
        <header class="practice-head">
          <p class="practice-kicker">חזרה מרווחת</p>
          <h1 id="pageTitle" tabindex="-1">כרטיסי חזרה</h1>
          <p class="practice-lead">כרטיס שעונים עליו נכון חוזר אחרי מרווח שהולך וגדל; כרטיס ששוכחים חוזר מהר. ההתקדמות נשמרת בדפדפן הזה.</p>
          <div class="practice-filter">
            <label for="cardUnit">${esc(words.unit)}</label>
            <select id="cardUnit" class="demo-select"><option value="">כל ${esc(words.theUnits)}</option>${units.map((group) => `<option value="${group.id}">${esc(words.unit)} ${group.number} · ${esc(group.subtitle || "")}</option>`).join("")}</select>
          </div>
        </header>
        <section class="review" aria-label="כרטיס">
          <p class="review-progress" aria-live="polite"></p>
          <div class="index-card" data-card></div>
          <div class="review-actions" data-actions></div>
        </section>
      </div>`;
    const cardBox = root.querySelector("[data-card]");
    const actions = root.querySelector("[data-actions]");
    const progress = root.querySelector(".review-progress");
    const select = root.querySelector("#cardUnit");
    let session = null;

    function start() {
      const { due, fresh } = dueQueue(select.value);
      session = { queue: [...due, ...fresh], done: 0, again: 0, freshIds: new Set(fresh.map((card) => card.id)) };
      next();
    }

    function next() {
      const card = session.queue.shift();
      if (!card) return finished();
      session.card = card;
      session.revealed = false;
      const left = session.queue.length + 1;
      progress.textContent = `${left} כרטיסים להיום${session.done ? ` · עניתם על ${session.done}` : ""}`;
      cardBox.innerHTML = `
        <p class="index-card-kind">${esc(card.kind)}${session.freshIds.has(card.id) ? ' · <span class="card-new">חדש</span>' : ""}</p>
        <div class="index-card-front prose">${card.front}</div>
        <div class="index-card-back prose" hidden></div>`;
      actions.innerHTML = `<button type="button" class="demo-btn" data-reveal>הצגת התשובה <kbd>רווח</kbd></button>`;
      actions.querySelector("[data-reveal]").addEventListener("click", reveal);
      actions.querySelector("[data-reveal]").focus();
      queueTypeset([cardBox]);
    }

    function reveal() {
      if (!session?.card || session.revealed) return;
      session.revealed = true;
      const card = session.card;
      const back = cardBox.querySelector(".index-card-back");
      back.innerHTML = `${card.back() || "<p>אין ניסוח שמור לכרטיס הזה.</p>"}<p class="index-card-source"><a href="${card.href}">לדף</a></p>`;
      back.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      back.querySelectorAll(".proof").forEach((node) => node.remove());
      back.hidden = false;
      const previous = srsState().cards[card.id];
      const labels = [
        [1, "שוב", "עוד היום"],
        [2, "קשה", intervalLabel(schedule(previous, 2).ivl)],
        [3, "טוב", intervalLabel(schedule(previous, 3).ivl)],
        [4, "קל", intervalLabel(schedule(previous, 4).ivl)]
      ];
      actions.innerHTML = `<p class="review-ask" id="reviewAsk">כמה טוב זכרתם?</p><div class="review-grades" role="group" aria-labelledby="reviewAsk">${labels
        .map(([value, label, when]) => `<button type="button" class="grade grade-${value}" data-grade="${value}"><strong>${label}</strong><small>${when}</small><kbd>${value}</kbd></button>`)
        .join("")}</div>`;
      actions.querySelectorAll("[data-grade]").forEach((button) => button.addEventListener("click", () => grade(Number(button.dataset.grade))));
      actions.querySelector('[data-grade="3"]').focus();
      queueTypeset([back]);
    }

    function grade(rating) {
      if (!session?.card || !session.revealed) return;
      const card = session.card;
      const state = srsState();
      const day = today();
      if (!state.cards[card.id]) state.introduced[day] = (state.introduced[day] || 0) + 1;
      for (const key of Object.keys(state.introduced)) if (Number(key) < day - 7) delete state.introduced[key];
      state.cards[card.id] = schedule(state.cards[card.id], rating);
      writeStore(SRS_KEY, state);
      session.done += 1;
      if (rating === 1) {
        session.again += 1;
        session.queue.splice(Math.min(3, session.queue.length), 0, card);
      }
      next();
    }

    function finished() {
      session.card = null;
      const tomorrow = deck().filter((card) => {
        const entry = srsState().cards[card.id];
        return entry && entry.due === today() + 1;
      }).length;
      progress.textContent = "";
      cardBox.innerHTML = `
        <p class="index-card-kind">סיום</p>
        <div class="index-card-front"><p><strong>${session.done ? `סיימתם להיום: ${session.done} כרטיסים.` : "אין כרטיסים לחזרה כרגע."}</strong></p>
        <p>${tomorrow ? `מחר יחכו לכם ${tomorrow} כרטיסים.` : "הכרטיסים הבאים יחזרו בעוד כמה ימים."}</p></div>`;
      actions.innerHTML = `<a class="demo-btn" href="#/practice">חזרה לתרגול</a> <button type="button" class="demo-btn is-quiet" data-more>עוד כרטיסים חדשים</button>`;
      actions.querySelector("[data-more]").addEventListener("click", () => {
        const state = srsState();
        state.introduced[today()] = Math.max(0, (state.introduced[today()] || 0) - NEW_PER_DAY);
        writeStore(SRS_KEY, state);
        start();
      });
    }

    // The listener ends with the card: leaving the page must give Space back
    // to scrolling.
    const onKey = (event) => {
      if (!cardBox.isConnected) return document.removeEventListener("keydown", onKey);
      if (event.target.closest?.("input, select, textarea") || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!session?.card) return;
      if (!session.revealed && (event.key === " " || (event.key === "Enter" && !event.target.closest?.("a, button")))) {
        event.preventDefault();
        reveal();
      } else if (session.revealed && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        grade(Number(event.key));
      }
    };
    document.addEventListener("keydown", onKey);
    select.addEventListener("change", start);
    start();
  }

  // ---------------------------------------------------------------------------
  // The practice hub
  // ---------------------------------------------------------------------------

  function renderHub(root) {
    const { setTitle, queueTypeset, groups } = app();
    setTitle("תרגול");
    const summary = srsSummary();
    const progress = puzzleProgress();
    const list = theorems();
    const solved = list.filter((t) => progress[t.number]?.done).length;
    const byUnit = new Map();
    for (const t of list) {
      const unit = app().pages.get(t.noteId)?.groupId || "";
      if (!byUnit.has(unit)) byUnit.set(unit, []);
      byUnit.get(unit).push(t);
    }
    const rows = groups
      .filter((group) => byUnit.has(group.id))
      .map(
        (group) => `
        <section class="hub-unit" aria-labelledby="hub-${group.id}">
          <h3 id="hub-${group.id}">${esc(words.unit)} ${group.number} · ${esc(group.subtitle || "")}</h3>
          <ul class="hub-theorems">${byUnit
            .get(group.id)
            .map((t) => {
              const entry = progress[t.number];
              const badge = entry?.done ? `<span class="hub-done">✓ שיא: ${mistakesText(entry.best)}</span>` : "";
              const name = theoremName(t);
              const plain = t.statementHtml.replace(/<[^>]+>/g, "").trim();
              return `<li>
                <span class="hub-number">${esc(t.number)}${t.part ? ` ${esc(t.part)}` : ""}</span>
                <span class="hub-text"><strong>${esc(name)}</strong>${plain && plain !== name ? `<span class="hub-statement">${t.statementHtml}</span>` : ""}</span>
                <span class="hub-actions">${badge}<a class="proof-btn" href="#/practice/proof/${encodeURIComponent(t.number)}">פאזל</a><a class="proof-btn is-quiet" href="${proofHref(t)}">להוכחה</a></span>
              </li>`;
            })
            .join("")}</ul>
        </section>`
      )
      .join("");
    const randomTheorem = list[Math.floor(Math.random() * list.length)];
    root.innerHTML = `
      <div class="practice">
        <header class="practice-head">
          <p class="practice-kicker">לפני הבחינה</p>
          <h1 id="pageTitle" tabindex="-1">תרגול</h1>
          <p class="practice-lead">כרטיסי חזרה עם חזרה מרווחת${list.length ? `, ופאזל הוכחה לכל אחד מ־${list.length} המשפטים ${esc(course.theoremListLabel)}. בכל הוכחה בדפים יש גם כפתור "שלב אחר שלב"` : ""}. ההתקדמות נשמרת בדפדפן הזה.</p>
        </header>
        <div class="hub-cards">
          ${(app().keyGuides?.() || [])
            .map((g) => `<a class="hub-card hub-card-link hub-card-guide" href="${app().pageHref(g.page)}"><h2>${esc(g.title)}</h2><p>${esc(g.text)}</p></a>`)
            .join("")}
          <article class="hub-card">
            <h2>כרטיסי חזרה</h2>
            <p class="hub-big"><strong>${summary.due + summary.fresh}</strong> להיום</p>
            <p>${summary.due} לחזרה · ${summary.fresh} חדשים · ${summary.learned} מתוך ${summary.total} כבר נלמדו</p>
            <a class="demo-btn" href="#/practice/cards">להתחיל חזרה</a>
          </article>
          ${list.length ? `<article class="hub-card">
            <h2>פאזלי הוכחה</h2>
            <p class="hub-big"><strong>${solved}</strong> מתוך ${list.length}</p>
            <p>מסדרים את שלבי ההוכחה לפי הסדר. כל טעות נספרת, ויש רמז כשנתקעים.</p>
            ${randomTheorem ? `<a class="demo-btn" href="#/practice/proof/${encodeURIComponent(randomTheorem.number)}">פאזל אקראי</a>` : ""}
          </article>` : ""}
        </div>
        ${list.length ? `<section aria-labelledby="hubListTitle">
          <h2 id="hubListTitle" class="hub-list-title">${list.length} ${esc(words.theTheorems)}</h2>
          ${rows}
        </section>` : ""}
      </div>`;
    queueTypeset([root]);
  }

  // ---------------------------------------------------------------------------

  function render(root, route) {
    if (route.id === "cards") renderCards(root);
    else if (route.id === "proof" && route.section) renderPuzzle(root, route.section);
    else renderHub(root);
  }

  function homeSection() {
    const summary = srsSummary();
    const solved = theorems().filter((t) => puzzleProgress()[t.number]?.done).length;
    return `<section class="home-practice" aria-labelledby="practiceTitle">
      <div class="section-head">
        <h2 id="practiceTitle">תרגול לפני הבחינה</h2>
        <p>ההתקדמות נשמרת בדפדפן הזה</p>
      </div>
      <div class="hub-cards">
        <a class="hub-card hub-card-link" href="#/practice/cards">
          <h3>כרטיסי חזרה</h3>
          <p class="hub-big"><strong>${summary.due + summary.fresh}</strong> להיום</p>
          <p>${summary.total} כרטיסים: שאלות, ניסוחי ${esc(words.theTheorems)} והגדרות, בחזרה מרווחת.</p>
        </a>
        ${theorems().length ? `<a class="hub-card hub-card-link" href="#/practice">
          <h3>פאזלי הוכחה</h3>
          <p class="hub-big"><strong>${solved}</strong> מתוך ${theorems().length}</p>
          <p>מסדרים את שלבי ההוכחה של כל ${esc(words.theoremFromList)}, עם רמזים כשנתקעים.</p>
        </a>` : ""}
      </div>
    </section>`;
  }

  window.InfiStudy = { decorate, render, srsSummary, puzzleProgress, theorems, segmentProof, homeSection };
})();
