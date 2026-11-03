/* כספת אינפי 1 — client app.
   Hash routes: #/  #/page/<id>[/<section>]  #/index  #/graph  #/about */

const data = window.COURSE_DATA;
const app = document.querySelector("#app");
const mainEl = document.querySelector("#main");

if (!data) {
  app.innerHTML = `<section class="empty-state"><h1>התוכן לא נטען</h1><p>הקובץ assets/content.js חסר. הריצו npm run build.</p></section>`;
  throw new Error("COURSE_DATA missing");
}

const pages = new Map(data.pages.map((page) => [page.id, page]));
const groups = data.navGroups || [];
const groupById = new Map(groups.map((group) => [group.id, group]));
const SITE_NAME = "כספת אינפי 1";

const ICONS = {
  chevron: '<path d="M15 6l-6 6 6 6" />',
  prev: '<path d="M5 12h14M13 6l6 6-6 6" />',
  next: '<path d="M19 12H5M11 6l-6 6 6 6" />',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />',
  clock: '<circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />',
  search: '<circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" />',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />',
  graph: '<circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="8" r="2.5" /><circle cx="9" cy="18" r="2.5" /><path d="M8.2 7.2l7.6.6M7 8.3l1.4 7.3M16.3 9.9l-5.6 6.4" />'
};

function icon(name, className = "icon") {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ""}</svg>`;
}

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
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: preferences just are not remembered */
    }
  }
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function groupColor(groupId) {
  return `var(--c-${groupId || "vault"})`;
}

function pageLabel(page) {
  return /^שער /.test(page.title) ? "סקירת היחידה" : page.navTitle;
}

function groupHeading(group) {
  if (!group) return "";
  return group.number ? `יחידה ${group.number} · ${group.subtitle}` : group.title;
}

function pageHref(page, section = "") {
  return `#/page/${page.id}${section ? `/${encodeURIComponent(section)}` : ""}`;
}

// ---------------------------------------------------------------------------
// Preferences: theme and text size
// ---------------------------------------------------------------------------

const root = document.documentElement;
const themeButton = document.querySelector("[data-theme-toggle]");
const sizeButton = document.querySelector("[data-text-size-toggle]");
const sizeLabel = document.querySelector("#textSizeLabel");
const SIZE_NAMES = { s: "קטן", m: "רגיל", l: "גדול" };

function syncPreferenceControls() {
  const dark = root.dataset.theme === "dark";
  themeButton.setAttribute("aria-pressed", String(dark));
  themeButton.title = dark ? "מעבר למצב בהיר" : "מעבר למצב כהה";
  const size = root.dataset.textSize || "m";
  sizeLabel.textContent = `גודל טקסט: ${SIZE_NAMES[size]}. לחיצה משנה את הגודל.`;
  sizeButton.title = `גודל טקסט: ${SIZE_NAMES[size]}`;
}

themeButton.addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  store.set("infi-theme", root.dataset.theme);
  syncPreferenceControls();
  renderMermaid(true);
  if (currentRoute.view === "graph") graph?.redraw();
});

sizeButton.addEventListener("click", () => {
  const order = ["s", "m", "l"];
  const next = order[(order.indexOf(root.dataset.textSize || "m") + 1) % order.length];
  root.dataset.textSize = next;
  store.set("infi-text-size", next);
  syncPreferenceControls();
  markWideFormulas();
});

syncPreferenceControls();

// ---------------------------------------------------------------------------
// Recently viewed pages
// ---------------------------------------------------------------------------

function recentPages() {
  try {
    return (JSON.parse(store.get("infi-recent") || "[]") || []).filter((id) => pages.has(id));
  } catch {
    return [];
  }
}

function rememberPage(id) {
  const list = [id, ...recentPages().filter((item) => item !== id)].slice(0, 6);
  store.set("infi-recent", JSON.stringify(list));
}

// ---------------------------------------------------------------------------
// Course navigation tree and mobile drawer
// ---------------------------------------------------------------------------

const tree = document.querySelector("[data-course-tree]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const menuClose = document.querySelector("[data-menu-close]");
const backdrop = document.querySelector("[data-nav-backdrop]");
const courseNav = document.querySelector("#courseNav");
const expanded = new Set(JSON.parse(sessionStorageGet("infi-expanded") || "[]"));

function sessionStorageGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveExpanded() {
  try {
    sessionStorage.setItem("infi-expanded", JSON.stringify(Array.from(expanded)));
  } catch {
    /* ignore */
  }
}

function renderTree() {
  tree.innerHTML =
    groups
      .map((group) => {
        const listId = `tree-${group.id}`;
        const open = expanded.has(group.id);
        const badge = group.number ?? (group.id === "start" ? "★" : group.id === "supplement" ? "+" : "·");
        const items = group.pageIds
          .map((id) => pages.get(id))
          .filter(Boolean)
          .map(
            (page) => `<li><a href="${pageHref(page)}" data-id="${page.id}">
              <span>${escapeHtml(pageLabel(page))}</span>
              ${page.hasExamTheorem ? `${icon("star", "icon tree-star")}<span class="visually-hidden">(כולל משפט מהרשימה לבחינה)</span>` : ""}
            </a></li>`
          )
          .join("");
        return `<div class="tree-group" data-group="${group.id}" style="--c:${groupColor(group.id)}">
          <button class="tree-toggle" type="button" aria-expanded="${open}" aria-controls="${listId}" data-group-toggle="${group.id}">
            <span class="tree-num" aria-hidden="true">${badge}</span>
            <span class="tree-label"><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml(group.subtitle || "")}</small></span>
            ${icon("chevron", "icon tree-chevron")}
          </button>
          <ul class="tree-list" id="${listId}" ${open ? "" : "hidden"}>${items}</ul>
        </div>`;
      })
      .join("") + `<p class="tree-legend">${icon("star", "icon tree-star")} כולל משפט מהרשימה לבחינה</p>`;
}

tree.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-group-toggle]");
  if (toggle) {
    const id = toggle.dataset.groupToggle;
    const list = document.getElementById(`tree-${id}`);
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    list.hidden = !open;
    if (open) expanded.add(id);
    else expanded.delete(id);
    saveExpanded();
    return;
  }
  if (event.target.closest("a")) closeDrawer(false);
});

function syncTree(activeId) {
  const page = pages.get(activeId);
  if (page?.groupId && !expanded.has(page.groupId)) {
    expanded.add(page.groupId);
    saveExpanded();
    const toggle = tree.querySelector(`[data-group-toggle="${page.groupId}"]`);
    if (toggle) {
      toggle.setAttribute("aria-expanded", "true");
      document.getElementById(`tree-${page.groupId}`).hidden = false;
    }
  }
  let current = null;
  tree.querySelectorAll("a[data-id]").forEach((link) => {
    if (link.dataset.id === activeId) {
      link.setAttribute("aria-current", "page");
      current = link;
    } else {
      link.removeAttribute("aria-current");
    }
  });
  if (current && !drawerOpen()) {
    const navBox = courseNav.getBoundingClientRect();
    const linkBox = current.getBoundingClientRect();
    if (linkBox.top < navBox.top || linkBox.bottom > navBox.bottom) {
      current.scrollIntoView({ block: "center" });
    }
  }
}

const drawerQuery = window.matchMedia("(max-width: 1060px)");
let lastFocusBeforeDrawer = null;

function drawerOpen() {
  return document.body.classList.contains("nav-open");
}

function setInert(on) {
  for (const el of [document.querySelector(".site-header"), mainEl, document.querySelector(".site-footer")]) {
    if (!el) continue;
    if (on) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
  }
}

function openDrawer() {
  if (!drawerQuery.matches) return;
  lastFocusBeforeDrawer = document.activeElement;
  document.body.classList.add("nav-open");
  backdrop.hidden = false;
  menuToggle.setAttribute("aria-expanded", "true");
  courseNav.setAttribute("role", "dialog");
  courseNav.setAttribute("aria-modal", "true");
  setInert(true);
  const target = tree.querySelector('a[aria-current="page"]') || menuClose;
  requestAnimationFrame(() => target.focus());
}

function closeDrawer(restoreFocus = true) {
  if (!drawerOpen()) return;
  document.body.classList.remove("nav-open");
  backdrop.hidden = true;
  menuToggle.setAttribute("aria-expanded", "false");
  courseNav.removeAttribute("role");
  courseNav.removeAttribute("aria-modal");
  setInert(false);
  if (restoreFocus && lastFocusBeforeDrawer) lastFocusBeforeDrawer.focus();
}

menuToggle.addEventListener("click", () => (drawerOpen() ? closeDrawer() : openDrawer()));
menuClose.addEventListener("click", () => closeDrawer());
backdrop.addEventListener("click", () => closeDrawer());
drawerQuery.addEventListener("change", () => closeDrawer(false));

courseNav.addEventListener("keydown", (event) => {
  if (!drawerOpen()) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeDrawer();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = Array.from(courseNav.querySelectorAll("a[href], button:not([disabled])")).filter(
    (el) => el.offsetParent !== null
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// ---------------------------------------------------------------------------
// Search (WAI-ARIA combobox with a listbox popup)
// ---------------------------------------------------------------------------

const header = document.querySelector(".site-header");
const searchInput = document.querySelector("#siteSearch");
const searchPanel = document.querySelector("#searchResults");
const searchStatus = document.querySelector("[data-search-status]");
const searchOpenButton = document.querySelector("[data-search-open]");
const searchCloseButton = document.querySelector("[data-search-close]");
let searchResults = [];
let activeResult = -1;

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[֑-ׇ]/g, "")
    .toLocaleLowerCase("he");
}

function plainText(value) {
  return String(value || "")
    .replace(/\$+/g, "")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}^_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const searchIndex = data.pages.map((page) => {
  const text = plainText(page.searchText);
  return {
    page,
    text,
    title: normalize(`${page.navTitle} ${page.title}`),
    aliases: normalize((page.aliases || []).join(" ")),
    body: normalize(text)
  };
});

function termVariants(term) {
  const variants = [term];
  if (term.length > 3 && /^[והבכלמש]/.test(term)) variants.push(term.slice(1));
  return variants;
}

function runSearch(query) {
  const terms = normalize(query).split(/\s+/).filter((term) => term.length >= 2);
  if (!terms.length) return [];
  const phrase = normalize(query).trim();
  const scored = [];
  for (const entry of searchIndex) {
    let score = 0;
    let matched = true;
    for (const term of terms) {
      let hit = 0;
      for (const variant of termVariants(term)) {
        if (entry.title.includes(variant)) hit = Math.max(hit, 12);
        else if (entry.aliases.includes(variant)) hit = Math.max(hit, 7);
        else if (entry.body.includes(variant)) hit = Math.max(hit, 2);
      }
      if (!hit) {
        matched = false;
        break;
      }
      score += hit;
    }
    if (!matched) continue;
    if (entry.title.startsWith(phrase)) score += 10;
    else if (entry.title.includes(phrase)) score += 5;
    if (entry.page.groupId === "vault") score -= 6;
    scored.push({ entry, score, terms });
  }
  return scored.sort((a, b) => b.score - a.score || a.entry.page.navTitle.localeCompare(b.entry.page.navTitle, "he")).slice(0, 10);
}

function highlight(text, terms) {
  let html = escapeHtml(text);
  const sorted = Array.from(new Set(terms.flatMap(termVariants))).sort((a, b) => b.length - a.length);
  for (const term of sorted) {
    const pattern = new RegExp(escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    html = html.replace(pattern, (match) => `<mark>${match}</mark>`);
  }
  return html;
}

function snippetFor(entry, terms) {
  const body = entry.body;
  let index = -1;
  for (const term of terms) {
    for (const variant of termVariants(term)) {
      index = body.indexOf(variant);
      if (index >= 0) break;
    }
    if (index >= 0) break;
  }
  const text = entry.text;
  if (index < 0) return text.slice(0, 140);
  const start = Math.max(0, index - 50);
  return `${start > 0 ? "…" : ""}${text.slice(start, start + 150)}…`;
}

function renderSearch() {
  const query = searchInput.value;
  if (normalize(query).trim().length < 2) {
    closeSearchPanel();
    return;
  }
  searchResults = runSearch(query);
  activeResult = -1;
  if (!searchResults.length) {
    searchPanel.innerHTML = `<div class="search-empty" role="presentation"><strong>לא נמצאו תוצאות</strong>נסו מילה אחרת, או חפשו לפי מספר משפט, למשל 5.29.</div>`;
  } else {
    searchPanel.innerHTML =
      searchResults
        .map(({ entry, terms }, index) => {
          const page = entry.page;
          const group = groupById.get(page.groupId);
          return `<div class="search-option" role="option" id="search-opt-${index}" data-id="${page.id}" aria-selected="${index === activeResult}">
            <span class="search-option-title">${highlight(page.navTitle, terms)}</span>
            <span class="search-option-meta">${escapeHtml(groupHeading(group))}</span>
            <span class="search-option-snippet">${highlight(snippetFor(entry, terms), terms)}</span>
          </div>`;
        })
        .join("") +
      `<div class="search-footer" role="presentation" aria-hidden="true"><span><kbd>↑</kbd> <kbd>↓</kbd> מעבר</span><span><kbd>Enter</kbd> פתיחה</span><span><kbd>Esc</kbd> סגירה</span></div>`;
  }
  searchPanel.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
  updateActiveResult();
  searchStatus.textContent = searchResults.length ? `נמצאו ${searchResults.length} תוצאות` : "לא נמצאו תוצאות";
}

function updateActiveResult() {
  searchPanel.querySelectorAll(".search-option").forEach((option, index) => {
    option.setAttribute("aria-selected", String(index === activeResult));
    if (index === activeResult) option.scrollIntoView({ block: "nearest" });
  });
  if (activeResult >= 0) searchInput.setAttribute("aria-activedescendant", `search-opt-${activeResult}`);
  else searchInput.removeAttribute("aria-activedescendant");
}

function closeSearchPanel() {
  searchPanel.hidden = true;
  searchPanel.innerHTML = "";
  searchResults = [];
  activeResult = -1;
  searchInput.setAttribute("aria-expanded", "false");
  searchInput.removeAttribute("aria-activedescendant");
}

function openResult(id) {
  if (!id) return;
  searchInput.value = "";
  closeSearchPanel();
  closeMobileSearch(false);
  location.hash = pageHref(pages.get(id));
}

function openMobileSearch() {
  header.classList.add("search-active");
  searchInput.focus();
}

function closeMobileSearch(restoreFocus = true) {
  if (!header.classList.contains("search-active")) return;
  header.classList.remove("search-active");
  if (restoreFocus) searchOpenButton.focus();
}

searchInput.addEventListener("input", renderSearch);
searchInput.addEventListener("focus", () => {
  if (searchInput.value.trim().length >= 2) renderSearch();
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (!searchResults.length) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    activeResult = (activeResult + step + searchResults.length) % searchResults.length;
    updateActiveResult();
  } else if (event.key === "Enter") {
    // Enter opens the highlighted result, or the best match if none is highlighted.
    if (searchResults.length) {
      event.preventDefault();
      openResult(searchResults[Math.max(0, activeResult)].entry.page.id);
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    if (!searchPanel.hidden) closeSearchPanel();
    else if (searchInput.value) searchInput.value = "";
    else {
      closeMobileSearch();
      searchInput.blur();
    }
  }
});

searchPanel.addEventListener("mousedown", (event) => event.preventDefault());
searchPanel.addEventListener("click", (event) => {
  const option = event.target.closest("[data-id]");
  if (option) openResult(option.dataset.id);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-search]") && !event.target.closest("[data-search-open]")) {
    closeSearchPanel();
    if (!searchInput.value) closeMobileSearch(false);
  }
});

searchOpenButton.addEventListener("click", openMobileSearch);
searchCloseButton.addEventListener("click", () => {
  searchInput.value = "";
  closeSearchPanel();
  closeMobileSearch();
});

document.addEventListener("keydown", (event) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  const shortcut = (event.key === "/" && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k");
  if (shortcut) {
    event.preventDefault();
    if (getComputedStyle(searchOpenButton).display !== "none") openMobileSearch();
    else searchInput.focus();
    searchInput.select();
  }
  if (event.key === "Escape" && drawerOpen()) closeDrawer();
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

let currentRoute = { view: "" };
let graph = null;
let tocObserver = null;

function parseRoute() {
  const hash = location.hash;
  if (!hash || hash === "#" || hash === "#/") return { view: "home" };
  const parts = hash
    .slice(2)
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  return { view: parts[0] || "home", id: parts[1] || "", section: parts[2] || "" };
}

function setTitle(text) {
  document.title = text ? `${text} · ${SITE_NAME}` : `${SITE_NAME} · חשבון אינפיניטסימלי 1`;
}

function updatePrimaryNav(view) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function route({ initial = false } = {}) {
  const hash = location.hash;
  // Non-route fragments (e.g. the skip link "#main") must not re-render.
  if (hash && !hash.startsWith("#/") && hash !== "#") return;

  const next = parseRoute();
  const samePage = next.view === "page" && currentRoute.view === "page" && next.id === currentRoute.id;
  closeSearchPanel();
  closeDrawer(false);

  if (samePage) {
    currentRoute = next;
    scrollToSection(next.section, true);
    return;
  }

  cleanupView();
  currentRoute = next;
  document.body.dataset.view = next.view;

  if (next.view === "page" && pages.has(next.id)) renderPage(pages.get(next.id), next.section);
  else if (next.view === "index") renderIndex();
  else if (next.view === "graph") renderGraph();
  else if (next.view === "about" || next.view === "credits") renderAbout();
  else if (next.view === "home") renderHome();
  else renderNotFound();

  updatePrimaryNav(next.view === "page" ? "" : next.view);
  syncTree(next.view === "page" ? next.id : "");
  if (!next.section) window.scrollTo(0, 0);
  if (!initial) {
    const heading = app.querySelector("h1");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }
  updateScrollUi();
}

function cleanupView() {
  if (graph) {
    graph.destroy();
    graph = null;
  }
  if (tocObserver) {
    tocObserver.disconnect();
    tocObserver = null;
  }
  window.MathJax?.typesetClear?.([app]);
}

window.addEventListener("hashchange", () => route());

document.querySelector("[data-skip]").addEventListener("click", (event) => {
  event.preventDefault();
  const heading = app.querySelector("h1");
  const target = heading || mainEl;
  target.setAttribute("tabindex", "-1");
  target.focus();
  target.scrollIntoView({ block: "start" });
});

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function renderHome() {
  setTitle("");
  const unitGroups = groups.filter((group) => group.number || group.id === "supplement");
  const start = groupById.get("start");
  const exam = pages.get(data.examListPageId);
  const map = pages.get(data.mapPageId);
  const firstUnit = unitGroups[0] ? pages.get(unitGroups[0].gatewayId) : null;
  const recent = recentPages().map((id) => pages.get(id));
  const last = recent[0];

  const unitCards = unitGroups
    .map((group) => {
      const gateway = pages.get(group.gatewayId);
      const theorems = group.pageIds.filter((id) => pages.get(id)?.hasExamTheorem).length;
      return `<a class="unit-card" href="${pageHref(gateway)}" style="--c:${groupColor(group.id)}">
        <span class="unit-card-top"><span class="unit-card-num">${group.number ? `יחידה ${group.number}` : "העשרה"}</span><span>${escapeHtml(group.volume || "אינפי 1מ")}</span></span>
        <h3>${escapeHtml(group.number ? group.subtitle : group.title)}</h3>
        <p>${gateway?.summaryHtml || ""}</p>
        <span class="unit-card-foot">
          <span>${icon("list")} ${group.pageIds.length} פתקים</span>
          ${theorems ? `<span>${icon("star")} ${theorems} עם משפטים לבחינה</span>` : ""}
        </span>
      </a>`;
    })
    .join("");

  const toolDescriptions = {
    "מפת הקורס": "כל היחידות והפתקים בעמוד אחד, לפי סדר הספרים.",
    "תיקונים לספרי הקורס": "כל 40 התיקונים הרשמיים לכרכים א–ג.",
    "תבניות הוכחה": "המהלכים שחוזרים בהוכחות: ε, sup, קטע סגור ונגזרת.",
    "מפת תלות משפטים": "איזה משפט נשען על איזה, מהשלמות ועד טיילור.",
    "אינדקס דוגמאות נגד": "הדוגמאות שמפריכות הכללות שגויות, לפי נושא.",
    "כרטיסי חזרה": "שאלות ותשובות קצרות לחזרה לפני הבחינה.",
    "מפת מוח": "מבט על הקורס כולו כמפה אחת.",
    "כספת העל": "שער הכניסה המקורי של הכספת.",
    "מקורות וחומרי גלם": "מאיפה כל פרט בכספת מגיע."
  };
  const tools = (start?.pageIds || [])
    .map((id) => pages.get(id))
    .filter((page) => page && page.id !== data.examListPageId)
    .map((page) => {
      const key = Object.keys(toolDescriptions).find((k) => page.navTitle.includes(k));
      return `<a class="tool-card" href="${pageHref(page)}"><strong>${escapeHtml(page.navTitle)}</strong><span>${escapeHtml(toolDescriptions[key] || "")}</span></a>`;
    })
    .join("");

  const panel = last
    ? `<h2>המשך מאיפה שעצרת</h2>
       <a class="continue-link" href="${pageHref(last)}"><small>${escapeHtml(groupHeading(groupById.get(last.groupId)))}</small><strong>${escapeHtml(last.navTitle)}</strong></a>
       ${recent.length > 1 ? `<ul class="recent-list">${recent.slice(1, 5).map((page) => `<li><a href="${pageHref(page)}">${escapeHtml(page.navTitle)}</a></li>`).join("")}</ul>` : ""}`
    : `<h2>איך להשתמש באתר</h2>
       <ol class="steps">
         <li>בוחרים יחידה מהתפריט או מהכרטיסים למטה. כל יחידה נפתחת בסקירה ובציר לימוד.</li>
         <li>בכל פתק יש מקור בספר, הגדרות ומשפטים לפי החוברת, הוכחות ודוגמאות.</li>
         <li>מחפשים מושג או מספר משפט, למשל 5.29, בשורת החיפוש. במחשב המקש <kbd>/</kbd> פותח אותה.</li>
       </ol>`;

  app.innerHTML = `
    <div class="home">
      <section class="hero" aria-labelledby="homeTitle">
        <div>
          <p class="kicker">${icon("book")} קורס 20474 · האוניברסיטה הפתוחה</p>
          <h1 id="homeTitle">חשבון אינפיניטסימלי 1</h1>
          <p class="hero-lead">סיכומים מסודרים לפי שמונה יחידות הקורס: הגדרות ומשפטים לפי חוברת הקורס, הוכחות מלאות ל־35 המשפטים שברשימה לבחינה, דוגמאות נגד ומפות לחזרה.</p>
          <div class="hero-actions">
            ${firstUnit ? `<a class="button button-primary" href="${pageHref(firstUnit)}">להתחיל ביחידה 1</a>` : ""}
            ${exam ? `<a class="button" href="${pageHref(exam)}">${icon("star")} 35 המשפטים לבחינה</a>` : ""}
            ${map ? `<a class="button" href="${pageHref(map)}">מפת הקורס</a>` : ""}
          </div>
        </div>
        <aside class="hero-panel" aria-label="${last ? "המשך קריאה" : "הסבר קצר"}">${panel}</aside>
      </section>

      <section aria-labelledby="unitsTitle">
        <div class="section-head">
          <h2 id="unitsTitle">יחידות הקורס</h2>
          <p>שלושה כרכים, שמונה יחידות ונושאי העשרה</p>
        </div>
        <div class="unit-grid">${unitCards}</div>
      </section>

      ${
        exam
          ? `<section class="exam-band" aria-labelledby="examTitle">
              <span class="exam-band-icon" aria-hidden="true">${icon("star")}</span>
              <div>
                <h2 id="examTitle">35 המשפטים לבחינה</h2>
                <p>בבחינה מבקשים להוכיח 2–3 משפטים מהרשימה הרשמית. לכל משפט יש בכספת הוכחה מלאה עם כל הנימוקים.</p>
              </div>
              <a class="button" href="${pageHref(exam)}">לרשימה המלאה</a>
            </section>`
          : ""
      }

      <section aria-labelledby="toolsTitle">
        <div class="section-head">
          <h2 id="toolsTitle">כלי לימוד וחזרה</h2>
          <p>מפות, תבניות ודוגמאות שחוצות את היחידות</p>
        </div>
        <div class="tool-grid">${tools}</div>
      </section>
    </div>`;
  typesetMath();
}

function renderPage(page, section) {
  setTitle(page.navTitle);
  rememberPage(page.id);
  const group = groupById.get(page.groupId);
  const gateway = group?.gatewayId ? pages.get(group.gatewayId) : null;
  const prev = pages.get(page.prevId);
  const next = pages.get(page.nextId);
  const backlinks = (page.backlinks || [])
    .map((id) => pages.get(id))
    .filter((item) => item && item.groupId !== "vault");

  const crumbs = [`<li><a href="#/">בית</a></li>`];
  if (group) {
    const crumbTarget = gateway && gateway.id !== page.id ? `<a href="${pageHref(gateway)}">${escapeHtml(groupHeading(group))}</a>` : `<span>${escapeHtml(groupHeading(group))}</span>`;
    crumbs.push(`<li>${crumbTarget}</li>`);
  }
  crumbs.push(`<li aria-current="page">${escapeHtml(pageLabel(page))}</li>`);

  const meta = [
    group ? `<span class="chip" style="--c:${groupColor(group.id)}"><span class="chip-dot" aria-hidden="true"></span>${escapeHtml(group.number ? `יחידה ${group.number}` : group.title)}</span>` : "",
    page.unitVolume ? `<span class="chip">${icon("book")} ${escapeHtml(page.unitVolume)}</span>` : "",
    `<span class="chip">${icon("clock")} כ־${page.readMinutes} דקות קריאה</span>`,
    page.hasExamTheorem && data.examListPageId ? `<a class="chip chip-exam" href="${pageHref(pages.get(data.examListPageId))}">${icon("star")} כולל משפט מהרשימה לבחינה</a>` : ""
  ].join("");

  app.innerHTML = `
    <div class="page-grid">
      <article class="note" aria-labelledby="pageTitle">
        <header class="note-head">
          <nav class="breadcrumbs" aria-label="מיקום בקורס"><ol>${crumbs.join("")}</ol></nav>
          <h1 id="pageTitle" class="note-title">${page.titleHtml || escapeHtml(page.title)}</h1>
          <div class="note-meta">${meta}</div>
          ${page.aliases?.length ? `<p class="note-aliases">נקרא גם: ${page.aliases.map(escapeHtml).join(" · ")}</p>` : ""}
        </header>
        <details class="toc-inline" data-toc-inline hidden>
          <summary>בדף הזה ${icon("chevron")}</summary>
          <nav aria-label="תוכן הדף"><ol data-toc-list></ol></nav>
        </details>
        <div class="prose">${page.html}</div>
        <footer class="note-foot">
          ${
            prev || next
              ? `<nav class="pager" aria-label="הפתק הקודם והבא">
                  ${prev ? `<a class="pager-prev" href="${pageHref(prev)}" rel="prev"><small>${icon("prev")} הקודם</small><strong>${escapeHtml(prev.navTitle)}</strong></a>` : ""}
                  ${next ? `<a class="pager-next" href="${pageHref(next)}" rel="next"><small>הבא ${icon("next")}</small><strong>${escapeHtml(next.navTitle)}</strong></a>` : ""}
                </nav>`
              : ""
          }
          ${
            backlinks.length
              ? `<section class="backlinks" aria-labelledby="backlinksTitle">
                  <h2 id="backlinksTitle">פתקים שמפנים לכאן</h2>
                  <ul>${backlinks.map((item) => `<li><a class="chip" href="${pageHref(item)}">${escapeHtml(item.navTitle)}</a></li>`).join("")}</ul>
                </section>`
              : ""
          }
        </footer>
      </article>
      <aside class="toc" aria-label="בדף הזה" data-toc hidden>
        <p class="toc-title">בדף הזה</p>
        <nav aria-label="תוכן הדף"><ol data-toc-list></ol></nav>
      </aside>
    </div>`;

  decorateHeadings(page);
  buildToc(page);
  typesetMath(() => scrollToSection(section, false));
  renderMermaid();
  if (section) scrollToSection(section, false);
}

function decorateHeadings(page) {
  app.querySelectorAll(".prose h2[id], .prose h3[id]").forEach((heading) => {
    const link = document.createElement("a");
    link.className = "heading-link";
    link.href = pageHref(page, heading.id);
    link.innerHTML = `${icon("link")}<span class="visually-hidden">קישור ישיר לסעיף</span>`;
    heading.append(link);
  });
}

function buildToc(page) {
  const headings = Array.from(app.querySelectorAll(".prose h2[id], .prose h3[id]"));
  if (headings.filter((h) => h.tagName === "H2").length < 3) return;
  const items = headings
    .map((heading) => {
      const clone = heading.cloneNode(true);
      clone.querySelectorAll(".heading-link, .badge").forEach((el) => el.remove());
      const sub = heading.tagName === "H3" ? ' class="toc-sub"' : "";
      return `<li${sub}><a href="${pageHref(page, heading.id)}" data-toc-target="${heading.id}">${clone.innerHTML.trim()}</a></li>`;
    })
    .join("");
  app.querySelectorAll("[data-toc-list]").forEach((list) => (list.innerHTML = items));
  app.querySelector("[data-toc]").hidden = false;
  app.querySelector("[data-toc-inline]").hidden = false;

  app.querySelectorAll("[data-toc-target]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      history.replaceState(null, "", link.getAttribute("href"));
      currentRoute.section = link.dataset.tocTarget;
      scrollToSection(link.dataset.tocTarget, true);
      app.querySelector("[data-toc-inline]")?.removeAttribute("open");
    });
  });

  const tocLinks = Array.from(app.querySelectorAll(".toc [data-toc-target]"));
  if (!("IntersectionObserver" in window)) return;
  const visible = new Map();
  tocObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
      const active = headings.find((heading) => visible.get(heading.id)) || null;
      if (!active) return;
      tocLinks.forEach((link) => {
        if (link.dataset.tocTarget === active.id) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    },
    { rootMargin: `-${70}px 0px -65% 0px` }
  );
  headings.forEach((heading) => tocObserver.observe(heading));
}

function scrollToSection(section, smooth) {
  if (!section) return;
  const target = document.getElementById(section);
  if (!target) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: smooth && !reduce ? "smooth" : "auto", block: "start" });
  target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

function renderIndex() {
  setTitle("כל הפתקים");
  const total = data.pages.length;
  app.innerHTML = `
    <div class="index-page">
      <header class="page-intro">
        <h1>כל הפתקים</h1>
        <p>${total} פתקים, מסודרים לפי יחידות הקורס ובסדר הלימוד שלהן. ${icon("star", "icon tree-star")} מסמן פתק שיש בו משפט מהרשימה לבחינה.</p>
      </header>
      <label class="visually-hidden" for="indexFilter">סינון פתקים לפי שם</label>
      <div class="filter-field">
        ${icon("search")}
        <input id="indexFilter" type="search" autocomplete="off" placeholder="סינון לפי שם הפתק" />
      </div>
      <p class="filter-status" aria-live="polite" data-filter-status></p>
      ${groups
        .map((group) => {
          const items = group.pageIds
            .map((id) => pages.get(id))
            .filter(Boolean)
            .map(
              (page) => `<li data-filter-text="${escapeHtml(normalize(`${page.navTitle} ${page.title} ${(page.aliases || []).join(" ")}`))}">
                <a href="${pageHref(page)}">
                  <span>${escapeHtml(pageLabel(page))}</span>
                  ${page.hasExamTheorem ? `${icon("star", "icon tree-star")}<span class="visually-hidden">(כולל משפט מהרשימה לבחינה)</span>` : ""}
                  <span class="index-meta">${page.readMinutes} דק'</span>
                </a>
              </li>`
            )
            .join("");
          return `<section class="index-group" data-index-group style="--c:${groupColor(group.id)}">
            <h2>${escapeHtml(group.number ? `יחידה ${group.number} · ${group.subtitle}` : group.title)}<small>${escapeHtml(group.number ? group.volume : group.subtitle || "")} · ${group.pageIds.length} פתקים</small></h2>
            <ul class="index-list">${items}</ul>
          </section>`;
        })
        .join("")}
    </div>`;

  const input = app.querySelector("#indexFilter");
  const status = app.querySelector("[data-filter-status]");
  input.addEventListener("input", () => {
    const query = normalize(input.value).trim();
    let shown = 0;
    app.querySelectorAll("[data-index-group]").forEach((section) => {
      let groupShown = 0;
      section.querySelectorAll("[data-filter-text]").forEach((item) => {
        const match = !query || item.dataset.filterText.includes(query);
        item.hidden = !match;
        if (match) groupShown += 1;
      });
      section.hidden = groupShown === 0;
      shown += groupShown;
    });
    status.textContent = query ? (shown ? `${shown} פתקים מתאימים` : "אין פתקים מתאימים") : "";
  });
}

function renderAbout() {
  setTitle("מקורות וקרדיט");
  const sources = pages.get(groups.find((g) => g.id === "start")?.pageIds.find((id) => pages.get(id)?.navTitle.includes("מקורות")) || "");
  const corrections = data.pages.find((page) => page.navTitle.includes("תיקונים לספרי הקורס"));
  app.innerHTML = `
    <div class="about-page">
      <header class="page-intro">
        <h1>מקורות וקרדיט</h1>
        <p>על מה האתר מבוסס, ומה מותר ואסור לעשות עם החומר.</p>
      </header>
      <div class="prose">
        <h2 id="about-sources">מקורות</h2>
        <ul>
          <li>ספרי הקורס 20474 חשבון אינפיניטסימלי 1 של האוניברסיטה הפתוחה (ד"ר גיל אלון): כרך א (יחידות 1–3), כרך ב (יחידות 4–6), כרך ג (יחידות 7–8).</li>
          <li>חוברת ההגדרות והמשפטים של הקורס. מספרי ההגדרות והמשפטים בפתקים אומתו מולה.</li>
          <li>רשימת המשפטים לבחינה, וקובץ התיקונים הרשמי לספרים (עדכון 19.2.2024)${corrections ? ` — <a href="${pageHref(corrections)}">בפתק התיקונים</a>` : ""}.</li>
          <li>סיכום הרצאות אינפי 1מ של אביב צנזור (הטכניון), לנושאי ההעשרה.</li>
        </ul>
        ${sources ? `<p>פירוט מלא: <a href="${pageHref(sources)}">מקורות וחומרי גלם</a>.</p>` : ""}
        <h2 id="about-rights">זכויות</h2>
        <p>${escapeHtml(data.notice)}</p>
        <p>זה אינו אתר רשמי של האוניברסיטה הפתוחה, של הטכניון או של אביב צנזור. אין להעלות ציבורית ספרים, חוברות, קובצי PDF רשמיים, פתרונות רשמיים או הקלטות בלי הרשאה.</p>
        <h2 id="about-exam">שימוש בבחינה</h2>
        <p>בבחינה מצטטים רק משפטים, טענות, דוגמאות ושאלות מהספר. סיכומים חיצוניים, כולל הכספת הזו, אינם מקור שמותר לצטט בלי הוכחה.</p>
        <h2 id="about-build">עדכון אחרון</h2>
        <p>האתר נבנה מהכספת ב־${escapeHtml(new Date(data.generatedAt).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }))}.</p>
      </div>
    </div>`;
}

function renderNotFound() {
  setTitle("הדף לא נמצא");
  app.innerHTML = `
    <section class="empty-state">
      <h1>הדף לא נמצא</h1>
      <p>ייתכן שהקישור ישן או שהפתק הועבר. אפשר לחפש אותו בשורת החיפוש, או לחזור לדף הבית.</p>
      <p><a class="button button-primary" href="#/">לדף הבית</a> <a class="button" href="#/index">לכל הפתקים</a></p>
    </section>`;
}

function renderGraph() {
  setTitle("גרף קשרים");
  app.innerHTML = `
    <div class="graph-page">
      <header class="page-intro">
        <h1>גרף הקשרים בין הפתקים</h1>
        <p>כל ריבוע הוא פתק, וכל קו הוא קישור בין שני פתקים. גוררים פתק כדי להזיז אותו, גלגלת העכבר מגדילה, ולחיצה פותחת את הפתק. הרשימה המלאה נמצאת גם ב<a href="#/index">כל הפתקים</a>.</p>
      </header>
      <div class="graph-layout">
        <div class="graph-stage"><canvas id="graphCanvas" role="img" aria-label="גרף הקשרים בין ${data.graph.nodes.length} פתקים. לרשימה נגישה עברו לדף כל הפתקים."></canvas></div>
        <aside class="graph-side" aria-live="polite">
          <div data-graph-info>
            <h2>${data.graph.nodes.length} פתקים, ${data.graph.edges.length} קשרים</h2>
            <p>העבירו את העכבר מעל פתק כדי לראות את שמו ואת מספר הקישורים שלו.</p>
          </div>
          <ul class="legend">${groups.map((group) => `<li style="--c:${groupColor(group.id)}"><i></i>${escapeHtml(group.number ? `יחידה ${group.number} · ${group.subtitle}` : group.title)}</li>`).join("")}</ul>
        </aside>
      </div>
    </div>`;
  graph = mountGraph(app.querySelector("#graphCanvas"), app.querySelector("[data-graph-info]"));
}

function mountGraph(canvas, info) {
  const ctx = canvas.getContext("2d");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const groupOrder = groups.map((group) => group.id);
  const nodes = data.graph.nodes.map((node, index) => {
    const angle = (index / data.graph.nodes.length) * Math.PI * 2;
    const ring = 140 + (index % 9) * 22;
    return { ...node, x: Math.cos(angle) * ring, y: Math.sin(angle) * ring, vx: 0, vy: 0, r: 4 + Math.min(8, node.degree * 0.45) };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = data.graph.edges.map((edge) => ({ a: byId.get(edge.source), b: byId.get(edge.target) })).filter((e) => e.a && e.b);
  let width = 1;
  let height = 1;
  let zoom = 1;
  let hover = null;
  let dragged = null;
  let ticks = 0;
  let frame = 0;
  let colors = {};

  function readColors() {
    const css = getComputedStyle(document.documentElement);
    colors = { ink: css.getPropertyValue("--ink").trim(), line: css.getPropertyValue("--line-2").trim(), surface: css.getPropertyValue("--surface").trim() };
    for (const id of groupOrder) colors[id] = css.getPropertyValue(`--c-${id}`).trim() || colors.ink;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = Math.max(300, rect.width);
    height = Math.max(400, rect.height);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function toGraph(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left - width / 2) / zoom, y: (event.clientY - rect.top - height / 2) / zoom };
  }

  function nearest(point) {
    let best = null;
    let bestDistance = Infinity;
    for (const node of nodes) {
      const distance = Math.hypot(node.x - point.x, node.y - point.y);
      if (distance < bestDistance && distance < Math.max(16, node.r + 8)) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }

  function anchor(groupId) {
    const order = Math.max(0, groupOrder.indexOf(groupId));
    const angle = (order / Math.max(1, groupOrder.length)) * Math.PI * 2;
    return { x: Math.cos(angle) * 230, y: Math.sin(angle) * 170 };
  }

  function step() {
    ticks += 1;
    const alpha = Math.max(0.02, 0.25 * Math.exp(-ticks / 260));
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
    for (const { a, b } of edges) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const force = (distance - 96) * 0.003 * alpha;
      a.vx += (dx / distance) * force;
      a.vy += (dy / distance) * force;
      b.vx -= (dx / distance) * force;
      b.vy -= (dy / distance) * force;
    }
    for (const node of nodes) {
      if (node === dragged) continue;
      const target = anchor(node.groupId);
      node.vx += (target.x - node.x) * 0.0009 * alpha - node.x * 0.0007;
      node.vy += (target.y - node.y) * 0.0009 * alpha - node.y * 0.0007;
      node.vx *= 0.88;
      node.vy *= 0.88;
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);
    ctx.lineWidth = 1 / zoom;
    ctx.strokeStyle = colors.line;
    ctx.globalAlpha = 0.55;
    for (const { a, b } of edges) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const node of nodes) {
      const active = node === hover;
      ctx.fillStyle = colors[node.groupId] || colors.ink;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(node.x - node.r, node.y - node.r, node.r * 2, node.r * 2, 2) : ctx.rect(node.x - node.r, node.y - node.r, node.r * 2, node.r * 2);
      ctx.fill();
      if (active) {
        ctx.lineWidth = 2 / zoom;
        ctx.strokeStyle = colors.ink;
        ctx.stroke();
        ctx.lineWidth = 1 / zoom;
        ctx.strokeStyle = colors.line;
      }
      if (active || node.degree > 34) {
        ctx.font = `${active ? 600 : 500} ${12 / zoom}px Heebo, system-ui, sans-serif`;
        ctx.fillStyle = colors.ink;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(node.title.slice(0, 30), node.x, node.y + node.r + 5);
      }
    }
    ctx.restore();
  }

  function loop() {
    if (!(reduceMotion && ticks > 300)) step();
    draw();
    frame = requestAnimationFrame(loop);
  }

  if (reduceMotion) for (let i = 0; i < 300; i += 1) step();

  function showInfo(node) {
    const page = pages.get(node.id);
    const group = groupById.get(page.groupId);
    info.innerHTML = `<h2>${escapeHtml(page.navTitle)}</h2><p>${escapeHtml(groupHeading(group))} · ${page.links.length} קישורים יוצאים · ${page.backlinks.length} נכנסים</p>`;
  }

  const onMove = (event) => {
    const point = toGraph(event);
    if (dragged) {
      dragged.x = point.x;
      dragged.y = point.y;
      dragged.vx = 0;
      dragged.vy = 0;
      return;
    }
    hover = nearest(point);
    canvas.style.cursor = hover ? "pointer" : "grab";
    if (hover) showInfo(hover);
  };
  const onDown = (event) => {
    dragged = nearest(toGraph(event));
    if (dragged) canvas.setPointerCapture(event.pointerId);
  };
  const onUp = (event) => {
    if (dragged) canvas.releasePointerCapture(event.pointerId);
    dragged = null;
  };
  const onClick = (event) => {
    const node = nearest(toGraph(event));
    if (node) location.hash = pageHref(pages.get(node.id));
  };
  const onWheel = (event) => {
    event.preventDefault();
    zoom = Math.min(2.4, Math.max(0.45, zoom + (event.deltaY > 0 ? -0.08 : 0.08)));
  };

  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("resize", resize, { passive: true });
  readColors();
  resize();
  loop();

  return {
    redraw() {
      readColors();
    },
    destroy() {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    }
  };
}

// ---------------------------------------------------------------------------
// Math and diagrams
// ---------------------------------------------------------------------------

function typesetMath(after) {
  const mathJax = window.MathJax;
  if (!mathJax) return;
  const run = () => {
    if (!mathJax.typesetPromise) return;
    mathJax
      .typesetPromise([app])
      .then(() => {
        markWideFormulas();
        if (typeof after === "function") after();
      })
      .catch(() => {});
  };
  if (mathJax.startup?.promise) mathJax.startup.promise.then(run);
  else run();
}

// Inline formulas cannot wrap; the few that are wider than the text column
// become a scrollable line of their own on narrow screens.
function markWideFormulas() {
  app.querySelectorAll(".math-inline").forEach((el) => {
    el.classList.remove("math-overflow");
    const column = el.closest("p, li, td, th, blockquote, .prose") || app;
    const formula = el.querySelector("mjx-container") || el;
    if (formula.getBoundingClientRect().width > column.clientWidth + 1) el.classList.add("math-overflow");
  });
}

function renderMermaid(rerender = false) {
  if (!window.mermaid) return;
  const diagrams = Array.from(app.querySelectorAll("pre.mermaid"));
  if (!diagrams.length) return;
  for (const pre of diagrams) {
    if (!pre.dataset.source) pre.dataset.source = pre.textContent;
    if (rerender) {
      pre.removeAttribute("data-processed");
      pre.textContent = pre.dataset.source;
    }
  }
  const dark = root.dataset.theme === "dark";
  try {
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "neutral",
      themeVariables: { fontFamily: "Heebo, system-ui, sans-serif", fontSize: "15px" },
      flowchart: { htmlLabels: true, useMaxWidth: false, nodeSpacing: 34, rankSpacing: 42 }
    });
    Promise.resolve(window.mermaid.run({ nodes: diagrams }))
      .then(() => {
        // Flowcharts read right to left; open wide ones at their first node.
        app.querySelectorAll(".diagram-wrap").forEach((wrap) => {
          wrap.scrollLeft = wrap.scrollWidth;
        });
      })
      .catch(() => {});
  } catch {
    /* Mermaid is optional; the source stays visible. */
  }
}

// ---------------------------------------------------------------------------
// Scroll UI: reading progress and back-to-top
// ---------------------------------------------------------------------------

const progress = document.querySelector(".progress-bar span");
const backToTop = document.querySelector("[data-back-to-top]");
let scrollTicking = false;

function updateScrollUi() {
  scrollTicking = false;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = currentRoute.view === "page" && max > 0 ? Math.min(1, window.scrollY / max) : 0;
  progress.style.transform = `scaleX(${ratio})`;
  backToTop.hidden = window.scrollY < 900;
}

window.addEventListener(
  "scroll",
  () => {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(updateScrollUi);
    }
  },
  { passive: true }
);

backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const heading = app.querySelector("h1");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
});

let resizeTimer = 0;
window.addEventListener(
  "resize",
  () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (currentRoute.view === "page") markWideFormulas();
      updateScrollUi();
    }, 150);
  },
  { passive: true }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

renderTree();
route({ initial: true });
