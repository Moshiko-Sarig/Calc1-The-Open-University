/* Learning support: reading options (text size, spacing, plain paper, focus
   mode, opened explanations), a private "how did this note go?" mark, a
   "stuck?" ladder at the end of each note, the symbols a note uses with how to
   read them aloud, links on cited statements ("לפי למה 3.4.3"), and reading a
   note aloud. Everything is kept in this browser only: no account, no cookies.
   app.js calls InfiSupport.decorate / decorateTree / decorateHome. */
(function () {
  "use strict";

  const root = document.documentElement;
  const app = () => window.InfiApp;
  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        /* storage blocked: the choice lasts until the page is closed */
      }
    }
  };
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------------------------------------------------------------------------
  // Reading options
  // ---------------------------------------------------------------------------

  // Each option is a data attribute on <html>, applied before first paint by
  // the inline script in index.html (same storage keys).
  const OPTIONS = [
    { key: "spacing", label: "רווח בין שורות ואותיות", values: [["normal", "רגיל"], ["wide", "מרווח"]] },
    { key: "paper", label: "רקע הדף", values: [["grid", "משבצות"], ["plain", "נייר חלק"]] },
    { key: "focus", label: "מצב ריכוז (בלי תפריטים בצד)", values: [["off", "כבוי"], ["on", "פועל"]] },
    { key: "explain", label: "הסברים במילים פשוטות", values: [["first", "הראשון פתוח"], ["open", "כולם פתוחים"]] },
    { key: "cheer", label: "משפטי עידוד", values: [["on", "להציג"], ["off", "להסתיר"]] }
  ];
  const SIZES = [["s", "קטן"], ["m", "רגיל"], ["l", "גדול"], ["xl", "גדול מאוד"], ["xxl", "ענק"]];

  function setOption(key, value, fallback) {
    if (value === fallback) {
      delete root.dataset[key];
      store.set(`infi-${key}`, null);
    } else {
      root.dataset[key] = value;
      store.set(`infi-${key}`, value);
    }
  }

  function relayout() {
    window.dispatchEvent(new Event("infi:reading-options"));
  }

  function optionsPanel() {
    const size = root.dataset.textSize || "m";
    const group = (name, label, values, current) => `
      <fieldset class="ro-group">
        <legend>${esc(label)}</legend>
        <div class="ro-choices">${values
          .map(
            ([value, text]) => `<label class="ro-choice"><input type="radio" name="ro-${name}" value="${value}"${value === current ? " checked" : ""} /><span>${esc(text)}</span></label>`
          )
          .join("")}</div>
      </fieldset>`;
    return `
      <div class="ro-head">
        <h2 id="readingOptionsTitle">אפשרויות קריאה</h2>
        <button class="icon-button ro-close" type="button" data-ro-close>
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
          <span class="visually-hidden">סגירה</span>
        </button>
      </div>
      <p class="ro-note">הבחירות נשמרות רק בדפדפן הזה.</p>
      ${group("textSize", "גודל טקסט", SIZES, size)}
      ${OPTIONS.map((o) => group(o.key, o.label, o.values, root.dataset[o.key] || o.values[0][0])).join("")}`;
  }

  function mountOptions() {
    const actions = document.querySelector(".header-actions");
    if (!actions || actions.querySelector("[data-ro-open]")) return;
    const button = document.createElement("button");
    button.className = "icon-button";
    button.type = "button";
    button.dataset.roOpen = "";
    button.setAttribute("aria-haspopup", "dialog");
    button.title = "אפשרויות קריאה";
    button.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg><span class="visually-hidden">אפשרויות קריאה</span>`;
    actions.prepend(button);

    const dialog = document.createElement("dialog");
    dialog.className = "reading-options";
    dialog.setAttribute("aria-labelledby", "readingOptionsTitle");
    document.body.append(dialog);

    button.addEventListener("click", () => {
      dialog.innerHTML = optionsPanel();
      dialog.showModal();
      dialog.querySelector("input:checked")?.focus();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog || event.target.closest("[data-ro-close]")) dialog.close();
    });
    dialog.addEventListener("close", () => button.focus());
    dialog.addEventListener("change", (event) => {
      const input = event.target;
      const name = input.name.replace(/^ro-/, "");
      if (name === "textSize") {
        root.dataset.textSize = input.value;
        store.set("infi-text-size", input.value);
        window.dispatchEvent(new Event("infi:text-size"));
      } else {
        const option = OPTIONS.find((o) => o.key === name);
        setOption(name, input.value, option.values[0][0]);
        if (name === "explain") applyExplain(document);
      }
      relayout();
    });
  }

  function applyExplain(scope) {
    if (root.dataset.explain !== "open") return;
    scope.querySelectorAll?.("details.callout-simple").forEach((box) => (box.open = true));
  }

  // ---------------------------------------------------------------------------
  // "How did this note go?" (private, per course)
  // ---------------------------------------------------------------------------

  const STATUS = {
    got: { label: "הבנתי", tree: "הבנתי" },
    again: { label: "לחזור אליו", tree: "לחזור אליו" },
    stuck: { label: "נתקעתי כאן", tree: "נתקעתי" }
  };
  const STUCK_WORDS = [
    "זה בסדר להיתקע. כמעט כל מי שלומד את זה נתקע באותו מקום.",
    "סימנתם, וזה כבר צעד. נסו אחת מהדרכים למטה, או חזרו לזה מחר בראש נקי.",
    "נתקעתם בשורה מסוימת? כתבו אותה לעצמכם. שאלה מדויקת היא חצי תשובה.",
    "אין צורך להבין הכול בקריאה הראשונה. גם קריאה שנייה ושלישית הן חלק רגיל מהלמידה."
  ];
  const GOT_WORDS = ["יפה מאוד. שווה לחזור לזה בעוד כמה ימים, כדי שזה יישאר.", "כל הכבוד. אפשר להמשיך לדף הבא."];

  const statusKey = () => `${app().data.course?.storagePrefix || "infi"}-note-status`;

  function statuses() {
    try {
      return JSON.parse(store.get(statusKey()) || "{}") || {};
    } catch {
      return {};
    }
  }

  function setStatus(id, value) {
    const all = statuses();
    if (value) all[id] = value;
    else delete all[id];
    store.set(statusKey(), JSON.stringify(all));
    decorateTree();
  }

  function decorateTree() {
    const all = statuses();
    document.querySelectorAll(".course-tree .tree-list a[data-id]").forEach((link) => {
      link.querySelector(".tree-status")?.remove();
      const value = all[link.dataset.id];
      if (!STATUS[value]) return;
      link.insertAdjacentHTML(
        "beforeend",
        `<span class="tree-status tree-status-${value}" aria-hidden="true"></span><span class="tree-status visually-hidden">(${STATUS[value].tree})</span>`
      );
    });
  }

  function statusPanel(page) {
    const current = statuses()[page.id] || "";
    return `
      <section class="note-check" aria-labelledby="noteCheckTitle" data-note-check>
        <h2 id="noteCheckTitle">איך הלך הדף?</h2>
        <p class="note-check-hint">סימון פרטי שנשמר רק בדפדפן הזה. הוא מופיע בתפריט הדפים ובדף הבית.</p>
        <div class="note-check-buttons" role="group" aria-label="מצב הדף">
          ${Object.entries(STATUS)
            .map(([value, s]) => `<button type="button" class="note-check-btn note-check-${value}" data-status="${value}" aria-pressed="${current === value}">${esc(s.label)}</button>`)
            .join("")}
        </div>
        <p class="note-check-message" aria-live="polite" data-check-message></p>
      </section>`;
  }

  // ---------------------------------------------------------------------------
  // The "stuck?" ladder
  // ---------------------------------------------------------------------------

  function linkedNotes(prose, page) {
    const { pages, pageHref } = app();
    const seen = new Set([page.id]);
    const out = [];
    prose.querySelectorAll('a[href^="#/page/"]').forEach((a) => {
      const id = a.getAttribute("href").split("/")[2];
      const target = pages.get(id);
      if (!target || seen.has(id) || target.groupId === "vault" || out.length >= 3) return;
      seen.add(id);
      out.push(`<a href="${pageHref(target)}">${esc(target.navTitle)}</a>`);
    });
    return out;
  }

  function stuckLadder(prose, page) {
    const { pages, pageHref } = app();
    const steps = [];
    if (prose.querySelector("details.callout-simple")) {
      steps.push(`<button type="button" class="link-button" data-open-simple>לפתוח את כל ההסברים במילים פשוטות בדף</button> ולקרוא רק אותם, בלי ההוכחות.`);
    }
    const example = Array.from(prose.querySelectorAll("h2[id], h3[id]")).find((h) => /דוגמ/.test(h.textContent));
    if (example) steps.push(`לחזור ל<a href="${pageHref(page, example.id)}">דוגמה הפתורה</a> ולעבור עליה עם עיפרון, שורה אחרי שורה.`);
    const prev = pages.get(page.prevId);
    if (prev && prev.groupId === page.groupId) steps.push(`לחזור לנושא הקודם: <a href="${pageHref(prev)}">${esc(prev.navTitle)}</a>. הרבה פעמים הקושי מתחיל שם.`);
    const linked = linkedNotes(prose, page);
    if (linked.length) steps.push(`לרענן את מה שהדף נשען עליו: ${linked.join(" · ")}.`);
    if (prose.querySelector(".symbols-box")) steps.push(`<button type="button" class="link-button" data-open-symbols>לבדוק איך קוראים את הסימנים</button>. לפעמים סימן אחד לא מוכר עוצר את כל השורה.`);
    steps.push("לסמן ״נתקעתי כאן״ ולהמשיך הלאה. אפשר לחזור לזה אחר כך, ולפעמים הנושא הבא מבהיר את הקודם.");
    return `
      <details class="stuck-ladder" data-stuck-ladder>
        <summary>נתקעתם? ככה אפשר להמשיך</summary>
        <ol>${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
      </details>`;
  }

  // ---------------------------------------------------------------------------
  // Symbols used in a note, and how to read them
  // ---------------------------------------------------------------------------

  const SYMBOLS = [
    [/\\forall/, "\\forall", "לכל"],
    [/\\exists/, "\\exists", "קיים"],
    [/\\in(?![a-zA-Z])/, "\\in", "שייך ל־"],
    [/\\notin/, "\\notin", "לא שייך ל־"],
    [/\\subseteq|\\subset(?![a-zA-Z])/, "\\subseteq", "מוכלת ב־"],
    [/\\cup/, "\\cup", "איחוד"],
    [/\\cap/, "\\cap", "חיתוך"],
    [/\\emptyset|\\varnothing/, "\\emptyset", "הקבוצה הריקה"],
    [/\\Rightarrow|\\implies|\\Longrightarrow/, "\\Rightarrow", "גורר, ולכן"],
    [/\\iff|\\Leftrightarrow|\\Longleftrightarrow/, "\\iff", "אם ורק אם"],
    [/\\varepsilon|\\epsilon/, "\\varepsilon", "אפסילון: מרחק קטן כלשהו"],
    [/\\delta/, "\\delta", "דלתא: מרחק קטן בציר ה־x"],
    [/\\lim/, "\\lim", "הגבול של"],
    [/\\to(?![a-zA-Z])/, "\\to", "שואף ל־"],
    [/\\infty/, "\\infty", "אינסוף"],
    [/\\sum/, "\\sum", "סכום של"],
    [/\\sup/, "\\sup", "החסם העליון (סופרמום)"],
    [/\\inf(?![a-zA-Z])/, "\\inf", "החסם התחתון (אינפימום)"],
    [/\\max/, "\\max", "המקסימום"],
    [/\\min/, "\\min", "המינימום"],
    [/\\le(?:q)?(?![a-zA-Z])/, "\\le", "קטן או שווה"],
    [/\\ge(?:q)?(?![a-zA-Z])/, "\\ge", "גדול או שווה"],
    [/\\ne(?:q)?(?![a-zA-Z])/, "\\ne", "שונה מ־"],
    [/\\mathbb\s*\{?R/, "\\mathbb R", "המספרים הממשיים"],
    [/\\mathbb\s*\{?N/, "\\mathbb N", "המספרים הטבעיים"],
    [/\\mathbb\s*\{?Q/, "\\mathbb Q", "המספרים הרציונליים"],
    [/\\mathbb\s*\{?Z/, "\\mathbb Z", "המספרים השלמים"],
    [/\\mathbb\s*\{?C/, "\\mathbb C", "המספרים המרוכבים"],
    [/F\^\{?n/, "F^n", "המרחב של כל הרשימות באורך n מהשדה F"],
    [/\\mathbf\s*\{?M/, "\\mathbf M_n(F)", "כל המטריצות הריבועיות מסדר n מעל F"],
    [/\^\{?-1\}?/, "A^{-1}", "ההופכית של A"],
    [/\^\{?t\}?(?![a-zA-Z])/, "A^t", "השחלוף של A (שורות הופכות לעמודות)"],
    [/\\mathbf\s*\{?0\}?/, "\\mathbf 0", "וקטור האפס"],
    [/\\lfloor/, "\\lfloor x\\rfloor", "הערך השלם של x"],
    [/\\sqrt/, "\\sqrt{x}", "שורש של x"],
    [/\|[^|]+\|/, "|x|", "הערך המוחלט של x (המרחק מאפס)"],
    [/\\ldots|\\cdots|\\dots/, "\\ldots", "וכן הלאה, באותה דרך"]
  ];

  function symbolsBox(prose) {
    const tex = Array.from(prose.querySelectorAll(".math"))
      .map((m) => m.textContent)
      .join(" ");
    const found = SYMBOLS.filter(([re]) => re.test(tex));
    if (found.length < 2) return null;
    const box = document.createElement("details");
    box.className = "callout symbols-box";
    box.innerHTML = `
      <summary class="callout-title"><span class="callout-title-text">איך קוראים את הסימנים בדף הזה (${found.length})</span></summary>
      <div class="callout-body">
        <p>אפשר לקרוא כל נוסחה בקול, כמו משפט בעברית. זה עוזר להבין מה היא אומרת.</p>
        <ul class="symbols-list">${found
          .map(([, symbol, reading]) => `<li><span class="math" dir="ltr">\\(${symbol}\\)</span><span>${esc(reading)}</span></li>`)
          .join("")}</ul>
      </div>`;
    return box;
  }

  // ---------------------------------------------------------------------------
  // Links on cited statements: "לפי למה 3.4.3" opens (and previews) 3.4.3
  // ---------------------------------------------------------------------------

  const KINDS = "משפט|טענה|למה|הגדרה|מסקנה|אקסיומה";
  const CITED = new RegExp(`(^|[^\\u05d0-\\u05ea])([בלמהו]?)((?:${KINDS})\\s+(\\d+(?:\\.\\d+){1,2}))(?![\\d])`, "g");
  const NO_LINK = "a, .math, mjx-container, h1, h2, h3, h4, summary, code, pre, .callout-source, .why-note, .symbols-box";

  function linkCitations(prose) {
    const { data, pages, pageHref } = app();
    if (!data.statements) return;
    const texts = [];
    const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (/\d\.\d/.test(node.data) && !node.parentElement.closest(NO_LINK)) texts.push(node);
    }
    for (const node of texts) {
      const text = node.data;
      let last = 0;
      const parts = [];
      for (const m of text.matchAll(CITED)) {
        const st = data.statements[m[4]];
        const page = st && pages.get(st.pageId);
        if (!page) continue;
        const start = m.index + m[1].length + m[2].length;
        parts.push(document.createTextNode(text.slice(last, start)));
        const a = document.createElement("a");
        a.className = "ref-link";
        a.href = pageHref(page, st.anchor);
        a.textContent = m[3];
        parts.push(a);
        last = start + m[3].length;
      }
      if (!parts.length) continue;
      parts.push(document.createTextNode(text.slice(last)));
      node.replaceWith(...parts);
    }
  }

  // ---------------------------------------------------------------------------
  // Read aloud (browser speech, Hebrew). Formulas are announced as "נוסחה".
  // ---------------------------------------------------------------------------

  const speech = window.speechSynthesis;
  let reading = null;

  function readableBlocks(prose) {
    return Array.from(prose.querySelectorAll("h2, h3, p, li")).filter(
      (el) =>
        !el.closest("details:not([open]), .grid-probe, .callout-source, .proof-bar, .why-note, li li, .demo, .note-check, .stuck-ladder") &&
        !(el.matches("li") && el.querySelector("p")) &&
        el.textContent.trim()
    );
  }

  function blockText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("mjx-container, .math").forEach((m) => m.replaceWith(" נוסחה "));
    clone.querySelectorAll(".heading-link, .why-btn, .visually-hidden").forEach((m) => m.remove());
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  function stopReading() {
    if (!reading) return;
    reading.cancelled = true;
    speech.cancel();
    reading.blocks[reading.index]?.classList.remove("reading-now");
    reading.button.setAttribute("aria-pressed", "false");
    reading.button.querySelector("span").textContent = "הקראה";
    reading = null;
  }

  function speakNext(state) {
    if (state.cancelled) return;
    state.blocks[state.index - 1]?.classList.remove("reading-now");
    const el = state.blocks[state.index];
    if (!el) return stopReading();
    el.classList.add("reading-now");
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const utterance = new SpeechSynthesisUtterance(blockText(el));
    utterance.lang = "he-IL";
    utterance.rate = 0.92;
    const voice = speech.getVoices().find((v) => /^he|^iw/i.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      state.index += 1;
      speakNext(state);
    };
    utterance.onerror = () => stopReading();
    speech.speak(utterance);
  }

  function mountReadAloud(scope, prose) {
    const meta = scope.querySelector(".note-meta");
    if (!speech || !meta) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip chip-button";
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></svg> <span>הקראה</span>`;
    button.title = "הקראת ההסברים בקול. הנוסחאות מוקראות כ״נוסחה״.";
    button.addEventListener("click", () => {
      if (reading) return stopReading();
      const blocks = readableBlocks(prose);
      if (!blocks.length) return;
      reading = { blocks, index: 0, button, cancelled: false };
      button.setAttribute("aria-pressed", "true");
      button.querySelector("span").textContent = "עצירת ההקראה";
      speech.cancel();
      speakNext(reading);
    });
    meta.append(button);
  }

  // ---------------------------------------------------------------------------
  // Exam weight of a unit (courses with a question archive)
  // ---------------------------------------------------------------------------

  function examWeight(page) {
    const { data, groupById } = app();
    const group = groupById.get(page.groupId);
    if (!data.archiveUnits?.length || !group?.number || group.gatewayId !== page.id) return "";
    const unit = data.archiveUnits.find((u) => u.number === Number(group.number));
    if (!unit) return "";
    const max = Math.max(...data.archiveUnits.map((u) => u.questions));
    const level = unit.questions >= max * 0.5 ? "high" : unit.questions >= max * 0.15 ? "mid" : "low";
    const advice = {
      high: "הפרק הזה מופיע הרבה במבחנים ובמטלות. שווה להשקיע בו זמן, ובמיוחד בתרגול.",
      mid: "הפרק מופיע במבחנים במידה בינונית. כדאי להבין את הרעיונות המרכזיים ולתרגל דוגמה מכל סוג.",
      low: "הפרק מופיע מעט כשאלה בפני עצמה, אבל הפרקים הבאים נשענים עליו. מספיק להבין את הרעיונות והמושגים."
    }[level];
    return `<div class="callout callout-exam exam-weight exam-weight-${level}"><p class="callout-title">כמה הפרק הזה מופיע במבחנים</p><div class="callout-body"><p>בארכיון יש ${unit.questions} שאלות שנוגעות בפרק, מ-${unit.exams} מבחנים ומטלות. ${advice}</p></div></div>`;
  }

  // ---------------------------------------------------------------------------
  // Hooks called by app.js
  // ---------------------------------------------------------------------------

  function decorate(scope, page) {
    stopReading();
    const prose = scope.querySelector(".prose");
    if (!prose || !page) return;
    linkCitations(prose);
    const weight = examWeight(page);
    if (weight) prose.insertAdjacentHTML("afterbegin", weight);
    const symbols = /^unit-/.test(page.groupId || "") ? symbolsBox(prose) : null;
    if (symbols) {
      // Below the "what matters here" line when the page opens with one, so
      // the first thing a reader meets is content and not a tool.
      const lead = Array.from(prose.children).find((el) => el.tagName === "P" && /^מה חשוב כאן/.test(el.textContent.trim()));
      if (lead) lead.after(symbols);
      else prose.prepend(symbols);
    }
    applyExplain(prose);
    mountReadAloud(scope, prose);

    const foot = scope.querySelector(".note-foot");
    if (foot && /^unit-/.test(page.groupId || "")) {
      foot.insertAdjacentHTML("afterbegin", statusPanel(page) + stuckLadder(prose, page));
      const check = foot.querySelector("[data-note-check]");
      const message = check.querySelector("[data-check-message]");
      check.addEventListener("click", (event) => {
        const button = event.target.closest("[data-status]");
        if (!button) return;
        const value = button.getAttribute("aria-pressed") === "true" ? "" : button.dataset.status;
        setStatus(page.id, value);
        check.querySelectorAll("[data-status]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.status === value)));
        const pool = value === "stuck" ? STUCK_WORDS : value === "got" ? GOT_WORDS : null;
        message.textContent = pool && root.dataset.cheer !== "off" ? pool[Math.floor(Math.random() * pool.length)] : value === "again" ? "סומן לחזרה. הוא יחכה לכם בדף הבית." : "";
        if (value === "stuck") foot.querySelector("[data-stuck-ladder]").open = true;
      });
      foot.addEventListener("click", (event) => {
        if (event.target.closest("[data-open-simple]")) {
          const boxes = prose.querySelectorAll("details.callout-simple");
          boxes.forEach((box) => (box.open = true));
          boxes[0]?.scrollIntoView({ block: "start" });
          boxes[0]?.querySelector("summary")?.focus({ preventScroll: true });
        }
        if (event.target.closest("[data-open-symbols]")) {
          const box = prose.querySelector(".symbols-box");
          box.open = true;
          box.scrollIntoView({ block: "start" });
          box.querySelector("summary").focus({ preventScroll: true });
        }
      });
    }
  }

  // Notes marked "again" or "stuck" wait on the home page.
  function decorateHome(scope) {
    const { pages, pageHref } = app();
    const all = statuses();
    const marked = Object.entries(all)
      .filter(([id, value]) => (value === "again" || value === "stuck") && pages.has(id))
      .map(([id, value]) => ({ page: pages.get(id), value }));
    const toc = scope.querySelector(".book-toc");
    if (!marked.length || !toc) return;
    const section = document.createElement("section");
    section.className = "home-marked";
    section.setAttribute("aria-labelledby", "homeMarkedTitle");
    section.innerHTML = `
      <h2 id="homeMarkedTitle">דפים שסימנתם לחזור אליהם</h2>
      <ul>${marked
        .map(({ page, value }) => `<li><a class="chip" href="${pageHref(page)}"><span class="tree-status tree-status-${value}" aria-hidden="true"></span>${esc(page.navTitle)}<span class="visually-hidden"> (${STATUS[value].tree})</span></a></li>`)
        .join("")}</ul>`;
    toc.before(section);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && reading) stopReading();
  });
  window.addEventListener("hashchange", stopReading);

  mountOptions();
  window.InfiSupport = { decorate, decorateTree, decorateHome, applyExplain };
})();
