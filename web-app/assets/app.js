/* כספת אינפי 1 — client app.
   Hash routes: #/  #/page/<id>[/<section>]  #/index  #/graph  #/about
   #/practice[...]  #/exams[/<n>[/q<k>]] */

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

// Switching theme swaps the whole screen between paper and black. Done in one
// frame it is a flash, so the old and new screens cross-fade instead (View
// Transitions; durations and easing live in site.css under "Theme switch").
// data-theme-fade says which way it goes: toward light is slower, so the
// brightness rises gently. Browsers without View Transitions get a short
// colour transition instead (data-theme-fade-css).
let themeFadeToken = null;
// The theme the last press asked for. A fade applies its theme a frame or more
// after the press, so a second press must toggle from this, not from the page.
let themeTarget = null;

function applyTheme(next) {
  root.dataset.theme = next;
  store.set("infi-theme", next);
  syncPreferenceControls();
  renderMermaid(true);
  if (currentRoute.view === "graph") graph?.redraw();
}

themeButton.addEventListener("click", () => {
  const next = (themeTarget || root.dataset.theme) === "dark" ? "light" : "dark";
  themeTarget = next;
  const token = (themeFadeToken = {});
  const done = () => {
    if (themeFadeToken !== token) return;
    themeTarget = null;
    delete root.dataset.themeFade;
    delete root.dataset.themeFadeCss;
  };
  root.dataset.themeFade = next === "light" ? "to-light" : "to-dark";

  if (typeof document.startViewTransition === "function") {
    const transition = document.startViewTransition(() => applyTheme(next));
    // A fade is skipped when the tab is hidden or the button is pressed again
    // mid-fade; the theme still changes (the update still runs), so the skip
    // is not an error.
    transition.ready.catch(() => {});
    transition.finished.then(done, done);
  } else {
    root.dataset.themeFadeCss = "";
    applyTheme(next);
    setTimeout(done, 900);
  }
});

sizeButton.addEventListener("click", () => {
  const order = ["s", "m", "l"];
  const next = order[(order.indexOf(root.dataset.textSize || "m") + 1) % order.length];
  root.dataset.textSize = next;
  store.set("infi-text-size", next);
  syncPreferenceControls();
  markWideFormulas();
  requestAnimationFrame(alignSheetGrid);
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

// On narrow screens the header links are hidden, so the drawer repeats them.
const DRAWER_LINKS = [
  ["home", "#/", "בית"],
  ["index", "#/index", "כל הפתקים"],
  ["exams", "#/exams", "מבחנים"],
  ["graph", "#/graph", "גרף קשרים"]
];

// Two guides the course leans on in every exam: what may be cited from the
// book, and how the lecturer chooses a method. They are pinned in the drawer,
// on the home page and on the practice page.
const KEY_GUIDES = [
  {
    match: "מסקנות משאלות הספר",
    title: "מסקנות משאלות הספר",
    text: "שאלות מהספר שמותר לצטט במבחן בלי הוכחה, ומתי שולפים כל אחת. חוסך הוכחות שלמות.",
    short: "מה מותר לצטט במבחן"
  },
  {
    match: "שיטות המרצה",
    title: "שיטות המרצה: איך בוחרים דרך פתרון",
    text: "דרכי העבודה שהמרצה הדגיש במפגשים: איך מזהים סוג שאלה ובוחרים כלי מתאים.",
    short: "איך בוחרים דרך פתרון"
  }
];

function keyGuides() {
  return KEY_GUIDES.map((guide) => ({ ...guide, page: data.pages.find((p) => p.navTitle.includes(guide.match) || p.title.includes(guide.match)) })).filter((guide) => guide.page);
}

function renderTree() {
  if (expanded.size > 1) {
    const keep = Array.from(expanded).at(-1);
    expanded.clear();
    expanded.add(keep);
    saveExpanded();
  }
  tree.innerHTML =
    `<nav class="tree-primary" aria-label="ניווט ראשי">${DRAWER_LINKS.map(([view, href, label]) => `<a href="${href}" data-nav="${view}">${label}</a>`).join("")}</nav>` +
    `<a class="tree-practice" href="#/practice" data-nav="practice">${icon("star")}<span><strong>תרגול</strong><small>כרטיסי חזרה ופאזלי הוכחה</small></span></a>` +
    `<div class="tree-guides">${keyGuides().map((g) => `<a class="tree-guide" href="${pageHref(g.page)}" data-id="${g.page.id}"><strong>${escapeHtml(g.match)}</strong><small>${escapeHtml(g.short)}</small></a>`).join("")}</div>` +
    groups
      .map((group) => {
        const listId = `tree-${group.id}`;
        const open = expanded.has(group.id);
        const badge = group.number ?? (group.id === "start" ? "★" : "·");
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
    if (open) {
      for (const other of tree.querySelectorAll("[data-group-toggle]")) {
        const otherId = other.dataset.groupToggle;
        const isThis = otherId === id;
        other.setAttribute("aria-expanded", String(isThis));
        const otherList = document.getElementById(`tree-${otherId}`);
        if (otherList) otherList.hidden = !isThis;
      }
      expanded.clear();
      expanded.add(id);
    } else {
      toggle.setAttribute("aria-expanded", "false");
      list.hidden = true;
      expanded.delete(id);
    }
    saveExpanded();
    return;
  }
  if (event.target.closest("a")) closeDrawer(false);
});

function syncTree(activeId) {
  const page = pages.get(activeId);
  if (page?.groupId && (expanded.size !== 1 || !expanded.has(page.groupId))) {
    for (const toggle of tree.querySelectorAll("[data-group-toggle]")) {
      const id = toggle.dataset.groupToggle;
      const isThis = id === page.groupId;
      toggle.setAttribute("aria-expanded", String(isThis));
      const list = document.getElementById(`tree-${id}`);
      if (list) list.hidden = !isThis;
    }
    expanded.clear();
    expanded.add(page.groupId);
    saveExpanded();
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
let desktopNavCollapsed = store.get("infi-nav-collapsed") === "true";

function syncMenuButton() {
  const open = drawerQuery.matches ? drawerOpen() : !desktopNavCollapsed;
  menuToggle.setAttribute("aria-expanded", String(open));
  const label = open ? "סגירת תפריט היחידות" : "פתיחת תפריט היחידות";
  menuToggle.querySelector(".visually-hidden").textContent = label;
  menuToggle.title = label;
}

function syncDesktopNav() {
  document.body.classList.toggle("nav-collapsed", desktopNavCollapsed);
  syncMenuButton();
}

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
  syncMenuButton();
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
  syncMenuButton();
  courseNav.removeAttribute("role");
  courseNav.removeAttribute("aria-modal");
  setInert(false);
  if (restoreFocus && lastFocusBeforeDrawer) lastFocusBeforeDrawer.focus();
}

menuToggle.addEventListener("click", () => {
  if (drawerQuery.matches) {
    if (drawerOpen()) closeDrawer();
    else openDrawer();
    return;
  }
  desktopNavCollapsed = !desktopNavCollapsed;
  store.set("infi-nav-collapsed", String(desktopNavCollapsed));
  syncDesktopNav();
});
menuClose.addEventListener("click", () => closeDrawer());
backdrop.addEventListener("click", () => closeDrawer());
drawerQuery.addEventListener("change", () => {
  closeDrawer(false);
  syncDesktopNav();
});
syncDesktopNav();

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

// A search result opens the page at the first place the words appear, not
// at its top.
let pendingFind = "";

function openResult(id) {
  if (!id) return;
  pendingFind = normalize(searchInput.value).trim();
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
  const [hash, queryString = ""] = location.hash.split("?");
  if (!hash || hash === "#" || hash === "#/") return { view: "home", query: new URLSearchParams(queryString) };
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
  return { view: parts[0] || "home", id: parts[1] || "", section: parts[2] || "", query: new URLSearchParams(queryString) };
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
  else if (next.view === "practice" && window.InfiStudy) window.InfiStudy.render(app, next);
  else if (next.view === "exams" && window.InfiExams) window.InfiExams.render(app, next);
  else if (next.view === "home") renderHome();
  else renderNotFound();

  updatePrimaryNav(next.view === "page" ? "" : next.view);
  syncTree(next.view === "page" ? next.id : "");
  if (!next.section || next.view !== "page") window.scrollTo(0, 0);
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

// The interactive demos (assets/demos.js), each linked to the note it lives in.
const DEMO_GALLERY = [
  {
    name: "epsilon-delta",
    title: "משחק ε‑δ",
    text: "האתגר בוחר ε, אתם בוחרים δ. שישה סיבובים עד ההגדרה.",
    sketch: `<rect class="sk-band-red" x="0" y="30" width="160" height="22"/><rect class="sk-band-blue" x="62" y="0" width="28" height="90"/><path class="sk sk-gray" d="M8 84 Q55 56 76 41 T154 4"/><path class="sk sk-green sk-bold" d="M62 49 Q70 45 76 41 T90 33"/><circle class="sk-hole" cx="76" cy="41" r="4"/>`
  },
  {
    name: "epsilon-n",
    title: "הגבול של סדרה",
    text: "מזיזים את ε ורואים מאיזה N כל האיברים ברצועה.",
    sketch: `<rect class="sk-band-red" x="0" y="33" width="160" height="16"/><path class="sk sk-red sk-thin" stroke-dasharray="5 5" d="M0 41 H160"/><path class="sk sk-green sk-thin" stroke-dasharray="3 4" d="M57 4 V86"/>${[[12, 72], [22, 14], [32, 60], [42, 26], [52, 52], [62, 34], [72, 46], [82, 37], [92, 44], [102, 39], [112, 42], [122, 40], [132, 41], [142, 40.5], [152, 41]]
      .map(([x, y], i) => `<circle class="${i < 5 ? "sk-dot-red" : "sk-dot-green"}" cx="${x}" cy="${y}" r="3.2"/>`)
      .join("")}`
  },
  {
    name: "bisection",
    title: "ערך הביניים בחצייה",
    text: "שלב אחר שלב, הקטע מצטמצם עד השורש.",
    sketch: `<path class="sk sk-graphite sk-thin" d="M4 48 H156"/><path class="sk sk-blue" d="M8 82 C50 72 80 56 100 47 S140 20 154 6"/><path class="sk sk-gray" d="M60 64 H140"/><path class="sk sk-gray" d="M60 71 H100"/><path class="sk sk-green sk-bold" d="M80 78 H100"/><circle class="sk-dot-red" cx="80" cy="54" r="3.4"/><circle class="sk-dot-blue" cx="100" cy="47" r="3.4"/>`
  },
  {
    name: "nested-intervals",
    title: "הלמה של קנטור",
    text: "קטעים מקוננים לבחירתכם, ודוגמה נגדית עם קטעים פתוחים.",
    sketch: `<path class="sk sk-blue sk-bold" d="M10 18 H150"/><path class="sk sk-green sk-bold" d="M50 32 H150"/><path class="sk sk-red sk-bold" d="M50 46 H110"/><path class="sk sk-purple sk-bold" d="M72 60 H110"/><path class="sk sk-orange sk-bold" d="M72 74 H92"/><path class="sk sk-gray sk-thin" stroke-dasharray="3 4" d="M82 6 V86"/>`
  },
  {
    name: "sup",
    title: "החסם העליון",
    text: "למה החסם העליון של [a,b) הוא b, ולמה אין לקבוצה מקסימום.",
    sketch: `<path class="sk sk-graphite sk-thin" d="M4 60 H156"/><rect class="sk-band-red" x="112" y="50" width="16" height="20"/><path class="sk sk-blue sk-bold" d="M22 40 H110"/><circle class="sk-dot-blue" cx="22" cy="40" r="4"/><circle class="sk-hole sk-hole-blue" cx="110" cy="40" r="4"/><path class="sk sk-red" d="M128 26 V74"/>`
  },
  {
    name: "uniform",
    title: "רציפות במידה שווה",
    text: "איך δ מתכווץ כש־x₀ גדל, ומה משפט קנטור מבטיח.",
    sketch: `<rect class="sk-band-red" x="0" y="28" width="160" height="14"/><rect class="sk-band-blue" x="116" y="0" width="10" height="90"/><path class="sk sk-graphite sk-thin" d="M4 84 H156"/><path class="sk sk-blue" d="M10 82 C70 82 112 58 152 4"/><path class="sk sk-green sk-bold" d="M116 39 L126 31"/>`
  },
  {
    name: "secant",
    title: "מהמיתר למשיק",
    text: "מקטינים את h עד שהמיתר הופך למשיק.",
    sketch: `<path class="sk sk-graphite sk-thin" d="M4 84 H156"/><path class="sk sk-blue" d="M14 8 Q80 150 146 8"/><path class="sk sk-red" d="M30 86 L150 10"/><path class="sk sk-green sk-thin" stroke-dasharray="5 5" d="M24 84 L150 30"/><circle class="sk-dot-blue" cx="62" cy="65" r="3.6"/><circle class="sk-dot-red" cx="112" cy="40" r="3.6"/>`
  },
  {
    name: "mvt",
    title: "משפט לגראנז'",
    text: "מזיזים את c עד שהמשיק מקביל למיתר.",
    sketch: `<path class="sk sk-blue" d="M12 62 C38 8 70 8 90 46 S134 82 150 40"/><path class="sk sk-red" d="M12 62 L150 40"/><path class="sk sk-green sk-bold" d="M26 29 L82 20"/><circle class="sk-dot-red" cx="12" cy="62" r="3.6"/><circle class="sk-dot-red" cx="150" cy="40" r="3.6"/><circle class="sk-dot-green" cx="54" cy="24.5" r="3.6"/>`
  }
];

function demoGallery() {
  return DEMO_GALLERY.map((item) => {
    const home = data.pages.find(
      (page) => page.html.includes(`data-demo="${item.name}"`) && !/^שער /.test(page.title) && /^unit-/.test(page.groupId || "")
    );
    if (!home) return null;
    return {
      ...item,
      href: pageHref(home, `demo-${item.name}`),
      unit: groupHeading(groupById.get(home.groupId)),
      sketch: `<svg viewBox="0 0 160 90" focusable="false">${item.sketch}</svg>`
    };
  }).filter(Boolean);
}

function renderHome() {
  setTitle("");
  const unitGroups = groups.filter((group) => group.number);
  const units = unitGroups.filter((group) => group.number);
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
        <span class="unit-card-top"><span class="unit-card-num">יחידה ${group.number}</span><span>${escapeHtml(group.volume || "")}</span></span>
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
    "תיקונים לספרי הקורס": "התיקונים הרשמיים לכרכים א–ג.",
    "תבניות הוכחה": "המהלכים שחוזרים בהוכחות: ε, sup, קטע סגור ונגזרת.",
    "מפת תלות משפטים": "איזה משפט נשען על איזה, מהשלמות ועד משפטי הנגזרת.",
    "אינדקס דוגמאות נגד": "הדוגמאות שמפריכות הכללות שגויות, לפי נושא.",
    "כרטיסי חזרה": "שאלות ותשובות קצרות לחזרה לפני הבחינה.",
    "מפת מוח": "מבט על הקורס כולו כמפה אחת.",
    "מסקנות משאלות הספר": "שאלות מהספר שמותר לצטט במבחן, ומתי שולפים כל אחת.",
    "שיטות המרצה": "דרכי העבודה שהמרצה הדגיש במפגשים, לפי יחידות.",
    "גרפים והמחשות": "כל הגרפים החיים של הקורס במקום אחד.",
    "מקורות וחומרי גלם": "מאיפה כל פרט באתר מגיע."
  };
  const tools = (start?.pageIds || [])
    .map((id) => pages.get(id))
    .filter((page) => page && page.id !== data.examListPageId && !page.navTitle.includes("כספת העל") && !KEY_GUIDES.some((g) => page.navTitle.includes(g.match)))
    .map((page) => {
      const key = Object.keys(toolDescriptions).find((k) => page.navTitle.includes(k));
      return `<a class="tool-card" href="${pageHref(page)}"><strong>${escapeHtml(page.navTitle)}</strong><span>${escapeHtml(toolDescriptions[key] || "")}</span></a>`;
    })
    .join("");

  const panel = last
    ? `<p class="home-resume-label">המשך הלמידה</p>
       <a class="home-resume-link" href="${pageHref(last)}"><small>${escapeHtml(groupHeading(groupById.get(last.groupId)))}</small><strong>${escapeHtml(last.navTitle)}</strong><span aria-hidden="true">←</span></a>
       ${recent.length > 1 ? `<p class="home-recent-label">ביקרתם לאחרונה</p><ul class="home-recent-list">${recent.slice(1, 4).map((page) => `<li><a href="${pageHref(page)}">${escapeHtml(page.navTitle)}</a></li>`).join("")}</ul>` : ""}`
    : `<p class="home-resume-label">מאיפה מתחילים?</p>
       <p class="home-start-text">מתחילים ביחידה 1 ומתקדמים לפי הסדר. בכל פתק יש קודם הסבר במילים פשוטות, ואז ההגדרה, הדוגמאות והתרגול.</p>
       ${firstUnit ? `<a class="home-start-link" href="${pageHref(firstUnit)}">ליחידה 1: המספרים הממשיים <span aria-hidden="true">←</span></a>` : ""}`;

  const demos = demoGallery();
  const game = demos.find((item) => item.name === "epsilon-delta");

  app.innerHTML = `
    <div class="home">
      <section class="home-intro" aria-labelledby="homeTitle">
        <div class="home-intro-main">
          <p class="home-intro-kicker">האוניברסיטה הפתוחה <span aria-hidden="true"> / </span> קורס 20474</p>
          <h1 id="homeTitle">חשבון אינפיניטסימלי 1</h1>
          <p class="home-intro-subtitle">הסברים, הוכחות ותרגול לקראת הבחינה.</p>
          <div class="home-intro-actions">
            ${firstUnit ? `<a class="button button-primary" href="${pageHref(firstUnit)}">להתחלת הלימוד <span aria-hidden="true">←</span></a>` : ""}
            ${exam ? `<a class="home-quick-link" href="${pageHref(exam)}">המשפטים לבחינה</a><a class="home-quick-link" href="#/exams">מבחני עבר</a>` : ""}
            ${game ? `<a class="home-quick-link" href="${game.href}">משחק ε‑δ</a>` : ""}
          </div>
          <p class="home-intro-meta">${units.length} יחידות לימוד <span aria-hidden="true">·</span> ${(data.examTheorems || []).length} משפטים לבחינה <span aria-hidden="true">·</span> ${(data.exams || []).length} מבחני עבר</p>
        </div>
        <aside class="home-resume" aria-label="${last ? "המשך קריאה" : "תחילת הלימוד"}">${panel}</aside>
      </section>

      ${
        keyGuides().length
          ? `<section class="guide-band" aria-labelledby="guidesTitle">
              <div class="section-head">
                <h2 id="guidesTitle">שני דפים שכדאי להכיר לפני הבחינה</h2>
              </div>
              <div class="guide-cards">${keyGuides()
                .map((g) => `<a class="guide-card" href="${pageHref(g.page)}"><span class="guide-card-icon" aria-hidden="true">${icon("star")}</span><span><strong>${escapeHtml(g.title)}</strong><span>${escapeHtml(g.text)}</span></span><span class="guide-card-go" aria-hidden="true">←</span></a>`)
                .join("")}</div>
            </section>`
          : ""
      }

      <section aria-labelledby="unitsTitle">
        <div class="section-head">
          <h2 id="unitsTitle">יחידות הקורס</h2>
          <p>${new Set(unitGroups.map((g) => g.volume).filter(Boolean)).size} כרכים, ${unitGroups.length} יחידות</p>
        </div>
        <div class="unit-grid">${unitCards}</div>
      </section>


      ${
        demos.length
          ? `<section aria-labelledby="demosTitle">
              <div class="section-head">
                <h2 id="demosTitle">המחשות על המשבצות</h2>
                <p>גוררים, משנים את ε ורואים את ההגדרה עובדת</p>
              </div>
              <div class="demo-gallery">${demos
                .map(
                  (item) => `<a class="demo-card" href="${item.href}">
                    <span class="demo-card-art" aria-hidden="true">${item.sketch}</span>
                    <span class="demo-card-body">
                      <small>${escapeHtml(item.unit)}</small>
                      <strong>${escapeHtml(item.title)}</strong>
                      <span>${escapeHtml(item.text)}</span>
                    </span>
                  </a>`
                )
                .join("")}</div>
            </section>`
          : ""
      }

      ${window.InfiStudy ? window.InfiStudy.homeSection() : ""}

      ${
        exam
          ? `<section class="exam-band" aria-labelledby="examTitle">
              <span class="exam-band-icon" aria-hidden="true">${icon("star")}</span>
              <div>
                <h2 id="examTitle">${(data.examTheorems || []).length} המשפטים לבחינה</h2>
                <p>בבחינה מבקשים להוכיח 2–3 משפטים מהרשימה הרשמית. לכל משפט יש בכספת הוכחה מלאה עם כל הנימוקים, וליד כל הוכחה כתוב באילו מבחנים היא נשאלה.</p>
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

// Divider tabs along the sheet's free edge, one per unit, as in a binder.
function unitTabs(page) {
  const tabs = groups
    .filter((group) => group.number && group.gatewayId && pages.get(group.gatewayId))
    .map((group) => {
      const current = group.id === page.groupId;
      return `<a class="unit-tab${current ? " is-current" : ""}" href="${pageHref(pages.get(group.gatewayId))}" style="--c:${groupColor(group.id)}"${current ? ' aria-current="true"' : ""} title="${escapeHtml(group.subtitle || "")}"><span class="visually-hidden">יחידה </span>${group.number}<span class="visually-hidden">: ${escapeHtml(group.subtitle || "")}</span></a>`;
    })
    .join("");
  return tabs ? `<nav class="unit-tabs" aria-label="חוצצי היחידות"><div class="unit-tabs-rail">${tabs}</div></nav>` : "";
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
        <nav class="breadcrumbs" aria-label="מיקום בקורס"><ol>${crumbs.join("")}</ol></nav>
        <div class="sheet" data-sheet>
          ${unitTabs(page)}
          <header class="note-head">
            <h1 id="pageTitle" class="note-title">${page.titleHtml || escapeHtml(page.title)}</h1>
            <div class="note-meta">${meta}</div>
            ${page.aliases?.length ? `<p class="note-aliases">נקרא גם: ${page.aliases.map(escapeHtml).join(" · ")}</p>` : ""}
            <div class="grid-probe" aria-hidden="true"><div class="note-title"><span class="bl"></span>א</div></div>
          </header>
          <details class="toc-inline" data-toc-inline hidden>
            <summary>בדף הזה ${icon("chevron")}</summary>
            <nav aria-label="תוכן הדף"><ol data-toc-list></ol></nav>
          </details>
          <div class="prose">${page.html}<div class="grid-probe" aria-hidden="true"><p><span class="bl"></span>א</p><h2><span class="bl"></span>א</h2><h3><span class="bl"></span>א</h3><div class="grid-cell" style="height: var(--cell)"></div></div></div>
        </div>
        <footer class="note-foot">
          ${
            prev || next
              ? `<nav class="pager" aria-label="הפתק הקודם והבא">
                  ${prev ? `<a class="pager-prev" href="${pageHref(prev)}" rel="prev"><small>${icon("prev")} לנושא הקודם</small><strong>${escapeHtml(prev.navTitle)}</strong></a>` : ""}
                  ${next ? `<a class="pager-next" href="${pageHref(next)}" rel="next"><small>לנושא הבא ${icon("next")}</small><strong>${escapeHtml(next.navTitle)}</strong></a>` : ""}
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
  window.InfiDemos?.mount(app);
  window.InfiStudy?.decorate(app);
  window.InfiExams?.decorate(app);
  mountLearningPath(page, group, gateway);
  alignSheetGrid();
  app.querySelector("[data-toc-inline]")?.addEventListener("toggle", alignSheetGrid);
  app.querySelectorAll("details.callout").forEach((box) => box.addEventListener("toggle", alignSheetGrid));
  typesetMath(() => scrollToSection(section, false));
  renderMermaid();
  if (section) scrollToSection(section, false);
  else if (pendingFind) revealMatch(pendingFind);
  pendingFind = "";
}

function revealMatch(query) {
  const prose = app.querySelector(".prose");
  if (!prose) return;
  const terms = [query, ...query.split(/\s+/).filter((t) => t.length >= 2)];
  const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
  let hit = null;
  for (const term of terms) {
    walker.currentNode = prose;
    while (!hit && walker.nextNode()) {
      if (normalize(walker.currentNode.nodeValue).includes(term)) hit = walker.currentNode.parentElement;
    }
    if (hit) break;
  }
  if (!hit || hit.closest(".note-head")) return;
  for (let box = hit.closest("details"); box; box = box.parentElement?.closest("details")) box.open = true;
  alignSheetGrid();
  const block = hit.closest("p, li, h2, h3, h4, td, .callout, .math-display") || hit;
  requestAnimationFrame(() => {
    block.scrollIntoView({ behavior: "auto", block: "center" });
    block.classList.add("search-hit");
    setTimeout(() => block.classList.remove("search-hit"), 2400);
  });
}

// Links only to material that actually exists on this page; the full note
// remains available and the learner can choose how much to reveal.
function mountLearningPath(page, group, gateway) {
  if (!group?.number) return;
  const prose = app.querySelector(".prose");
  if (!prose) return;
  const headings = Array.from(prose.querySelectorAll("h2, h3"));
  const findHeading = (pattern) => headings.find((h) => pattern.test(h.textContent));
  const intuition = prose.querySelector(".callout-simple");
  const example = findHeading(/דוגמ[הת]|עם מספרים/) || Array.from(prose.querySelectorAll(".callout-simple")).find((box) => /עם מספרים/.test(box.textContent));
  const formal = findHeading(/הגדר|המשפט|ניסוח/) || headings[0];
  const practice = findHeading(/תרגול קצר|תרגול מודרך|בדיקת שליטה|בדיקה עצמית|כרטיס דיוק/);
  const exam = prose.querySelector(".callout-exam") || findHeading(/סוגי שאלות במבחן|במבחן/);
  const items = [["אינטואיציה", intuition], ["דוגמה במספרים", example], ["הגדרה ומשפטים", formal], ["תרגול", practice], ["במבחן", exam]].filter(([, target]) => target);
  if (!exam && gateway && gateway.id !== page.id) items.push(["שאלות מבחן ביחידה", null]);
  if (items.length < 2) return;
  const nav = document.createElement("nav");
  nav.className = "learning-path";
  nav.setAttribute("aria-label", "מסלול לימוד בדף");
  nav.innerHTML = '<p><strong>מסלול לימוד:</strong> בחרו שלב כדי להגיע אליו. אפשר לפתוח הסברים ורמזים לפי הצורך.</p><ol></ol>';
  const list = nav.querySelector("ol");
  items.forEach(([label, target], index) => {
    const li = document.createElement("li");
    if (!target) {
      const link = document.createElement("a");
      link.href = `#/exams?unit=${group.number}`;
      link.textContent = `${index + 1}. ${label}`;
      li.append(link);
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${index + 1}. ${label}`;
      button.addEventListener("click", () => {
        if (target.tagName === "DETAILS") target.open = true;
        const focusTarget = target.tagName === "DETAILS" ? target.querySelector("summary") : target;
        if (!focusTarget.hasAttribute("tabindex")) focusTarget.setAttribute("tabindex", "-1");
        target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        focusTarget.focus({ preventScroll: true });
      });
      li.append(button);
    }
    list.append(li);
  });
  // Where the contents list is folded into the page (narrow screens), the
  // learning path goes inside it, so the text starts on the first screen.
  const inlineToc = app.querySelector("[data-toc-inline]");
  if (inlineToc && !inlineToc.hidden && getComputedStyle(inlineToc).display !== "none") {
    nav.classList.add("learning-path-inline");
    inlineToc.querySelector("nav")?.before(nav);
  } else {
    prose.before(nav);
  }
}

// ---------------------------------------------------------------------------
// Notebook sheet: put text baselines on the grid lines
// ---------------------------------------------------------------------------

function mod(value, size) {
  return ((value % size) + size) % size;
}

// Boxes on the page (cards, callouts, tables, diagrams) are ruled along the
// grid lines, like a frame a student draws around a theorem.
const SHEET_BOX =
  ".toc-inline, .callout, .table-wrap, .diagram-wrap, .section-card, .section-review, .dataview-result, pre, .section-related > ul, .proof-bar, .qa-list, .qa-practice";
// Boxes that get extra padding so they also end on a line. The related-notes
// cards already have a height in whole cells (see site.css).
const SHEET_BOX_ROUNDED =
  ".toc-inline, .callout, .table-wrap, .diagram-wrap, .section-card, .section-review, .dataview-result, pre, .proof-bar, .qa-list, .qa-practice";

// 1. The grid is shifted so its horizontal lines pass through the baselines
//    of body text; a line of text is exactly two cells tall.
// 2. Every text block (paragraph, list, heading, formula) is snapped so its
//    top starts a whole number of cells below the top of the sheet, which
//    keeps it in phase with the grid after boxes of any height.
// 3. Boxes start on a grid line and are padded to end on one, and the red
//    rule under the title is laid over a grid line.
// 4. Headings are nudged so their baselines sit on a line.
function alignSheetGrid() {
  const sheet = app.querySelector("[data-sheet]");
  if (!sheet) return;
  const prose = sheet.querySelector(".prose");
  const cellEl = sheet.querySelector(".grid-cell");
  const probes = prose?.querySelector(".grid-probe");
  if (!prose || !cellEl || !probes) return;

  sheet.querySelectorAll("[data-grid-snap]").forEach((el) => {
    el.style.marginBlockStart = "";
    el.style.marginBlockEnd = "";
    el.removeAttribute("data-grid-snap");
  });
  sheet.querySelectorAll("[data-grid-pad]").forEach((el) => {
    el.style.paddingBlockStart = "";
    el.style.paddingBlockEnd = "";
    el.removeAttribute("data-grid-pad");
  });
  sheet.querySelectorAll("[data-grid-fit]").forEach((el) => {
    el.style.marginBlockStart = "";
    el.style.marginBlockEnd = "";
    el.removeAttribute("data-grid-fit");
  });

  const cell = cellEl.getBoundingClientRect().height;
  if (!(cell > 4)) return;

  // Baselines measured on hidden probes: they do not depend on where a block
  // sits, so they are read once, before anything moves.
  const baseline = (el) => {
    const mark = el?.querySelector(".bl");
    return mark ? mark.getBoundingClientRect().bottom - el.getBoundingClientRect().top : null;
  };
  const bodyBaseline = baseline(probes.querySelector("p"));
  if (bodyBaseline === null) return;
  const nudge = (el) => {
    const b = baseline(el);
    if (b === null) return "0px";
    let delta = mod(bodyBaseline - b, cell);
    if (delta > cell / 2) delta -= cell;
    return `${delta.toFixed(2)}px`;
  };
  const head = sheet.querySelector(".note-head");
  const shifts = {
    "--shift-h1": nudge(head?.querySelector(".grid-probe .note-title")),
    "--shift-h2": nudge(probes.querySelector("h2")),
    "--shift-h3": nudge(probes.querySelector("h3"))
  };

  fitTallFormulas(prose, cell, bodyBaseline);

  const blocks = [];
  if (head) blocks.push(head);
  const toc = sheet.querySelector(".toc-inline");
  if (toc && toc.getClientRects().length) blocks.push(toc);
  const learningPath = sheet.querySelector(".learning-path");
  if (learningPath && learningPath.getClientRects().length) blocks.push(learningPath);
  const collect = (container) => {
    for (const child of container.children) {
      if (child.classList.contains("grid-probe")) continue;
      if ((child.classList.contains("note-section") && !child.matches(".section-card, .section-review")) || child.classList.contains("proof")) collect(child);
      else if (child.getClientRects().length) blocks.push(child);
    }
  };
  collect(prose);

  const sheetStyle = getComputedStyle(sheet);
  const contentTop = parseFloat(sheetStyle.paddingTop || "0");
  // Where the grid lines fall, measured from the top of the sheet's padding
  // box (the background's origin).
  const lineAt = mod(contentTop + bodyBaseline, cell);

  // Heights: a box is a whole number of cells plus 1px, so its bottom border
  // covers a line; the head ends where its 2px red rule covers a line.
  const padWrites = [];
  const roundHeight = (el, remainder, split) => {
    const extra = mod(remainder - el.getBoundingClientRect().height, cell);
    if (extra < 0.5 || cell - extra < 0.5) return;
    const style = getComputedStyle(el);
    const before = split ? Math.floor(extra / 2) : 0;
    padWrites.push([el, (parseFloat(style.paddingTop) || 0) + before, (parseFloat(style.paddingBottom) || 0) + extra - before]);
  };
  if (head) roundHeight(head, mod(bodyBaseline + 1, cell), false);
  blocks.forEach((el) => {
    if (el !== head && el.matches(SHEET_BOX_ROUNDED)) roundHeight(el, 1, true);
  });
  // A formula on a line of its own inside running text (a display formula in
  // a list item, or an inline one too wide for a phone) is whole cells tall,
  // so the text after it stays on the lines.
  prose.querySelectorAll(".math-display, .math-inline.math-overflow").forEach((el) => {
    if (!el.closest(`${SHEET_BOX}, .grid-probe`) && el.getClientRects().length) roundHeight(el, 0, true);
  });
  // A "why?" note inside a proof is whole cells tall, so the lines after it
  // stay on the grid.
  prose.querySelectorAll(".why-note").forEach((el) => {
    if (el.getClientRects().length) roundHeight(el, 0, true);
  });
  // A demo's controls card is ruled along the grid like the other boxes.
  prose.querySelectorAll(".demo-panel").forEach((el) => {
    if (el.getClientRects().length) roundHeight(el, 1, true);
  });
  for (const [el, top, bottom] of padWrites) {
    el.style.paddingBlockStart = `${top}px`;
    el.style.paddingBlockEnd = `${bottom}px`;
    el.dataset.gridPad = "1";
  }

  const originTop = sheet.getBoundingClientRect().top + parseFloat(sheetStyle.borderTopWidth || "0");
  const boxes = blocks.map((el) => {
    const box = el.getBoundingClientRect();
    return {
      el,
      top: box.top - originTop,
      bottom: box.bottom - originTop,
      target: el !== head && el.matches(SHEET_BOX) ? lineAt : contentTop
    };
  });

  // Margins between consecutive blocks are rewritten as one explicit gap on
  // the later block, so margin collapsing cannot distort the arithmetic.
  let shift = 0;
  const writes = [];
  for (let i = 1; i < boxes.length; i += 1) {
    const gap = boxes[i].top - boxes[i - 1].bottom;
    let pad = mod(boxes[i].target - (boxes[i].top + shift), cell);
    if (pad < 0.5 || cell - pad < 0.5) pad = 0;
    if (pad) {
      writes.push([boxes[i - 1].el, boxes[i].el, gap + pad]);
      shift += pad;
    }
  }
  for (const [before, after, value] of writes) {
    before.style.marginBlockEnd = "0px";
    after.style.marginBlockStart = `${Math.max(0, value)}px`;
    before.dataset.gridSnap = "1";
    after.dataset.gridSnap = "1";
  }

  sheet.style.setProperty("--grid-offset", `${lineAt.toFixed(2)}px`);
  for (const [name, value] of Object.entries(shifts)) sheet.style.setProperty(name, value);
}

// A formula taller than the line (a fraction, floor brackets, a sum) would
// stretch its line box by a few pixels and push every later line off the
// grid. It may reach into the space between lines by up to ~0.45 cell; past
// that its line grows by whole cells. Both are done with margins on the
// formula's box, which change the line box and never move the formula.
function fitTallFormulas(prose, cell, bodyBaseline) {
  const lineHeight = cell * 2;
  const reach = cell * 0.45;
  const formulas = Array.from(prose.querySelectorAll(".math-inline:not(.math-overflow) mjx-math")).filter(
    (math) => !math.closest(`${SHEET_BOX}, h1, h2, h3, h4, .grid-probe, .why-note, .is-hidden`) && math.getClientRects().length
  );
  if (!formulas.length) return;
  // The baseline mark goes inside the formula's box, which never wraps, so it
  // is on the formula's own line even when the formula starts a new line.
  const marks = formulas.map((math) => {
    const mark = document.createElement("span");
    mark.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    math.prepend(mark);
    return mark;
  });
  const fits = formulas.map((math, i) => {
    const base = marks[i].getBoundingClientRect().bottom;
    const box = math.getBoundingClientRect();
    const above = base - bodyBaseline - box.top;
    const below = box.bottom - (base - bodyBaseline + lineHeight);
    const margin = (excess) => (excess > 0.5 ? Math.max(0, Math.ceil((excess - reach) / cell)) * cell - excess : null);
    return [math, margin(above), margin(below)];
  });
  marks.forEach((mark) => mark.remove());
  for (const [math, top, bottom] of fits) {
    if (top === null && bottom === null) continue;
    if (top !== null) math.style.marginBlockStart = `${top.toFixed(2)}px`;
    if (bottom !== null) math.style.marginBlockEnd = `${bottom.toFixed(2)}px`;
    math.dataset.gridFit = "1";
  }
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
  // A target inside folded boxes must be visible before scrolling to it.
  for (let box = target.closest("details"); box; box = box.parentElement?.closest("details")) box.open = true;
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
          <li>סיכום מצגות המרצה במפגשי ההנחיה, ומסקנות משאלות הספר שהמרצה הפנה אליהן.</li>
          <li>טפסי המבחנים הרשמיים 2019–2026 (סריקות, בלי פתרונות), בעמוד המבחנים.</li>
        </ul>
        ${sources ? `<p>פירוט מלא: <a href="${pageHref(sources)}">מקורות וחומרי גלם</a>.</p>` : ""}
        <h2 id="about-rights">זכויות</h2>
        <p>${escapeHtml(data.notice)}</p>
        <p>זה אינו אתר רשמי של האוניברסיטה הפתוחה.</p>
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

// MathJax must not typeset two things at once, so every request (the page,
// a link preview) is chained onto MathJax's own startup promise.
function queueTypeset(nodes) {
  const mathJax = window.MathJax;
  if (!mathJax?.startup?.promise) return Promise.resolve(false);
  const next = mathJax.startup.promise
    .then(() => (mathJax.typesetPromise ? mathJax.typesetPromise(nodes) : null))
    .then(() => true)
    .catch(() => false);
  mathJax.startup.promise = next;
  return next;
}

function typesetMath(after) {
  queueTypeset([app]).then((done) => {
    if (!done) return;
    markWideFormulas();
    alignSheetGrid();
    if (typeof after === "function") after();
  });
}

// Inline formulas cannot wrap; the few that are wider than the text column
// become a scrollable line of their own on narrow screens. A formula glued to
// its punctuation (.nobr) may run a few pixels into the ragged left margin,
// which is better than a lone "." starting the next line; only a glued run
// that is clearly too wide is released.
const GLUE_SLACK = 10;

function markWideFormulas() {
  const formulas = Array.from(app.querySelectorAll(".math-inline"));
  if (!formulas.length) return;
  // Reset first and measure in one pass, so the page is laid out once rather
  // than once per formula.
  app.querySelectorAll(".math-overflow").forEach((el) => el.classList.remove("math-overflow"));
  app.querySelectorAll(".nobr-off").forEach((el) => el.classList.remove("nobr-off"));
  const verdicts = [];
  formulas.forEach((el) => {
    const column = el.closest("p, li, td, th, blockquote, .prose") || app;
    const formula = el.querySelector("mjx-container") || el;
    const limit = column.clientWidth + 1;
    if (formula.getBoundingClientRect().width > limit) {
      verdicts.push([el, "math-overflow"]);
      return;
    }
    // Innermost run first (formula + punctuation), then the prefix around it.
    for (let glue = el.closest(".nobr"); glue && app.contains(glue); glue = glue.parentElement?.closest(".nobr")) {
      if (glue.getBoundingClientRect().width > limit + GLUE_SLACK) verdicts.push([glue, "nobr-off"]);
    }
  });
  verdicts.forEach(([el, className]) => el.classList.add(className));
}

// Mermaid is large and only some notes have diagrams, so it is fetched the
// first time a page needs it.
const MERMAID_SRC = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
let mermaidLoading = null;

function renderMermaid(rerender = false) {
  const diagrams = Array.from(app.querySelectorAll("pre.mermaid"));
  if (!diagrams.length) return;
  if (!window.mermaid) {
    mermaidLoading ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = MERMAID_SRC;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    mermaidLoading.then(() => renderMermaid(rerender)).catch(() => {});
    return;
  }
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
        alignSheetGrid();
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
      if (currentRoute.view === "page") {
        markWideFormulas();
        alignSheetGrid();
      }
      updateScrollUi();
    }, 150);
  },
  { passive: true }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Link previews: hovering (or tabbing to) a link to a note shows an index
// card with the linked theorem, or the note's summary, without leaving the
// page. The card repeats what the link leads to, so it is hidden from
// assistive technology; touch screens just follow the link.
// ---------------------------------------------------------------------------

const PREVIEW_LINKS = '.prose a[href^="#/page/"], .backlinks a[href^="#/page/"]';
const canHover = window.matchMedia?.("(hover: hover) and (pointer: fine)");
const preview = document.createElement("div");
preview.className = "link-preview";
preview.setAttribute("aria-hidden", "true");
preview.hidden = true;
document.body.append(preview);
const parsedPages = new Map();
let previewTimer = 0;
let previewFor = null;

function parsedPage(page) {
  let fragment = parsedPages.get(page.id);
  if (!fragment) {
    const template = document.createElement("template");
    template.innerHTML = page.html;
    fragment = template.content;
    parsedPages.set(page.id, fragment);
    if (parsedPages.size > 40) parsedPages.delete(parsedPages.keys().next().value);
  }
  return fragment;
}

// The heading of the linked section and the block or two after it: for a
// theorem that is its statement.
function sectionPreview(page, slug) {
  const target = parsedPage(page).querySelector(`[id="${CSS.escape(slug)}"]`);
  if (!target) return null;
  // a paragraph or list item that states "**משפט 4.42**: ..." (and the
  // display formula right after it)
  if (/^(P|LI)$/.test(target.tagName)) {
    const statement = document.createElement("p");
    statement.innerHTML = target.innerHTML;
    const parts = [statement];
    for (let node = target.nextElementSibling; node?.matches(".math-display") && parts.length < 3; node = node.nextElementSibling) parts.push(node.cloneNode(true));
    const number = slug.replace(/^stmt-/, "").replace("-", ".");
    return { title: `${escapeHtml(target.dataset.kind || "")} ${number}`.trim(), parts };
  }
  if (!/^H[2-4]$/.test(target.tagName)) return null;
  const parts = [];
  let length = 0;
  for (let node = target.nextElementSibling; node && parts.length < 3 && length < 280; node = node.nextElementSibling) {
    // the statement ends where its proof begins
    if (/^H[1-6]$/.test(node.tagName) || node.matches(".proof") || (node.matches("p") && /^\s*הוכח/.test(node.textContent))) break;
    if (node.matches("figure, .diagram-wrap, .dataview-result, .table-wrap, .proof-bar")) continue;
    parts.push(node.cloneNode(true));
    length += node.textContent.length;
  }
  return { title: target.innerHTML, parts };
}

function placePreview(link) {
  const box = link.getBoundingClientRect();
  const width = preview.offsetWidth;
  const height = preview.offsetHeight;
  const viewWidth = document.documentElement.clientWidth;
  const left = Math.max(8, Math.min(box.right - width, viewWidth - width - 8));
  let top = box.bottom + 8;
  if (top + height > window.innerHeight - 8 && box.top - height - 8 > 8) top = box.top - height - 8;
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
}

function showPreview(link) {
  const match = /^#\/page\/([^/]+)(?:\/(.+))?$/.exec(link.getAttribute("href") || "");
  const page = match && pages.get(match[1]);
  if (!page) return;
  const slug = match[2] ? decodeURIComponent(match[2]) : "";
  if (!slug && page.id === currentRoute.id) return;
  const section = slug ? sectionPreview(page, slug) : null;
  const group = groups.find((item) => item.id === page.groupId);
  const meta = [groupHeading(group), section ? page.navTitle : page.readMinutes ? `כ־${page.readMinutes} דקות קריאה` : ""]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");
  preview.style.setProperty("--preview-tone", groupColor(page.groupId));
  preview.innerHTML = `
    <p class="link-preview-meta"><span class="link-preview-dot"></span>${meta}</p>
    <p class="link-preview-title">${section ? section.title : page.titleHtml || escapeHtml(page.title)}</p>
    <div class="link-preview-body prose"></div>`;
  const body = preview.querySelector(".link-preview-body");
  if (section?.parts.length) body.append(...section.parts);
  else body.innerHTML = page.summaryHtml ? `<p>${page.summaryHtml}</p>` : "";
  preview.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  previewFor = link;
  preview.hidden = false;
  placePreview(link);
  queueTypeset([preview]).then(() => {
    if (previewFor === link && !preview.hidden) placePreview(link);
  });
}

function hidePreview() {
  clearTimeout(previewTimer);
  previewFor = null;
  preview.hidden = true;
}

function schedulePreview(link, delay) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => showPreview(link), delay);
}

app.addEventListener("pointerover", (event) => {
  if (!canHover?.matches) return;
  const link = event.target.closest?.(PREVIEW_LINKS);
  if (link && link !== previewFor) schedulePreview(link, 380);
});
app.addEventListener("pointerout", (event) => {
  const link = event.target.closest?.(PREVIEW_LINKS);
  if (link && !link.contains(event.relatedTarget)) hidePreview();
});
app.addEventListener("focusin", (event) => {
  const link = event.target.closest?.(PREVIEW_LINKS);
  if (link?.matches(":focus-visible")) schedulePreview(link, 450);
  else hidePreview();
});
app.addEventListener("focusout", hidePreview);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !preview.hidden) hidePreview();
});
window.addEventListener("scroll", hidePreview, { passive: true });
window.addEventListener("hashchange", hidePreview);

// The study tools (assets/study.js) reuse these helpers.
window.InfiApp = {
  data,
  pages,
  groups,
  groupById,
  pageHref,
  escapeHtml,
  groupHeading,
  groupColor,
  queueTypeset,
  alignSheetGrid,
  setTitle,
  sectionPreview,
  keyGuides
};

// A demo re-draws itself when the column or the grid cell changes size.
let demoAlignFrame = 0;
window.addEventListener("infi:demo-resized", () => {
  cancelAnimationFrame(demoAlignFrame);
  demoAlignFrame = requestAnimationFrame(alignSheetGrid);
});

renderTree();
route({ initial: true });
document.fonts?.ready?.then(() => alignSheetGrid());
// MathJax loads asynchronously; whatever is on screen when it becomes ready
// is typeset then (earlier requests found no MathJax and did nothing).
window.addEventListener("infi:mathjax-ready", () => typesetMath());
