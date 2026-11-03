/* Interactive pencil graphs drawn on the notebook grid.
 *
 * Every figure.demo on a note is filled in here: the native renderer for the
 * vault's Desmos blocks (data-desmos) and the hand-made demos (data-demo).
 * A plot has a transparent background, so the sheet's own squares are the
 * graph paper: one grid cell is a whole number of data steps and the axes
 * lie on grid lines. Controls are native sliders and buttons, so every demo
 * works with a keyboard and a screen reader; results are announced in a
 * polite live region.
 */
(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  let uid = 0;
  const live = new Set();

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  function h(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) if (child != null) node.append(child);
    return node;
  }

  function s(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, value);
    return node;
  }

  const esc = (text) =>
    String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function fmt(value, digits = 2) {
    if (!Number.isFinite(value)) return "—";
    let out = (Math.abs(value) < 1e-12 ? 0 : value).toFixed(digits);
    if (out.includes(".")) out = out.replace(/0+$/, "").replace(/\.$/, "");
    if (out === "-0") out = "0";
    return out.replace(/^-/, "−");
  }

  // A short left-to-right math snippet inside Hebrew text.
  const m = (text) => `<span class="demo-m" dir="ltr">${esc(text)}</span>`;

  const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉" };
  const sub = (n) => String(n).replace(/\d/g, (d) => SUB[d]);
  const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "-": "⁻" };
  const sup = (n) => String(n).replace(/[\d-]/g, (d) => SUP[d]);

  function cellOf(node) {
    const value = parseFloat(getComputedStyle(node).getPropertyValue("--cell"));
    return value > 4 ? value : 17;
  }

  // ---------------------------------------------------------------------------
  // Plot: a grid-aligned SVG in data coordinates
  // ---------------------------------------------------------------------------

  const NICE = [0.001, 0.002, 0.0025, 0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

  class Plot {
    constructor(host, { view, rows = 14, xAxis = true, yAxis = true, xLabel = "x", yLabel = "y", xAlign = "center" }) {
      this.host = host;
      this.view = { ...view };
      this.rows = rows;
      this.xAlign = xAlign;
      this.axesOn = { x: xAxis, y: yAxis, xLabel, yLabel };
      this.id = ++uid;
      this.canvas = h("div", { class: "demo-canvas" });
      this.svg = s("svg", { class: "demo-svg", "aria-hidden": "true", focusable: "false" });
      const defs = s("defs");
      const clip = s("clipPath", { id: `demo-clip-${this.id}` });
      this.clipRect = s("rect", { x: 0, y: 0, width: 0, height: 0 });
      clip.append(this.clipRect);
      const filter = s("filter", { id: `demo-pencil-${this.id}`, x: "-2%", y: "-2%", width: "104%", height: "104%" });
      filter.append(
        s("feTurbulence", { type: "fractalNoise", baseFrequency: "0.85", numOctaves: "1", seed: String(this.id % 7), result: "grain" }),
        s("feDisplacementMap", { in: "SourceGraphic", in2: "grain", scale: "1.15", xChannelSelector: "R", yChannelSelector: "G" })
      );
      defs.append(clip, filter);
      this.bands = s("g", { class: "demo-bands", "clip-path": `url(#demo-clip-${this.id})` });
      this.axes = s("g", { class: "demo-axes", filter: `url(#demo-pencil-${this.id})` });
      this.ink = s("g", { class: "demo-ink", "clip-path": `url(#demo-clip-${this.id})`, filter: `url(#demo-pencil-${this.id})` });
      this.marks = s("g", { class: "demo-marks", "clip-path": `url(#demo-clip-${this.id})` });
      this.svg.append(defs, this.bands, this.axes, this.ink, this.marks);
      this.overlay = h("div", { class: "demo-overlay", "aria-hidden": "true" });
      this.labels = new Map();
      this.canvas.append(this.svg, this.overlay);
      host.append(this.canvas);
      this.layout();
    }

    // Fill the host's width with whole cells and keep a fixed number of rows;
    // the requested view is centred and widened to a whole number of steps,
    // so x = 0 and y = 0 always fall on grid lines.
    layout() {
      const cell = cellOf(this.host);
      const cols = Math.max(8, Math.floor((this.host.clientWidth + 0.5) / cell));
      const rows = this.rows;
      const { xmin, xmax, ymin, ymax } = this.view;
      const fit = (lo, hi, count, align = "center") => {
        for (const step of NICE) {
          const start =
            align === "start" ? Math.floor(lo / step + 1e-9) * step : Math.floor(((lo + hi) / 2 - (count * step) / 2) / step + 1e-9) * step;
          if (start <= lo + 1e-9 && start + count * step >= hi - 1e-9) return { step, start };
        }
        const step = NICE[NICE.length - 1];
        return { step, start: Math.floor(lo / step) * step };
      };
      const fx = fit(xmin, xmax, cols, this.xAlign);
      const fy = fit(ymin, ymax, rows);
      Object.assign(this, { cell, cols, dx: fx.step, dy: fy.step, xLeft: fx.start, xRight: fx.start + cols * fx.step });
      this.yBottom = fy.start;
      this.yTop = fy.start + rows * fy.step;
      this.W = cols * cell;
      this.H = rows * cell;
      const width = this.W;
      const height = this.H + 1;
      this.svg.setAttribute("width", width);
      this.svg.setAttribute("height", height);
      this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.clipRect.setAttribute("width", width);
      this.clipRect.setAttribute("height", height);
    }

    X(x) {
      return ((x - this.xLeft) / this.dx) * this.cell + 0.5;
    }

    Y(y) {
      return ((this.yTop - y) / this.dy) * this.cell + 0.5;
    }

    invX(px) {
      return this.xLeft + ((px - 0.5) / this.cell) * this.dx;
    }

    clear() {
      this.bands.replaceChildren();
      this.axes.replaceChildren();
      this.ink.replaceChildren();
      this.marks.replaceChildren();
    }

    drawAxes() {
      const { cols, rows, cell } = this;
      const inX = (v) => v >= this.xLeft - 1e-9 && v <= this.xRight + 1e-9;
      const inY = (v) => v >= this.yBottom - 1e-9 && v <= this.yTop + 1e-9;
      const axisY = inY(0) ? 0 : this.yBottom;
      const axisX = inX(0) ? 0 : this.xLeft;
      const py = this.Y(axisY);
      const px = this.X(axisX);
      const font = cell * 0.68;
      const pick = (count, limit) => [1, 2, 4, 5, 10, 20].find((k) => count / k <= limit) || 20;
      if (this.axesOn.x) {
        this.axes.append(s("line", { x1: 0.5, y1: py, x2: this.W - 2, y2: py, class: "demo-axis" }));
        this.axes.append(s("path", { d: `M${this.W - 2} ${py} l-${cell * 0.45} -${cell * 0.24} M${this.W - 2} ${py} l-${cell * 0.45} ${cell * 0.24}`, class: "demo-axis" }));
        const every = pick(cols, cell < 17 ? 8 : 11);
        const below = py + cell * 1.05 <= this.H;
        const first = Math.ceil(this.xLeft / (this.dx * every) - 1e-9);
        for (let k = first, guard = 0; Number.isFinite(k) && guard < 400; k += 1, guard += 1) {
          const v = k * this.dx * every;
          if (v > this.xRight - this.dx * 0.5) break;
          if (Math.abs(v - axisX) < 1e-9 && this.axesOn.y) continue;
          const x = this.X(v);
          if (x < cell * 0.6) continue;
          this.axes.append(s("line", { x1: x, y1: py - cell * 0.22, x2: x, y2: py + cell * 0.22, class: "demo-tick-mark" }));
          const label = s("text", { x, y: below ? py + cell * 0.95 : py - cell * 0.4, class: "demo-tick", "text-anchor": "middle", "font-size": font });
          label.textContent = fmt(v, 3);
          this.marks.append(label);
        }
        const name = s("text", { x: this.W - cell * 0.4, y: py - cell * 0.45, class: "demo-axis-name", "text-anchor": "end", "font-size": font * 1.1 });
        name.textContent = this.axesOn.xLabel;
        this.marks.append(name);
      }
      if (this.axesOn.y) {
        this.axes.append(s("line", { x1: px, y1: this.H, x2: px, y2: 2, class: "demo-axis" }));
        this.axes.append(s("path", { d: `M${px} 2 l-${cell * 0.24} ${cell * 0.45} M${px} 2 l${cell * 0.24} ${cell * 0.45}`, class: "demo-axis" }));
        const every = pick(rows, 7);
        const leftSide = px >= cell * 1.6;
        const first = Math.ceil(this.yBottom / (this.dy * every) - 1e-9);
        for (let k = first, guard = 0; Number.isFinite(k) && guard < 400; k += 1, guard += 1) {
          const v = k * this.dy * every;
          if (v > this.yTop - this.dy * 0.5) break;
          if (Math.abs(v - axisY) < 1e-9 && this.axesOn.x) continue;
          const y = this.Y(v);
          if (y > this.H - cell * 0.4) continue;
          this.axes.append(s("line", { x1: px - cell * 0.22, y1: y, x2: px + cell * 0.22, y2: y, class: "demo-tick-mark" }));
          const label = s("text", { x: leftSide ? px - cell * 0.35 : px + cell * 0.35, y: y + font * 0.35, class: "demo-tick", "text-anchor": leftSide ? "end" : "start", "font-size": font });
          label.textContent = fmt(v, 3);
          this.marks.append(label);
        }
        const name = s("text", { x: px + cell * 0.45, y: cell * 0.85, class: "demo-axis-name", "font-size": font * 1.1 });
        name.textContent = this.axesOn.yLabel;
        this.marks.append(name);
      }
    }

    // Samples f across [from, to]; the pencil is lifted at gaps and jumps.
    pathFor(f, from = this.xLeft, to = this.xRight, skip = null) {
      const steps = Math.max(80, Math.round(Math.abs(this.X(to) - this.X(from)) / 1.25));
      let d = "";
      let pen = false;
      let prev = null;
      for (let i = 0; i <= steps; i += 1) {
        const x = from + ((to - from) * i) / steps;
        if (skip !== null && Math.abs(x - skip) < (to - from) / steps / 2) {
          pen = false;
          continue;
        }
        let y;
        try {
          y = f(x);
        } catch {
          y = NaN;
        }
        if (!Number.isFinite(y) || Math.abs(y) > 1e8) {
          pen = false;
          prev = null;
          continue;
        }
        const py = Math.max(-this.H, Math.min(2 * this.H, this.Y(y)));
        if (pen && prev !== null && Math.abs(py - prev) > this.H * 0.9) pen = false;
        d += `${pen ? "L" : "M"}${this.X(x).toFixed(2)} ${py.toFixed(2)}`;
        pen = true;
        prev = py;
      }
      return d;
    }

    curve(f, { cls = "pc-blue", width = 2.2, dash = null, from, to, skip = null } = {}) {
      const d = this.pathFor(f, from, to, skip);
      if (d) this.ink.append(s("path", { d, class: `demo-curve ${cls}`, "stroke-width": width, "stroke-dasharray": dash }));
    }

    // Draws f on [from, to] in pieces whose colour depends on each point.
    curvePieces(f, from, to, colourOf, { width = 3.4, skip = null } = {}) {
      const steps = Math.max(60, Math.round(Math.abs(this.X(to) - this.X(from)) / 1.25));
      let current = null;
      let d = "";
      const flush = () => {
        if (d && current) this.ink.append(s("path", { d, class: `demo-curve ${current}`, "stroke-width": width }));
        d = "";
      };
      let last = null;
      for (let i = 0; i <= steps; i += 1) {
        const x = from + ((to - from) * i) / steps;
        if (skip !== null && Math.abs(x - skip) < Math.abs(to - from) / steps / 2) {
          flush();
          current = null;
          last = null;
          continue;
        }
        const y = f(x);
        if (!Number.isFinite(y)) {
          flush();
          current = null;
          last = null;
          continue;
        }
        const cls = colourOf(x, y);
        const point = `${this.X(x).toFixed(2)} ${Math.max(-this.H, Math.min(2 * this.H, this.Y(y))).toFixed(2)}`;
        if (cls !== current) {
          flush();
          current = cls;
          d = last ? `M${last}L${point}` : `M${point}`;
        } else {
          d += `L${point}`;
        }
        last = point;
      }
      flush();
    }

    line(x1, y1, x2, y2, { cls = "pc-gray", width = 1.8, dash = null, layer = "ink" } = {}) {
      this[layer].append(
        s("line", { x1: this.X(x1), y1: this.Y(y1), x2: this.X(x2), y2: this.Y(y2), class: `demo-line ${cls}`, "stroke-width": width, "stroke-dasharray": dash })
      );
    }

    hline(y, opts) {
      this.line(this.xLeft, y, this.xRight, y, opts);
    }

    vline(x, opts) {
      this.line(x, this.yBottom, x, this.yTop, opts);
    }

    bandY(y1, y2, cls = "band-red") {
      const top = this.Y(Math.max(y1, y2));
      const bottom = this.Y(Math.min(y1, y2));
      this.bands.append(s("rect", { x: 0, y: top, width: this.W, height: Math.max(0, bottom - top), class: `demo-band ${cls}` }));
    }

    bandX(x1, x2, cls = "band-blue", y1 = this.yBottom, y2 = this.yTop) {
      const left = this.X(Math.min(x1, x2));
      const right = this.X(Math.max(x1, x2));
      const top = this.Y(Math.max(y1, y2));
      const bottom = this.Y(Math.min(y1, y2));
      this.bands.append(s("rect", { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top), class: `demo-band ${cls}` }));
    }

    dot(x, y, { cls = "pc-blue", hollow = false, r = null } = {}) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      this.marks.append(
        s("circle", { cx: this.X(x), cy: this.Y(y), r: r ?? this.cell * 0.24, class: `demo-dot ${cls}${hollow ? " is-hollow" : ""}` })
      );
    }

    text(x, y, content, { cls = "", anchor = "middle", dy = 0, size = 0.72 } = {}) {
      const node = s("text", { x: this.X(x), y: this.Y(y) + dy * this.cell, class: `demo-label ${cls}`, "text-anchor": anchor, "font-size": this.cell * size });
      node.textContent = content;
      this.marks.append(node);
    }

    // An HTML label over the plot, for TeX that MathJax typesets once.
    label(key, x, y, tex, { dx = 0.4, dy = -0.5, cls = "" } = {}) {
      let node = this.labels.get(key);
      if (!node) {
        node = h("span", { class: `demo-tex ${cls}` });
        node.textContent = `\\(${tex}\\)`;
        this.overlay.append(node);
        this.labels.set(key, node);
      }
      const visible = Number.isFinite(x) && Number.isFinite(y);
      node.hidden = !visible;
      if (!visible) return;
      const left = Math.min(this.W - this.cell * 2, Math.max(0, this.X(x) + dx * this.cell));
      const top = Math.min(this.H - this.cell, Math.max(0, this.Y(y) + dy * this.cell - this.cell * 0.5));
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
    }

    // Shows (x, f(x)) under the pointer for the plot's main function.
    readout(f) {
      const tip = h("span", { class: "demo-readout", hidden: true });
      const dot = h("span", { class: "demo-readout-dot", hidden: true });
      this.overlay.append(dot, tip);
      const hide = () => {
        tip.hidden = true;
        dot.hidden = true;
      };
      this.svg.addEventListener("pointermove", (event) => {
        const rect = this.svg.getBoundingClientRect();
        const x = this.invX(event.clientX - rect.left);
        let y;
        try {
          y = f(x);
        } catch {
          y = NaN;
        }
        if (!Number.isFinite(y) || y < this.yBottom || y > this.yTop) return hide();
        const px = this.X(x);
        const py = this.Y(y);
        dot.hidden = false;
        dot.style.left = `${px}px`;
        dot.style.top = `${py}px`;
        tip.hidden = false;
        tip.textContent = `(${fmt(x, 2)}, ${fmt(y, 2)})`;
        tip.style.left = `${Math.min(this.W - this.cell * 5, px + this.cell * 0.6)}px`;
        tip.style.top = `${Math.max(0, py - this.cell * 1.6)}px`;
      });
      this.svg.addEventListener("pointerleave", hide);
    }
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  function slider({ label, min, max, step = "any", value, log = false, format = (v) => fmt(v), onInput }) {
    const id = `demo-input-${++uid}`;
    let lo = min;
    let hi = max;
    const toPos = (v) => (log ? (Math.log(v / lo) / Math.log(hi / lo)) * 1000 : v);
    const fromPos = (p) => (log ? lo * Math.pow(hi / lo, p / 1000) : p);
    const input = h("input", {
      type: "range",
      id,
      dir: "ltr",
      min: log ? 0 : min,
      max: log ? 1000 : max,
      step: log ? 1 : step,
      value: String(toPos(value))
    });
    const output = h("output", { for: id, class: "demo-out", dir: "ltr" });
    const wrap = h("div", { class: "demo-slider" }, h("label", { for: id, html: label }), input, output);
    const api = {
      el: wrap,
      input,
      get value() {
        return fromPos(parseFloat(input.value));
      },
      set(v) {
        input.value = String(toPos(v));
        sync();
      },
      range(newLo, newHi, v) {
        lo = newLo;
        hi = newHi;
        if (!log) {
          input.min = String(newLo);
          input.max = String(newHi);
        }
        api.set(v);
      }
    };
    function sync() {
      const text = format(api.value);
      output.textContent = text;
      input.setAttribute("aria-valuetext", text);
    }
    input.addEventListener("input", () => {
      sync();
      onInput?.(api.value);
    });
    sync();
    return api;
  }

  function button(label, onClick, cls = "") {
    return h("button", { type: "button", class: `demo-btn ${cls}`.trim(), onclick: onClick, html: label });
  }

  function choice(label, options, onChange) {
    const id = `demo-select-${++uid}`;
    const select = h(
      "select",
      { id, class: "demo-select", onchange: () => onChange(Number(select.value)) },
      options.map((text, index) => h("option", { value: String(index), html: text }))
    );
    return { el: h("div", { class: "demo-choice" }, h("label", { for: id, html: label }), select), select };
  }

  function check(label, onChange) {
    const id = `demo-check-${++uid}`;
    const input = h("input", { type: "checkbox", id, onchange: () => onChange(input.checked) });
    return { el: h("div", { class: "demo-check" }, input, h("label", { for: id, html: label })), input };
  }

  // The frame every demo shares: title, plot, controls and a live status.
  function frame(fig, title, kicker = "המחשה") {
    const titleId = `demo-title-${++uid}`;
    fig.replaceChildren();
    fig.setAttribute("role", "group");
    fig.setAttribute("aria-labelledby", titleId);
    const head = h("figcaption", { class: "demo-head" }, h("span", { class: "demo-kicker", text: kicker }), h("span", { class: "demo-title", id: titleId, html: title }));
    const plotHost = h("div", { class: "demo-plot" });
    const controls = h("div", { class: "demo-controls" });
    const buttons = h("div", { class: "demo-buttons" });
    const status = h("p", { class: "demo-status", "aria-live": "polite" });
    const panel = h("div", { class: "demo-panel" }, controls, buttons, status);
    fig.append(head, plotHost, panel);
    return {
      plotHost,
      controls,
      buttons,
      panel,
      say(html) {
        status.innerHTML = html;
      }
    };
  }

  // ---------------------------------------------------------------------------
  // A small TeX expression compiler for the vault's Desmos blocks
  // ---------------------------------------------------------------------------

  const FUNCS = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    cot: (x) => 1 / Math.tan(x),
    sec: (x) => 1 / Math.cos(x),
    csc: (x) => 1 / Math.sin(x),
    arcsin: Math.asin,
    arccos: Math.acos,
    arctan: Math.atan,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    ln: Math.log,
    log: Math.log10,
    exp: Math.exp
  };

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) {
        i += 1;
      } else if (ch === "\\") {
        const match = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
        i += match[0].length;
        if ([",", ";", " ", "!", ":"].includes(match[1])) continue;
        tokens.push({ t: "cmd", v: match[1] });
      } else if (/[0-9.]/.test(ch)) {
        const match = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
        tokens.push({ t: "num", v: parseFloat(match[1]) });
        i += match[0].length;
      } else if (/[a-zA-Z]/.test(ch)) {
        tokens.push({ t: "id", v: ch });
        i += 1;
      } else {
        tokens.push({ t: "op", v: ch });
        i += 1;
      }
    }
    return tokens;
  }

  function callFunc(env, name, x, order) {
    const f = env.funcs[name];
    if (!f) return NaN;
    if (!order) return f(x);
    const step = 1e-4 * Math.max(1, Math.abs(x));
    if (order === 1) return (f(x + step) - f(x - step)) / (2 * step);
    return (f(x + step) - 2 * f(x) + f(x - step)) / (step * step);
  }

  function compileTex(src, ctx) {
    const tokens = tokenize(src);
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const isOp = (t, v) => t && t.t === "op" && t.v === v;
    const isCmd = (t, v) => t && t.t === "cmd" && t.v === v;
    const expect = (ok, what) => {
      if (!ok) throw new Error(`expected ${what} in "${src}"`);
    };
    const FACTOR_CMDS = new Set(["frac", "dfrac", "tfrac", "sqrt", "pi", "left", ...Object.keys(FUNCS)]);
    const startsFactor = (t) =>
      Boolean(t) && (t.t === "num" || t.t === "id" || (t.t === "op" && (t.v === "(" || t.v === "[")) || (t.t === "cmd" && FACTOR_CMDS.has(t.v)));

    function parseExpr() {
      let left = parseTerm();
      for (;;) {
        if (isOp(peek(), "+")) {
          next();
          const l = left;
          const r = parseTerm();
          left = (e) => l(e) + r(e);
        } else if (isOp(peek(), "-")) {
          next();
          const l = left;
          const r = parseTerm();
          left = (e) => l(e) - r(e);
        } else return left;
      }
    }

    function parseTerm() {
      let left = parseUnary();
      for (;;) {
        const t = peek();
        if (isOp(t, "*") || isCmd(t, "cdot") || isCmd(t, "times")) {
          next();
          const l = left;
          const r = parseUnary();
          left = (e) => l(e) * r(e);
        } else if (isOp(t, "/")) {
          next();
          const l = left;
          const r = parseUnary();
          left = (e) => l(e) / r(e);
        } else if (startsFactor(t)) {
          const l = left;
          const r = parsePower();
          left = (e) => l(e) * r(e);
        } else return left;
      }
    }

    function parseUnary() {
      if (isOp(peek(), "-")) {
        next();
        const a = parseUnary();
        return (e) => -a(e);
      }
      if (isOp(peek(), "+")) {
        next();
        return parseUnary();
      }
      return parsePower();
    }

    function parsePower() {
      const base = parsePrimary();
      if (isOp(peek(), "^")) {
        next();
        const exponent = parseExponent();
        return (e) => Math.pow(base(e), exponent(e));
      }
      return base;
    }

    function parseExponent() {
      if (isOp(peek(), "{")) {
        next();
        const v = parseExpr();
        expect(isOp(next(), "}"), "}");
        return v;
      }
      if (isOp(peek(), "-")) {
        next();
        const v = parseExponent();
        return (e) => -v(e);
      }
      return parsePrimary();
    }

    function parseBraced() {
      expect(isOp(next(), "{"), "{");
      const v = parseExpr();
      expect(isOp(next(), "}"), "}");
      return v;
    }

    function parseFunction(fn) {
      let power = null;
      if (isOp(peek(), "^")) {
        next();
        power = parseExponent();
      }
      let arg;
      if (isOp(peek(), "(") || isCmd(peek(), "left")) arg = parsePrimary();
      else {
        arg = parsePower();
        while (peek() && (peek().t === "num" || peek().t === "id")) {
          const l = arg;
          const r = parsePower();
          arg = (e) => l(e) * r(e);
        }
      }
      return power ? (e) => Math.pow(fn(arg(e)), power(e)) : (e) => fn(arg(e));
    }

    function parsePrimary() {
      const t = next();
      expect(t, "a value");
      if (t.t === "num") {
        const v = t.v;
        return () => v;
      }
      if (t.t === "op") {
        const close = { "(": ")", "[": "]", "{": "}" }[t.v];
        if (close) {
          const v = parseExpr();
          expect(isOp(next(), close), close);
          return v;
        }
        if (t.v === "|") {
          const v = parseExpr();
          expect(isOp(next(), "|"), "|");
          return (e) => Math.abs(v(e));
        }
        throw new Error(`unexpected "${t.v}" in "${src}"`);
      }
      if (t.t === "cmd") {
        if (t.v === "left") {
          const open = next();
          const close = { "(": ")", "[": "]", "|": "|" }[open?.v];
          expect(close, "a bracket");
          const v = parseExpr();
          expect(isCmd(next(), "right"), "\\right");
          expect(next()?.v === close, close);
          return open.v === "|" ? (e) => Math.abs(v(e)) : v;
        }
        if (t.v === "frac" || t.v === "dfrac" || t.v === "tfrac") {
          const a = parseBraced();
          const b = parseBraced();
          return (e) => a(e) / b(e);
        }
        if (t.v === "sqrt") {
          let n = null;
          if (isOp(peek(), "[")) {
            next();
            n = parseExpr();
            expect(isOp(next(), "]"), "]");
          }
          const a = parseBraced();
          if (!n) return (e) => Math.sqrt(a(e));
          return (e) => {
            const value = a(e);
            const k = n(e);
            return value < 0 && Math.round(k) % 2 === 1 ? -Math.pow(-value, 1 / k) : Math.pow(value, 1 / k);
          };
        }
        if (t.v === "pi") return () => Math.PI;
        if (FUNCS[t.v]) return parseFunction(FUNCS[t.v]);
        throw new Error(`unknown \\${t.v} in "${src}"`);
      }
      const name = t.v;
      if (ctx.funcNames.has(name) && (isOp(peek(), "(") || isOp(peek(), "'") || isCmd(peek(), "left"))) {
        let order = 0;
        while (isOp(peek(), "'")) {
          next();
          order += 1;
        }
        const arg = parsePrimary();
        return (e) => callFunc(e, name, arg(e), order);
      }
      if (name === "x") return (e) => e.x;
      if (name in ctx.params) return (e) => e.params[name];
      if (name === "e") return () => Math.E;
      throw new Error(`unknown "${name}" in "${src}"`);
    }

    const result = parseExpr();
    expect(pos === tokens.length, "the end");
    return result;
  }

  // Splits "(a, f(a))" at its top-level comma.
  function splitPoint(latex) {
    const inner = latex.trim().replace(/^\\left\(/, "(").replace(/\\right\)$/, ")");
    if (!inner.startsWith("(") || !inner.endsWith(")")) return null;
    const body = inner.slice(1, -1);
    let depth = 0;
    for (let i = 0; i < body.length; i += 1) {
      const c = body[i];
      if (c === "(" || c === "{" || c === "[") depth += 1;
      else if (c === ")" || c === "}" || c === "]") depth -= 1;
      else if (c === "," && depth === 0) return [body.slice(0, i), body.slice(i + 1)];
    }
    return null;
  }

  const DESMOS_COLOURS = {
    "#2d70b3": "pc-blue",
    "#c74440": "pc-red",
    "#388c46": "pc-green",
    "#6042a6": "pc-purple",
    "#fa7e19": "pc-orange",
    "#000000": "pc-gray",
    "#666666": "pc-gray"
  };
  const ROTATION = ["pc-blue", "pc-red", "pc-green", "pc-purple", "pc-orange"];

  function desmos(fig) {
    const spec = JSON.parse(fig.dataset.desmos);
    const view = spec.graph?.viewport || { xmin: -10, xmax: 10, ymin: -7, ymax: 7 };
    const list = (spec.expressions?.list || []).filter((e) => e.type === "expression" && typeof e.latex === "string" && !e.hidden);
    const funcNames = new Set();
    const params = {};
    const paramBounds = {};
    for (const e of list) {
      let match = /^\s*([a-wzA-Z])\s*\(\s*x\s*\)\s*=/.exec(e.latex);
      if (match) funcNames.add(match[1]);
      else if ((match = /^\s*([a-wzA-Z])\s*=\s*(-?\d+(?:\.\d+)?)\s*$/.exec(e.latex))) {
        params[match[1]] = parseFloat(match[2]);
        paramBounds[match[1]] = e.sliderBounds || {};
      }
    }
    const ctx = { funcNames, params };
    const env = { params: { ...params }, funcs: {} };
    const items = [];
    list.forEach((e, index) => {
      const cls = DESMOS_COLOURS[(e.color || "").toLowerCase()] || ROTATION[index % ROTATION.length];
      const dash = e.lineStyle === "DASHED" ? "7 6" : e.lineStyle === "DOTTED" ? "2 5" : null;
      const latex = e.latex.trim();
      try {
        let match;
        if ((match = /^([a-wzA-Z])\s*\(\s*x\s*\)\s*=(.+)$/.exec(latex))) {
          const body = compileTex(match[2], ctx);
          env.funcs[match[1]] = (x) => body({ x, params: env.params, funcs: env.funcs });
          items.push({ kind: "curve", f: env.funcs[match[1]], cls, dash, latex });
        } else if ((match = /^y\s*=(.+)$/.exec(latex))) {
          const body = compileTex(match[1], ctx);
          items.push({ kind: "curve", f: (x) => body({ x, params: env.params, funcs: env.funcs }), cls, dash, latex });
        } else if ((match = /^x\s*=(.+)$/.exec(latex))) {
          const body = compileTex(match[1], ctx);
          items.push({ kind: "vline", at: () => body({ x: 0, params: env.params, funcs: env.funcs }), cls, dash, latex });
        } else if (/^\s*([a-wzA-Z])\s*=\s*-?\d/.test(latex)) {
          // a slider parameter, handled below
        } else {
          const parts = splitPoint(latex);
          if (!parts) throw new Error(`unsupported "${latex}"`);
          const px = compileTex(parts[0], ctx);
          const py = compileTex(parts[1], ctx);
          const at = () => {
            const scope = { x: 0, params: env.params, funcs: env.funcs };
            return [px(scope), py(scope)];
          };
          items.push({ kind: "point", at, cls, label: e.showLabel ? e.label || latex : null, key: `p${index}`, open: e.pointStyle === "OPEN" });
        }
      } catch (error) {
        console.warn("[demos] skipped Desmos expression:", error.message);
      }
    });

    const shown = items.filter((item) => item.kind !== "point").map((item) => item.latex);
    const ui = frame(fig, "גרף על המשבצות", "גרף");
    const plot = new Plot(ui.plotHost, { view, rows: 14 });
    const legend = h(
      "ul",
      { class: "demo-legend" },
      items
        .filter((item) => item.kind !== "point")
        .map((item) => h("li", {}, h("span", { class: `demo-swatch ${item.cls}${item.dash ? " is-dashed" : ""}`, "aria-hidden": "true" }), h("span", { text: `\\(${item.latex}\\)` })))
    );
    ui.controls.append(legend);
    for (const [name, initial] of Object.entries(params)) {
      const span = view.xmax - view.xmin;
      const bounds = paramBounds[name];
      const number = (value) => value === undefined || value === null || value === "" ? NaN : Number(value);
      const requestedMin = number(bounds.min);
      const requestedMax = number(bounds.max);
      const requestedStep = number(bounds.step);
      const validBounds = Number.isFinite(requestedMin) && Number.isFinite(requestedMax) && requestedMin < requestedMax && initial >= requestedMin && initial <= requestedMax;
      const control = slider({
        label: `\\(${name}\\)`,
        min: validBounds ? requestedMin : view.xmin,
        max: validBounds ? requestedMax : view.xmax,
        step: Number.isFinite(requestedStep) && requestedStep > 0 ? requestedStep : span / 400,
        value: initial,
        onInput: (v) => {
          env.params[name] = v;
          draw();
          describe();
        }
      });
      ui.controls.append(control.el);
    }
    const main = items.find((item) => item.kind === "curve");
    if (main) plot.readout(main.f);

    function draw() {
      plot.clear();
      plot.drawAxes();
      for (const item of items) {
        if (item.kind === "curve") plot.curve(item.f, { cls: item.cls, dash: item.dash });
        else if (item.kind === "vline") plot.vline(item.at(), { cls: item.cls, dash: item.dash, width: 2 });
        else if (item.kind === "point") {
          const [x, y] = item.at();
          plot.dot(x, y, { cls: item.cls, hollow: item.open });
          if (item.label) plot.label(item.key, x, y, item.label);
        }
      }
    }

    function describe() {
      const values = Object.entries(env.params).map(([name, v]) => m(`${name} = ${fmt(v)}`));
      const points = items
        .filter((item) => item.kind === "point")
        .map((item) => {
          const [x, y] = item.at();
          return m(`(${fmt(x)}, ${fmt(y)})`);
        });
      ui.say(
        [values.length ? `ערך: ${values.join(", ")}.` : "", points.length ? `נקודות: ${points.join(", ")}.` : "", main ? "העבירו את העכבר על הגרף כדי לקרוא ערכים." : ""]
          .filter(Boolean)
          .join(" ")
      );
    }

    describe();
    return {
      render() {
        plot.layout();
        draw();
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Hand-made demos
  // ---------------------------------------------------------------------------

  const DEMOS = {};

  // Unit 1: sup A for A = [a, b), and why it is not a maximum.
  DEMOS.sup = (fig) => {
    const a = -1.4;
    const b = 2.6;
    const ui = frame(fig, "החסם העליון של \\(A=[a,b)\\)");
    const plot = new Plot(ui.plotHost, { view: { xmin: -3, xmax: 4.6, ymin: -1.5, ymax: 1.5 }, rows: 7, yAxis: false });
    const state = { M: 3.6, eps: 0.5 };
    const M = slider({ label: "חסם מועמד \\(M\\)", min: -2.5, max: 4.5, step: 0.05, value: state.M, onInput: (v) => ((state.M = v), update()) });
    const eps = slider({ label: "\\(\\varepsilon\\)", min: 0.05, max: 1.5, step: 0.05, value: state.eps, onInput: (v) => ((state.eps = v), update()) });
    ui.controls.append(M.el, eps.el);
    ui.buttons.append(
      button("קבעו \\(M=\\sup A\\)", () => {
        state.M = b;
        M.set(b);
        update();
      })
    );

    function draw() {
      plot.clear();
      plot.drawAxes();
      const { M: candidate, eps: e } = state;
      plot.bandX(candidate - e, candidate, "band-red", -0.55, 0.55);
      plot.line(a, 0.75, b, 0.75, { cls: "pc-blue", width: 4 });
      plot.dot(a, 0.75, { cls: "pc-blue" });
      plot.dot(b, 0.75, { cls: "pc-blue", hollow: true });
      plot.text((a + b) / 2, 0.75, "A", { cls: "pc-blue-text", dy: -0.6, size: 0.9 });
      plot.text(a, 0, "a", { cls: "pc-blue-text", dy: 1.55 });
      plot.text(b, 0, "b", { cls: "pc-blue-text", dy: 1.55 });
      plot.line(candidate, -1.1, candidate, 1.05, { cls: "pc-red", width: 2.4 });
      plot.text(candidate + plot.dx * 0.25, 1.05, "M", { cls: "pc-red-text", dy: 0.1, size: 0.9, anchor: "start" });
      const witness = Math.min(b - 0.02, candidate) > candidate - e ? Math.max(a, Math.min(b - Math.min(0.06, e / 3), candidate - e / 3)) : null;
      if (witness !== null && witness >= a && witness < b && witness > candidate - e) plot.dot(witness, 0.75, { cls: "pc-green", r: plot.cell * 0.3 });
    }

    function update() {
      draw();
      const { M: candidate, eps: e } = state;
      const isBound = candidate >= b - 1e-9;
      const close = candidate - e < b - 1e-9;
      const Mt = m(`M = ${fmt(candidate)}`);
      if (!isBound) {
        ui.say(`${Mt} <strong>אינו חסם מלעיל</strong>: יש ב-${m("A")} מספרים גדולים ממנו, למשל ${m(fmt((Math.max(candidate, a) + b) / 2))}.`);
      } else if (!close) {
        ui.say(`${Mt} חסם מלעיל, אבל עבור ${m(`ε = ${fmt(e)}`)} אין ב-${m("A")} מספר גדול מ-${m(`M − ε = ${fmt(candidate - e)}`)}. יש חסם מלעיל קטן יותר, ולכן ${m("M")} אינו הסופרמום.`);
      } else if (candidate > b + 1e-9) {
        ui.say(`${Mt} חסם מלעיל, ועבור ${m(`ε = ${fmt(e)}`)} יש ב-${m("A")} מספר גדול מ-${m("M − ε")} (הנקודה הירוקה). אבל זה לא נכון לכל ${m("ε")}: עבור ${m(`ε < M − b = ${fmt(candidate - b)}`)} זה נכשל.`);
      } else {
        ui.say(`${m(`M = b = ${fmt(b)}`)} הוא ${m("sup A")}: חסם מלעיל, ולכל ${m("ε > 0")} יש ב-${m("A")} מספר גדול מ-${m("M − ε")}. אבל ${m(`${fmt(b)} ∉ A`)}, ולכן ל-${m("A")} <strong>אין מקסימום</strong>.`);
      }
    }

    update();
    return {
      render() {
        plot.layout();
        draw();
      }
    };
  };

  // Unit 2: the ε–N definition of a limit of a sequence.
  DEMOS["epsilon-n"] = (fig) => {
    const cases = [
      { name: "aₙ = 1 + (−1)ⁿ/n", a: (n) => 1 + (-1) ** n / n, L: 1, N: (e) => Math.floor(1 / e + 1e-9) },
      { name: "aₙ = n/(n+1)", a: (n) => n / (n + 1), L: 1, N: (e) => Math.max(0, Math.floor(1 / e - 1 + 1e-9)) },
      { name: "aₙ = (−1)ⁿ (מתבדרת)", a: (n) => (-1) ** n, L: 1, N: (e) => (e > 2 ? 0 : null) }
    ];
    const ui = frame(fig, "הגבול של סדרה: לכל \\(\\varepsilon\\) קיים \\(N\\)");
    const state = { c: 0, eps: 0.25 };
    const plot = new Plot(ui.plotHost, { view: { xmin: -2, xmax: 40, ymin: -1.4, ymax: 2.4 }, rows: 12, xLabel: "n", yLabel: "aₙ", xAlign: "start" });
    const pick = choice("סדרה", cases.map((c) => c.name), (i) => {
      state.c = i;
      update();
    });
    const eps = slider({ label: "\\(\\varepsilon\\)", min: 0.03, max: 1, step: 0.01, value: state.eps, onInput: (v) => ((state.eps = v), update()) });
    ui.controls.append(pick.el, eps.el);

    function draw() {
      const cs = cases[state.c];
      const e = state.eps;
      const N = cs.N(e);
      plot.clear();
      plot.bandY(cs.L - e, cs.L + e, "band-red");
      plot.drawAxes();
      plot.hline(cs.L, { cls: "pc-red", dash: "7 6", width: 1.6 });
      plot.text(plot.xRight - plot.dx, cs.L, "L", { cls: "pc-red-text", dy: -0.4, anchor: "end" });
      if (N !== null && N < plot.xRight - 1) {
        plot.vline(N + 0.5, { cls: "pc-green", width: 2.2, dash: "3 4" });
        plot.text(N + 0.5, plot.yBottom, `N = ${N}`, { cls: "pc-green-text", dy: -0.35, anchor: "start" });
      }
      const last = Math.floor(plot.xRight - plot.dx * 0.5);
      for (let n = 1; n <= last; n += 1) {
        const value = cs.a(n);
        const inside = Math.abs(value - cs.L) < e;
        const cls = N !== null && n > N ? "pc-green" : inside ? "pc-blue" : "pc-red";
        plot.dot(n, value, { cls, r: plot.cell * 0.2 });
      }
    }

    function update() {
      draw();
      const cs = cases[state.c];
      const e = state.eps;
      const N = cs.N(e);
      if (N === null) {
        ui.say(`עבור ${m(`ε = ${fmt(e)}`)} <strong>אין N כזה</strong>: לכל ${m("N")} יש ${m("n > N")} עם ${m("|aₙ − 1| = 2 ≥ ε")}. הסדרה לא שואפת ל-1, וגם לא לשום גבול אחר.`);
      } else {
        ui.say(`עבור ${m(`ε = ${fmt(e)}`)} מספיק ${m(`N = ${N}`)}: לכל ${m(`n > ${N}`)} מתקיים ${m(`|aₙ − ${fmt(cs.L)}| < ${fmt(e)}`)} (הנקודות הירוקות). הקטינו את ${m("ε")}: ${m("N")} גדל, אבל תמיד קיים.`);
      }
    }

    update();
    return {
      render() {
        plot.layout();
        draw();
      }
    };
  };

  // Unit 3: Cantor's lemma on nested closed intervals, and why "closed" matters.
  DEMOS["nested-intervals"] = (fig) => {
    const ui = frame(fig, "הלמה של קנטור: קטעים סגורים מקוננים");
    const plot = new Plot(ui.plotHost, { view: { xmin: -0.4, xmax: 8.4, ymin: -13, ymax: 1 }, rows: 14, yAxis: false });
    const state = { open: false, list: [[0, 8]] };
    const left = button("חצי שמאלי", () => halve(0));
    const right = button("חצי ימני", () => halve(1));
    const random = button("אקראי", () => halve(Math.random() < 0.5 ? 0 : 1));
    const nextOpen = button("הקטע הבא", () => {
      state.list.push([0, 8 / (state.list.length + 1)]);
      update();
    });
    const reset = button("מההתחלה", () => {
      state.list = [[0, 8]];
      update();
    }, "is-quiet");
    const mode = check("דוגמה נגדית: קטעים פתוחים \\((0,\\tfrac{8}{n})\\)", (on) => {
      state.open = on;
      state.list = [[0, 8]];
      update();
    });
    ui.controls.append(mode.el);
    ui.buttons.append(left, right, random, nextOpen, reset);

    function halve(side) {
      if (state.list.length >= 40) return;
      const [lo, hi] = state.list[state.list.length - 1];
      const mid = (lo + hi) / 2;
      state.list.push(side ? [mid, hi] : [lo, mid]);
      update();
    }

    function draw() {
      plot.clear();
      plot.drawAxes();
      const shown = state.list.slice(-11);
      const offset = state.list.length - shown.length;
      shown.forEach(([lo, hi], i) => {
        const y = -2 - i;
        const cls = ["pc-blue", "pc-green", "pc-red", "pc-purple", "pc-orange"][(i + offset) % 5];
        plot.line(lo, y, hi, y, { cls, width: 3.6 });
        plot.dot(lo, y, { cls, hollow: state.open, r: plot.cell * 0.2 });
        plot.dot(hi, y, { cls, hollow: state.open, r: plot.cell * 0.2 });
        plot.text(lo, y, `I${sub(i + offset + 1)}`, { cls: "demo-label-muted", anchor: "end", dy: 0.28, size: 0.72 });
      });
      if (!state.open && state.list.length > 3) {
        const [lo, hi] = state.list[state.list.length - 1];
        plot.vline((lo + hi) / 2, { cls: "pc-gray", dash: "4 4", width: 1.4 });
        plot.text((lo + hi) / 2, plot.yTop, "c", { dy: 0.95, size: 0.85 });
      }
      if (state.open) plot.dot(0, 0, { cls: "pc-red", hollow: true, r: plot.cell * 0.28 });
    }

    function update() {
      for (const node of [left, right, random]) node.hidden = state.open;
      nextOpen.hidden = !state.open;
      draw();
      const k = state.list.length;
      const [lo, hi] = state.list[k - 1];
      if (state.open) {
        ui.say(`${m(`I${sub(k)} = (0, ${fmt(hi, 3)})`)}. כל ${m("x > 0")} יוצא מהקטעים כש-${m("n > 8/x")}, ו-${m("0")} לא שייך לאף קטע: <strong>החיתוך ריק</strong>. לכן בלמה של קנטור הקטעים חייבים להיות סגורים.`);
      } else if (k === 1) {
        ui.say(`בחרו בכל שלב חצי של הקטע. לכל בחירה, האורכים שואפים ל-0 והחיתוך הוא נקודה אחת.`);
      } else {
        ui.say(`${m(`I${sub(k)} = [${fmt(lo, 4)}, ${fmt(hi, 4)}]`)}, אורך ${m(fmt(hi - lo, 4))}. כל הקטעים מכילים את ${m(`c ≈ ${fmt((lo + hi) / 2, 4)}`)}, והאורכים שואפים ל-0, ולכן ${m("⋂ Iₙ = {c}")}.`);
      }
    }

    update();
    return {
      render() {
        plot.layout();
        draw();
      }
    };
  };

  // Unit 4: the ε–δ definition as a game against a challenger.
  DEMOS["epsilon-delta"] = (fig) => {
    const cases = [
      { name: "f(x) = x², x₀ = 2", f: (x) => x * x, x0: 2, L: 4 },
      { name: "f(x) = sin x / x, x₀ = 0", f: (x) => Math.sin(x) / x, x0: 0, L: 1 },
      { name: "פונקציה עם קפיצה, x₀ = 1", f: (x) => (x < 1 ? x : x + 1), x0: 1, L: 1.5, jump: true }
    ];
    const ROUNDS = [1, 0.5, 0.25, 0.1, 0.05, 0.02];
    const ui = frame(fig, "משחק \\(\\varepsilon\\)-\\(\\delta\\): האתגר בוחר \\(\\varepsilon\\), אתם בוחרים \\(\\delta\\)", "משחק");
    const state = { c: 0, round: 0, wins: 0, misses: 0, witness: null, won: false };
    const plot = new Plot(ui.plotHost, { view: { xmin: 0, xmax: 4, ymin: 0, ymax: 8 }, rows: 14 });
    const pick = choice("פונקציה", cases.map((c) => c.name), (i) => {
      state.c = i;
      state.round = 0;
      state.wins = 0;
      state.misses = 0;
      startRound();
    });
    const delta = slider({ label: "\\(\\delta\\)", log: true, min: 0.001, max: 1, value: 0.5, format: (v) => fmt(v, 4), onInput: () => ((state.witness = null), (state.won = false), draw()) });
    const checkBtn = button("בדקו את \\(\\delta\\)", judge);
    const nextBtn = button("סיבוב הבא: \\(\\varepsilon\\) קטן יותר", () => {
      state.round += 1;
      startRound();
    });
    const againBtn = button("שחקו שוב", () => {
      state.round = 0;
      state.wins = 0;
      state.misses = 0;
      startRound();
    }, "is-quiet");
    ui.controls.append(pick.el, delta.el);
    ui.buttons.append(checkBtn, nextBtn, againBtn);

    const worst = (cs, d) => {
      let best = { x: null, gap: -1 };
      const samples = 1200;
      for (let i = 1; i < samples; i += 1) {
        const t = -1 + (2 * i) / samples;
        const x = cs.x0 + t * d;
        if (Math.abs(x - cs.x0) < 1e-12) continue;
        const gap = Math.abs(cs.f(x) - cs.L);
        if (gap > best.gap) best = { x, gap };
      }
      return best;
    };

    const deltaStar = (cs, e) => {
      if (worst(cs, 1e-6).gap >= e) return null;
      let lo = 1e-6;
      let hi = 2;
      if (worst(cs, hi).gap < e) return hi;
      for (let i = 0; i < 40; i += 1) {
        const mid = Math.sqrt(lo * hi);
        if (worst(cs, mid).gap < e) lo = mid;
        else hi = mid;
      }
      return lo;
    };

    function startRound() {
      const cs = cases[state.c];
      const e = ROUNDS[state.round];
      const star = deltaStar(cs, e);
      state.star = star;
      state.witness = null;
      state.won = false;
      state.misses = state.round === 0 ? 0 : state.misses;
      const hx = star ? Math.min(Math.max(star * 3.2, 0.004), 3) : 1.2;
      const hy = Math.max(e * 2.3, 0.04);
      plot.view = { xmin: cs.x0 - hx, xmax: cs.x0 + hx, ymin: cs.L - hy, ymax: cs.L + hy };
      const lo = star ? star / 25 : 0.002;
      const hi = star ? Math.min(star * 3, hx) : 1;
      delta.range(lo, hi, hi * 0.8);
      nextBtn.hidden = true;
      againBtn.hidden = true;
      checkBtn.hidden = false;
      plot.layout();
      draw();
      ui.say(`סיבוב ${state.round + 1} מתוך ${ROUNDS.length}: האתגר בחר ${m(`ε = ${fmt(e)}`)}. מצאו ${m("δ")} כך שלכל ${m(`0 < |x − ${fmt(cs.x0)}| < δ`)} יתקיים ${m(`|f(x) − ${fmt(cs.L)}| < ε`)}. החלק הירוק של הגרף בתוך הרצועה, האדום מחוצה לה.`);
    }

    function draw() {
      const cs = cases[state.c];
      const e = ROUNDS[state.round];
      const d = delta.value;
      plot.clear();
      plot.bandY(cs.L - e, cs.L + e, "band-red");
      plot.bandX(cs.x0 - d, cs.x0 + d, "band-blue");
      plot.drawAxes();
      plot.hline(cs.L, { cls: "pc-red", dash: "7 6", width: 1.4 });
      plot.vline(cs.x0, { cls: "pc-blue", dash: "7 6", width: 1.4 });
      plot.curve(cs.f, { cls: "pc-gray", width: 2, skip: cs.x0 });
      plot.curvePieces(cs.f, cs.x0 - d, cs.x0 + d, (x, y) => (Math.abs(y - cs.L) < e ? "pc-green" : "pc-red"), { skip: cs.x0 });
      plot.dot(cs.x0, cs.L, { cls: "pc-blue", hollow: true });
      plot.text(plot.xRight, cs.L + e, "L + ε", { cls: "pc-red-text", anchor: "end", dy: -0.3, size: 0.66 });
      plot.text(plot.xRight, cs.L - e, "L − ε", { cls: "pc-red-text", anchor: "end", dy: 0.85, size: 0.66 });
      if (state.witness !== null) {
        plot.dot(state.witness, cs.f(state.witness), { cls: "pc-red", r: plot.cell * 0.32 });
      }
    }

    function judge() {
      const cs = cases[state.c];
      const e = ROUNDS[state.round];
      const d = delta.value;
      const bad = worst(cs, d);
      if (bad.gap < e) {
        state.wins += 1;
        state.won = true;
        state.witness = null;
        draw();
        checkBtn.hidden = true;
        if (state.round + 1 < ROUNDS.length) {
          nextBtn.hidden = false;
          ui.say(`<strong>ניצחתם את הסיבוב.</strong> לכל ${m("x")} במרחק פחות מ-${m(`δ = ${fmt(d, 4)}`)} מ-${m(fmt(cs.x0))}, ${m("f(x)")} רחוק פחות מ-${m(`ε = ${fmt(e)}`)} מ-${m(fmt(cs.L))}. מוכנים ל-${m("ε")} קטן יותר?`);
          nextBtn.focus();
        } else {
          againBtn.hidden = false;
          ui.say(`<strong>ניצחתם בכל ${ROUNDS.length} הסיבובים!</strong> זו בדיוק ההגדרה: לכל ${m("ε > 0")} קיים ${m("δ > 0")}, ולכן ${m(`lim f(x) = ${fmt(cs.L)}`)}.`);
          againBtn.focus();
        }
      } else {
        state.misses += 1;
        state.witness = bad.x;
        draw();
        const hint =
          cs.jump && state.misses >= 2
            ? ` כאן אי אפשר לנצח: לכל ${m("δ")} יש ${m("x")} קרוב ל-1 שבו ${m("f(x)")} רחוק מ-1.5 לפחות 0.5. <strong>לפונקציה אין גבול ב-1.</strong>`
            : ` נסו ${m("δ")} קטן יותר.`;
        ui.say(`ב-${m(`x = ${fmt(bad.x, 4)}`)} (הנקודה האדומה) ${m(`f(x) = ${fmt(cs.f(bad.x), 4)}`)}, רחוק מ-${m(fmt(cs.L))} יותר מ-${m(`ε = ${fmt(e)}`)}.${hint}`);
      }
    }

    startRound();
    return {
      render() {
        plot.layout();
        draw();
      }
    };
  };

  // Unit 5: the intermediate value theorem by bisection.
  DEMOS.bisection = (fig) => {
    const f = (x) => x ** 3 + x - 1;
    const ui = frame(fig, "ערך הביניים בחצייה: \\(f(x)=x^3+x-1\\) בקטע \\([0,1]\\)");
    const plot = new Plot(ui.plotHost, { view: { xmin: -0.15, xmax: 1.15, ymin: -1.5, ymax: 1.25 }, rows: 14 });
    const state = { list: [[0, 1]], done: false };
    const step = button("שלב חצייה", () => {
      if (state.list.length > 14) return;
      const [a, b] = state.list[state.list.length - 1];
      const mid = (a + b) / 2;
      state.list.push(f(mid) < 0 ? [mid, b] : [a, mid]);
      update(mid);
    });
    const reset = button("מההתחלה", () => {
      state.list = [[0, 1]];
      update(null);
    }, "is-quiet");
    ui.buttons.append(step, reset);
    plot.readout(f);

    function draw(mid) {
      plot.clear();
      plot.drawAxes();
      plot.curve(f, { cls: "pc-blue", width: 2.4 });
      const shown = state.list.slice(-6);
      shown.forEach(([a, b], i) => {
        const y = -1.25 - i * 0.13;
        plot.line(a, y, b, y, { cls: i === shown.length - 1 ? "pc-green" : "pc-gray", width: i === shown.length - 1 ? 4 : 2.6 });
      });
      const [a, b] = state.list[state.list.length - 1];
      plot.bandX(a, b, "band-green");
      plot.dot(a, f(a), { cls: "pc-red" });
      plot.dot(b, f(b), { cls: "pc-blue" });
      if (mid !== null && mid !== undefined) plot.dot(mid, f(mid), { cls: "pc-gray", r: plot.cell * 0.2 });
    }

    function update(mid) {
      draw(mid);
      const k = state.list.length - 1;
      const [a, b] = state.list[k];
      step.disabled = k >= 14;
      if (k === 0) {
        ui.say(`${m("f(0) = −1 < 0")} ו-${m("f(1) = 1 > 0")}. בכל שלב בודקים את האמצע ושומרים את החצי שבו ${m("f")} מחליפה סימן, כך ש-${m("f(aₙ) < 0 < f(bₙ)")} תמיד.`);
      } else {
        const sign = f(mid) < 0 ? "< 0" : "> 0";
        ui.say(`שלב ${k}: ${m(`f(${fmt(mid, 5)}) ${sign}`)}, ולכן הקטע החדש הוא ${m(`[${fmt(a, 5)}, ${fmt(b, 5)}]`)} באורך ${m(`2${sup(-k)} ≈ ${fmt(b - a, 5)}`)}. השורש נמצא בקטע הזה (הערך המדויק ${m("c ≈ 0.68233")}).${k >= 14 ? " זה כבר דיוק של ארבע ספרות." : ""}`);
      }
    }

    update(null);
    return {
      render() {
        plot.layout();
        draw(null);
      }
    };
  };

  // Unit 5: uniform continuity, with δ(x₀) for f(x) = x².
  DEMOS.uniform = (fig) => {
    const f = (x) => x * x;
    const ui = frame(fig, "רציפות במידה שווה: \\(f(x)=x^2\\)");
    const plot = new Plot(ui.plotHost, { view: { xmin: -0.4, xmax: 4.6, ymin: -1, ymax: 20 }, rows: 11, xAlign: "start" });
    const state = { eps: 1, x0: 1 };
    const deltaAt = (x0, e) => Math.sqrt(x0 * x0 + e) - x0;
    const eps = slider({ label: "\\(\\varepsilon\\)", min: 0.2, max: 3, step: 0.1, value: state.eps, onInput: (v) => ((state.eps = v), update()) });
    const x0 = slider({ label: "\\(x_0\\)", min: 0, max: 4, step: 0.05, value: state.x0, onInput: (v) => ((state.x0 = v), update()) });
    ui.controls.append(eps.el, x0.el);

    function draw() {
      const { eps: e, x0: p } = state;
      const d = deltaAt(p, e);
      plot.clear();
      plot.bandY(f(p) - e, f(p) + e, "band-red");
      plot.bandX(p - d, p + d, "band-blue");
      plot.drawAxes();
      plot.curve(f, { cls: "pc-blue", width: 2.4 });
      plot.curvePieces(f, Math.max(plot.xLeft, p - d), p + d, () => "pc-green", { width: 3.6 });
      plot.dot(p, f(p), { cls: "pc-blue" });
      plot.text(p, plot.yBottom, `δ = ${fmt(d, 3)}`, { cls: "pc-blue-text", dy: -0.35, size: 0.66 });
    }

    function update() {
      draw();
      const { eps: e, x0: p } = state;
      const d = deltaAt(p, e);
      const d4 = deltaAt(4, e);
      ui.say(`ב-${m(`x₀ = ${fmt(p)}`)} ה-${m("δ")} הגדול ביותר הוא ${m(`δ = ${fmt(d, 3)}`)}. ככל ש-${m("x₀")} גדל, ${m("δ")} קטן. על הקטע ${m("[0, 4]")} אפשר לקחת ${m(`δ = δ(4) = ${fmt(d4, 3)}`)} לכל הנקודות: זו רציפות במידה שווה (משפט קנטור). על כל ${m("ℝ")}, ${m("δ(x₀) → 0")} ואין ${m("δ")} אחד שמתאים לכולן.`);
    }

    update();
    return {
      render() {
        plot.layout();
        draw();
      }
    };
  };

  // Unit 7: the derivative as the limit of secant slopes.
  DEMOS.secant = (fig) => {
    const f = (x) => x * x;
    const ui = frame(fig, "מהמיתר למשיק: \\(f(x)=x^2\\)");
    const plot = new Plot(ui.plotHost, { view: { xmin: -0.6, xmax: 3.4, ymin: -0.8, ymax: 7.5 }, rows: 10 });
    const state = { a: 1, h: 1.2, neg: false };
    const a = slider({ label: "\\(a\\)", min: 0, max: 2, step: 0.05, value: state.a, onInput: (v) => ((state.a = v), update()) });
    const hs = slider({ label: "\\(|h|\\)", log: true, min: 0.001, max: 1.4, value: state.h, format: (v) => fmt(v, 4), onInput: (v) => ((state.h = v), update()) });
    const side = check("\\(h<0\\) (מיתר משמאל)", (on) => ((state.neg = on), update()));
    ui.controls.append(a.el, hs.el, side.el);
    plot.readout(f);

    function draw() {
      const p = state.a;
      const step = state.neg ? -state.h : state.h;
      const q = p + step;
      const slope = (f(q) - f(p)) / step;
      plot.clear();
      plot.drawAxes();
      plot.curve(f, { cls: "pc-blue", width: 2.4 });
      plot.curve((x) => f(p) + 2 * p * (x - p), { cls: "pc-green", width: 1.6, dash: "7 6" });
      plot.curve((x) => f(p) + slope * (x - p), { cls: "pc-red", width: 2 });
      plot.line(p, f(p), q, f(p), { cls: "pc-gray", width: 1.3, dash: "3 4" });
      plot.line(q, f(p), q, f(q), { cls: "pc-gray", width: 1.3, dash: "3 4" });
      plot.dot(p, f(p), { cls: "pc-blue" });
      plot.dot(q, f(q), { cls: "pc-red" });
    }

    function update() {
      draw();
      const p = state.a;
      const step = state.neg ? -state.h : state.h;
      const slope = (f(p + step) - f(p)) / step;
      ui.say(`שיפוע המיתר (אדום) ${m(`(f(a+h) − f(a))/h = 2a + h = ${fmt(slope, 4)}`)}, ושיפוע המשיק (ירוק מקווקו) ${m(`f′(${fmt(p)}) = 2a = ${fmt(2 * p, 4)}`)}. ההפרש הוא בדיוק ${m(`h = ${fmt(step, 4)}`)}: כש-${m("h → 0")} המיתר הופך למשיק.`);
    }

    update();
    return {
      render() {
        plot.layout();
        draw();
      }
    };
  };

  // Unit 8: Lagrange's mean value theorem.
  DEMOS.mvt = (fig) => {
    const f = (x) => 0.15 * x ** 3 - 1.2 * x * x + 2.7 * x + 0.5;
    const df = (x) => 0.45 * x * x - 2.4 * x + 2.7;
    const A = 0.5;
    const B = 4.5;
    const chord = (f(B) - f(A)) / (B - A);
    const solutions = [1.5, 23 / 6];
    const ui = frame(fig, "משפט לגראנז': נקודה שבה המשיק מקביל למיתר");
    const plot = new Plot(ui.plotHost, { view: { xmin: 0, xmax: 5, ymin: 0, ymax: 3 }, rows: 12 });
    const state = { c: 2.7, next: 0 };
    const c = slider({ label: "\\(c\\)", min: A, max: B, step: 0.01, value: state.c, onInput: (v) => ((state.c = v), update()) });
    const find = button("הראו לי את \\(c\\)", () => {
      state.c = solutions[state.next % solutions.length];
      state.next += 1;
      c.set(state.c);
      update();
    });
    ui.controls.append(c.el);
    ui.buttons.append(find);
    plot.readout(f);

    function draw() {
      const p = state.c;
      const match = Math.abs(df(p) - chord) < 0.02;
      plot.clear();
      plot.drawAxes();
      plot.curve(f, { cls: "pc-blue", width: 2.4, from: A - 0.3, to: B + 0.3 });
      plot.line(A, f(A), B, f(B), { cls: "pc-red", width: 2.2 });
      const half = 0.9;
      plot.line(p - half, f(p) - df(p) * half, p + half, f(p) + df(p) * half, { cls: match ? "pc-green" : "pc-gray", width: match ? 3 : 2.2 });
      plot.dot(A, f(A), { cls: "pc-red" });
      plot.dot(B, f(B), { cls: "pc-red" });
      plot.dot(p, f(p), { cls: match ? "pc-green" : "pc-gray" });
      plot.text(A, f(A), "a", { cls: "pc-red-text", dy: 1.1 });
      plot.text(B, f(B), "b", { cls: "pc-red-text", dy: 1.1 });
    }

    function update() {
      draw();
      const p = state.c;
      const match = Math.abs(df(p) - chord) < 0.02;
      ui.say(
        match
          ? `<strong>${m(`f′(${fmt(p)}) = ${fmt(df(p), 3)}`)} שווה לשיפוע המיתר ${m(fmt(chord, 3))}</strong>: ${m(`c = ${fmt(p, 3)}`)} היא נקודה כמו במשפט. לפונקציה הזו יש שתיים כאלה.`
          : `שיפוע המיתר ${m(`(f(b) − f(a))/(b − a) = ${fmt(chord, 3)}`)}. שיפוע המשיק ב-${m(`c = ${fmt(p)}`)} הוא ${m(`f′(c) = ${fmt(df(p), 3)}`)}. הזיזו את ${m("c")} עד שהמשיק יהיה מקביל למיתר.`
      );
    }

    update();
    return {
      render() {
        plot.layout();
        draw();
      }
    };
  };

  // ---------------------------------------------------------------------------
  // Mounting
  // ---------------------------------------------------------------------------

  function notifyResize() {
    window.dispatchEvent(new CustomEvent("infi:demo-resized"));
  }

  function mount(root) {
    for (const item of live) {
      if (!item.fig.isConnected) {
        item.observer?.disconnect();
        live.delete(item);
      }
    }
    root.querySelectorAll("figure.demo:not([data-ready])").forEach((fig) => {
      fig.dataset.ready = "1";
      try {
        const build = fig.dataset.desmos ? desmos : DEMOS[fig.dataset.demo];
        if (!build) throw new Error(`unknown demo "${fig.dataset.demo}"`);
        const demo = build(fig);
        const item = { fig, demo, width: 0, cell: 0 };
        const render = () => {
          const width = fig.clientWidth;
          const cell = cellOf(fig);
          if (width === item.width && cell === item.cell) return;
          item.width = width;
          item.cell = cell;
          demo.render();
          notifyResize();
        };
        item.render = render;
        render();
        if ("ResizeObserver" in window) {
          item.observer = new ResizeObserver(render);
          item.observer.observe(fig);
        }
        live.add(item);
      } catch (error) {
        console.warn("[demos]", error);
        fig.classList.add("demo-failed");
        fig.replaceChildren(h("p", { class: "demo-status", text: "ההמחשה לא נטענה בדפדפן הזה." }));
      }
    });
  }

  // A change of text size changes the grid cell without changing the width.
  new MutationObserver(() => {
    for (const item of live) item.render?.();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-text-size"] });

  window.InfiDemos = { mount, compileTex };
})();
