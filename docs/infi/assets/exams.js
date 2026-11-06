/* Past exams: #/exams lists the 45 official exams of 2019–2026 with the tags
 * typed from the scans (unit, topic, kind, the theorem a question asks to
 * prove), and #/exams/<n> shows one exam's scanned pages next to its
 * questions. decorate() adds an "asked in exams" line above every proof of a
 * theorem that past exams asked for. app.js passes its helpers in
 * window.InfiApp.
 */
(() => {
  "use strict";

  const app = () => window.InfiApp;
  const esc = (text) => app().escapeHtml(String(text ?? ""));
  const exams = () => app().data.exams || [];
  const theorems = () => [...(app().data.examTheorems || []), ...(app().data.pastTheorems || [])];
  const examLabel = (exam) => `${exam.semester} · מועד ${exam.moed}`;
  const examHref = (n, q) => `#/exams/${n}${q ? `/q${q}` : ""}`;
  const course = window.COURSE_DATA.course;
  const words = course.words;
  const unitNames = () => Object.fromEntries(app().groups.filter((group) => group.number).map((group) => [group.number, group.subtitle]));

  function theoremByNumber(number) {
    return theorems().find((row) => row.number === number);
  }

  function proofHref(row) {
    const page = app().pages.get(row?.proofPageId || row?.noteId);
    return page ? `${app().pageHref(page)}${row.proofAnchor ? `/${row.proofAnchor}` : ""}` : "";
  }

  function theoremChip(number) {
    const row = theoremByNumber(number);
    const href = proofHref(row);
    const label = `משפט ${esc(number)}`;
    return href ? `<a class="exam-chip exam-chip-proof" href="${href}">${label}</a>` : `<span class="exam-chip exam-chip-proof">${label}</span>`;
  }

  function questionRow(exam, q, withExam) {
    const units = (q.units || []).map((u) => `<span class="exam-chip" style="--c:var(--c-unit-${u})">${esc(words.unit)} ${u}</span>`).join("");
    const proves = (q.prove || []).map(theoremChip).join("");
    const head = withExam
      ? `<a href="${examHref(exam.n, q.q)}">${esc(examLabel(exam))} · שאלה ${q.q}</a>`
      : `<a href="${examHref(exam.n, q.q)}" data-jump="${q.page}">שאלה ${q.q}</a>`;
    return `<li class="exam-q"${withExam ? "" : ` id="q${q.q}"`}>
      <p class="exam-q-head">${head}<span class="exam-q-meta">${esc(q.format || "")}${q.points ? ` · ${q.points} נק'` : ""}${q.kind ? ` · ${esc(q.kind)}` : ""}${q.kind_detail ? ` + ${esc(q.kind_detail)}` : ""}</span></p>
      <p class="exam-q-summary">${esc(q.summary)}</p>
      <p class="exam-q-tags">${proves}${units}${(q.topics || []).map((t) => `<span class="exam-chip exam-chip-topic">${esc(t)}</span>`).join("")}</p>
      ${q.note ? `<p class="exam-q-note">${esc(q.note)}</p>` : ""}
    </li>`;
  }

  // ---------------------------------------------------------------------------
  // #/exams
  // ---------------------------------------------------------------------------

  function frequencyBoard() {
    const rows = (app().data.examTheorems || []).slice().sort((a, b) => b.count - a.count || a.number.localeCompare(b.number, "en", { numeric: true }));
    const max = Math.max(1, ...rows.map((r) => r.count));
    const items = rows
      .map((row) => {
        const href = proofHref(row);
        const scannedCount = new Set(row.exams.map(({ exam }) => exam)).size;
        const asked = row.exams
          .map(({ exam, q }) => {
            const e = exams().find((x) => x.n === exam);
            return e ? `<a href="${examHref(exam, q)}" title="${esc(examLabel(e))}">${esc(e.semester)}·${esc(e.moed)}</a>` : "";
          })
          .join("");
        return `<li class="freq-row">
          <span class="freq-num">${href ? `<a href="${href}">${esc(row.number)}</a>` : esc(row.number)}</span>
          <span class="freq-name">${row.statementHtml}</span>
          <span class="freq-bar" style="--w:${(row.count / max) * 100}%" aria-hidden="true"></span>
          <span class="freq-count">${row.count}<span class="visually-hidden"> הופעות</span></span>
          ${scannedCount !== row.count ? `<span class="freq-discrepancy">בטבלה המקורית: ${row.count} · בסריקות המתויגות: ${scannedCount}</span>` : ""}
          ${asked ? `<span class="freq-exams">${asked}</span>` : ""}
        </li>`;
      })
      .join("");
    return `<section class="exam-section" aria-labelledby="freqTitle">
      <h2 id="freqTitle">כמה פעמים כל משפט נשאל</h2>
      <p>${(app().data.examTheorems || []).length} המשפטים של הרשימה הרשמית (2026ג), מהנפוץ לנדיר. המספר הוא כמות המבחנים מ-2019 עד 2026 שבהם ביקשו להוכיח את המשפט. לחיצה על מספר המשפט פותחת את ההוכחה, ולחיצה על סמסטר פותחת את השאלה.</p>
      <ol class="freq-list">${items}</ol>
    </section>`;
  }

  function heatmap() {
    const years = Array.from(new Set(exams().map((e) => e.semester.slice(0, 4)))).sort();
    const counts = {};
    let max = 1;
    for (const exam of exams()) {
      const year = exam.semester.slice(0, 4);
      for (const q of exam.questions) {
        for (const u of q.units || []) {
          const key = `${u}-${year}`;
          counts[key] = (counts[key] || 0) + 1;
          max = Math.max(max, counts[key]);
        }
      }
    }
    const head = years.map((y) => `<th scope="col">${y}</th>`).join("");
    const body = Object.entries(unitNames())
      .map(([u, name]) => {
        const cells = years
          .map((y) => {
            const n = counts[`${u}-${y}`] || 0;
            return `<td style="--heat:${(n / max).toFixed(2)}">${n || ""}</td>`;
          })
          .join("");
        return `<tr><th scope="row">${u}. ${name}</th>${cells}</tr>`;
      })
      .join("");
    return `<section class="exam-section" aria-labelledby="heatTitle">
      <h2 id="heatTitle">איזו ${esc(words.unit)} נשאלת כל שנה</h2>
      <p>מספר השאלות שנוגעות בכל ${esc(words.unit)}, לפי שנה. ככל שהמשבצת כהה יותר, ${esc(words.theUnit)} נשאלה יותר.</p>
      <div class="table-wrap"><table class="heatmap"><thead><tr><th scope="col">${esc(words.unit)}</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    </section>`;
  }

  function renderList(root, route = {}) {
    app().setTitle("מבחנים");
    const list = exams();
    const kinds = Array.from(new Set(list.flatMap((e) => e.questions.flatMap((q) => [q.kind, q.kind_detail])).filter(Boolean))).sort();
    const nums = (app().data.examTheorems || []).map((r) => r.number);
    const cards = list
      .slice()
      .reverse()
      .map((exam) => {
        const proves = exam.questions.flatMap((q) => q.prove || []);
        return `<li class="exam-card" data-exam="${exam.n}">
          <a class="exam-card-link" href="${examHref(exam.n)}">
            <span class="exam-card-sem">${esc(exam.semester)}</span>
            <span class="exam-card-meta">${esc(exam.date || "")} · מועד ${esc(exam.moed)}</span>
          </a>
          <p class="exam-card-proves">${proves.length ? `להוכיח: ${proves.map((n) => `<b>${esc(n)}</b>`).join(", ")}` : "בלי הוכחת משפט מהרשימה"}</p>
        </li>`;
      })
      .join("");
    root.innerHTML = `
      <div class="exams-page">
        <header class="page-intro">
          <h1>מבחנים 2019–2026</h1>
          <p>${list.length} טפסי מבחן רשמיים של הקורס, כסריקות. לכל שאלה סימנו את ${esc(words.theUnit)}, הנושא, סוג השאלה ואת המשפט שמבקשים להוכיח, כדי שתוכלו לתרגל לפי נושא. אין כאן פתרונות: פותרים לבד, ובודקים מול ההוכחות שבפתקים.</p>
        </header>
        ${frequencyBoard()}
        ${heatmap()}
        <section class="exam-section" aria-labelledby="findTitle">
          <h2 id="findTitle">חיפוש שאלות לפי נושא</h2>
          <div class="exam-filters">
            <label>${esc(words.unit)}<select data-f="unit"><option value="">הכול</option>${Object.entries(unitNames()).map(([u, n]) => `<option value="${u}">${u}. ${n}</option>`).join("")}</select></label>
            <label>משפט להוכחה<select data-f="thm"><option value="">הכול</option>${nums.map((n) => `<option>${n}</option>`).join("")}</select></label>
            <label>סוג שאלה<select data-f="kind"><option value="">הכול</option>${kinds.map((k) => `<option>${esc(k)}</option>`).join("")}</select></label>
            <label class="exam-filter-text">מילה<input type="search" data-f="text" autocomplete="off" placeholder="למשל: במידה שווה" /></label>
          </div>
          <p class="filter-status" aria-live="polite" data-exam-status></p>
          <ul class="exam-q-list" data-exam-results></ul>
        </section>
        <section class="exam-section" aria-labelledby="allTitle">
          <h2 id="allTitle">כל המבחנים</h2>
          <ul class="exam-cards">${cards}</ul>
        </section>
      </div>`;

    const results = root.querySelector("[data-exam-results]");
    const status = root.querySelector("[data-exam-status]");
    const field = (name) => root.querySelector(`[data-f="${name}"]`).value.trim();
    const norm = (s) => String(s || "").toLowerCase().replace(/["'״׳]/g, "");
    const update = () => {
      const unit = field("unit");
      const thm = field("thm");
      const kind = field("kind");
      const text = norm(field("text"));
      if (!unit && !thm && !kind && !text) {
        results.innerHTML = "";
        status.textContent = `בחרו ${words.unit}, משפט, סוג או מילה כדי לראות את כל השאלות המתאימות.`;
        return;
      }
      const hits = [];
      for (const exam of list.slice().reverse()) {
        for (const q of exam.questions) {
          if (unit && !(q.units || []).map(String).includes(unit)) continue;
          if (thm && !(q.prove || []).includes(thm)) continue;
          if (kind && q.kind !== kind && q.kind_detail !== kind) continue;
          if (text && !norm(`${q.summary} ${(q.topics || []).join(" ")} ${q.note || ""}`).includes(text)) continue;
          hits.push(questionRow(exam, q, true));
        }
      }
      results.innerHTML = hits.join("");
      status.textContent = hits.length ? `${hits.length} שאלות מתאימות` : "אין שאלות מתאימות";
    };
    // Filters live in the address, so a unit's exam questions can be linked
    // to (#/exams?unit=5) and survive a reload.
    for (const name of ["unit", "thm", "kind", "text"]) {
      const value = route.query?.get(name);
      if (value) root.querySelector(`[data-f="${name}"]`).value = value;
    }
    const syncUrl = () => {
      const params = new URLSearchParams();
      for (const name of ["unit", "thm", "kind", "text"]) if (field(name)) params.set(name, field(name));
      const query = params.toString();
      history.replaceState(null, "", `#/exams${query ? `?${query}` : ""}`);
    };
    root.querySelectorAll("[data-f]").forEach((el) =>
      el.addEventListener("input", () => {
        update();
        syncUrl();
      })
    );
    update();
    if (route.query?.toString()) requestAnimationFrame(() => root.querySelector("#findTitle")?.scrollIntoView({ block: "start" }));
    app().queueTypeset(root);
  }

  // ---------------------------------------------------------------------------
  // #/exams/<n>
  // ---------------------------------------------------------------------------

  function renderExam(root, n, section) {
    const list = exams();
    const index = list.findIndex((e) => String(e.n) === String(n));
    const exam = list[index];
    if (!exam) {
      root.innerHTML = `<div class="page-intro"><h1>המבחן לא נמצא</h1><p><a href="#/exams">לכל המבחנים</a></p></div>`;
      return;
    }
    app().setTitle(`מבחן ${examLabel(exam)}`);
    const q = /^q(\d+)$/.exec(section || "")?.[1];
    const target = exam.questions.find((x) => String(x.q) === q);
    // Pages up to the one asked for load eagerly, so the jump lands on it.
    const eagerUntil = Math.max(1, target ? exam.pages.indexOf(target.page) : 1);
    const prev = list[index - 1];
    const next = list[index + 1];
    const pagesHtml = exam.images
      .map(
        (src, i) => `<figure class="exam-scan" id="page-${exam.pages[i]}">
          <a href="${src}" target="_blank" rel="noopener"><img src="${src}" width="875" height="1240" decoding="async" loading="${i <= eagerUntil ? "eager" : "lazy"}" alt="${esc(`${examLabel(exam)}, עמוד ${i + 1} מתוך ${exam.images.length}`)}" /></a>
          <figcaption>עמוד ${i + 1} מתוך ${exam.images.length} · לחיצה פותחת בגודל מלא</figcaption>
        </figure>`
      )
      .join("");
    root.innerHTML = `
      <div class="exam-view">
        <header class="page-intro">
          <p class="exam-crumbs"><a href="#/exams">מבחנים</a></p>
          <h1>מבחן ${esc(exam.semester)} · מועד ${esc(exam.moed)}</h1>
          <p>${esc(exam.date || "")}${exam.durationHours ? ` · ${exam.durationHours} שעות` : ""}${exam.questionnaire ? ` · שאלון ${esc(exam.questionnaire)}` : ""}. ${esc(exam.structure || "")}</p>
        </header>
        <div class="exam-layout">
          <aside class="exam-side" aria-label="השאלות במבחן">
            <ol class="exam-q-list">${exam.questions.map((q) => questionRow(exam, q, false)).join("")}</ol>
            <nav class="exam-pager" aria-label="מבחן קודם והבא">
              ${prev ? `<a class="button" href="${examHref(prev.n)}">→ ${esc(examLabel(prev))}</a>` : ""}
              ${next ? `<a class="button" href="${examHref(next.n)}">${esc(examLabel(next))} ←</a>` : ""}
            </nav>
          </aside>
          <div class="exam-scans">${pagesHtml}</div>
        </div>
      </div>`;

    const jump = (page) => root.querySelector(`#page-${page}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    root.querySelectorAll("[data-jump]").forEach((link) =>
      link.addEventListener("click", (event) => {
        event.preventDefault();
        history.replaceState(null, "", link.getAttribute("href"));
        jump(link.dataset.jump);
      })
    );
    if (target) {
      const img = root.querySelector(`#page-${target.page} img`);
      const go = () => jump(target.page);
      const before = Array.from(root.querySelectorAll(".exam-scan img")).slice(0, eagerUntil);
      Promise.all(before.map((el) => (el.complete ? null : new Promise((ok) => el.addEventListener("load", ok, { once: true }))))).then(go);
      if (img?.complete) go();
    }
    app().queueTypeset(root);
  }

  // ---------------------------------------------------------------------------
  // A line above each proof: where past exams asked for it.
  // ---------------------------------------------------------------------------

  function decorate(root) {
    root.querySelectorAll(".proof[data-proof]").forEach((proof) => {
      const row = theoremByNumber(proof.dataset.proof);
      // The line goes above the proof bar, so study.js still finds its bar
      // right before the proof and never adds a second one.
      const bar = proof.previousElementSibling?.classList.contains("proof-bar") ? proof.previousElementSibling : null;
      const anchor = bar || proof;
      if (!row || !row.exams?.length || anchor.previousElementSibling?.classList.contains("proof-asked")) return;
      const links = row.exams
        .map(({ exam, q }) => {
          const e = exams().find((x) => x.n === exam);
          return e ? `<a href="${examHref(exam, q)}">${esc(e.semester)}·${esc(e.moed)}</a>` : "";
        })
        .join(" · ");
      const note = document.createElement("p");
      note.className = "proof-asked";
      note.innerHTML = `<b>נשאל ב-${row.exams.length} מבחנים:</b> ${links}`;
      anchor.before(note);
    });
  }

  function renderNoExams(root) {
    app().setTitle("מבחנים");
    root.innerHTML = `
      <section class="empty-state">
        <h1>אין עדיין מבחנים לקורס הזה</h1>
        <p>נוסיף אותם כשיהיו לנו טפסי מבחן לתייג. בינתיים אפשר ללמוד מהפתקים ולתרגל.</p>
        <p><a class="button button-primary" href="#/">לדף הבית</a> <a class="button" href="#/practice">לתרגול</a></p>
      </section>`;
  }

  function render(root, route) {
    if (!course.features.exams) renderNoExams(root);
    else if (route.id) renderExam(root, route.id, route.section);
    else renderList(root, route);
  }

  window.InfiExams = { render, decorate };
})();
