/* Past exams: scans, guided solutions, private ratings, an MC trainer and a
 * timed simulation. #/exams lists the 45 official exams of 2019–2026 with the tags
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
  // Exams photographed on gray paper rather than scanned on white. They stay as
  // plain images; only white scans can lie on the squared sheet.
  const PHOTOGRAPHED_EXAMS = new Set([15, 36, 40, 41]);
  const unitNames = () =>Object.fromEntries(app().groups.filter((group) => group.number).map((group) => [group.number, group.subtitle]));

  // Private progress is namespaced by course; blocked storage keeps an in-memory copy.
  const ratingLabels = { got: "הבנתי", partial: "חלקית", stuck: "נתקעתי" };
  const storageKey = `${course.storagePrefix}-exam-ratings`;
  let ratings = readStored(storageKey);
  let simulationTimer = null;
  let navObserver = null;
  const simulations = new Map();
  const mcSession = { correct: 0, total: 0 };
  const studyRequests = new Map();

  function loadStudy(exam) {
    if (!exam.studyVersion || exam.studyLoaded) return Promise.resolve();
    if (studyRequests.has(exam.n)) return studyRequests.get(exam.n);
    const request = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `./assets/exam-studies/${encodeURIComponent(exam.n)}.js?v=${encodeURIComponent(exam.studyVersion)}`;
      script.onload = () => {
        const solutions = window.EXAM_STUDIES?.[exam.n];
        if (!solutions) return reject(new Error("Missing exam solutions"));
        exam.questions.forEach((q) => { if (solutions[q.q]) q.study = solutions[q.q]; });
        exam.studyLoaded = true;
        resolve();
      };
      script.onerror = () => { script.remove(); reject(new Error("Failed to load exam solutions")); };
      document.head.appendChild(script);
    }).catch((error) => { studyRequests.delete(exam.n); throw error; });
    studyRequests.set(exam.n, request);
    return request;
  }

  function loadBeforeRender(root, route, needed) {
    const hash = location.hash;
    root.innerHTML = '<section class="empty-state" role="status"><p>טוען את הפתרונות…</p></section>';
    Promise.all(needed.map(loadStudy)).then(() => {
      if (location.hash === hash) render(root, route);
    }).catch(() => {
      if (location.hash !== hash) return;
      root.innerHTML = '<section class="empty-state"><h1>הפתרונות לא נטענו</h1><p>בדקו את החיבור ונסו שוב.</p><button class="button" type="button" data-retry-study>נסו שוב</button></section>';
      root.querySelector("[data-retry-study]").addEventListener("click", () => render(root, route));
    });
  }

  function readStored(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function saveStored(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage blocked: progress lasts until the page is closed */
    }
  }

  function ratingMark(exam, q) {
    const rating = ratings[`${exam.n}/${q.q}`]?.value;
    return ratingLabels[rating] ? `<span class="exam-rating exam-rating-${rating}">${ratingLabels[rating]}</span>` : "";
  }

  function examRatings(exam) {
    const counts = Object.keys(ratingLabels).map((value) => {
      const count = exam.questions.filter((q) => ratings[`${exam.n}/${q.q}`]?.value === value).length;
      return count ? `${ratingLabels[value]}: ${count}` : "";
    }).filter(Boolean);
    return counts.length ? `<p class="exam-rating-summary">${counts.join(" · ")}</p>` : "";
  }

  function coverage(exam) {
    const count = exam.questions.filter((q) => q.study).length;
    return count ? `<p class="exam-coverage">פתרונות מלאים · ${count} מתוך ${exam.questions.length} שאלות</p>` : "";
  }

  function questionTabs(exam, current) {
    return `<nav class="exam-actions exam-question-nav" aria-label="שאלות במבחן">${exam.questions.map((q) => `<a class="button" href="${examHref(exam.n, q.q)}" data-question-tab="${q.q}"${q.q === current?.q ? ` aria-current="page"` : ""}><span>ש${q.q}</span><span data-tab-rating>${ratingMark(exam, q)}</span><span class="exam-tab-solution">${q.study ? "יש פתרון" : "סריקה"}</span></a>`).join("")}</nav>`;
  }

  function questionPager(exam, q) {
    const index = exam.questions.indexOf(q);
    const prev = exam.questions[index - 1];
    const next = exam.questions[index + 1];
    return `<nav class="exam-actions" aria-label="המשך הלימוד">${prev ? `<a class="button" href="${examHref(exam.n, prev.q)}">השאלה הקודמת</a>` : ""}${next ? `<a class="button" href="${examHref(exam.n, next.q)}">השאלה הבאה</a>` : ""}<a class="button" href="#/exams">כל המבחנים</a></nav>`;
  }

  function reviewRows() {
    const fromExams = exams().flatMap((exam) => exam.questions.map((q) => ({ exam, q, rating: ratings[`${exam.n}/${q.q}`] })));
    const fromPages = Object.entries(ratings).filter(([key, r]) => key.startsWith("p:") && r?.href).map(([, rating]) => ({ rating }));
    return [...fromExams, ...fromPages].filter(({ rating }) => ["partial", "stuck"].includes(rating?.value)).sort((a, b) => a.rating.at - b.rating.at);
  }

  function reviewList() {
    const rows = reviewRows();
    const row = ({ exam, q, rating }) => exam
      ? questionRow(exam, q, true)
      : `<li class="exam-q"><p class="exam-q-head"><a href="${rating.href}">${esc(rating.label)}</a><span class="exam-rating exam-rating-stuck">${ratingLabels.stuck}</span><span class="exam-q-meta">תרגול אמריקאיות</span></p></li>`;
    return `<section class="exam-section" aria-labelledby="reviewTitle"><h2 id="reviewTitle" tabindex="-1">לחזרה</h2>
      <p>כאן מופיעות שאלות שסימנתם ״חלקית״ או ״נתקעתי״, ושאלות שטעיתם בהן בתרגול האמריקאיות. מהישנה לחדשה.</p>
      ${rows.length ? `<ul class="exam-q-list">${rows.map(row).join("")}</ul>` : ""}</section>`;
  }

  function ratingBox(exam, q) {
    const current = ratings[`${exam.n}/${q.q}`]?.value;
    return `<fieldset class="exam-self-rating"><legend>איך היה הפתרון?</legend><div class="exam-actions">${Object.entries(ratingLabels).map(([value, label]) => `<button class="button" type="button" data-rating="${value}" aria-pressed="${current === value}">${label}</button>`).join("")}</div><p data-rating-status role="status">הסימון נשמר רק בדפדפן הזה.</p></fieldset>`;
  }

  function bindRating(root, exam, q) {
    root.querySelectorAll("[data-rating]").forEach((button) => button.addEventListener("click", () => {
      ratings[`${exam.n}/${q.q}`] = { value: button.dataset.rating, at: Date.now() };
      saveStored(storageKey, ratings);
      root.querySelectorAll("[data-rating]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
      root.querySelector(`[data-question-tab="${q.q}"] [data-tab-rating]`).innerHTML = ratingMark(exam, q);
      root.querySelector("[data-rating-status]").textContent = `סימנתם: ${ratingLabels[button.dataset.rating]}`;
    }));
  }

  function scanHtml(exam, page) {
    const index = exam.pages.indexOf(page);
    if (index < 0) return "";
    const src = exam.images[index];
    return `<figure class="exam-scan${PHOTOGRAPHED_EXAMS.has(exam.n) ? "" : " exam-scan-sheet"}"><a href="${src}" target="_blank" rel="noopener"><img src="${src}" width="875" height="1240" alt="${esc(examLabel(exam))}, עמוד ${index + 1}" /></a><figcaption>עמוד ${index + 1} · לחיצה פותחת בגודל מלא</figcaption></figure>`;
  }

  function typesetStudy(scope) {
    return app().queueTypeset([scope]).then(() => {
      // Keep Hebrew prefixes and punctuation glued to a formula unless the
      // whole run is wider than its column, as in the notes' math layout.
      scope.querySelectorAll(".math-inline").forEach((formula) => {
        const column = formula.closest("p, li, td, th, .prose") || scope;
        const math = formula.querySelector("mjx-container") || formula;
        if (math.getBoundingClientRect().width > column.clientWidth + 1) formula.classList.add("math-overflow");
        for (let glue = formula.closest(".nobr"); glue && scope.contains(glue); glue = glue.parentElement?.closest(".nobr")) {
          if (glue.getBoundingClientRect().width > column.clientWidth + 10) glue.classList.add("nobr-off");
        }
      });
    });
  }

  function renderStudy(root, exam, q) {
    const study = q.study;
    app().setTitle(`שאלה ${q.q} · ${examLabel(exam)}`);
    root.innerHTML = `<div class="exam-view exam-study-view">
      <header class="page-intro"><p><a href="${examHref(exam.n)}">${esc(examLabel(exam))}</a> · <a href="#/exams">כל המבחנים</a></p><h1>שאלה ${q.q} · לומדים בשלבים</h1></header>
      ${questionTabs(exam, q)}
      <div class="exam-study-layout"><article class="exam-study prose" aria-label="לימוד השאלה">
        ${study.question}
        ${study.parts.map((part, i) => `<section class="exam-study-part" data-study-part="${i}" aria-labelledby="studyPart${i}">
          <h2 id="studyPart${i}">${part.label ? `סעיף ${esc(part.label)}` : "דרך הפתרון"}</h2>
          ${part.simple}
          ${part.graphs?.length ? `<div class="exam-study-graphs">${part.graphs.map((graph) => graph.html).join("")}</div>` : ""}
          <div data-hints aria-live="polite"></div><p class="exam-actions"><button class="button" type="button" data-next-hint${part.hints.length ? "" : " hidden"}>רמז הבא</button><button class="button" type="button" data-plan${part.hints.length ? " hidden" : ""}>לתוכנית הפתרון</button></p>
          <div data-plan-body hidden>${part.plan}</div>
          <div data-attempt hidden><p>ניסיתם לבד? אפשר לעצור לרגע ולכתוב ניסיון, או להמשיך יחד.</p><button class="button" type="button" data-attempted>לפתרון בשלבים</button></div>
          <section class="exam-solution" data-solution hidden aria-label="פתרון בשלבים"><div data-steps></div><p class="exam-step-status" data-step-status role="status" tabindex="-1"></p><div class="exam-actions"><button class="button button-primary" type="button" data-next-step>הצעד הבא</button><button class="button" type="button" data-all-steps>הצג הכל</button></div></section>
          <div data-mistakes hidden>${part.mistakes}</div>
        </section>`).join("")}
        <div data-study-end hidden>${study.similar}${ratingBox(exam, q)}${questionPager(exam, q)}</div>
      </article><aside class="exam-study-scan" aria-label="הסריקה המקורית">${scanHtml(exam, q.page)}<p><a href="${examHref(exam.n)}">לכל עמודי המבחן</a></p></aside></div>
    </div>`;
    const finished = new Set();
    root.querySelectorAll("[data-study-part]").forEach((section, i) => {
      const part = study.parts[i];
      let hints = 0;
      let steps = 0;
      const find = (selector) => section.querySelector(selector);
      find("[data-next-hint]").addEventListener("click", () => {
        find("[data-hints]").insertAdjacentHTML("beforeend", part.hints[hints++].html);
        if (hints === part.hints.length) {
          find("[data-next-hint]").hidden = true;
          find("[data-plan]").hidden = false;
          find("[data-plan]").focus();
        }
        typesetStudy(find("[data-hints]"));
      });
      find("[data-plan]").addEventListener("click", () => {
        find("[data-plan-body]").hidden = false;
        find("[data-attempt]").hidden = false;
        find("[data-plan]").hidden = true;
        find("[data-attempted]").focus();
        typesetStudy(find("[data-plan-body]"));
      });
      const reveal = (all) => {
        const until = all ? part.steps.length : Math.min(steps + 1, part.steps.length);
        while (steps < until) find("[data-steps]").insertAdjacentHTML("beforeend", `<div class="exam-solution-step">${part.steps[steps++]}</div>`);
        find("[data-step-status]").textContent = `${steps} מתוך ${part.steps.length} צעדים`;
        if (steps === part.steps.length) {
          find("[data-next-step]").hidden = true;
          find("[data-all-steps]").hidden = true;
          find("[data-mistakes]").hidden = false;
          find("[data-step-status]").focus();
          finished.add(i);
          if (finished.size === study.parts.length) root.querySelector("[data-study-end]").hidden = false;
        }
        typesetStudy(find("[data-steps]"));
      };
      find("[data-attempted]").addEventListener("click", () => {
        find("[data-attempt]").hidden = true;
        find("[data-solution]").hidden = false;
        reveal(false);
        (steps < part.steps.length ? find("[data-next-step]") : find("[data-step-status]")).focus();
      });
      find("[data-next-step]").addEventListener("click", () => reveal(false));
      find("[data-all-steps]").addEventListener("click", () => reveal(true));
    });
    bindRating(root, exam, q);
    window.InfiDemos?.mount(root);
    typesetStudy(root);
  }

  // Practice questions written on course pages: <!-- infi-mc: ג medium -->
  // after an options line. The question runs from the page's ### heading to
  // the options; the explanation is the callouts after it, without the hint.
  function pagePracticePool() {
    const out = [];
    for (const page of app().pages?.values?.() || []) {
      if (!page.html?.includes("data-mc-answer")) continue;
      const doc = document.createElement("template");
      doc.innerHTML = page.html;
      doc.content.querySelectorAll(".page-mc[data-mc-answer]").forEach((box) => {
        const before = [];
        let node = box.previousElementSibling;
        while (node && !/^H[1-3]$/.test(node.tagName)) { before.unshift(node.outerHTML); node = node.previousElementSibling; }
        const heading = node?.tagName === "H3" ? node : null;
        if (!heading || !before.length) return;
        const after = [];
        for (let next = box.nextElementSibling; next && !/^H[1-3]$/.test(next.tagName); next = next.nextElementSibling) {
          if (next.matches("details.callout") && !next.classList.contains("callout-hint")) {
            if (next.classList.contains("callout-solution")) next.setAttribute("open", "");
            after.push(next.outerHTML);
          }
        }
        const number = (heading.textContent.match(/שאלה\s+([\d.]+)/) || [])[1] || heading.textContent.trim();
        const letters = [...before[before.length - 1].matchAll(/(?:^|>|\s)([א-ת])\.\s/g)].map((m) => m[1]);
        out.push({
          key: `p:${page.id}/${number}`,
          label: `${page.title} · שאלה ${number}`,
          href: app().pageHref(page, heading.id || ""),
          q: { q: number, units: [], topics: [], difficulty: box.dataset.mcLevel || "", study: {
            question: before.join(""), options: letters.length >= 2 ? letters : null, mc: { answer: box.dataset.mcAnswer },
            parts: [{ simple: "", solution: after.join("") }]
          } }
        });
      });
    }
    return out;
  }

  // A wrong answer in practice marks the question "נתקעתי", so it shows in
  // the review list next to the questions marked by hand.
  function markMiss(item) {
    ratings[item.key] = { value: "stuck", at: Date.now(), from: "mc", ...(item.exam ? {} : { label: item.label, href: item.href }) };
    saveStored(storageKey, ratings);
  }

  // Each answer locks once: changing a choice cannot inflate the session score.
  function renderMC(root) {
    app().setTitle("תרגול אמריקאיות");
    const pool = [
      ...exams().flatMap((exam) => exam.questions.filter((q) => q.format === "אמריקאית" && q.study?.mc).map((q) => ({ exam, q, key: `${exam.n}/${q.q}`, label: examLabel(exam), href: examHref(exam.n, q.q) }))),
      ...pagePracticePool()
    ];
    const topics = [...new Set(pool.flatMap(({ q }) => q.topics || []))].sort();
    root.innerHTML = `<div class="exams-page"><header class="page-intro"><p><a href="#/exams">מבחנים</a></p><h1>תרגול אמריקאיות</h1><p>בוחרים תשובה, בודקים אותה וקוראים את ההסבר. ${pool.length} שאלות: מכל המבחנים ומעמודי התרגול. תשובה שגויה נשמרת אוטומטית ב<a href="#/exams?section=reviewTitle">רשימת החזרה</a>.</p></header>
      <div class="exam-filters"><label>${esc(words.unit)}<select data-mc-unit><option value="">הכול</option>${Object.entries(unitNames()).map(([u, name]) => `<option value="${u}">${u}. ${esc(name)}</option>`).join("")}</select></label><label>נושא<select data-mc-topic><option value="">הכול</option>${topics.map((topic) => `<option>${esc(topic)}</option>`).join("")}</select></label><label>רמת קושי<select data-mc-level><option value="">הכול</option>${LEVELS.map((l) => `<option value="${l.id}">${l.label}</option>`).join("")}</select></label></div>
      <p class="filter-status" data-mc-count aria-live="polite"></p>
      <p data-mc-score role="status"></p><div data-mc-question class="exam-study prose"></div><p><button class="button" type="button" data-mc-next>לשאלה הבאה</button></p></div>`;
    const host = root.querySelector("[data-mc-question]");
    let remaining = [];
    const score = () => { root.querySelector("[data-mc-score]").textContent = `בתרגול הזה: ${mcSession.correct} מתוך ${mcSession.total} תשובות נכונות`; };
    const refill = () => {
      const unit = root.querySelector("[data-mc-unit]").value;
      const topic = root.querySelector("[data-mc-topic]").value;
      const level = root.querySelector("[data-mc-level]").value;
      remaining = pool.filter(({ q }) => (!unit || q.units.map(String).includes(unit)) && (!topic || q.topics.includes(topic)) && (!level || q.difficulty === level));
      root.querySelector("[data-mc-count]").textContent = `${remaining.length} שאלות בבחירה הזו`;
      draw();
    };
    const draw = () => {
      root.querySelector("[data-mc-next]").hidden = !remaining.length;
      if (!remaining.length) {
        host.innerHTML = `<p>${pool.length ? "אין עוד שאלות בבחירה הזו. אפשר לבחור נושא אחר." : "עדיין אין שאלות חלק ב עם פתרון. הן יופיעו כאן כשהפתרונות יתווספו."}</p>`;
        return;
      }
      const index = Math.floor(Math.random() * remaining.length);
      const item = remaining.splice(index, 1)[0];
      const { q } = item;
      const mc = q.study.mc;
      const statements = mc.answer ? [["answer", "בחרו את התשובה במבחן", q.study.options?.length >= 2 ? q.study.options : ["א", "ב", "ג", "ד", "ה"]]] : Object.keys(mc).map((key) => [key, `טענה ${key}`, ["true", "false"]]);
      const answered = new Set();
      let missed = false;
      host.innerHTML = `<h2>${esc(item.label)}${item.exam ? ` · שאלה ${q.q}` : ""} ${levelChip(q)}</h2>${q.study.question}
        ${statements.map(([key, label, values]) => `<fieldset class="exam-mc-answer" data-mc-statement="${key}"><legend>${label}</legend><div class="exam-actions">${values.map((value) => `<button class="button" type="button" data-answer="${value}">${value === "true" ? "נכון" : value === "false" ? "לא נכון" : value}</button>`).join("")}</div><p data-feedback role="status"></p></fieldset>`).join("")}
        <div data-mc-explanation hidden><h3>ההסבר</h3>${q.study.parts.map((part) => part.simple + part.solution).join("")}<p><a class="button" href="${item.href}">${item.exam ? "ללימוד עם רמזים" : "לשאלה בעמוד התרגול"}</a></p></div>`;
      host.querySelectorAll("[data-mc-statement]").forEach((field) => {
        field.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", () => {
          const key = field.dataset.mcStatement;
          if (answered.has(key)) return;
          answered.add(key);
          const expected = String(mc[key]);
          const correct = button.dataset.answer === expected;
          mcSession.total += 1;
          if (correct) mcSession.correct += 1;
          button.setAttribute("aria-pressed", "true");
          field.querySelectorAll("button").forEach((choice) => { choice.disabled = true; });
          if (!correct && !missed) { missed = true; markMiss(item); }
          field.querySelector("[data-feedback]").textContent = correct ? "התשובה נכונה." : `התשובה כאן: ${expected === "true" ? "נכון" : expected === "false" ? "לא נכון" : expected}. אפשר לבדוק את הנימוק בהסבר. השאלה נוספה לרשימת החזרה.`;
          field.querySelector("[data-feedback]").className = correct ? "exam-feedback-correct" : "exam-feedback-incorrect";
          if (answered.size === statements.length) {
            host.querySelector("[data-mc-explanation]").hidden = false;
            typesetStudy(host.querySelector("[data-mc-explanation]"));
          }
          score();
        }));
      });
      typesetStudy(host);
    };
    root.querySelectorAll("select").forEach((select) => select.addEventListener("change", refill));
    root.querySelector("[data-mc-next]").addEventListener("click", () => { draw(); host.querySelector("h2")?.scrollIntoView({ block: "start" }); });
    score();
    refill();
  }

  // Use elapsed wall time, rather than counting ticks, so a background tab's
  // throttled intervals do not give extra time. Pausing hides the scans.
  function renderSimulation(root, exam) {
    app().setTitle(`הדמיית מבחן · ${examLabel(exam)}`);
    if (!simulations.has(exam.n)) simulations.set(exam.n, { remaining: (exam.durationHours || 3) * 3600000, deadline: null, done: false, started: false });
    const state = simulations.get(exam.n);
    const timeLeft = () => state.deadline === null ? state.remaining : Math.max(0, state.deadline - Date.now());
    const finish = () => {
      state.remaining = timeLeft();
      state.deadline = null;
      state.done = true;
      clearInterval(simulationTimer);
      summary();
    };
    const summary = () => {
      const key = `${course.storagePrefix}-exam-sim-${exam.n}`;
      const scores = readStored(key);
      root.innerHTML = `<div class="exam-view"><header class="page-intro"><p><a href="${examHref(exam.n)}">${esc(examLabel(exam))}</a></p><h1>סיכום ההדמיה</h1><p>${esc(exam.structure)}</p><p>סמנו אילו שאלות פתרתם. אפשר לפתוח את הפתרון ולבדוק כמה נקודות לתת.</p></header>
        <form class="exam-sim-scores"><ul class="exam-q-list">${exam.questions.map((q) => `<li class="exam-q"><p><a class="button" href="${examHref(exam.n, q.q)}">שאלה ${q.q}${q.study ? " · ללימוד הפתרון" : " · לסריקה"}</a></p><p>${esc(q.summary)}</p><label class="exam-score-choice"><input type="checkbox" data-scored="${q.q}"${scores[q.q] !== undefined ? " checked" : ""} /> פתרנו את השאלה</label><label class="exam-score-input">ניקוד עצמי (מתוך ${q.points})<input type="number" min="0" max="${q.points}" step="0.5" data-score="${q.q}" value="${esc(scores[q.q] ?? "")}"${scores[q.q] === undefined ? " disabled" : ""} /></label></li>`).join("")}</ul><p data-score-total role="status"></p><p>הניקוד נשמר רק בדפדפן הזה.</p></form><button class="button" type="button" data-sim-restart>להדמיה חדשה</button></div>`;
      const update = () => {
        const selected = [];
        for (const q of exam.questions) {
          const checked = root.querySelector(`[data-scored="${q.q}"]`).checked;
          const input = root.querySelector(`[data-score="${q.q}"]`);
          input.disabled = !checked;
          if (checked) {
            selected.push(q);
            scores[q.q] = Math.min(q.points, Math.max(0, Number(input.value) || 0));
          } else delete scores[q.q];
        }
        saveStored(key, scores);
        root.querySelector("[data-score-total]").textContent = `הניקוד שנתתם: ${Object.values(scores).reduce((sum, value) => sum + Number(value), 0)} מתוך ${selected.reduce((sum, q) => sum + q.points, 0)} בשאלות שסימנתם`;
      };
      root.querySelector("form").addEventListener("input", update);
      root.querySelector("form").addEventListener("submit", (event) => event.preventDefault());
      root.querySelector("[data-sim-restart]").addEventListener("click", () => { simulations.delete(exam.n); renderSimulation(root, exam); });
      update();
    };
    if (state.done) return summary();
    root.innerHTML = `<div class="exam-view"><header class="page-intro"><p><a href="${examHref(exam.n)}">${esc(examLabel(exam))}</a></p><h1>הדמיית מבחן</h1><p>${esc(exam.structure)}</p></header>
      <div class="exam-sim-controls"><p>זמן שנותר: <b dir="ltr" data-sim-time role="timer" aria-label="זמן שנותר"></b></p><div class="exam-actions"><button class="button button-primary" type="button" data-sim-pause>${state.deadline === null ? state.started ? "להמשך" : "להתחלה" : "השהיה"}</button><button class="button" type="button" data-sim-finish>סיום ההדמיה</button></div><p data-sim-status role="status"></p></div>
      <div class="exam-scans exam-sim-scans" data-sim-scans hidden>${exam.pages.map((page) => scanHtml(exam, page)).join("")}</div></div>`;
    const tick = () => {
      if (!root.querySelector("[data-sim-time]")) { clearInterval(simulationTimer); return; }
      const ms = timeLeft();
      const seconds = Math.ceil(ms / 1000);
      root.querySelector("[data-sim-time]").textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
      root.querySelector("[data-sim-scans]").hidden = state.deadline === null;
      root.querySelector("[data-sim-status]").textContent = state.deadline !== null ? "ההדמיה פועלת." : state.started ? "ההדמיה מושהית. הסריקות יחזרו כשתמשיכו." : "כשתתחילו, הסריקות ייפתחו והזמן יתחיל לרדת.";
      if (ms <= 0) finish();
    };
    root.querySelector("[data-sim-pause]").addEventListener("click", (event) => {
      if (state.deadline === null) { state.deadline = Date.now() + state.remaining; state.started = true; }
      else { state.remaining = timeLeft(); state.deadline = null; }
      event.currentTarget.textContent = state.deadline === null ? "להמשך" : "השהיה";
      tick();
    });
    root.querySelector("[data-sim-finish]").addEventListener("click", finish);
    tick();
    simulationTimer = setInterval(tick, 250);
  }

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

  // Difficulty levels typed into exams.json as q.difficulty. The order is the
  // sort order; the text is the legend shown above the topic search.
  const LEVELS = [
    { id: "easy", label: "קלה", text: "צעד אחד מוכר: הגדרה, נוסחה או משפט אחד, חישוב שגרתי, הוכחה קצרה מהספר או דוגמה נגדית ידועה." },
    { id: "medium", label: "בינונית", text: "שניים־שלושה רעיונות שצריך לחבר, או לבחור את הכלי הנכון (רול, לגראנז׳, ערך ביניים, סנדוויץ׳) ולהפעיל אותו. הוכחה רגילה מהספר עם צעד עדין אחד." },
    { id: "hard", label: "קשה", text: "דורשת רעיון מקורי, בנייה או דוגמה נגדית לא צפויה, הוכחה ארוכה בכמה שלבים, או שילוב של כמה נושאים." }
  ];
  const levelRank = (q) => Math.max(0, LEVELS.findIndex((l) => l.id === q.difficulty));
  function levelChip(q) {
    const level = LEVELS.find((l) => l.id === q.difficulty);
    return level ? `<span class="exam-chip exam-chip-level exam-level-${level.id}" title="רמת קושי">${level.label}</span>` : "";
  }

  function questionRow(exam, q, withExam) {
    const units =(q.units || []).map((u) => `<span class="exam-chip" style="--c:var(--c-unit-${u})">${esc(words.unit)} ${u}</span>`).join("");
    const proves = (q.prove || []).map(theoremChip).join("");
    const head = withExam
      ? `<a href="${examHref(exam.n, q.q)}">${esc(examLabel(exam))} · שאלה ${q.q}</a>`
      : `<a href="${examHref(exam.n, q.q)}" ${q.study ? "" : `data-jump="${q.page}"`}>שאלה ${q.q}</a>`;
    return `<li class="exam-q"${withExam ? "" : ` id="q${q.q}"`}>
      <p class="exam-q-head">${head}${ratingMark(exam, q)}${q.study ? `<span class="exam-coverage">פתרון מלא</span>` : ""}<span class="exam-q-meta">${esc(q.format || "")}${q.points ? ` · ${q.points} נק'` : ""}${q.kind ? ` · ${esc(q.kind)}` : ""}${q.kind_detail ? ` + ${esc(q.kind_detail)}` : ""}</span></p>
      <p class="exam-q-summary">${esc(q.summary)}</p>
      <p class="exam-q-tags">${levelChip(q)}${proves}${units}${(q.topics || []).map((t) => `<span class="exam-chip exam-chip-topic">${esc(t)}</span>`).join("")}</p>
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
    const years = [...new Set(list.map((exam) => exam.semester.slice(0, 4)))].sort().reverse();
    const reviewCount = reviewRows().length;
    // Newest first. A semester like "2026ג" splits into its year and letter.
    const byDate = list.slice().sort((a, b) => b.semester.localeCompare(a.semester, "he") || b.n - a.n);
    const semName = { "א": "סמסטר א", "ב": "סמסטר ב", "ג": "סמסטר ג (קיץ)" };
    const rows = years.map((year) => `<li class="exam-rows-year"><span class="exam-rows-y">${esc(year)}</span><ul>${byDate.filter((exam) => exam.semester.startsWith(year)).map((exam) => `<li class="exam-row" data-exam="${exam.n}">
          <a href="${examHref(exam.n)}">${esc(exam.semester)} · מועד ${esc(exam.moed)}</a>
          <span class="exam-row-meta">${exam.questions.some((q) => q.study) ? "פתרונות" : "סריקה בלבד"}${examRatings(exam).replace(/<\/?p[^>]*>/g, "") ? ` · ${examRatings(exam).replace(/<\/?p[^>]*>/g, "")}` : ""}</span>
          <a class="exam-row-sim" href="${examHref(exam.n)}/sim" aria-label="סימולציה · ${esc(examLabel(exam))}">סימולציה</a>
        </li>`).join("")}</ul></li>`).join("");
    const option = (href, section, title, text) => `<a class="exam-option" href="${href}"${section ? ` data-exam-section="${section}"` : ""}><strong>${title}</strong><span>${text}</span></a>`;
    root.innerHTML = `
      <div class="exams-page">
        <header class="page-intro">
          <h1>מבחנים 2019–2026</h1>
          <p>${list.length} מבחנים קודמים עם סריקות, ולרובם פתרונות מלאים. מה אפשר לעשות כאן:</p>
        </header>
        <nav class="exam-options" aria-label="מה אפשר לעשות בעמוד המבחנים">
          ${option("#/exams?section=allTitle", "allTitle", "פתיחת מבחן", "בוחרים שנה, סמסטר ומועד, ופותחים את הסריקה, הפתרונות או סימולציה עם שעון.")}
          ${option("#/exams?section=findTitle", "findTitle", "חיפוש שאלות", "כל השאלות מכל המבחנים, לפי נושא, משפט, סוג ורמת קושי.")}
          ${option("#/exams/practice-mc", "", "תרגול אמריקאיות", "שאלות אמריקאיות מכל המבחנים ומעמודי התרגול, עם בדיקה והסבר. טעות נשמרת לחזרה.")}
          ${option("#/exams?section=reviewTitle", "reviewTitle", `לחזרה (${reviewCount})`, "השאלות שסימנתם ״חלקית״ או ״נתקעתי״.")}
          ${option("#/exams?section=examStats", "examStats", "סטטיסטיקות", "מה נשאל הכי הרבה, לפי נושא ולפי שנה.")}
          <label class="exam-option exam-option-level"><strong>שאלות לפי רמה</strong><select data-nav-level><option value="">בחרו רמת קושי</option>${LEVELS.map((l) => `<option value="${l.id}">${l.label}</option>`).join("")}</select></label>
        </nav>
        <section class="exam-section exam-all" aria-labelledby="allTitle">
          <h2 id="allTitle" tabindex="-1">פתיחת מבחן</h2>
          <div class="exam-filters exam-picker">
            <label>שנה<select data-pick="year">${years.map((y) => `<option>${esc(y)}</option>`).join("")}</select></label>
            <label>סמסטר<select data-pick="sem"></select></label>
            <label>מועד<select data-pick="moed"></select></label>
          </div>
          <div class="exam-picked" data-picked aria-live="polite"></div>
          <details class="exam-all-list">
            <summary>כל ${list.length} המבחנים ברשימה אחת</summary>
            <ul class="exam-rows">${rows}</ul>
          </details>
        </section>
        <section class="exam-section" aria-labelledby="findTitle">
          <h2 id="findTitle" tabindex="-1">חיפוש שאלות לפי נושא</h2>
          <div class="exam-filters">
            <label>${esc(words.unit)}<select data-f="unit"><option value="">הכול</option>${Object.entries(unitNames()).map(([u, n]) => `<option value="${u}">${u}. ${n}</option>`).join("")}</select></label>
            <label>משפט להוכחה<select data-f="thm"><option value="">הכול</option>${nums.map((n) => `<option>${n}</option>`).join("")}</select></label>
            <label>סוג שאלה<select data-f="kind"><option value="">הכול</option>${kinds.map((k) => `<option>${esc(k)}</option>`).join("")}</select></label>
            <label>רמת קושי<select data-f="level"><option value="">הכול</option>${LEVELS.map((l) => `<option value="${l.id}">${l.label}</option>`).join("")}</select></label>
            <label>מיון<select data-f="sort"><option value="">חדש לישן</option><option value="easy">מהקלה לקשה</option><option value="hard">מהקשה לקלה</option></select></label>
            <label class="exam-filter-text">מילה<input type="search" data-f="text" autocomplete="off" placeholder="למשל: במידה שווה" /></label>
          </div>
          <details class="exam-levels">
            <summary>מה זה קלה, בינונית וקשה?</summary>
            <dl>${LEVELS.map((l) => `<div><dt><span class="exam-chip exam-chip-level exam-level-${l.id}">${l.label}</span></dt><dd>${l.text}</dd></div>`).join("")}</dl>
            <p>הדירוג הוא הערכה שלנו לפי מה שהשאלה דורשת, לא לפי הניקוד. אותה שאלה יכולה להרגיש אחרת לכל אחד.</p>
          </details>
          <p class="filter-status" aria-live="polite" data-exam-status></p>
          <ul class="exam-q-list" data-exam-results></ul>
        </section>
        ${reviewList()}
        <details class="exam-statistics">
          <summary id="examStats">סטטיסטיקות: מה נשאל הכי הרבה</summary>
          ${frequencyBoard()}
          ${heatmap()}
        </details>
      </div>`;

    const results = root.querySelector("[data-exam-results]");
    const status = root.querySelector("[data-exam-status]");
    const field = (name) => root.querySelector(`[data-f="${name}"]`).value.trim();
    const norm = (s) => String(s || "").toLowerCase().replace(/["'״׳]/g, "");
    const update = () => {
      const unit = field("unit");
      const thm = field("thm");
      const kind = field("kind");
      const level = field("level");
      const sort = field("sort");
      const text = norm(field("text"));
      if (!unit && !thm && !kind && !level && !text) {
        results.innerHTML = "";
        status.textContent = `בחרו ${words.unit}, משפט, סוג, רמת קושי או מילה כדי לראות את כל השאלות המתאימות.`;
        return;
      }
      const hits = [];
      for (const exam of list.slice().reverse()) {
        for (const q of exam.questions) {
          if (unit && !(q.units || []).map(String).includes(unit)) continue;
          if (thm && !(q.prove || []).includes(thm)) continue;
          if (kind && q.kind !== kind && q.kind_detail !== kind) continue;
          if (level && q.difficulty !== level) continue;
          if (text && !norm(`${q.summary} ${(q.topics || []).join(" ")} ${q.note || ""}`).includes(text)) continue;
          hits.push({ q, html: questionRow(exam, q, true) });
        }
      }
      // Array sort is stable, so within a level the newest exam stays first.
      if (sort) hits.sort((a, b) => (sort === "hard" ? -1 : 1) * (levelRank(a.q) - levelRank(b.q)));
      results.innerHTML = hits.map((hit) => hit.html).join("");
      const counts = LEVELS.map((l) => [l.label, hits.filter((hit) => hit.q.difficulty === l.id).length]).filter(([, c]) => c);
      status.textContent = hits.length ? `${hits.length} שאלות מתאימות${!level && counts.length > 1 ? ` (${counts.map(([l, c]) => `${c} ${l}`).join(", ")})` : ""}` : "אין שאלות מתאימות";
    };
    // Filters live in the address, so a unit's exam questions can be linked
    // to (#/exams?unit=5) and survive a reload.
    for (const name of ["unit", "thm", "kind", "level", "sort", "text"]) {
      const value = route.query?.get(name);
      if (value) root.querySelector(`[data-f="${name}"]`).value = value;
    }
    const syncUrl = () => {
      const params = new URLSearchParams();
      for (const name of ["unit", "thm", "kind", "level", "sort", "text"]) if (field(name)) params.set(name, field(name));
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
    // The options menu scrolls away with the page, so headings need no extra offset.
    const nav = root.querySelector(".exam-options");
    root.querySelector(".exams-page")?.style.setProperty("--exam-nav-h", "0px");
    // Exam picker: year -> semester -> moed, newest first; the chosen exam
    // shows below with its open and simulation buttons.
    const pick = (name) => root.querySelector(`[data-pick="${name}"]`);
    const picked = root.querySelector("[data-picked]");
    const fill = (select, values, label) => {
      if (!select) return;
      select.innerHTML = values.map((v) => `<option value="${esc(v)}">${esc(label(v))}</option>`).join("");
    };
    const showPicked = () => {
      const exam = byDate.find((e) => e.semester === `${pick("year").value}${pick("sem").value}` && String(e.moed) === pick("moed").value);
      if (!exam || !picked) return;
      const solved = exam.questions.filter((q) => q.study).length;
      const levels = LEVELS.map((l) => [l, exam.questions.filter((q) => q.difficulty === l.id).length]).filter(([, c]) => c);
      picked.innerHTML = `<div class="exam-picked-card">
          <h3>${esc(semName[exam.semester.slice(4)] || exam.semester)} ${esc(exam.semester.slice(0, 4))} · מועד ${esc(exam.moed)}</h3>
          <p>${exam.questions.length} שאלות · ${solved ? `פתרון מלא ל-${solved} מהן` : "סריקה בלבד, בלי פתרונות"}${exam.durationHours ? ` · ${exam.durationHours} שעות` : ""}</p>
          ${levels.length ? `<p class="exam-q-tags">${levels.map(([l, c]) => `<span class="exam-chip exam-chip-level exam-level-${l.id}">${c} ${l.label}</span>`).join("")}</p>` : ""}
          ${examRatings(exam)}
          <p class="exam-actions"><a class="button button-primary" href="${examHref(exam.n)}">פתיחת המבחן</a><a class="button" href="${examHref(exam.n)}/sim">סימולציה עם שעון</a></p>
        </div>`;
    };
    const fillMoed = () => {
      const sem = `${pick("year").value}${pick("sem").value}`;
      fill(pick("moed"), byDate.filter((e) => e.semester === sem).map((e) => String(e.moed)), (m) => `מועד ${m}`);
      showPicked();
    };
    const fillSem = () => {
      const year = pick("year").value;
      fill(pick("sem"), [...new Set(byDate.filter((e) => e.semester.startsWith(year)).map((e) => e.semester.slice(4)))], (l) => semName[l] || l);
      fillMoed();
    };
    if (pick("year")?.addEventListener) {
      pick("year").addEventListener("change", fillSem);
      pick("sem").addEventListener("change", fillMoed);
      pick("moed").addEventListener("change", showPicked);
      fillSem();
    }
    const jump = (id) => {
      const target = root.querySelector(`#${id}`);
      if (!target) return;
      if (id === "examStats") target.parentElement.open = true;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    };
    // The top-bar level picker drives the topic search's own level filter.
    const navLevel = root.querySelector("[data-nav-level]");
    const levelField = root.querySelector('[data-f="level"]');
    if (navLevel && levelField) {
      navLevel.value = levelField.value;
      navLevel.addEventListener("change", () => {
        levelField.value = navLevel.value;
        update();
        syncUrl();
        jump("findTitle");
      });
      levelField.addEventListener("input", () => { navLevel.value = levelField.value; });
    }
    nav.querySelectorAll("[data-exam-section]").forEach((link) => link.addEventListener("click", (event) => {
      event.preventDefault();
      jump(link.dataset.examSection);
    }));
    const hasFilter = ["unit", "thm", "kind", "level", "sort", "text"].some((name) => route.query?.get(name));
    const section = route.query?.get("section");
    if (hasFilter || ["allTitle", "reviewTitle", "findTitle", "examStats"].includes(section)) requestAnimationFrame(() => jump(hasFilter ? "findTitle" : section));
    app().queueTypeset([root]);
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
    if (section === "sim") return renderSimulation(root, exam);
    if (target?.study) return renderStudy(root, exam, target);
    // Pages up to the one asked for load eagerly, so the jump lands on it.
    const eagerUntil = Math.max(1, target ? exam.pages.indexOf(target.page) : 1);
    const prev = list[index - 1];
    const next = list[index + 1];
    const pagesHtml = exam.images
      .map(
        (src, i) => `<figure class="exam-scan${PHOTOGRAPHED_EXAMS.has(exam.n) ? "" : " exam-scan-sheet"}" id="page-${exam.pages[i]}">
          <a href="${src}" target="_blank" rel="noopener"><img src="${src}" width="875" height="1240" decoding="async" loading="${i <= eagerUntil ? "eager" : "lazy"}" alt="${esc(`${examLabel(exam)}, עמוד ${i + 1} מתוך ${exam.images.length}`)}" /></a>
          <figcaption>עמוד ${i + 1} מתוך ${exam.images.length} · לחיצה פותחת בגודל מלא</figcaption>
        </figure>`
      )
      .join("");
    root.innerHTML = `
      <div class="exam-view">
        <header class="page-intro">
          <p class="exam-crumbs"><a href="#/exams">כל המבחנים</a></p>
          <h1>מבחן ${esc(exam.semester)} · מועד ${esc(exam.moed)}</h1>
          <p>${esc(exam.date || "")}${exam.durationHours ? ` · ${exam.durationHours} שעות` : ""}${exam.questionnaire ? ` · שאלון ${esc(exam.questionnaire)}` : ""}. ${esc(exam.structure || "")}</p>
        </header>
        ${questionTabs(exam, target)}
        ${coverage(exam)}${examRatings(exam)}
        <p><a class="button" href="${examHref(exam.n)}/sim">הדמיית מבחן</a></p>
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
    app().queueTypeset([root]);
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
        <p>נוסיף אותם כשיהיו לנו טפסי מבחן לתייג. בינתיים אפשר ללמוד מהדפים ולתרגל.</p>
        <p><a class="button button-primary" href="#/">לדף הבית</a> <a class="button" href="#/practice">לתרגול</a></p>
      </section>`;
  }

  function render(root, route) {
    clearInterval(simulationTimer);
    navObserver?.disconnect();
    if (course.features.questionArchive && window.LinearArchive) return window.LinearArchive.render(root, route);
    if (course.features.exams && route.id === "practice-mc") {
      const needed = exams().filter((exam) => exam.studyVersion && !exam.studyLoaded && exam.questions.some((q) => q.part === "ב" && q.study));
      if (needed.length) return loadBeforeRender(root, route, needed);
    }
    if (course.features.exams && /^q\d+$/.test(route.section || "")) {
      const exam = exams().find((item) => String(item.n) === String(route.id));
      const question = exam?.questions.find((item) => `q${item.q}` === route.section);
      if (question?.study && exam.studyVersion && !exam.studyLoaded) return loadBeforeRender(root, route, [exam]);
    }
    if (!course.features.exams) renderNoExams(root);
    else if (route.id === "practice-mc") renderMC(root);
    else if (route.id) renderExam(root, route.id, route.section);
    else renderList(root, route);
  }

  window.InfiExams = { render, decorate };
})();
