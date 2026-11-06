/* Supplied course 20109 archive. Loaded only when entering the archive. */
(() => {
  'use strict';
  let pending;
  let imageSizes = {};
  const base = 'assets/archive/';
  const esc = (value) => window.InfiApp.escapeHtml(String(value ?? ''));
  const href = (id, question = '') => `#/exams/${encodeURIComponent(id)}${question ? '/' + encodeURIComponent(question) : ''}`;
  const load = () => pending ||= fetch(`${base}questions.json`).then((r) => {
    if (!r.ok) throw new Error('Archive unavailable');
    return r.json();
  }).then((data) => { imageSizes = data.imageSizes; return data; }).catch((e) => { pending = null; throw e; });
  const hasSolution = (q) => q.solution_images.length > 0;
  const images = (paths, label) => paths.map((p, i) => `<a href="${base}${esc(p)}" target="_blank" rel="noopener" aria-label="${esc(label)} — הגדלת תמונה ${i + 1}"><img class="archive-image" src="${base}${esc(p)}" width="${imageSizes[p][0]}" height="${imageSizes[p][1]}" alt="${esc(label)} — תמונה ${i + 1}" loading="lazy" decoding="async"></a>`).join('');
  const options = (rows, selected) => rows.map(([value, label]) => `<option value="${esc(value)}"${String(value) === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');

  function question(q) {
    return `<article class="archive-question" id="${esc(q.id)}">
      <h2>${esc(q.question_label)}</h2>
      <p class="archive-meta">${esc(q.unit_labels.join(' · '))} · ${esc(q.type_label)}</p>
      ${images(q.prompt_images, q.question_label)}
      ${hasSolution(q) ? `<details class="archive-solution"><summary>הצגת הפתרון</summary>${images(q.solution_images, 'פתרון ' + q.question_label)}${q.solution_note ? `<p>${esc(q.solution_note)}</p>` : ''}</details>` : '<p class="archive-missing">לא צורף פתרון לשאלה זו בארכיון.</p>'}
    </article>`;
  }

  function detail(root, data, route) {
    const exam = data.exams.find((e) => e.id === route.id);
    if (!exam) {
      root.innerHTML = '<section class="archive"><h1>הטופס לא נמצא</h1><a href="#/exams">לכל המבחנים והמטלות</a></section>';
      return;
    }
    window.InfiApp.setTitle(exam.label);
    const qs = data.questions.filter((q) => q.exam_id === exam.id);
    root.innerHTML = `<section class="archive"><a href="#/exams">← לכל המבחנים והמטלות</a><h1>${esc(exam.label)}</h1>
      <p>${qs.length} שאלות וסעיפים · ${qs.filter(hasSolution).length} עם פתרון</p>
      <p class="archive-meta">מקור: חומרי קורס 20109 של האוניברסיטה הפתוחה, מתוך הארכיון שסופק. לחיצה על תמונה פותחת אותה בגודל מלא.</p>
      ${exam.solution_file && !exam.solution_file.includes(String(exam.year) + exam.semester) ? '<p>הערת מקור: שם קובץ הפתרון בארכיון מציין סמסטר אחר. התמונות מוצגות לפי השיוך שבארכיון; התאמת הפתרון לטופס לא אומתה.</p>' : ''}
      <nav class="archive-question-nav" aria-label="שאלות בטופס">${qs.map((q) => `<a href="${href(exam.id, q.id)}">${esc(q.question_label)}</a>`).join('')}</nav>
      ${qs.map(question).join('')}
    </section>`;
    if (route.section) {
      const target = document.getElementById(route.section);
      const hash = location.hash;
      if (target) {
        const before = [...root.querySelectorAll('.archive-question > a img')].filter((img) => img.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING);
        before.forEach((img) => { img.loading = 'eager'; });
        Promise.all([document.fonts.ready, ...before.map((img) => img.decode().catch(() => {}))]).then(() => {
          if (location.hash === hash && target.isConnected) target.scrollIntoView({ block: 'start' });
        });
      }
    }
  }

  function list(root, data, route) {
    window.InfiApp.setTitle('מבחנים ומטלות');
    const query = route.query || new URLSearchParams();
    const selected = (key) => query.get(key) || '';
    const years = [...new Set(data.exams.map((e) => e.year))].sort((a, b) => b - a);
    root.innerHTML = `<section class="archive"><h1>מבחנים ומטלות</h1>
      <p>${data.summary.exams} מבחנים · ${data.summary.assignments} מטלות · ${data.summary.questions} שאלות וסעיפים</p>
      <p class="archive-meta">פתרונות מצורפים ל־${data.summary.withSolutions} שאלות וסעיפים. ל־5 המטלות של 2027א לא צורפו פתרונות.</p>
      <form class="archive-filters" role="search" aria-label="סינון שאלות">
        <label>סוג<select name="kind">${options([['', 'הכול'], ['exam', 'מבחנים'], ['maman', 'מטלות']], selected('kind'))}</select></label>
        <label>שנה<select name="year">${options([['', 'כל השנים'], ...years.map((y) => [y, y])], selected('year'))}</select></label>
        <label>פרק<select name="unit">${options([['', 'כל הפרקים'], ...data.units.map((u) => [String(u.number), `${u.number}. ${u.label}`])], selected('unit'))}</select></label>
        <label class="archive-search">חיפוש<input name="text" type="search" value="${esc(selected('text'))}" placeholder="נושא, מועד או מילים מהשאלה"></label>
        <button class="button" type="submit">סינון</button><a href="#/exams">איפוס</a>
      </form><p id="archive-count" role="status"></p><div id="archive-results"></div></section>`;
    const form = root.querySelector('form');
    const update = () => {
      const filters = new FormData(form);
      const kind = filters.get('kind');
      const year = filters.get('year');
      const unit = filters.get('unit');
      const text = filters.get('text').trim().toLocaleLowerCase('he');
      const matches = data.questions.filter((q) => (!kind || Boolean(q.is_maman) === (kind === 'maman')) && (!year || String(q.year) === year) && (!unit || q.unit_ids.includes(`u${unit.padStart(2, '0')}`)) && (!text || [q.prompt, q.exam_label, q.question_label, ...q.tags, ...q.unit_labels].join(' ').toLocaleLowerCase('he').includes(text)));
      const grouped = new Map();
      for (const q of matches) {
        if (!grouped.has(q.exam_id)) grouped.set(q.exam_id, []);
        grouped.get(q.exam_id).push(q);
      }
      root.querySelector('#archive-count').textContent = `${grouped.size} טפסים · ${matches.length} שאלות וסעיפים`;
      const exams = data.exams.filter((e) => grouped.has(e.id)).sort((a, b) => b.year - a.year || b.semester.localeCompare(a.semester) || Number(Boolean(a.is_maman)) - Number(Boolean(b.is_maman)) || (a.moed ?? a.assignment_number) - (b.moed ?? b.assignment_number));
      root.querySelector('#archive-results').innerHTML = exams.length ? exams.map((e) => {
        const qs = grouped.get(e.id);
        const solved = qs.filter(hasSolution).length;
        return `<article class="archive-row"><h2><a href="${href(e.id)}">${esc(e.label)}</a></h2><p>${qs.length} שאלות וסעיפים${solved === qs.length ? ' · כולל פתרונות' : solved ? ` · ${solved} עם פתרון` : ' · ללא פתרונות בארכיון'}</p>${unit || text ? `<ul>${qs.map((q) => `<li><a href="${href(e.id, q.id)}">${esc(q.question_label)}</a> — ${esc(q.unit_labels.join(' · '))}</li>`).join('')}</ul>` : ''}</article>`;
      }).join('') : '<p>לא נמצאו שאלות שמתאימות לסינון. אפשר לשנות את הבחירה או לאפס.</p>';
      const params = new URLSearchParams();
      for (const [key, value] of filters) if (value.trim()) params.set(key, value.trim());
      history.replaceState(null, '', `#/exams${params.size ? '?' + params : ''}`);
    };
    form.addEventListener('submit', (event) => { event.preventDefault(); update(); });
    form.querySelectorAll('select').forEach((select) => select.addEventListener('change', update));
    update();
  }

  async function render(root, route) {
    const hash = location.hash;
    root.innerHTML = '<section class="archive" aria-busy="true"><h1>מבחנים ומטלות</h1><p role="status">טוענים את מאגר השאלות…</p></section>';
    try {
      const data = await load();
      if (location.hash !== hash) return;
      if (route.id) detail(root, data, route); else list(root, data, route);
    } catch {
      if (location.hash !== hash) return;
      root.innerHTML = '<section class="archive"><h1>מבחנים ומטלות</h1><p role="alert">לא הצלחנו לטעון את המאגר.</p><button class="button" type="button">ניסיון נוסף</button></section>';
      root.querySelector('button').addEventListener('click', () => render(root, route));
    }
  }
  window.LinearArchive = { render };
})();
