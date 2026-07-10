const data = window.COURSE_DATA;
const app = document.querySelector("#app");
const searchInput = document.querySelector("#siteSearch");
const searchResults = document.querySelector("#searchResults");
const unitNav = document.querySelector("#unitNav");
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));

if (!data) {
  app.innerHTML = `<section class="loading-state"><h1>אין תוכן</h1><p>הקובץ assets/content.js לא נטען.</p></section>`;
  throw new Error("COURSE_DATA missing");
}

const pages = new Map(data.pages.map((page) => [page.id, page]));
let currentView = "home";
let graphFrame = 0;

const unitColors = {
  overview: "#9d7a31",
  center: "#b8001a",
  "unit-1": "#19465e",
  "unit-2": "#6d6a42",
  "unit-3": "#7b4f3b",
  "unit-4": "#2f6b62",
  "unit-5": "#8b3440",
  "unit-6": "#3f5f87",
  "unit-7": "#744f77",
  "unit-8": "#9a5d4f",
  supplement: "#5d7043",
  other: "#343946"
};

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("he")
    .normalize("NFKC");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function routeTo(view, id = "") {
  const hash = id ? `#/${view}/${id}` : `#/${view}`;
  if (location.hash !== hash) location.hash = hash;
  else renderRoute();
}

function openPage(id) {
  if (id) routeTo("page", id);
}

function routeParts() {
  return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

function renderRoute() {
  const parts = routeParts();
  const view = parts[0] || "home";
  const id = parts[1] || "";
  currentView = view;
  document.body.dataset.view = view;
  updateTabs(view);
  cancelAnimationFrame(graphFrame);

  if (view === "page" && pages.has(id)) {
    renderPage(pages.get(id));
  } else if (view === "graph") {
    renderGraph();
  } else if (view === "index") {
    renderIndex(id);
  } else if (view === "credits") {
    renderCredits();
  } else {
    renderHome();
  }

  updateUnitRail(view === "index" ? id : "");
}

function updateTabs(view) {
  tabButtons.forEach((button) => {
    const active = button.dataset.view === view || (view === "page" && button.dataset.view === "home");
    button.setAttribute("aria-current", active ? "page" : "false");
  });
}

function updateUnitRail(activeUnit) {
  unitNav.querySelectorAll("[data-unit]").forEach((button) => {
    button.setAttribute("aria-current", button.dataset.unit === activeUnit ? "true" : "false");
  });
}

function renderUnitNav() {
  unitNav.innerHTML = data.units
    .map((unit) => {
      const color = unitColors[unit.id] || unitColors.other;
      return `<button class="unit-button" type="button" data-unit="${unit.id}" style="--unit-color:${color}">
        <span>${escapeHtml(unit.name)}</span>
        <small>${unit.count}</small>
      </button>`;
    })
    .join("");

  unitNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-unit]");
    if (!button) return;
    routeTo("index", button.dataset.unit);
  });
}

function renderHome() {
  const keyPages = [
    data.homePageId,
    data.mapPageId,
    data.dependencyPageId,
    data.proofPageId,
    data.counterPageId
  ]
    .filter(Boolean)
    .map((id) => pages.get(id))
    .filter(Boolean);

  const unitCards = data.units
    .filter((unit) => unit.id.startsWith("unit-") || unit.id === "supplement")
    .map((unit) => {
      const first =
        data.pages.find((page) => page.unitId === unit.id && page.title.includes("שער")) ||
        data.pages.find((page) => page.unitId === unit.id);
      return `<a class="unit-paper" href="#/page/${first?.id || data.homePageId}">
        <small>${escapeHtml(unit.name)}</small>
        <strong>${escapeHtml(first?.title || unit.name)}</strong>
        <span class="path-line">${unit.count} פתקים</span>
      </a>`;
    })
    .join("");

  app.innerHTML = `
    <div class="home-front">
      <section class="lead-story">
        <span class="kicker">גיליון עבודה לסטודנטים</span>
        <h1>חשבון אינפיסימטלי 1, לא כמו רשימת קבצים.</h1>
        <p>כספת הקורס נפתחת כעיתון מתמטי: משפטים, דוגמאות נגד, תלות בין רעיונות ומפת קריאה אחת שאפשר לחזור אליה לפני מבחן.</p>
        <div class="front-ledger" aria-label="נתוני האתר">
          <div class="metric"><strong>${data.pages.length}</strong><span>פתקים</span></div>
          <div class="metric"><strong>${data.graph.edges.length}</strong><span>קשרים</span></div>
          <div class="metric"><strong>${data.units.length}</strong><span>מדורים</span></div>
          <div class="metric"><strong>${data.stats.formulaCount}</strong><span>סימני TeX</span></div>
        </div>
        <div class="front-actions">
          <button type="button" data-open="${data.mapPageId}">מפת הקורס</button>
          <button type="button" data-open="${data.dependencyPageId}">מפת תלות</button>
          <button type="button" data-go="graph">גרף קשרים</button>
        </div>
      </section>

      <aside class="editor-column">
        <section class="notice-block">
          <h2>הערת מערכת</h2>
          <p>${escapeHtml(data.notice)}</p>
        </section>
        <section class="wire-block">
          <h2>כניסות מהירות</h2>
          <div class="wire-list">${keyPages.map(renderWireLink).join("")}</div>
        </section>
      </aside>

      <section class="front-sections">
        <div class="section-block">
          <h2>מדורי הקורס</h2>
          <div class="unit-grid">${unitCards}</div>
        </div>
        <div class="section-block">
          <h2>פתקים מרכזיים</h2>
          <div class="note-grid">${keyPages.map(renderNoteCard).join("")}</div>
        </div>
      </section>
    </div>
  `;

  app.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => openPage(button.dataset.open));
  });
  app.querySelector("[data-go='graph']")?.addEventListener("click", () => routeTo("graph"));
  app.focus({ preventScroll: true });
}

function renderWireLink(page) {
  return `<a class="wire-link" href="#/page/${page.id}">
    <small>${escapeHtml(page.unitName)}</small>
    <strong>${escapeHtml(page.title)}</strong>
  </a>`;
}

function renderNoteCard(page) {
  return `<a class="note-card" href="#/page/${page.id}">
    <small>${escapeHtml(page.unitName)}</small>
    <strong>${escapeHtml(page.title)}</strong>
    <span class="path-line">${escapeHtml(page.path)}</span>
  </a>`;
}

function renderIndex(unitId = "") {
  const sections = data.units
    .filter((unit) => !unitId || unit.id === unitId)
    .map((unit) => {
      const cards = data.pages.filter((page) => page.unitId === unit.id).map(renderNoteCard).join("");
      if (!cards) return "";
      return `<section class="section-block">
        <h2>${escapeHtml(unit.name)}</h2>
        <div class="note-grid">${cards}</div>
      </section>`;
    })
    .join("");

  app.innerHTML = `<div class="index-grid">${sections}</div>`;
  app.focus({ preventScroll: true });
}

function renderCredits() {
  app.innerHTML = `
    <section class="page-shell">
      <header class="page-head">
        <div class="page-meta">
          <span>אתר לימודי לא רשמי</span>
          <span>נבנה: ${escapeHtml(data.generatedAt)}</span>
        </div>
        <h1>קרדיט, מקור וגבולות פרסום</h1>
      </header>
      <div class="page-layout">
        <article class="article-body credits-text">
          <p>${escapeHtml(data.notice)}</p>
          <p>חומרי המקור: ספרי הקורס 20474 של האוניברסיטה הפתוחה, חוברת הגדרות ומשפטים, וסיכום הרצאות אינפי 1מ של אביב צנזור מהטכניון.</p>
          <p>כל הזכויות בחומרי המקור שמורות לבעליהן. האתר מיועד ללמידה, חזרה, ניווט והנגשה בין נושאים. זה אינו אתר רשמי של האוניברסיטה הפתוחה, הטכניון או אביב צנזור.</p>
          <p>אין להעלות ציבורית PDFs רשמיים, ספרים מלאים, פתרונות רשמיים או הקלטות שאין להן הרשאת הפצה.</p>
        </article>
      </div>
    </section>
  `;
  app.focus({ preventScroll: true });
}

function renderPage(page) {
  const backlinks = page.backlinks.map((id) => pages.get(id)).filter(Boolean);
  const outgoing = page.links.map((id) => pages.get(id)).filter(Boolean);

  app.innerHTML = `
    <article class="page-shell">
      <header class="page-head">
        <div class="page-meta">
          <span>${escapeHtml(page.unitName)}</span>
          <span>${escapeHtml(page.path)}</span>
          <span>${page.wordCount} מילים</span>
        </div>
        <h1>${escapeHtml(page.title)}</h1>
        ${page.aliases?.length ? `<div class="chip-list">${page.aliases.map((tag) => `<span class="link-chip">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      </header>

      <div class="page-layout">
        <div class="article-body">${page.html}</div>
        <aside class="article-sidebar">
          <section class="side-section">
            <h2>יוצא מכאן</h2>
            <div class="chip-list">${outgoing.length ? outgoing.map(renderChip).join("") : `<span class="path-line">אין קישורים יוצאים.</span>`}</div>
          </section>
          <section class="side-section">
            <h2>נכנס לכאן</h2>
            <div class="chip-list">${backlinks.length ? backlinks.map(renderChip).join("") : `<span class="path-line">אין קישורים נכנסים.</span>`}</div>
          </section>
        </aside>
      </div>
    </article>
  `;

  typesetMath();
  renderMermaid();
  app.focus({ preventScroll: true });
}

function renderChip(page) {
  return `<a class="link-chip" href="#/page/${page.id}">${escapeHtml(page.title)}</a>`;
}

function renderGraph() {
  app.innerHTML = `
    <section class="graph-shell">
      <div class="graph-stage">
        <canvas id="graphCanvas"></canvas>
      </div>
      <aside class="graph-info" id="graphInfo">
        <h2>גרף תלות וקישורים</h2>
        <p>${data.graph.nodes.length} צמתים, ${data.graph.edges.length} קשתות.</p>
        <div class="legend">
          ${data.units.map((unit) => `<span class="legend-item"><i class="swatch" style="background:${unitColors[unit.id] || unitColors.other}"></i>${escapeHtml(unit.name)}</span>`).join("")}
        </div>
      </aside>
    </section>
  `;
  mountGraph();
  app.focus({ preventScroll: true });
}

function mountGraph() {
  const canvas = document.querySelector("#graphCanvas");
  const info = document.querySelector("#graphInfo");
  const ctx = canvas.getContext("2d");
  const prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nodes = data.graph.nodes.map((node, index) => {
    const angle = (index / data.graph.nodes.length) * Math.PI * 2;
    const ring = 150 + (index % 9) * 24;
    return {
      ...node,
      x: Math.cos(angle) * ring,
      y: Math.sin(angle) * ring,
      vx: 0,
      vy: 0,
      r: 4 + Math.min(9, node.degree * 0.5)
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = data.graph.edges
    .map((edge) => ({ ...edge, sourceNode: nodeById.get(edge.source), targetNode: nodeById.get(edge.target) }))
    .filter((edge) => edge.sourceNode && edge.targetNode);

  let width = 1;
  let height = 1;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let hover = null;
  let dragged = null;
  let tickCount = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = Math.max(320, rect.width);
    height = Math.max(440, rect.height);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    panX = width / 2;
    panY = height / 2;
  }

  function screenToGraph(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - panX) / zoom,
      y: (event.clientY - rect.top - panY) / zoom
    };
  }

  function nearest(point) {
    let best = null;
    let bestDistance = Infinity;
    nodes.forEach((node) => {
      const distance = Math.hypot(node.x - point.x, node.y - point.y);
      if (distance < bestDistance && distance < Math.max(18, node.r + 8)) {
        best = node;
        bestDistance = distance;
      }
    });
    return best;
  }

  function unitAnchor(unitId) {
    const order = data.units.findIndex((unit) => unit.id === unitId);
    const angle = ((order < 0 ? 0 : order) / Math.max(1, data.units.length)) * Math.PI * 2;
    return { x: Math.cos(angle) * 230, y: Math.sin(angle) * 170 };
  }

  function simulate() {
    if (prefersReduced && tickCount > 12) return;
    tickCount += 1;
    const alpha = Math.max(0.02, 0.25 * Math.exp(-tickCount / 280));

    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        const dx = a.x - b.x || 0.01;
        const dy = a.y - b.y || 0.01;
        const distance = Math.max(20, Math.hypot(dx, dy));
        const force = (1000 / (distance * distance)) * alpha;
        a.vx += (dx / distance) * force;
        a.vy += (dy / distance) * force;
        b.vx -= (dx / distance) * force;
        b.vy -= (dy / distance) * force;
      }
    }

    edges.forEach((edge) => {
      const a = edge.sourceNode;
      const b = edge.targetNode;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const force = (distance - 96) * 0.003 * alpha;
      a.vx += (dx / distance) * force;
      a.vy += (dy / distance) * force;
      b.vx -= (dx / distance) * force;
      b.vy -= (dy / distance) * force;
    });

    nodes.forEach((node) => {
      if (node === dragged) return;
      const anchor = unitAnchor(node.unitId);
      node.vx += (anchor.x - node.x) * 0.0009 * alpha;
      node.vy += (anchor.y - node.y) * 0.0009 * alpha;
      node.vx += -node.x * 0.0007;
      node.vy += -node.y * 0.0007;
      node.vx *= 0.88;
      node.vy *= 0.88;
      node.x += node.vx;
      node.y += node.vy;
    });
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    ctx.lineWidth = 1 / zoom;
    edges.forEach((edge) => {
      ctx.beginPath();
      ctx.moveTo(edge.sourceNode.x, edge.sourceNode.y);
      ctx.lineTo(edge.targetNode.x, edge.targetNode.y);
      ctx.strokeStyle = "rgba(20,23,31,0.15)";
      ctx.stroke();
    });

    nodes.forEach((node) => {
      const active = node === hover;
      const important = [data.homePageId, data.mapPageId, data.dependencyPageId, data.proofPageId, data.counterPageId].includes(node.id);
      ctx.beginPath();
      ctx.rect(node.x - node.r, node.y - node.r, node.r * 2, node.r * 2);
      ctx.fillStyle = unitColors[node.unitId] || unitColors.other;
      ctx.globalAlpha = active ? 1 : 0.88;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (active || important || node.degree > 34) {
        ctx.font = `${active ? 800 : 700} ${12 / zoom}px Heebo, system-ui, sans-serif`;
        ctx.fillStyle = "#14171f";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(node.title.slice(0, 26), node.x, node.y + node.r + 6);
      }
    });

    ctx.restore();
  }

  function frame() {
    if (currentView !== "graph") return;
    simulate();
    draw();
    graphFrame = requestAnimationFrame(frame);
  }

  canvas.addEventListener("pointermove", (event) => {
    const point = screenToGraph(event);
    if (dragged) {
      dragged.x = point.x;
      dragged.y = point.y;
      dragged.vx = 0;
      dragged.vy = 0;
      return;
    }
    hover = nearest(point);
    canvas.style.cursor = hover ? "pointer" : "grab";
    if (hover) {
      const page = pages.get(hover.id);
      info.querySelector("h2").textContent = page.title;
      info.querySelector("p").textContent = `${page.unitName} · ${page.links.length} יוצאים · ${page.backlinks.length} נכנסים`;
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    dragged = nearest(screenToGraph(event));
    if (dragged) canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointerup", (event) => {
    if (dragged) {
      canvas.releasePointerCapture(event.pointerId);
      dragged = null;
    }
  });

  canvas.addEventListener("click", (event) => {
    const node = nearest(screenToGraph(event));
    if (node) openPage(node.id);
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      zoom = Math.min(2.2, Math.max(0.45, zoom + direction * 0.08));
    },
    { passive: false }
  );

  resize();
  window.addEventListener("resize", resize, { passive: true });
  frame();
}

function runSearch(query) {
  const term = normalize(query);
  if (term.length < 2) {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
    return;
  }

  const results = data.pages
    .map((page) => {
      const haystack = normalize(`${page.title} ${page.aliases.join(" ")} ${page.path} ${page.searchText}`);
      const titleHit = normalize(page.title).includes(term) ? 8 : 0;
      const pathHit = normalize(page.path).includes(term) ? 3 : 0;
      const bodyHit = haystack.includes(term) ? 1 : 0;
      return { page, score: titleHit + pathHit + bodyHit };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title, "he"))
    .slice(0, 12);

  searchResults.hidden = false;
  searchResults.innerHTML = results.length
    ? results
        .map(
          ({ page }) => `<button class="result-button" type="button" data-open="${page.id}">
            <strong>${escapeHtml(page.title)}</strong>
            <small>${escapeHtml(page.path)}</small>
          </button>`
        )
        .join("")
    : `<div class="result-button"><strong>אין תוצאות</strong><small>נסו מושג קצר יותר.</small></div>`;
}

function typesetMath() {
  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([app]).catch(() => {});
  }
}

function renderMermaid() {
  if (!window.mermaid) return;
  try {
    window.mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "neutral" });
    window.mermaid.run({ nodes: app.querySelectorAll(".mermaid") });
  } catch {
    // Mermaid optional. Raw source stays visible.
  }
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => routeTo(button.dataset.view));
});

searchInput.addEventListener("input", (event) => runSearch(event.target.value));

searchResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open]");
  if (!button) return;
  searchInput.value = "";
  searchResults.hidden = true;
  openPage(button.dataset.open);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Escape") {
    searchResults.hidden = true;
    searchInput.blur();
  }
});

window.addEventListener("hashchange", renderRoute);

renderUnitNav();
renderRoute();
