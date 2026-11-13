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
    constructor(host, { view, rows = 14, xAxis = true, yAxis = true, xLabel = "x", yLabel = "y", xAlign = "center", square = false }) {
      this.host = host;
      this.view = { ...view };
      this.rows = rows;
      this.xAlign = xAlign;
      // One cell is the same number of units in both directions, so a circle
      // is round and a reflection in y = x looks like one.
      this.square = square;
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
      let fx = fit(xmin, xmax, cols, this.xAlign);
      let fy = fit(ymin, ymax, rows);
      if (this.square && fx.step !== fy.step) {
        const step = Math.max(fx.step, fy.step);
        const centred = (lo, hi, count) => Math.floor(((lo + hi) / 2 - (count * step) / 2) / step + 1e-9) * step;
        fx = { step, start: centred(xmin, xmax, cols) };
        fy = { step, start: centred(ymin, ymax, rows) };
      }
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

    // Stretches [lo, hi] over the plot's width, leaving whole cells free on
    // each side. The step is no longer a round number, so the demo draws its
    // own ticks with axisX().
    spanX(lo, hi, padStart = 2, padEnd = 2) {
      this.dx = (hi - lo) / Math.max(1, this.cols - padStart - padEnd);
      this.xLeft = lo - padStart * this.dx;
      this.xRight = this.xLeft + this.cols * this.dx;
    }

    // A horizontal axis with the demo's own ticks: [{ at, label }].
    axisX({ from = this.xLeft, to = this.xRight, y = 0, ticks = [], name = "", arrow = true } = {}) {
      const { cell } = this;
      const py = this.Y(y);
      const end = Math.min(this.W - 2, this.X(to));
      const font = cell * 0.68;
      this.axes.append(s("line", { x1: this.X(from), y1: py, x2: end, y2: py, class: "demo-axis" }));
      if (arrow) this.axes.append(s("path", { d: `M${end} ${py} l-${cell * 0.45} -${cell * 0.24} M${end} ${py} l-${cell * 0.45} ${cell * 0.24}`, class: "demo-axis" }));
      for (const tick of ticks) {
        const x = this.X(tick.at);
        this.axes.append(s("line", { x1: x, y1: py - cell * 0.22, x2: x, y2: py + cell * 0.22, class: "demo-tick-mark" }));
        if (tick.label == null) continue;
        const label = s("text", { x, y: py + cell * (tick.above ? -0.45 : 0.95), class: "demo-tick", "text-anchor": "middle", "font-size": font });
        label.textContent = tick.label;
        this.marks.append(label);
      }
      if (name) {
        const label = s("text", { x: end - cell * 0.2, y: py - cell * 0.45, class: "demo-axis-name", "text-anchor": "end", "font-size": font * 1.1 });
        label.textContent = name;
        this.marks.append(label);
      }
    }

    // A vertical axis with the demo's own ticks.
    axisY({ at = 0, from = this.yBottom, to = this.yTop, ticks = [], name = "", arrow = true } = {}) {
      const { cell } = this;
      const px = this.X(at);
      const top = Math.max(2, this.Y(to));
      const font = cell * 0.68;
      this.axes.append(s("line", { x1: px, y1: this.Y(from), x2: px, y2: top, class: "demo-axis" }));
      if (arrow) this.axes.append(s("path", { d: `M${px} ${top} l-${cell * 0.24} ${cell * 0.45} M${px} ${top} l${cell * 0.24} ${cell * 0.45}`, class: "demo-axis" }));
      for (const tick of ticks) {
        const y = this.Y(tick.at);
        this.axes.append(s("line", { x1: px - cell * 0.22, y1: y, x2: px + cell * 0.22, y2: y, class: "demo-tick-mark" }));
        if (tick.label == null) continue;
        const label = s("text", { x: px - cell * 0.35, y: y + font * 0.35, class: "demo-tick", "text-anchor": "end", "font-size": font });
        label.textContent = tick.label;
        this.marks.append(label);
      }
      if (name) {
        const label = s("text", { x: px + cell * 0.45, y: top + cell * 0.7, class: "demo-axis-name", "font-size": font * 1.1 });
        label.textContent = name;
        this.marks.append(label);
      }
    }

    // A pencil line through points given in data coordinates.
    polyline(points, { cls = "pc-blue", width = 2.2, dash = null, layer = "ink" } = {}) {
      const d = points
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
        .map(([x, y], i) => `${i ? "L" : "M"}${this.X(x).toFixed(2)} ${Math.max(-this.H, Math.min(2 * this.H, this.Y(y))).toFixed(2)}`)
        .join("");
      if (d) this[layer].append(s("path", { d, class: `demo-curve ${cls}`, "stroke-width": width, "stroke-dasharray": dash }));
    }

    // Raw SVG in pixels, for shapes that are not graphs (a circle, an arc).
    shape(tag, attrs, layer = "ink") {
      const node = s(tag, attrs);
      this[layer].append(node);
      return node;
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
  // Plot3D: arrows, lines and planes in R³, turned by hand
  // ---------------------------------------------------------------------------
  // An orthographic view of the box [-R, R]³ with z up. Every mark is projected
  // again on each frame and painted back to front, so the near end of an arrow
  // covers the far one and a plane tints what lies behind it. Dragging, the
  // arrow keys and the view buttons turn the camera; "from above" is the flat
  // picture of the xy-plane that the two-dimensional notes draw.

  const V = {
    add: (p, q) => p.map((x, i) => x + q[i]),
    sub: (p, q) => p.map((x, i) => x - q[i]),
    scale: (p, k) => p.map((x) => x * k),
    dot: (p, q) => p.reduce((sum, x, i) => sum + x * q[i], 0),
    cross: (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]],
    len: (p) => Math.hypot(...p)
  };
  const ORIGIN = [0, 0, 0];
  const tiny = (p) => V.len(p) < 1e-9;

  // The line where the planes n1·p = d1 and n2·p = d2 meet, or null if they are parallel.
  function meet(n1, d1, n2, d2) {
    const dir = V.cross(n1, n2);
    const size = V.dot(dir, dir);
    if (size < 1e-12) return null;
    const a = V.dot(n1, n1), b = V.dot(n1, n2), c = V.dot(n2, n2);
    const point = V.scale(V.add(V.scale(n1, d1 * c - d2 * b), V.scale(n2, d2 * a - d1 * b)), 1 / size);
    return { point, dir };
  }

  const reduceMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const HOME_VIEW = [0.62, 0.4];
  const TOP_VIEW = [-Math.PI / 2, Math.PI / 2];
  const SIDE_VIEW = [0, 0];

  // One camera can drive several plots, so two pictures of one system turn together.
  class Camera3D {
    constructor([yaw, pitch] = HOME_VIEW) {
      this.yaw = yaw;
      this.pitch = pitch;
      this.moving = false;
      this.views = new Set();
      this.spin = 0;
      this.tween = 0;
      this.onSpin = null;
    }

    watch(view) {
      this.views.add(view);
    }

    alive() {
      for (const view of this.views) if (view.canvas.isConnected) return true;
      return false;
    }

    changed() {
      for (const view of this.views) view.schedule();
    }

    set(yaw, pitch) {
      this.yaw = yaw;
      this.pitch = Math.max(-0.2, Math.min(Math.PI / 2, pitch));
      this.changed();
    }

    turn(dyaw, dpitch) {
      this.set(this.yaw + dyaw, this.pitch + dpitch);
    }

    // The pencil filter is dropped while the picture moves, so turning stays smooth.
    hold(moving) {
      if (this.moving === moving) return;
      this.moving = moving;
      this.changed();
    }

    stop() {
      cancelAnimationFrame(this.spin);
      cancelAnimationFrame(this.tween);
      const wasSpinning = Boolean(this.spin);
      this.spin = 0;
      this.tween = 0;
      if (wasSpinning) this.onSpin?.(false);
      this.hold(false);
    }

    go([yaw, pitch]) {
      this.stop();
      let delta = (yaw - this.yaw) % (2 * Math.PI);
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      const from = [this.yaw, this.pitch];
      if (reduceMotion()) return this.set(from[0] + delta, pitch);
      const start = performance.now();
      this.hold(true);
      const step = (now) => {
        const k = Math.min(1, (now - start) / 560);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        this.set(from[0] + delta * e, from[1] + (pitch - from[1]) * e);
        if (k < 1 && this.alive()) this.tween = requestAnimationFrame(step);
        else {
          this.tween = 0;
          this.hold(false);
        }
      };
      this.tween = requestAnimationFrame(step);
    }

    toggleSpin() {
      if (this.spin) return this.stop();
      cancelAnimationFrame(this.tween);
      this.tween = 0;
      this.hold(true);
      this.onSpin?.(true);
      let last = performance.now();
      const step = (now) => {
        if (!this.alive()) return this.stop();
        this.turn(((now - last) / 1000) * 0.45, 0);
        last = now;
        this.spin = requestAnimationFrame(step);
      };
      this.spin = requestAnimationFrame(step);
    }
  }

  class Plot3D {
    constructor(host, { range = 4, rows = 20, camera = new Camera3D(), names = ["x", "y", "z"], caption = "" } = {}) {
      Object.assign(this, { host, R: range, rows, camera, names, caption });
      this.id = ++uid;
      this.canvas = h("div", {
        class: "demo-canvas demo-canvas-3d",
        tabindex: "0",
        role: "img",
        "aria-label": `${caption ? `${caption}. ` : ""}תרשים במרחב. גררו אותו, או השתמשו במקשי החיצים, כדי לסובב אותו.`
      });
      this.svg = s("svg", { class: "demo-svg demo-svg-3d", "aria-hidden": "true", focusable: "false" });
      const defs = s("defs");
      const filter = s("filter", { id: `demo-pencil-${this.id}`, x: "-2%", y: "-2%", width: "104%", height: "104%" });
      filter.append(
        s("feTurbulence", { type: "fractalNoise", baseFrequency: "0.85", numOctaves: "1", seed: String(this.id % 7), result: "grain" }),
        s("feDisplacementMap", { in: "SourceGraphic", in2: "grain", scale: "1.15", xChannelSelector: "R", yChannelSelector: "G" })
      );
      defs.append(filter);
      this.scene = s("g", { class: "demo-ink" });
      this.top = s("g", { class: "demo-marks" });
      this.svg.append(defs, this.scene, this.top);
      this.canvas.append(this.svg);
      if (caption) host.append(h("p", { class: "demo-subhead", text: caption }));
      host.append(this.canvas);
      this.items = [];
      this.labels = [];
      this.draw = null;
      this.frame = 0;
      camera.watch(this);
      this.bind();
      this.layout();
      this.begin();
    }

    // Whole cells across and a fixed number of rows, like the flat plots.
    layout() {
      const cell = cellOf(this.host);
      const cols = Math.max(12, Math.floor((this.host.clientWidth + 0.5) / cell));
      this.cell = cell;
      this.W = cols * cell;
      this.H = this.rows * cell;
      this.k = Math.min(this.W, this.H) / (2 * this.R * 1.22);
      const height = this.H + 1;
      this.svg.setAttribute("width", this.W);
      this.svg.setAttribute("height", height);
      this.svg.setAttribute("viewBox", `0 0 ${this.W} ${height}`);
      this.canvas.style.width = `${this.W}px`;
      this.canvas.style.height = `${height}px`;
    }

    schedule() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        if (this.canvas.isConnected) this.draw?.();
      });
    }

    bind() {
      let last = null;
      const svg = this.svg;
      svg.addEventListener("pointerdown", (event) => {
        if (event.button > 0) return;
        last = [event.clientX, event.clientY];
        svg.setPointerCapture?.(event.pointerId);
        this.camera.stop();
        this.camera.hold(true);
      });
      svg.addEventListener("pointermove", (event) => {
        if (!last) return;
        const dx = event.clientX - last[0];
        const dy = event.clientY - last[1];
        last = [event.clientX, event.clientY];
        this.camera.turn(-dx * 0.011, dy * 0.009);
      });
      const release = () => {
        if (!last) return;
        last = null;
        this.camera.hold(false);
      };
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) svg.addEventListener(type, release);
      this.canvas.addEventListener("keydown", (event) => {
        const turn = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[event.key];
        if (!turn) return;
        event.preventDefault();
        this.camera.stop();
        this.camera.turn(...turn);
      });
    }

    begin() {
      const { yaw, pitch } = this.camera;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      this.right = [-sy, cy, 0];
      this.up = [-sp * cy, -sp * sy, cp];
      this.eye = [cp * cy, cp * sy, sp];
      this.items = [];
      this.labels = [];
      if (this.camera.moving) this.scene.removeAttribute("filter");
      else this.scene.setAttribute("filter", `url(#demo-pencil-${this.id})`);
    }

    P(p) {
      return { x: this.W / 2 + this.k * V.dot(p, this.right), y: this.H / 2 - this.k * V.dot(p, this.up), z: V.dot(p, this.eye) };
    }

    // Far marks are drawn lighter, which is most of what makes the picture read as deep.
    fade(z) {
      return Math.max(0.35, Math.min(1, 0.66 + (0.34 * z) / (this.R * 1.75))).toFixed(2);
    }

    put(z, node) {
      this.items.push({ z, node });
    }

    segment(p, q, { cls = "pc-gray", width = 2, dash = null, pieces = 1 } = {}) {
      for (let i = 0; i < pieces; i += 1) {
        const A = this.P(V.add(p, V.scale(V.sub(q, p), i / pieces)));
        const B = this.P(V.add(p, V.scale(V.sub(q, p), (i + 1) / pieces)));
        const z = (A.z + B.z) / 2;
        this.put(z, s("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: `demo-line ${cls}`, "stroke-width": width, "stroke-dasharray": dash, "stroke-opacity": this.fade(z) }));
      }
    }

    // The part of the line point + t·dir that lies inside the box, or null.
    clip(point, dir) {
      let lo = -Infinity;
      let hi = Infinity;
      for (let i = 0; i < 3; i += 1) {
        if (Math.abs(dir[i]) < 1e-12) {
          if (Math.abs(point[i]) > this.R) return null;
          continue;
        }
        const t1 = (-this.R - point[i]) / dir[i];
        const t2 = (this.R - point[i]) / dir[i];
        lo = Math.max(lo, Math.min(t1, t2));
        hi = Math.min(hi, Math.max(t1, t2));
      }
      return hi > lo ? [V.add(point, V.scale(dir, lo)), V.add(point, V.scale(dir, hi))] : null;
    }

    line(point, dir, opts = {}) {
      if (tiny(dir)) return;
      const ends = this.clip(point, dir);
      if (ends) this.segment(...ends, { pieces: 14, ...opts });
    }

    arrow(from, to, { cls = "pc-blue", label = "", dash = null, width = 2.6 } = {}) {
      if (tiny(V.sub(to, from))) this.dot(to, { cls });
      else {
        this.segment(from, to, { cls, width, dash, pieces: 4 });
        const A = this.P(from);
        const B = this.P(to);
        const dx = B.x - A.x, dy = B.y - A.y, length = Math.hypot(dx, dy);
        if (length > 3) {
          const ux = dx / length, uy = dy / length, k = Math.min(10, length / 2.2);
          this.put(
            B.z + 0.01,
            s("path", {
              d: `M${B.x - k * ux + (k * uy) / 2},${B.y - k * uy - (k * ux) / 2} L${B.x},${B.y} L${B.x - k * ux - (k * uy) / 2},${B.y - k * uy + (k * ux) / 2}`,
              class: `demo-line ${cls}`,
              fill: "none",
              "stroke-width": 2.2,
              "stroke-opacity": this.fade(B.z)
            })
          );
        }
      }
      if (label) this.text(to, label, { cls: `${cls}-text` });
    }

    dot(p, { cls = "pc-blue", r = null, hollow = false } = {}) {
      const A = this.P(p);
      this.put(A.z + 0.02, s("circle", { cx: A.x, cy: A.y, r: r ?? this.cell * 0.24, class: `demo-dot ${cls}${hollow ? " is-hollow" : ""}` }));
    }

    // A dotted plumb line from a point down to the floor z = 0, so its height can be read.
    drop(p, cls = "pc-gray") {
      if (Math.abs(p[2]) < 0.05 || Math.max(...p.map(Math.abs)) > this.R) return;
      const foot = [p[0], p[1], 0];
      this.segment(p, foot, { cls, width: 1.2, dash: "2 4", pieces: 2 });
      this.dot(foot, { cls, r: 1.8 });
    }

    polygon(points, cls, extra = "") {
      if (points.length < 3) return;
      const Q = points.map((p) => this.P(p));
      const z = Q.reduce((sum, q) => sum + q.z, 0) / Q.length;
      this.put(z, s("polygon", { points: Q.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" "), class: `demo-plane ${cls} ${extra}`.trim() }));
    }

    // The plane n·p = d, cut to a box a little smaller than the axes, so its corners stay in the frame.
    plane(n, d, cls = "pc-blue") {
      if (tiny(n)) return;
      const R = this.R * 0.85;
      const f = (p) => V.dot(n, p) - d;
      const corners = [];
      for (const x of [-R, R]) for (const y of [-R, R]) for (const z of [-R, R]) corners.push([x, y, z]);
      const points = [];
      for (let i = 0; i < 8; i += 1) {
        for (let j = i + 1; j < 8; j += 1) {
          const a = corners[i], b = corners[j];
          if (a.filter((x, k) => x !== b[k]).length !== 1) continue;
          const fa = f(a), fb = f(b);
          if ((fa > 0 && fb > 0) || (fa < 0 && fb < 0) || fa === fb) continue;
          const p = V.add(a, V.scale(V.sub(b, a), fa / (fa - fb)));
          if (!points.some((q) => V.len(V.sub(p, q)) < 1e-6)) points.push(p);
        }
      }
      if (points.length < 3) return;
      const c = V.scale(points.reduce(V.add), 1 / points.length);
      const e1 = V.sub(points[0], c);
      const e2 = V.cross(n, e1);
      const angle = (p) => Math.atan2(V.dot(V.sub(p, c), e2), V.dot(V.sub(p, c), e1));
      points.sort((p, q) => angle(p) - angle(q));
      this.polygon(points, cls);
    }

    // The plane through a point spanned by two directions, if they are independent.
    span(u, v, cls = "pc-gray", through = ORIGIN) {
      const n = V.cross(u, v);
      if (!tiny(n)) this.plane(n, V.dot(n, through), cls);
    }

    text(p, content, { cls = "", dx = 0.35, dy = -0.45, size = 0.72, anchor = "start" } = {}) {
      const A = this.P(p);
      const node = s("text", { x: A.x + dx * this.cell, y: A.y + dy * this.cell, class: `demo-label ${cls}`, "text-anchor": anchor, "font-size": this.cell * size });
      node.textContent = content;
      this.labels.push(node);
    }

    // The floor grid on z = 0 and the three axes; the negative halves are dashed.
    room() {
      const R = this.R;
      const n = Math.floor(R - 0.25);
      for (let k = -n; k <= n; k += 1) {
        for (const [p, q] of [[[k, -n, 0], [k, n, 0]], [[-n, k, 0], [n, k, 0]]]) {
          const A = this.P(p), B = this.P(q);
          this.put(-1e9, s("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: "demo-floor" }));
        }
      }
      const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      axes.forEach((e, i) => {
        this.segment(V.scale(e, -R), ORIGIN, { cls: "demo-axis-3d", width: 1.3, dash: "3 4", pieces: 4 });
        this.arrow(ORIGIN, V.scale(e, R), { cls: "demo-axis-3d", width: 1.5 });
        const across = axes[i === 2 ? 0 : 2];
        for (let t = 1; t <= n; t += 1) {
          const at = V.scale(e, t);
          this.segment(V.add(at, V.scale(across, -0.13)), V.add(at, V.scale(across, 0.13)), { cls: "demo-axis-3d", width: 1.2 });
          if (n <= 4 || t % 2 === 0) this.text(at, String(t), { cls: "demo-tick", dx: -0.2, dy: 1, size: 0.55 });
        }
        if (this.names[i]) this.text(V.scale(e, R * 1.04), this.names[i], { cls: "demo-axis-name", dx: 0.2, dy: -0.25, size: 0.8 });
      });
    }

    end() {
      this.items.sort((a, b) => a.z - b.z);
      this.scene.replaceChildren(...this.items.map((item) => item.node));
      this.top.replaceChildren(...this.labels);
    }
  }

  // The buttons under a 3D picture: three fixed views and a slow turn.
  function viewControls(camera) {
    const spin = button("סיבוב איטי", () => camera.toggleSpin(), "is-quiet");
    spin.setAttribute("aria-pressed", "false");
    camera.onSpin = (on) => {
      spin.setAttribute("aria-pressed", String(on));
      spin.textContent = on ? "עצירה" : "סיבוב איטי";
    };
    return h(
      "div",
      { class: "demo-view" },
      h("span", { class: "demo-view-hint", text: "גררו את התרשים כדי לסובב אותו." }),
      button("מבט רגיל", () => camera.go(HOME_VIEW), "is-quiet"),
      button("מבט מלמעלה", () => camera.go(TOP_VIEW), "is-quiet"),
      button("מבט מהצד", () => camera.go(SIDE_VIEW), "is-quiet"),
      spin
    );
  }

  // Coefficient controls and exact solving shared by the linear algebra demos.
  const half = (x) => window.Linalg.fraction(Math.round(x * 2), 2);
  const value = (fraction) => fraction.n / fraction.d;
  const same = (p, q) => p.every((x, i) => Math.abs(x - q[i]) < 1e-9);
  const term = (c, name) => (c < 0 ? `(${fmt(c)})${name}` : `${fmt(c)}${name}`);
  const combine = (coefficients, vectors) => vectors.reduce((sum, vector, i) => V.add(sum, V.scale(vector, coefficients[i])), vectors[0].map(() => 0));
  // The system whose columns are the given vectors and whose last column is the target.
  const columnsSystem = (columns, target) => window.Linalg.toFractions(target.map((_, i) => [...columns.map((c) => half(c[i])), half(target[i])]));
  const pair = (v) => `(${v.map((x) => fmt(x)).join(", ")})`;

  // Walks the vectors head to tail, each scaled by its coefficient.
  function walk3(plot, coefficients, vectors, classes) {
    let at = ORIGIN;
    vectors.forEach((vector, i) => {
      const next = V.add(at, V.scale(vector, coefficients[i]));
      if (!same(at, next)) plot.arrow(at, next, { cls: classes[i], dash: "5 4" });
      at = next;
    });
    return at;
  }

  function target3(plot, target, label = "יעד") {
    plot.drop(target, "pc-orange");
    plot.dot(target, { cls: "pc-orange", hollow: true, r: plot.cell * 0.5 });
    plot.text(target, label, { cls: "pc-orange-text", dx: 0.7, dy: 0.25 });
  }

  function endPoint(plot, p) {
    plot.drop(p, "pc-green");
    plot.dot(p, { cls: "pc-green", r: plot.cell * 0.32 });
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

  // A button that plays a run from 0 to 1 and stops it. While it runs the
  // status is not announced, so a screen reader hears the result, not sixty
  // updates a second. With reduced motion the run jumps to its end.
  function player(fig, ui, { label = "הפעלה", seconds = 6, from = () => 0, onFrame, onStop }) {
    let raf = 0;
    let playing = false;
    const btn = button(label, () => (playing ? stop() : start()));
    const sync = () => {
      btn.textContent = playing ? "עצירה" : label;
      ui.status.setAttribute("aria-live", playing ? "off" : "polite");
    };
    function stop() {
      cancelAnimationFrame(raf);
      if (!playing) return;
      playing = false;
      sync();
      onStop?.();
    }
    function start() {
      if (reduceMotion()) {
        onFrame(1);
        onStop?.();
        return;
      }
      let begin = from();
      if (!(begin >= 0 && begin < 0.995)) begin = 0;
      let t0 = 0;
      playing = true;
      sync();
      const step = (now) => {
        if (!fig.isConnected) return stop();
        t0 ||= now;
        const k = Math.min(1, begin + (now - t0) / (seconds * 1000));
        onFrame(k);
        if (k < 1) raf = requestAnimationFrame(step);
        else stop();
      };
      raf = requestAnimationFrame(step);
    }
    return {
      el: btn,
      stop,
      get playing() {
        return playing;
      }
    };
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
      status,
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
    if (Object.keys(params).length) {
      ui.controls.append(h("p", { class: "demo-instruction", text: "הזיזו את המחוון ועקבו אחר השינוי בגרף ובערכים." }));
    }
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
  // Linear algebra: exact arithmetic comes from assets/linalg.js
  // ---------------------------------------------------------------------------

  const minusSign = (text) => String(text).replace(/-/g, "−");
  const rowName = (i) => `R${sub(i + 1)}`;

  // One row of an augmented matrix as an equation, the way it is written by hand.
  function equationOf(row, names = (column) => `x${sub(column + 1)}`) {
    const terms = [];
    row.slice(0, -1).forEach((value, column) => {
      if (value.isZero()) return;
      const size = value.n < 0 ? value.neg() : value;
      const coefficient = size.isOne() ? "" : size.d === 1 ? String(size) : `(${size})`;
      const name = `${coefficient}${names(column)}`;
      if (!terms.length) terms.push(value.n < 0 ? `−${name}` : name);
      else terms.push(`${value.n < 0 ? "−" : "+"} ${name}`);
    });
    return `${terms.join(" ") || "0"} = ${minusSign(row.at(-1))}`;
  }

  function operationText(op) {
    if (op.type === "swap") return `${rowName(op.i)} ↔ ${rowName(op.j)}`;
    if (op.type === "scale") return `${rowName(op.i)} → ${minusSign(op.k.d === 1 ? op.k : `(${op.k})`)}·${rowName(op.i)}`;
    const size = op.k.n < 0 ? op.k.neg() : op.k;
    return `${rowName(op.i)} → ${rowName(op.i)} ${op.k.n < 0 ? "−" : "+"} ${size.isOne() ? "" : size.d === 1 ? `${size}·` : `(${size})·`}${rowName(op.j)}`;
  }

  const OPERATION_NAMES = { swap: "החלפת שתי שורות", scale: "כפל שורה בסקלר שונה מאפס", add: "הוספת כפולה של שורה לשורה אחרת" };

  // An augmented matrix on the grid. Pivots are marked, and the bar separates the
  // free coefficients. The picture is one image to a screen reader; the status says it in words.
  function matrixNode(matrix) {
    const node = h("div", { class: "demo-matrix", dir: "ltr", role: "img", style: `--cols:${matrix[0].length}` });
    const pivotOf = matrix.map((row) => row.findIndex((value) => !value.isZero()));
    node.setAttribute("aria-label", `מטריצה: ${matrix.map((row, i) => `שורה ${i + 1}: ${row.map(String).join(", ")}`).join("; ")}`);
    matrix.forEach((row, i) => {
      row.forEach((value, column) => {
        const classes = [column === row.length - 1 ? "is-free" : "", column === pivotOf[i] && column < row.length - 1 ? "is-pivot" : ""].filter(Boolean).join(" ");
        node.append(h("span", { class: classes || null, text: minusSign(value) }));
      });
    });
    return node;
  }

  function solutionWords(result) {
    if (result.kind === "none") return `יש שורה מהצורה ${m("0 = a")} עם ${m("a ≠ 0")}, ולכן <strong>אין פתרון</strong>.`;
    if (result.kind === "one") {
      const values = result.solution.map((value, column) => `x${sub(column + 1)} = ${minusSign(value)}`).join(", ");
      return `כל המשתנים קשורים, ולכן יש <strong>פתרון יחיד</strong>: ${m(values)}.`;
    }
    const names = result.free.map((column) => `x${sub(column + 1)}`).join(", ");
    return `${m(names)} ${result.free.length > 1 ? "חופשיים" : "חופשי"}, ולכן יש <strong>אינסוף פתרונות</strong> מעל ${m("ℝ")}.`;
  }

  // Chapter 1: row reduction, one elementary operation at a time.
  DEMOS["row-reduction"] = (fig) => {
    const { toFractions, applyOp, nextStep, classify, fraction } = window.Linalg;
    const examples = [
      { name: "פתרון יחיד", matrix: [[1, 1, 1, 6], [2, -1, 1, 3], [1, 2, -1, 2]] },
      { name: "אינסוף פתרונות", matrix: [[1, 2, -1, 3], [2, 4, 1, 9], [1, 2, 2, 6]] },
      { name: "אין פתרון", matrix: [[1, -1, 2, 1], [2, -2, 5, 4], [3, -3, 7, 2]] }
    ];
    const multipliers = [[2, 1], [3, 1], [-1, 1], [-2, 1], [-3, 1], [1, 2], [1, 3], [-1, 2]];
    const ui = frame(fig, "דירוג מטריצה, פעולה אחת בכל פעם");
    const board = h("div", { class: "demo-rows" });
    ui.plotHost.append(board);
    let history = [];

    const example = choice("מערכת", examples.map((item) => item.name), () => restart());
    const type = choice("פעולה", Object.values(OPERATION_NAMES), () => syncChoices());
    const target = choice("שורה", [0, 1, 2].map(rowName), () => {});
    const other = choice("עם שורה", [0, 1, 2].map(rowName), () => {});
    const factor = choice("סקלר", multipliers.map(([n, d]) => minusSign(fraction(n, d))), () => {});
    other.select.value = "1";
    ui.controls.append(example.el, type.el, target.el, other.el, factor.el);

    const nextButton = button("הצעד הבא", () => {
      const op = nextStep(current());
      if (op) apply(op);
    });
    const backButton = button("אחורה", () => {
      history = history.slice(0, -1);
      update("חזרנו צעד אחד אחורה.");
    }, "is-quiet");
    ui.buttons.append(
      nextButton,
      button("בצעו את הפעולה שבחרתם", () => applyChosen(), "is-quiet"),
      backButton,
      button("מההתחלה", () => restart(), "is-quiet")
    );

    const current = () => history.at(-1);
    const kinds = Object.keys(OPERATION_NAMES);

    function syncChoices() {
      const kind = kinds[Number(type.select.value)];
      other.select.disabled = kind === "scale";
      factor.select.disabled = kind === "swap";
    }

    function applyChosen() {
      const kind = kinds[Number(type.select.value)];
      const i = Number(target.select.value);
      const j = Number(other.select.value);
      if (kind !== "scale" && i === j) {
        ui.say("בחרו שתי שורות שונות. פעולה על שורה עם עצמה אינה פעולה אלמנטרית.");
        return;
      }
      const [n, d] = multipliers[Number(factor.select.value)];
      apply(kind === "swap" ? { type: "swap", i, j } : kind === "scale" ? { type: "scale", i, k: fraction(n, d) } : { type: "add", i, j, k: fraction(n, d) });
    }

    function apply(op) {
      history = [...history, applyOp(current(), op)];
      update(`${m(operationText(op))}: ${OPERATION_NAMES[op.type]}. המערכת שקולה לקודמת, ולכן יש לה בדיוק אותם פתרונות.`);
    }

    function restart() {
      history = [toFractions(examples[Number(example.select.value)].matrix)];
      update("זו המערכת ההתחלתית. לחצו על \"הצעד הבא\", או בחרו פעולה בעצמכם.");
    }

    function draw() {
      const matrix = current();
      board.replaceChildren(matrixNode(matrix), h("div", { class: "demo-system", dir: "ltr" }, matrix.map((row) => h("span", { text: equationOf(row) }))));
    }

    function update(message) {
      draw();
      const done = !nextStep(current());
      nextButton.disabled = done;
      backButton.disabled = history.length === 1;
      ui.say(done ? `${message} הגענו לצורה הקנונית. ${solutionWords(classify(current()))}` : message);
    }

    syncChoices();
    restart();
    return { render: draw };
  };

  // Chapter 1: three equations in three unknowns, seen as three planes.
  DEMOS["solution-count"] = (fig) => {
    const { toFractions, classify } = window.Linalg;
    const names = (column) => "xyz"[column];
    const ui = frame(fig, "שלושה מישורים, שלוש אפשרויות");
    const plot = new Plot3D(ui.plotHost, { range: 4 });
    ui.plotHost.append(viewControls(plot.camera));
    const BLUE = { n: [1, 1, 1], d: 3 };
    const PURPLE = { n: [1, -1, 1], d: 1 };
    const state = { a: 1, b: 0, c: -1, d: 0 };
    const sliders = {};
    for (const [key, label, min, max] of [["a", "מקדם \\(a\\)", -3, 3], ["b", "מקדם \\(b\\)", -3, 3], ["c", "מקדם \\(c\\)", -3, 3], ["d", "מקדם חופשי \\(d\\)", -4, 4]]) {
      sliders[key] = slider({ label, min, max, step: 0.5, value: state[key], onInput: (v) => { state[key] = v; update(); } });
      ui.controls.append(sliders[key].el);
    }
    const setTo = (a, b, c, d) => {
      Object.assign(state, { a, b, c, d });
      for (const key of ["a", "b", "c", "d"]) sliders[key].set(state[key]);
      update();
    };
    ui.buttons.append(
      button("נקודה אחת", () => setTo(1, 0, -1, 0), "is-quiet"),
      button("ישר שלם", () => setTo(2, 0, 2, 4), "is-quiet"),
      button("מקביל לכחול", () => setTo(1, 1, 1, -1), "is-quiet"),
      button("אוהל", () => setTo(2, 0, 2, 0), "is-quiet")
    );
    const reduced = h("div", { class: "demo-rows" });
    ui.panel.prepend(reduced);

    const red = () => ({ n: [state.a, state.b, state.c], d: state.d });
    const augmented = () => toFractions([[1, 1, 1, 3], [1, -1, 1, 1], [half(state.a), half(state.b), half(state.c), half(state.d)]]);

    function draw() {
      plot.begin();
      plot.room();
      const planes = [[BLUE, "pc-blue"], [PURPLE, "pc-purple"], [red(), "pc-red"]];
      for (const [p, cls] of planes) plot.plane(p.n, p.d, cls);
      for (let i = 0; i < 3; i += 1) {
        for (let j = i + 1; j < 3; j += 1) {
          const line = meet(planes[i][0].n, planes[i][0].d, planes[j][0].n, planes[j][0].d);
          if (line) plot.line(line.point, line.dir, { cls: "pc-gray", width: 1.4 });
        }
      }
      const result = classify(augmented());
      if (result.kind === "one") endPoint(plot, result.solution.map(value));
      else if (result.kind === "infinite") {
        const line = meet(BLUE.n, BLUE.d, PURPLE.n, PURPLE.d);
        plot.line(line.point, line.dir, { cls: "pc-green", width: 3.6 });
      }
      plot.end();
    }
    plot.draw = draw;

    function update() {
      draw();
      const start = augmented();
      const result = classify(start);
      reduced.replaceChildren(matrixNode(result.result), h("div", { class: "demo-system", dir: "ltr" }, start.map((row) => h("span", { text: equationOf(row, names) }))));
      const { n } = red();
      const empty = tiny(n);
      const parallel = !empty && [BLUE, PURPLE].some((p) => tiny(V.cross(p.n, n)));
      if (result.kind === "one") ui.say(`שלושת המישורים נפגשים בנקודה אחת, ולכן יש <strong>פתרון יחיד</strong>: ${m(`(x, y, z) = (${result.solution.map(minusSign).join(", ")})`)}.`);
      else if (result.kind === "none" && empty) ui.say(`המשוואה השלישית היא ${m(`0 = ${fmt(state.d)}`)}, ושום נקודה לא מקיימת אותה. לכן <strong>אין פתרון</strong>.`);
      else if (result.kind === "none" && parallel) ui.say(`המישור האדום מקביל לאחד המישורים ולא נוגע בו. בדירוג מתקבלת שורה ${m("0 = a")} עם ${m("a ≠ 0")}, ולכן <strong>אין פתרון</strong>.`);
      else if (result.kind === "none") ui.say(`כל שני מישורים נחתכים בישר אפור, אבל שלושת הישרים מקבילים, כמו שני צדי אוהל והרצפה שלו. אין נקודה שנמצאת על שלושת המישורים, ולכן <strong>אין פתרון</strong>.`);
      else if (empty) ui.say(`המשוואה השלישית היא ${m("0 = 0")} ואינה מגבילה דבר. הפתרונות הם הישר הירוק, שבו נפגשים הכחול והסגול: <strong>אינסוף פתרונות</strong>.`);
      else if (parallel) ui.say(`המישור האדום מתלכד עם אחד המישורים, אז נשארו בעצם שני מישורים. הם נחתכים בישר הירוק, ולכן יש <strong>אינסוף פתרונות</strong>.`);
      else ui.say(`המישור האדום עובר דרך הישר שבו נפגשים הכחול והסגול, ולכן כל נקודה על הישר הירוק היא פתרון: <strong>אינסוף פתרונות</strong>. ${m(result.free.map(names).join(", "))} משתנה חופשי.`);
    }

    update();
    return { render() { plot.layout(); draw(); } };
  };

  // 2.2: adding arrows in space, head to tail.
  DEMOS["vector-sum"] = (fig) => {
    const ui = frame(fig, "מחברים חיצים במרחב: ראש לעקב");
    const plot = new Plot3D(ui.plotHost, { range: 4.5 });
    ui.plotHost.append(viewControls(plot.camera));
    const a = [2, 0, 1];
    const b = [0, 2, 1];
    let t = 1;
    const control = slider({ label: "כמה פעמים לקחת את a?", min: -2, max: 2, step: 0.25, value: t, onInput(v) { t = v; update(); } });
    ui.controls.append(control.el);
    ui.buttons.append(button("היפוך כיוון", () => { t = -1; control.set(t); update(); }), button("וקטור האפס", () => { t = 0; control.set(t); update(); }, "is-quiet"));
    function draw() {
      plot.begin();
      plot.room();
      const ta = V.scale(a, t);
      const sum = V.add(ta, b);
      plot.polygon([ORIGIN, ta, sum, b], "pc-green", "is-faint");
      for (const p of [ta, b]) plot.drop(p);
      plot.arrow(ORIGIN, b, { cls: "pc-gray", label: "b", dash: "4 4" });
      plot.arrow(ORIGIN, ta, { cls: "pc-blue", label: "ta" });
      plot.arrow(ta, sum, { cls: "pc-red", dash: "5 4" });
      plot.arrow(ORIGIN, sum, { cls: "pc-green", label: "ta+b" });
      plot.drop(sum, "pc-green");
      plot.end();
    }
    plot.draw = draw;
    function update() {
      draw();
      ui.say(`${m("a = (2, 0, 1), b = (0, 2, 1)")}. ${m(`${fmt(t)}a + b = ${pair(V.add(V.scale(a, t), b))}`)}. החץ הכחול הוא ${m("ta")}; האדום מוסיף את ${m("b")} מראשו; הירוק מוביל ישר לתוצאה. הקווים המנוקדים יורדים לרצפה ${m("z = 0")}, כדי שתראו את הגובה של כל קצה. ${t === 0 ? "כשכופלים באפס, החץ הכחול מתכווץ לנקודה והתוצאה היא b." : t < 0 ? "המקדם שלילי, לכן כיוון a התהפך." : "שנו את המקדם וראו איך אורך החץ משתנה."}`);
    }
    update();
    return { render() { plot.layout(); draw(); } };
  };

  // 2.3: a point walking on a line, and with a second direction on a plane.
  DEMOS["parametric-line"] = (fig) => {
    const ui = frame(fig, "נקודה מטיילת על ישר, ואחר כך על מישור");
    const plot = new Plot3D(ui.plotHost, { range: 4 });
    ui.plotHost.append(viewControls(plot.camera));
    const base = [0, 1, 1];
    const second = [1, 0, 0];
    const state = { t: 1, s: 1, ax: 1, ay: 2, az: 1, plane: false };
    const controls = {};
    for (const [key, label, min, max] of [["t", "הפרמטר t", -3, 3], ["s", "הפרמטר s של הכיוון c", -3, 3], ["ax", "רכיב x של הכיוון a", -2, 2], ["ay", "רכיב y של הכיוון a", -2, 2], ["az", "רכיב z של הכיוון a", -2, 2]]) {
      controls[key] = slider({ label, min, max, step: 0.5, value: state[key], onInput(v) { state[key] = v; update(); } });
      ui.controls.append(controls[key].el);
    }
    const mode = button("", () => { state.plane = !state.plane; syncMode(); update(); });
    function syncMode() {
      controls.s.el.style.display = state.plane ? "" : "none";
      mode.textContent = state.plane ? "חזרה לישר" : "הוסיפו כיוון שני: מישור";
      mode.setAttribute("aria-pressed", String(state.plane));
    }
    function preset(ax, ay, az) {
      Object.assign(state, { ax, ay, az });
      for (const key of ["ax", "ay", "az"]) controls[key].set(state[key]);
      update();
    }
    ui.buttons.append(
      mode,
      button("ישר אנכי", () => preset(0, 0, 1), "is-quiet"),
      button("כיוון אפס", () => preset(0, 0, 0), "is-quiet"),
      button("a על הישר של c", () => { state.plane = true; syncMode(); preset(2, 0, 0); }, "is-quiet"),
      button("איפוס", () => { state.t = 1; state.s = 1; controls.t.set(1); controls.s.set(1); preset(1, 2, 1); }, "is-quiet")
    );
    const direction = () => [state.ax, state.ay, state.az];
    function draw() {
      plot.begin();
      plot.room();
      const a = direction();
      const at = V.add(base, V.scale(a, state.t));
      const p = state.plane ? V.add(at, V.scale(second, state.s)) : at;
      if (state.plane) plot.span(a, second, "pc-blue", base);
      plot.line(base, a, { cls: "pc-gray", dash: "5 5", width: 1.8 });
      if (state.plane) plot.line(base, second, { cls: "pc-gray", dash: "2 5", width: 1.4 });
      plot.arrow(base, at, { cls: "pc-blue" });
      if (state.plane) plot.arrow(at, p, { cls: "pc-purple" });
      plot.drop(base, "pc-red");
      plot.dot(base, { cls: "pc-red" });
      plot.text(base, "b", { dx: -0.9, dy: 0.2 });
      endPoint(plot, p);
      plot.text(p, state.plane ? "p(t, s)" : "p(t)", { cls: "pc-green-text" });
      plot.end();
    }
    plot.draw = draw;
    function update() {
      draw();
      const a = direction();
      const at = V.add(base, V.scale(a, state.t));
      const start = `${m(`b = (0, 1, 1), a = ${pair(a)}`)}`;
      if (!state.plane) {
        ui.say(`${start}. ${m(`p(t) = b + ta = ${pair(at)}`)}. ${tiny(a) ? "אין כיוון תנועה: לכל ערך של t נשארים ב-b. זו נקודה אחת, לא ישר." : "הקו המקווקו הוא הישר, והנקודה הירוקה היא הבחירה הנוכחית של t. המחוון מציג רק חלק מהערכים, אבל הישר כולל את כל t הממשיים. סובבו את התרשים: מכל כיוון זה נשאר ישר."}`);
        return;
      }
      const p = V.add(at, V.scale(second, state.s));
      const where = `${start}, ${m("c = (1, 0, 0)")}. ${m(`p(t, s) = b + ta + sc = ${pair(p)}`)}.`;
      if (tiny(a)) ui.say(`${where} ${m("a")} הוא וקטור האפס, אז נשאר רק הכיוון ${m("c")}: מתקבל ישר, לא מישור.`);
      else if (tiny(V.cross(a, second))) ui.say(`${where} ${m("a")} ו-${m("c")} על אותו ישר, ולכן כל הנקודות נשארות על ישר אחד. מישור צריך שתי הוראות תנועה שאינן על אותו ישר.`);
      else ui.say(`${where} שני כיוונים שאינם על אותו ישר פורשים מישור, המישור המוצלל. כל בחירה של ${m("t")} ושל ${m("s")} נותנת נקודה עליו. נסו "מבט מהצד" וסובבו עד שהמישור נראה כקו: כך רואים שהוא שטוח.`);
    }
    syncMode();
    update();
    return { render() { plot.layout(); draw(); } };
  };

  // 2.5: a linear combination as a recipe that has to hit a target.
  DEMOS["reach-target"] = (fig) => {
    const { classify } = window.Linalg;
    const ui = frame(fig, "להגיע ליעד במרחב: מוצאים את המתכון");
    const plot = new Plot3D(ui.plotHost, { range: 4 });
    ui.plotHost.append(viewControls(plot.camera));
    const FREE = { a: [2, 1, 0], b: [-1, 1, 1] };
    const LINE = { a: [1, 1, 1], b: [2, 2, 2] };
    const CASES = [
      { label: "יעד ראשון", ...FREE, target: [0, 3, 2] },
      { label: "יעד שני", ...FREE, target: [4, -1, -2] },
      { label: "יעד מחוץ למישור", ...FREE, target: [0, 0, 3] },
      { label: "על ישר אחד: יעד מחוץ לישר", ...LINE, target: [1, 0, 0] },
      { label: "על ישר אחד: יעד על הישר", ...LINE, target: [3, 3, 3] }
    ];
    const state = { index: 0, s: 1, t: 0 };
    const current = () => CASES[state.index];
    const controls = {};
    for (const [key, label] of [["s", "המקדם s של a"], ["t", "המקדם t של b"]]) {
      controls[key] = slider({ label, min: -3, max: 3, step: 0.5, value: state[key], onInput(v) { state[key] = v; update(); } });
      ui.controls.append(controls[key].el);
    }
    const setCoefficients = (cs, t) => {
      state.s = cs;
      state.t = t;
      controls.s.set(cs);
      controls.t.set(t);
      update();
    };
    ui.buttons.append(
      ...CASES.map((item, index) => button(item.label, () => { state.index = index; setCoefficients(1, 0); }, "is-quiet")),
      button("הראו לי מתכון", () => {
        const { a, b, target } = current();
        const result = classify(columnsSystem([a, b], target));
        if (result.kind === "one") setCoefficients(value(result.solution[0]), value(result.solution[1]));
        else if (result.kind === "infinite") setCoefficients(3, 0);
        else {
          setCoefficients(0, 0);
          ui.say(`אין מתכון להראות: למערכת <strong>אין פתרון</strong>, ולכן היעד אינו צירוף של ${m("a, b")}.`);
        }
      })
    );
    const rows = h("div", { class: "demo-rows" });
    ui.panel.prepend(rows);

    function draw() {
      plot.begin();
      plot.room();
      const { a, b, target } = current();
      const n = V.cross(a, b);
      if (tiny(n)) plot.line(ORIGIN, a, { cls: "pc-gray", dash: "5 5", width: 1.8 });
      else {
        plot.span(a, b, "pc-gray");
        // How far the target is from the plane: the plumb line to its nearest point there.
        const k = V.dot(target, n) / V.dot(n, n);
        if (Math.abs(k) > 1e-9) {
          const foot = V.sub(target, V.scale(n, k));
          plot.segment(target, foot, { cls: "pc-orange", dash: "2 4", width: 1.6, pieces: 3 });
          plot.dot(foot, { cls: "pc-orange", r: 2.4 });
        }
      }
      plot.arrow(ORIGIN, a, { cls: "pc-blue", label: "a" });
      plot.arrow(ORIGIN, b, { cls: "pc-red", label: "b" });
      target3(plot, target);
      endPoint(plot, walk3(plot, [state.s, state.t], [a, b], ["pc-blue", "pc-red"]));
      plot.end();
    }
    plot.draw = draw;

    function update() {
      draw();
      const { a, b, target } = current();
      const system = columnsSystem([a, b], target);
      const result = classify(system);
      rows.replaceChildren(matrixNode(system), h("div", { class: "demo-system", dir: "ltr" }, system.map((row) => h("span", { text: equationOf(row, (column) => "st"[column]) }))));
      const end = combine([state.s, state.t], [a, b]);
      const flat = tiny(V.cross(a, b));
      const where = `${m(`${term(state.s, "a")} + ${term(state.t, "b")} = ${pair(end)}`)}. היעד הוא ${m(pair(target))}.`;
      if (same(end, target) && result.kind === "one") ui.say(`${where} <strong>הגעתם.</strong> המקדמים ${m(`s = ${fmt(state.s)}, t = ${fmt(state.t)}`)} הם הפתרון של המערכת, וזה המתכון היחיד.`);
      else if (same(end, target)) ui.say(`${where} <strong>הגעתם, אבל זה לא המתכון היחיד.</strong> מכיוון ש-${m("b = 2a")}, גם ${m(`s = ${fmt(state.s + 2)}, t = ${fmt(state.t - 1)}`)} מגיע לאותו מקום. למערכת יש אינסוף פתרונות.`);
      else if (result.kind === "none" && flat) ui.say(`${where} כל צירוף נשאר על הישר המקווקו, והיעד לא עליו. אי אפשר להגיע אליו, ובדירוג המערכת מתקבלת שורת סתירה.`);
      else if (result.kind === "none") ui.say(`${where} החצים ${m("a")} ו-${m("b")} פורשים מישור, המישור המוצלל, וכל צירוף שלהם נשאר עליו. היעד מחוץ למישור, והקו הכתום מראה כמה. לכן אין מתכון, ובדירוג המערכת מתקבלת שורת סתירה. במרחב שני וקטורים לא מספיקים כדי להגיע לכל מקום.`);
      else ui.say(`${where} הזיזו את המקדמים עד שהנקודה הירוקה תיכנס לעיגול. סובבו את התרשים כדי לבדוק: מכיוון אחד הנקודה יכולה להיראות בתוך העיגול גם כשהיא לפניו או מאחוריו. כל עמודה במטריצה היא וקטור, והעמודה האחרונה היא היעד.`);
    }

    update();
    return { render() { plot.layout(); draw(); } };
  };

  // 2.5 and chapter 1: one system read by rows (planes) and by columns (arrows).
  DEMOS["rows-columns"] = (fig) => {
    const { classify } = window.Linalg;
    const ui = frame(fig, "אותה מערכת: שורות או עמודות");
    const CASES = [
      { label: "פתרון יחיד", columns: [[1, 0, 1], [1, 1, 0], [0, 1, 1]], target: [3, 3, 2], sample: [1, 2, 1] },
      { label: "אין פתרון", columns: [[1, 0, 1], [0, 1, 1], [1, 1, 2]], target: [1, 1, 0], sample: null },
      { label: "אינסוף פתרונות", columns: [[1, 0, 1], [0, 1, 1], [1, 1, 2]], target: [1, 2, 3], sample: [1, 2, 0] }
    ];
    const CLASSES = ["pc-blue", "pc-red", "pc-purple"];
    const pairHost = h("div", { class: "demo-pair" });
    const rowHost = h("div");
    const columnHost = h("div");
    pairHost.append(rowHost, columnHost);
    ui.plotHost.append(pairHost);
    const camera = new Camera3D();
    const rowPlot = new Plot3D(rowHost, { range: 3.5, rows: 16, camera, caption: "שורות: כל משוואה היא מישור" });
    const columnPlot = new Plot3D(columnHost, { range: 3.5, rows: 16, camera, caption: "עמודות: כל נעלם הוא מקדם של חץ" });
    ui.plotHost.append(viewControls(camera));
    const state = { index: 0, x: 1, y: 1, z: 1 };
    const current = () => CASES[state.index];
    const guess = () => [state.x, state.y, state.z];
    const controls = {};
    for (const key of ["x", "y", "z"]) {
      controls[key] = slider({ label: `הניחוש ל-${key}`, min: -3, max: 4, step: 0.5, value: state[key], onInput(v) { state[key] = v; update(); } });
      ui.controls.append(controls[key].el);
    }
    const setGuess = (x, y, z) => {
      Object.assign(state, { x, y, z });
      for (const key of ["x", "y", "z"]) controls[key].set(state[key]);
      update();
    };
    ui.buttons.append(
      ...CASES.map((item, index) => button(item.label, () => { state.index = index; setGuess(1, 1, 1); }, "is-quiet")),
      button("הראו פתרון", () => {
        const { sample } = current();
        if (sample) setGuess(...sample);
      })
    );
    const rows = h("div", { class: "demo-rows" });
    ui.panel.prepend(rows);

    function drawRows() {
      const { columns, target } = current();
      rowPlot.begin();
      rowPlot.room();
      CLASSES.forEach((cls, i) => rowPlot.plane(columns.map((c) => c[i]), target[i], cls));
      endPoint(rowPlot, guess());
      rowPlot.end();
    }

    function drawColumns() {
      const { columns, target } = current();
      columnPlot.begin();
      columnPlot.room();
      if (Math.abs(V.dot(columns[0], V.cross(columns[1], columns[2]))) < 1e-9) columnPlot.span(columns[0], columns[1], "pc-gray");
      columns.forEach((c, i) => columnPlot.arrow(ORIGIN, c, { cls: CLASSES[i], label: `c${sub(i + 1)}` }));
      target3(columnPlot, target, "b");
      endPoint(columnPlot, walk3(columnPlot, guess(), columns, CLASSES));
      columnPlot.end();
    }
    rowPlot.draw = drawRows;
    columnPlot.draw = drawColumns;

    function update() {
      drawRows();
      drawColumns();
      const { columns, target } = current();
      const system = columnsSystem(columns, target);
      const result = classify(system);
      rows.replaceChildren(matrixNode(system), h("div", { class: "demo-system", dir: "ltr" }, system.map((row) => h("span", { text: equationOf(row, (column) => "xyz"[column]) }))));
      const end = combine(guess(), columns);
      const shown = m(`(x, y, z) = ${pair(guess())}`);
      const reach = m(`${term(state.x, "c₁")} + ${term(state.y, "c₂")} + ${term(state.z, "c₃")} = ${pair(end)}`);
      if (same(end, target)) ui.say(`${shown} <strong>פותר את המערכת.</strong> בתמונת השורות הנקודה נמצאת על שלושת המישורים, ובתמונת העמודות החיצים מגיעים בדיוק ל-${m("b")}. ${result.kind === "infinite" ? "כאן שלושת המישורים נפגשים בישר שלם, ולכן יש עוד הרבה פתרונות." : "זו אותה עובדה בשתי תמונות."}`);
      else if (result.kind === "none") ui.say(`${shown}. ${reach}. בתמונת השורות כל שני מישורים נפגשים, אבל אין נקודה על שלושתם. בתמונת העמודות שלושת החיצים שוכבים באותו מישור, ו-${m("b")} מחוץ לו. בשתי התמונות <strong>אין פתרון</strong>.`);
      else ui.say(`${shown}. ${reach}, ועדיין לא ${m(pair(target))}. שנו את הניחוש: בתמונת השורות הנקודה צריכה להיות על שלושת המישורים, ובתמונת העמודות החיצים צריכים להגיע ל-${m("b")}. שני התנאים מתקיימים יחד.`);
    }

    update();
    return {
      render() {
        rowPlot.layout();
        columnPlot.layout();
        drawRows();
        drawColumns();
      }
    };
  };

  // 2.6: dependence as a walk that returns home with coefficients that are not all zero.
  DEMOS["dependence"] = (fig) => {
    const { fraction } = window.Linalg;
    const ui = frame(fig, "לחזור הביתה: האם יש וקטור מיותר?");
    const plot = new Plot3D(ui.plotHost, { range: 4 });
    ui.plotHost.append(viewControls(plot.camera));
    const CASES = [
      { label: "שלושה שאינם במישור אחד", vectors: [[2, 1, 0], [-1, 1, 0], [0, 1, 2]], relation: null },
      { label: "שלושה במישור אחד", vectors: [[2, 0, 1], [0, 2, 1], [1, 1, 1]], relation: [1, 1, -2] },
      { label: "שניים על ישר אחד", vectors: [[1, 2, 1], [2, 4, 2]], relation: [2, -1] },
      { label: "ארבעה ב-ℝ³", vectors: [[2, 0, 0], [0, 2, 0], [0, 0, 2], [1, 1, 1]], relation: [1, 1, 1, -2] },
      { label: "עם וקטור האפס", vectors: [[0, 0, 0], [1, 1, 1]], relation: [1, 0] }
    ];
    const CLASSES = ["pc-blue", "pc-red", "pc-purple", "pc-gray"];
    const nameOf = (i) => `a${sub(i + 1)}`;
    const state = { index: 0, coefficients: [1, 1, 1, 1] };
    const current = () => CASES[state.index];
    const controls = [0, 1, 2, 3].map((i) => {
      const control = slider({ label: `המקדם של ${nameOf(i)}`, min: -3, max: 3, step: 0.5, value: 1, onInput(v) { state.coefficients[i] = v; update(); } });
      ui.controls.append(control.el);
      return control;
    });
    const setCoefficients = (values) => {
      state.coefficients = [0, 1, 2, 3].map((i) => values[i] ?? 0);
      controls.forEach((control, i) => {
        control.set(state.coefficients[i]);
        control.el.style.display = i < current().vectors.length ? "" : "none";
      });
      update();
    };
    ui.buttons.append(
      ...CASES.map((item, index) => button(item.label, () => { state.index = index; setCoefficients([1, 1, 1, 1]); }, "is-quiet")),
      button("הראו קשר", () => {
        const { relation, vectors } = current();
        setCoefficients(relation || vectors.map(() => 0));
      })
    );

    // Isolates one vector from a relation, as in the proof of theorem 2.6.3.
    function isolate(coefficients, count) {
      const pivot = coefficients.findIndex((c, i) => i < count && c !== 0);
      const terms = [];
      for (let j = 0; j < count; j += 1) {
        if (j === pivot || coefficients[j] === 0) continue;
        terms.push(`(${minusSign(fraction(-Math.round(coefficients[j] * 2), Math.round(coefficients[pivot] * 2)))})${nameOf(j)}`);
      }
      return `${nameOf(pivot)} = ${terms.join(" + ") || "0"}`;
    }

    const coplanar = () => current().vectors.length === 3 && current().relation;

    function draw() {
      plot.begin();
      plot.room();
      const { vectors } = current();
      if (coplanar()) plot.span(vectors[0], vectors[1], "pc-gray");
      else if (vectors.length === 2 && !tiny(vectors[0]) && !tiny(vectors[1])) plot.line(ORIGIN, vectors[1], { cls: "pc-gray", dash: "5 5", width: 1.6 });
      vectors.forEach((vector, i) => plot.arrow(ORIGIN, vector, { cls: CLASSES[i], label: nameOf(i) }));
      target3(plot, ORIGIN, "בית");
      endPoint(plot, walk3(plot, state.coefficients, vectors, CLASSES));
      plot.end();
    }
    plot.draw = draw;

    function update() {
      draw();
      const { vectors, relation } = current();
      const used = state.coefficients.slice(0, vectors.length);
      const end = combine(used, vectors);
      const allZero = used.every((c) => c === 0);
      const shown = m(`${used.map((c, i) => term(c, nameOf(i))).join(" + ")} = ${pair(end)}`);
      if (same(end, ORIGIN) && allZero) ui.say(`${shown}. חזרתם הביתה כי לא זזתם: זה <strong>הצירוף הטריוויאלי</strong>, והוא עובד לכל וקטורים. ${relation ? "בדקו אם יש דרך אחרת לחזור." : "כאן אין דרך אחרת, ולכן הווקטורים <strong>בלתי תלויים</strong>."}`);
      else if (same(end, ORIGIN)) ui.say(`${shown}. חזרתם הביתה עם מקדמים שלא כולם אפס, ולכן הווקטורים <strong>תלויים</strong>. מעבירים אגף ומבודדים וקטור אחד: ${m(isolate(used, vectors.length))}.`);
      else if (vectors.length > 3) ui.say(`${shown}. ארבעה וקטורים ב-${m("ℝ³")} תמיד תלויים, לפי משפט 2.6.6, ולכן יש דרך לחזור הביתה. נסו למצוא אותה.`);
      else if (coplanar()) ui.say(`${shown}. שלושת הווקטורים שוכבים באותו מישור, המישור המוצלל. סובבו את התרשים עד שהמישור נראה כקו, ותראו את שלושתם עליו. בתוך מישור אחד יש דרך לחזור הביתה בלי לאפס הכול. נסו למצוא אותה.`);
      else if (relation) ui.say(`${shown}. בזוג הזה יש דרך לחזור הביתה בלי לאפס את כל המקדמים. נסו למצוא אותה.`);
      else ui.say(`${shown}. אף אחד מהשלושה אינו במישור של שני האחרים, ולכן כל עוד מקדם אחד אינו אפס לא תחזרו הביתה. אפסו את כל המקדמים כדי לראות את המקרה היחיד שעובד.`);
    }

    setCoefficients([1, 1, 1, 1]);
    return { render() { plot.layout(); draw(); } };
  };

  // 2.7: the unique coordinates of a target in an ordered basis of R³.
  DEMOS["basis-coordinates"] = (fig) => {
    const { classify } = window.Linalg;
    const ui = frame(fig, "אותו יעד, מתכון לפי בסיס");
    const plot = new Plot3D(ui.plotHost, { range: 4 });
    ui.plotHost.append(viewControls(plot.camera));
    const BASES = [
      { label: "הבסיס הסטנדרטי", vectors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
      { label: "בסיס (1,1,0), (0,1,1), (1,0,1)", vectors: [[1, 1, 0], [0, 1, 1], [1, 0, 1]] },
      { label: "בסיס (1,0,0), (1,1,0), (1,1,1)", vectors: [[1, 0, 0], [1, 1, 0], [1, 1, 1]] },
      { label: "לא בסיס: (1,0,1), (0,1,1), (1,1,2)", vectors: [[1, 0, 1], [0, 1, 1], [1, 1, 2]] }
    ];
    const CLASSES = ["pc-blue", "pc-red", "pc-purple"];
    const state = { index: 1, swapped: false, x: 2, y: 3, z: 3 };
    const ordered = () => {
      const [first, second, third] = BASES[state.index].vectors;
      return state.swapped ? [second, first, third] : [first, second, third];
    };
    const target = () => [state.x, state.y, state.z];
    for (const key of ["x", "y", "z"]) {
      const control = slider({ label: `רכיב ${key} של היעד`, min: -4, max: 4, step: 0.5, value: state[key], onInput(v) { state[key] = v; update(); } });
      ui.controls.append(control.el);
    }
    ui.buttons.append(
      ...BASES.map((item, index) => button(item.label, () => { state.index = index; state.swapped = false; update(); }, "is-quiet")),
      button("החלפת הסדר של a₁ ו-a₂", () => { state.swapped = !state.swapped; update(); })
    );

    function draw() {
      plot.begin();
      plot.room();
      const basis = ordered();
      const result = classify(columnsSystem(basis, target()));
      if (Math.abs(V.dot(basis[0], V.cross(basis[1], basis[2]))) < 1e-9) plot.span(basis[0], basis[1], "pc-gray");
      basis.forEach((vector, i) => plot.arrow(ORIGIN, vector, { cls: CLASSES[i], label: `a${sub(i + 1)}` }));
      if (result.kind === "one") walk3(plot, result.solution.map(value), basis, CLASSES);
      endPoint(plot, target());
      plot.end();
    }
    plot.draw = draw;

    function update() {
      draw();
      const basis = ordered();
      const result = classify(columnsSystem(basis, target()));
      const order = m(basis.map((vector, i) => `a${sub(i + 1)} = ${pair(vector)}`).join(", "));
      if (result.kind === "one") {
        const coefficients = result.solution.map((c) => minusSign(c));
        const wrap = (text) => (/[−/]/.test(text) ? `(${text})` : text);
        ui.say(`${order}. ${m(`${pair(target())} = ${coefficients.map((c, i) => `${wrap(c)}a${sub(i + 1)}`).join(" + ")}`)}. סדרת המקדמים היא ${m(`(${coefficients.join(", ")})`)}, וזה <strong>המתכון היחיד</strong> בסדר הזה (משפט 2.7.9). החליפו את הסדר: הווקטור לא זז, רק המקדמים מתחלפים.`);
      } else if (result.kind === "none") ui.say(`${order}. שלושת הווקטורים שוכבים באותו מישור, המישור המוצלל, ולכן כל צירוף שלהם נשאר עליו. היעד מחוץ למישור, ו<strong>אין לו מתכון</strong>. זה לא בסיס: אין פרישה.`);
      else ui.say(`${order}. שלושת הווקטורים שוכבים באותו מישור. היעד במישור, ולכן יש לו <strong>הרבה מתכונים</strong>, ואין יחידות. גם כאן זה לא בסיס.`);
    }

    update();
    return { render() { plot.layout(); draw(); } };
  };

  // ---------------------------------------------------------------------------
  // Chapter 3: matrices
  // ---------------------------------------------------------------------------

  // A plain matrix on the grid. marks(i, j) gives extra classes for a cell;
  // split puts a bar before that column, as in [A | I].
  function gridMatrix(matrix, { marks = () => "", split = null, label = "מטריצה" } = {}) {
    const node = h("div", { class: "demo-matrix", dir: "ltr", role: "img", style: `--cols:${matrix[0].length}` });
    node.setAttribute("aria-label", `${label}: ${matrix.map((row, i) => `שורה ${i + 1}: ${row.map((v) => String(v)).join(", ")}`).join("; ")}`);
    matrix.forEach((row, i) => {
      row.forEach((value, j) => {
        const classes = [marks(i, j), split !== null && j === split ? "is-free" : ""].filter(Boolean).join(" ");
        node.append(h("span", { class: classes || null, text: minusSign(value) }));
      });
    });
    return node;
  }

  const named = (name, node) => h("div", { class: "demo-named" }, h("span", { class: "demo-name", dir: "ltr", text: name }), node);
  const productOf = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((sum, a, k) => sum + a * B[k][j], 0)));
  const signed = (x) => (x < 0 ? `(${minusSign(x)})` : String(x));

  // 3.4: every cell of a product is one row times one column.
  DEMOS["matrix-product"] = (fig) => {
    const A = [[1, 2], [0, -1], [3, 1]];
    const B = [[2, 0, 1], [1, 4, -2]];
    const ui = frame(fig, "כפל מטריצות: שורה כפול עמודה");
    const board = h("div", { class: "demo-rows demo-product" });
    ui.plotHost.append(board);
    const state = { order: 0, i: 0, j: 0 };
    const factors = () => (state.order === 0 ? [A, B, "A", "B"] : [B, A, "B", "A"]);

    const order = choice("סדר הגורמים", ["AB", "BA"], (v) => { state.order = v; state.i = 0; state.j = 0; refill(); update(); });
    const row = choice("שורה", [], (v) => { state.i = v; update(); });
    const column = choice("עמודה", [], (v) => { state.j = v; update(); });
    ui.controls.append(order.el, row.el, column.el);
    ui.buttons.append(
      button("התא הבא", () => {
        const [L, R] = factors();
        state.j += 1;
        if (state.j === R[0].length) { state.j = 0; state.i = (state.i + 1) % L.length; }
        row.select.value = String(state.i);
        column.select.value = String(state.j);
        update();
      })
    );

    function refill() {
      const [L, R] = factors();
      row.select.replaceChildren(...L.map((_, i) => h("option", { value: String(i), text: String(i + 1) })));
      column.select.replaceChildren(...R[0].map((_, j) => h("option", { value: String(j), text: String(j + 1) })));
      row.select.value = String(state.i);
      column.select.value = String(state.j);
    }

    function update() {
      const [L, R, ln, rn] = factors();
      const P = productOf(L, R);
      const { i, j } = state;
      board.replaceChildren(
        named(`${ln} (${L.length}×${L[0].length})`, gridMatrix(L, { marks: (r) => (r === i ? "is-row" : ""), label: ln })),
        h("span", { class: "demo-op", text: "·" }),
        named(`${rn} (${R.length}×${R[0].length})`, gridMatrix(R, { marks: (_, c) => (c === j ? "is-col" : ""), label: rn })),
        h("span", { class: "demo-op", text: "=" }),
        named(`${ln}${rn} (${P.length}×${P[0].length})`, gridMatrix(P, { marks: (r, c) => (r === i && c === j ? "is-hit" : ""), label: `${ln}${rn}` }))
      );
      const terms = L[i].map((a, k) => `${signed(a)}·${signed(R[k][j])}`).join(" + ");
      const sizes = `${m(`(${L.length}×${L[0].length})·(${R.length}×${R[0].length}) = ${P.length}×${P[0].length}`)}`;
      const other = state.order === 0 ? `ב-${m("BA")} יוצאת מטריצה ${m("2×2")}: אפילו הסדר של התוצאה שונה.` : `ב-${m("AB")} יוצאת מטריצה ${m("3×3")}: אפילו הסדר של התוצאה שונה.`;
      ui.say(`התא ${m(`(${i + 1}, ${j + 1})`)} של ${m(`${ln}${rn}`)} הוא שורה ${i + 1} של ${m(ln)} כפול עמודה ${j + 1} של ${m(rn)}: ${m(`${terms} = ${minusSign(P[i][j])}`)}. הסדרים: ${sizes}. ${other}`);
    }

    refill();
    update();
    return { render: update };
  };

  // 3.9: [A | I] row-reduced to [I | A⁻¹], with the elementary matrix of every step.
  DEMOS["inverse-steps"] = (fig) => {
    const { toFractions, applyOp, nextStep } = window.Linalg;
    const examples = [
      { name: "מטריצה 3×3 הפיכה", matrix: [[1, 1, 1], [0, 1, 2], [1, 0, 0]] },
      { name: "מטריצה 2×2 הפיכה", matrix: [[2, 1], [5, 3]] },
      { name: "שורה שלישית = סכום השתיים", matrix: [[1, 2, 1], [2, 1, 0], [3, 3, 1]] }
    ];
    const ui = frame(fig, "מוצאים הופכית: מדרגים את \\([A \\mid I]\\)");
    const board = h("div", { class: "demo-rows demo-product" });
    ui.plotHost.append(board);
    let history = [];
    let n = 3;

    const example = choice("מטריצה", examples.map((item) => item.name), () => restart());
    ui.controls.append(example.el);
    const nextButton = button("הצעד הבא", () => {
      const op = nextStep(left(current().matrix));
      if (op) apply(op);
    });
    const backButton = button("אחורה", () => { history = history.slice(0, -1); update("חזרנו צעד אחד אחורה."); }, "is-quiet");
    ui.buttons.append(nextButton, backButton, button("מההתחלה", () => restart(), "is-quiet"));

    const current = () => history.at(-1);
    const left = (matrix) => matrix.map((row) => row.slice(0, n));
    const right = (matrix) => matrix.map((row) => row.slice(n));
    const identity = (size) => toFractions(Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (i === j ? 1 : 0))));
    const isIdentity = (matrix) => matrix.every((row, i) => row.every((v, j) => (i === j ? v.isOne() : v.isZero())));
    const zeroRow = (matrix) => matrix.findIndex((row) => row.every((v) => v.isZero()));

    function restart() {
      const A = examples[Number(example.select.value)].matrix;
      n = A.length;
      const I = identity(n);
      history = [{ matrix: toFractions(A).map((row, i) => [...row, ...I[i]]), op: null }];
      update("זו המטריצה \\([A \\mid I]\\). כל פעולה מתבצעת על השורה כולה, משני צדי הקו.");
    }

    function apply(op) {
      history = [...history, { matrix: applyOp(current().matrix, op), op }];
      update(`${m(operationText(op))}: ${OPERATION_NAMES[op.type]}. המטריצה האלמנטרית של הפעולה מופיעה מימין. לבצע את הפעולה זה לכפול בה משמאל (טענה 3.9.3).`);
    }

    let said = "";
    function update(message = said) {
      said = message;
      const { matrix, op } = current();
      const parts = [named("[A | I]", gridMatrix(matrix, { split: n, label: "המטריצה הרחבה" }))];
      if (op) parts.push(named(`φ(I): ${operationText(op)}`, gridMatrix(applyOp(identity(n), op), { label: "המטריצה האלמנטרית" })));
      board.replaceChildren(...parts);
      const done = !nextStep(left(matrix));
      nextButton.disabled = done;
      backButton.disabled = history.length === 1;
      let tail = "";
      if (done && isIdentity(left(matrix))) {
        tail = ` <strong>בצד שמאל התקבלה \\(I\\), ולכן \\(A\\) הפיכה.</strong> בצד ימין: ${m(`A⁻¹ = [${right(matrix).map((row) => row.map(minusSign).join(", ")).join("; ")}]`)}. אלה אותן פעולות, באותו סדר, שהפכו את ${m("A")} ל-${m("I")}.`;
      } else if (zeroRow(left(matrix)) >= 0) {
        tail = ` <strong>בצד שמאל יש שורת אפסים (שורה ${zeroRow(left(matrix)) + 1}), ולכן \\(A\\) אינה הפיכה.</strong> אי אפשר להגיע ל-${m("I")}, והשורות של ${m("A")} תלויות.`;
      }
      ui.say(`${message}${tail}`);
      window.MathJax?.typesetPromise?.([fig]).catch(() => {});
    }

    restart();
    return { render: () => update() };
  };

  // 3.10: a 2×2 matrix moves the whole grid; its columns are where e₁ and e₂ land.
  DEMOS["linear-map"] = (fig) => {
    const ui = frame(fig, "מטריצה מזיזה את דף המשבצות");
    const plot = new Plot(ui.plotHost, { view: { xmin: -4, xmax: 4, ymin: -3.5, ymax: 3.5 }, rows: 14 });
    const state = { a: 1, b: 1, c: 0, d: 1 };
    const sliders = {};
    for (const [key, label] of [["a", "\\(a\\)"], ["b", "\\(b\\)"], ["c", "\\(c\\)"], ["d", "\\(d\\)"]]) {
      sliders[key] = slider({ label, min: -2, max: 2, step: 0.5, value: state[key], onInput: (v) => { state[key] = v; update(); } });
      ui.controls.append(sliders[key].el);
    }
    const setTo = (a, b, c, d) => {
      Object.assign(state, { a, b, c, d });
      for (const key of "abcd") sliders[key].set(state[key]);
      update();
    };
    ui.buttons.append(
      button("הטיה", () => setTo(1, 1, 0, 1), "is-quiet"),
      button("סיבוב ברבע", () => setTo(0, -1, 1, 0), "is-quiet"),
      button("מתיחה", () => setTo(2, 0, 0, 0.5), "is-quiet"),
      button("מחיצה לקו", () => setTo(1, 2, 0.5, 1), "is-quiet"),
      button("\\(I\\)", () => setTo(1, 0, 0, 1), "is-quiet")
    );
    const matrixHost = h("div", { class: "demo-rows" });
    ui.panel.prepend(matrixHost);

    const map = ([x, y]) => [state.a * x + state.b * y, state.c * x + state.d * y];

    function draw() {
      plot.clear();
      plot.drawAxes();
      for (let k = -3; k <= 3; k += 1) {
        const [p, q] = [map([k, -3]), map([k, 3])];
        const [r, t] = [map([-3, k]), map([3, k])];
        plot.line(p[0], p[1], q[0], q[1], { cls: "pc-gray", width: 1, dash: "3 4" });
        plot.line(r[0], r[1], t[0], t[1], { cls: "pc-gray", width: 1, dash: "3 4" });
      }
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(map);
      plot.bands.append(s("polygon", { points: corners.map(([x, y]) => `${plot.X(x)},${plot.Y(y)}`).join(" "), class: "demo-band band-green" }));
      for (let i = 0; i < 4; i += 1) {
        const [p, q] = [corners[i], corners[(i + 1) % 4]];
        plot.line(p[0], p[1], q[0], q[1], { cls: "pc-green", width: 1.6 });
      }
      const e1 = map([1, 0]);
      const e2 = map([0, 1]);
      plot.line(0, 0, e1[0], e1[1], { cls: "pc-blue", width: 3 });
      plot.dot(e1[0], e1[1], { cls: "pc-blue" });
      plot.text(e1[0], e1[1], "Ae₁", { cls: "pc-blue-text", dy: -0.5 });
      plot.line(0, 0, e2[0], e2[1], { cls: "pc-red", width: 3 });
      plot.dot(e2[0], e2[1], { cls: "pc-red" });
      plot.text(e2[0], e2[1], "Ae₂", { cls: "pc-red-text", dy: -0.5 });
    }

    function update() {
      draw();
      const { a, b, c, d } = state;
      matrixHost.replaceChildren(named("A", gridMatrix([[a, b], [c, d]].map((row) => row.map((v) => fmt(v))), { label: "A" })));
      const cross = a * d - b * c;
      const cols = `העמודה הראשונה ${m(`(${fmt(a)}, ${fmt(c)})`)} היא ${m("Ae₁")} (כחול), והשנייה ${m(`(${fmt(b)}, ${fmt(d)})`)} היא ${m("Ae₂")} (אדום).`;
      if (Math.abs(cross) > 1e-9) ui.say(`${cols} העמודות בלתי תלויות, ולכן ריבוע היחידה הפך למקבילית אמיתית (ירוקה) והרשת כולה עדיין ממלאת את המישור. <strong>${m("A")} הפיכה</strong> (טענה 3.10.3): אפשר להחזיר כל נקודה למקומה.`);
      else if (a === 0 && b === 0 && c === 0 && d === 0) ui.say(`${cols} זו מטריצת האפס: כל המישור נמחץ לנקודה אחת, הראשית. <strong>${m("A")} אינה הפיכה.</strong>`);
      else ui.say(`${cols} העמודות תלויות, ולכן כל המישור נמחץ לישר אחד. נקודות שונות נוחתות באותו מקום, ואין דרך לדעת מאיפה הגיעו. <strong>${m("A")} אינה הפיכה</strong>, ול-${m("Ax = b")} אין פתרון כש-${m("b")} מחוץ לישר.`);
    }

    update();
    return { render() { plot.layout(); draw(); } };
  };

  // ---------------------------------------------------------------------------
  // Unit 0: the functions of the course, in motion
  // ---------------------------------------------------------------------------

  const TAU = 2 * Math.PI;
  const rad = (deg) => (deg * Math.PI) / 180;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // sin and cos of the angles everyone meets first, written exactly.
  const EXACT = [
    [0, "0"],
    [0.5, "1/2"],
    [Math.SQRT1_2, "√2/2"],
    [Math.sqrt(3) / 2, "√3/2"],
    [1, "1"]
  ];
  function trigText(value) {
    const hit = EXACT.find(([v]) => Math.abs(Math.abs(value) - v) < 1e-9);
    if (!hit) return fmt(value, 3);
    const text = `${value < -1e-9 ? "−" : ""}${hit[1]}`;
    return hit[1].includes("√") ? `${text} ≈ ${fmt(value, 3)}` : text;
  }

  // A circle on the left and a graph on the right that share the vertical
  // scale: the radius is as long as one unit of the y axis. `before` and
  // `after` are how much of the x axis the graph needs on each side of 0.
  // The graph fills the width that is left, so its x step is not a round
  // number and each demo draws its own ticks; x = 0 still lies on a grid line.
  function circleStage(plot, { before = 0, after, half }) {
    plot.view = { xmin: -1, xmax: 1, ymin: -half, ymax: half };
    plot.layout();
    const radiusCells = Math.round(plot.rows / (2 * half));
    const reserved = 2 * radiusCells + 2;
    const free = Math.max(4, plot.cols - reserved);
    const beforeCells = before ? Math.max(1, Math.round((free * before) / (before + after))) : 0;
    plot.dx = Math.max(before ? before / beforeCells : 0, after / (free - beforeCells));
    plot.xLeft = -(reserved + beforeCells) * plot.dx;
    plot.xRight = plot.xLeft + plot.cols * plot.dx;
    return { cx: 0.5 + (radiusCells + 1) * plot.cell, cy: plot.Y(0), r: radiusCells * plot.cell };
  }

  const onCircle = (stage, t, k = 1) => [stage.cx + stage.r * k * Math.cos(t), stage.cy - stage.r * k * Math.sin(t)];

  function arcPath(stage, from, to, k = 1) {
    const steps = Math.max(2, Math.ceil(Math.abs(to - from) / 0.04));
    let d = "";
    for (let i = 0; i <= steps; i += 1) {
      const [x, y] = onCircle(stage, from + ((to - from) * i) / steps, k);
      d += `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return d;
  }

  const pxLine = (plot, a, b, cls, width, dash = null, layer = "ink") =>
    plot.shape("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: `demo-line ${cls}`, "stroke-width": width, "stroke-dasharray": dash }, layer);
  const pxDot = (plot, p, cls, hollow = false) =>
    plot.shape("circle", { cx: p[0], cy: p[1], r: plot.cell * 0.24, class: `demo-dot ${cls}${hollow ? " is-hollow" : ""}` }, "marks");
  function pxText(plot, p, content, { cls = "", anchor = "middle", size = 0.72 } = {}) {
    const node = plot.shape("text", { x: p[0], y: p[1], class: `demo-label ${cls}`, "text-anchor": anchor, "font-size": plot.cell * size }, "marks");
    node.textContent = content;
  }

  function drawCircle(plot, stage) {
    const { cx, cy, r } = stage;
    const pad = plot.cell * 0.7;
    plot.shape("line", { x1: cx - r - pad, y1: cy, x2: cx + r + pad, y2: cy, class: "demo-line pc-gray", "stroke-width": 1.2 }, "axes");
    plot.shape("line", { x1: cx, y1: cy + r + pad, x2: cx, y2: cy - r - pad, class: "demo-line pc-gray", "stroke-width": 1.2 }, "axes");
    plot.shape("circle", { cx, cy, r, class: "demo-curve pc-gray", "stroke-width": 2 });
  }

  // The point on the unit circle, and its height and width unrolled into the
  // graphs of sine and cosine.
  DEMOS["unit-circle"] = (fig) => {
    const ui = frame(fig, "מעגל היחידה נפרש לגל");
    const plot = new Plot(ui.plotHost, { view: { xmin: -3, xmax: 7, ymin: -1.5, ymax: 1.5 }, rows: 12 });
    const state = { deg: 60, show: 0 };
    let stage;
    const angle = slider({
      label: "הזווית \\(\\theta\\)",
      min: 0,
      max: 360,
      step: 1,
      value: state.deg,
      format: (v) => `${fmt(rad(v))} rad = ${fmt(v, 0)}°`,
      onInput: (v) => {
        run.stop();
        state.deg = v;
        update();
      }
    });
    const what = choice("מה מציירים", ["סינוס (הגובה)", "קוסינוס (הרוחב)", "שניהם"], (i) => {
      state.show = i;
      update();
    });
    const known = [null, 30, 45, 60, 90, 120, 180, 270];
    const jump = choice("זווית מוכרת", ["בחרו…", "π/6 (30°)", "π/4 (45°)", "π/3 (60°)", "π/2 (90°)", "2π/3 (120°)", "π (180°)", "3π/2 (270°)"], (i) => {
      if (!i) return;
      run.stop();
      state.deg = known[i];
      angle.set(state.deg);
      jump.select.value = "0";
      update();
    });
    const run = player(fig, ui, {
      label: "סיבוב שלם",
      seconds: 9,
      from: () => state.deg / 360,
      onFrame: (k) => {
        state.deg = k * 360;
        angle.set(Math.round(state.deg));
        update();
      },
      onStop: () => {
        state.deg = Math.round(state.deg);
        update();
      }
    });
    ui.controls.append(angle.el, what.el, jump.el);
    ui.buttons.append(run.el);

    function place() {
      stage = circleStage(plot, { after: TAU + 0.15, half: 1.5 });
    }

    function draw() {
      const t = rad(state.deg);
      const sin = Math.sin(t);
      const cos = Math.cos(t);
      const showSin = state.show !== 1;
      const showCos = state.show !== 0;
      plot.clear();
      const ticks = [
        { at: Math.PI / 2, label: "π/2" },
        { at: Math.PI, label: "π" },
        { at: 1.5 * Math.PI, label: "3π/2" },
        { at: TAU, label: "2π" }
      ];
      plot.axisX({ from: 0, ticks: plot.dx > 0.7 ? ticks.filter((_, i) => i % 2) : ticks, name: "θ" });
      plot.axisY({ from: -1.4, to: 1.45, ticks: [{ at: 1, label: "1" }, { at: -1, label: "−1" }] });
      drawCircle(plot, stage);
      if (showSin) plot.curve(Math.sin, { cls: "pc-gray", width: 1.2, dash: "3 5", from: 0, to: TAU });
      if (showCos) plot.curve(Math.cos, { cls: "pc-gray", width: 1.2, dash: "3 5", from: 0, to: TAU });

      // The arc that was walked, and the same length laid along the θ axis.
      plot.shape("path", { d: arcPath(stage, 0, t), class: "demo-curve pc-green", "stroke-width": 3.2 });
      plot.line(0, 0, t, 0, { cls: "pc-green", width: 3.2 });

      const centre = [stage.cx, stage.cy];
      const P = onCircle(stage, t);
      const foot = [P[0], stage.cy];
      pxLine(plot, centre, P, "pc-gray", 1.8);
      if (showCos) {
        pxLine(plot, centre, foot, "pc-blue", 3.4);
        pxText(plot, [(centre[0] + foot[0]) / 2, stage.cy + plot.cell * (sin >= 0 ? 0.85 : -0.4)], "cos θ", { cls: "pc-blue-text", size: 0.62 });
        plot.curve(Math.cos, { cls: "pc-blue", width: 2.4, from: 0, to: t });
        if (!showSin) plot.line(t, 0, t, cos, { cls: "pc-blue", width: 3.4 });
        plot.dot(t, cos, { cls: "pc-blue" });
      }
      if (showSin) {
        pxLine(plot, foot, P, "pc-red", 3.4);
        pxText(plot, [P[0] + plot.cell * (cos >= 0 ? 0.3 : -0.3), (P[1] + stage.cy) / 2 + plot.cell * 0.2], "sin θ", { cls: "pc-red-text", anchor: cos >= 0 ? "start" : "end", size: 0.62 });
        plot.curve(Math.sin, { cls: "pc-red", width: 2.4, from: 0, to: t });
        if (!showCos) plot.line(t, 0, t, sin, { cls: "pc-red", width: 3.4 });
        pxLine(plot, P, [plot.X(t), plot.Y(sin)], "pc-red", 1.1, "4 5");
        plot.dot(t, sin, { cls: "pc-red" });
      }
      pxDot(plot, P, "pc-purple");
    }

    function update() {
      draw();
      const t = rad(state.deg);
      const sin = Math.sin(t);
      const cos = Math.cos(t);
      const onAxis = Math.abs(sin) < 1e-9 || Math.abs(cos) < 1e-9;
      const quadrant = ["הראשון", "השני", "השלישי", "הרביעי"][Math.min(3, Math.floor(state.deg / 90))];
      const sign = (v) => (v > 0 ? "חיובי" : "שלילי");
      const where = onAxis ? "הנקודה נמצאת על אחד הצירים." : `הנקודה ברביע ${quadrant}: הסינוס ${sign(sin)} והקוסינוס ${sign(cos)}.`;
      ui.say(
        `הזווית היא ${m(`θ = ${fmt(t)}`)} רדיאנים, כלומר ${m(`${fmt(state.deg, 0)}°`)}. הקשת הירוקה על המעגל והקטע הירוק על הציר מייצגים אותה זווית. הגובה האדום: ${m(`sin θ = ${trigText(sin)}`)}. הרוחב הכחול: ${m(`cos θ = ${trigText(cos)}`)}. ${where}`
      );
    }

    place();
    update();
    return {
      render() {
        place();
        draw();
      }
    };
  };

  // A radian: how many radii fit along the arc.
  DEMOS.radian = (fig) => {
    const ui = frame(fig, "רדיאן: מודדים זווית באורך הקשת");
    const plot = new Plot(ui.plotHost, { view: { xmin: -3, xmax: 7, ymin: -1.5, ymax: 1.5 }, rows: 12 });
    const state = { t: 1 };
    let stage;
    const arc = slider({
      label: "אורך הקשת, ברדיוסים",
      min: 0,
      max: 6.29,
      step: 0.01,
      value: state.t,
      format: (v) => fmt(Math.min(v, TAU)),
      onInput: (v) => {
        run.stop();
        state.t = Math.min(v, TAU);
        update();
      }
    });
    const go = (t) => () => {
      run.stop();
      state.t = t;
      arc.set(t);
      update();
    };
    const run = player(fig, ui, {
      label: "לכרוך רדיוסים על המעגל",
      seconds: 8,
      from: () => state.t / TAU,
      onFrame: (k) => {
        state.t = k * TAU;
        arc.set(state.t);
        update();
      }
    });
    ui.controls.append(arc.el);
    ui.buttons.append(run.el, button("רדיאן אחד", go(1), "is-quiet"), button("חצי סיבוב", go(Math.PI), "is-quiet"), button("סיבוב שלם", go(TAU), "is-quiet"));

    function place() {
      stage = circleStage(plot, { after: TAU + 0.5, half: 1.5 });
    }

    function draw() {
      const { t } = state;
      plot.clear();
      const ticks = [1, 2, 3, 4, 5, 6].map((k) => ({ at: k, label: String(k) }));
      ticks.push({ at: TAU, label: "2π", above: true });
      plot.axisX({ from: 0, ticks, name: "θ" });
      drawCircle(plot, stage);
      const centre = [stage.cx, stage.cy];
      for (let k = 1; k <= 6; k += 1) {
        pxLine(plot, onCircle(stage, k, 0.94), onCircle(stage, k, 1.06), "pc-gray", 1.4);
        const at = onCircle(stage, k, 1.2);
        pxText(plot, [at[0], at[1] + plot.cell * 0.22], String(k), { size: 0.62 });
      }
      // One colour for each whole radius along the arc, and the same on the ruler.
      for (let k = 0; k < t; k += 1) {
        const end = Math.min(k + 1, t);
        const cls = k % 2 ? "pc-orange" : "pc-green";
        plot.shape("path", { d: arcPath(stage, k, end), class: `demo-curve ${cls}`, "stroke-width": 3.6 });
        plot.line(k, 0, end, 0, { cls, width: 3.6 });
      }
      pxLine(plot, centre, onCircle(stage, 0), "pc-blue", 2.6);
      pxText(plot, [stage.cx + stage.r / 2, stage.cy + plot.cell * 0.8], "r", { cls: "pc-blue-text", size: 0.8 });
      pxLine(plot, centre, onCircle(stage, t), "pc-gray", 1.8);
      pxDot(plot, onCircle(stage, t), "pc-purple");
    }

    function update() {
      draw();
      const { t } = state;
      const deg = (t * 180) / Math.PI;
      let extra = "";
      if (Math.abs(t - 1) < 0.006) extra = " זה רדיאן אחד: קשת שאורכה בדיוק כאורך הרדיוס.";
      else if (Math.abs(t - Math.PI) < 0.006) extra = ` חצי סיבוב הוא ${m("π ≈ 3.14")} רדיוסים, ולכן ${m("180° = π")} רדיאנים.`;
      else if (t > TAU - 0.006) extra = ` בהיקף כולו נכנסים ${m("2π ≈ 6.28")} רדיוסים, ולכן ${m("360° = 2π")} רדיאנים.`;
      ui.say(
        `הקשת הצבועה ארוכה פי ${m(fmt(t))} מהרדיוס, ולכן הזווית היא ${m(`${fmt(t)} rad ≈ ${fmt(deg, 1)}°`)}. כל צבע הוא קשת באורך רדיוס אחד, והסרגל מימין סופר אותם.${extra}`
      );
    }

    place();
    update();
    return {
      render() {
        place();
        draw();
      }
    };
  };

  // tan θ as the height where the ray meets the line x = 1.
  DEMOS.tangent = (fig) => {
    const ui = frame(fig, "טנגנס: איפה הקרן פוגשת את המשיק");
    const plot = new Plot(ui.plotHost, { view: { xmin: -6, xmax: 4, ymin: -2, ymax: 2 }, rows: 16 });
    const state = { deg: 45 };
    const LIMIT = 1.97;
    let stage;
    const angle = slider({
      label: "הזווית \\(\\theta\\)",
      min: -180,
      max: 180,
      step: 1,
      value: state.deg,
      format: (v) => `${fmt(rad(v))} rad = ${fmt(v, 0)}°`,
      onInput: (v) => {
        run.stop();
        state.deg = v;
        update();
      }
    });
    const run = player(fig, ui, {
      label: "לסובב את הקרן",
      seconds: 12,
      from: () => (state.deg + 180) / 360,
      onFrame: (k) => {
        state.deg = -180 + 360 * k;
        angle.set(Math.round(state.deg));
        update();
      },
      onStop: () => {
        state.deg = Math.round(state.deg);
        update();
      }
    });
    ui.controls.append(angle.el);
    ui.buttons.append(run.el);

    function place() {
      stage = circleStage(plot, { before: Math.PI + 0.1, after: Math.PI + 0.25, half: 2 });
    }

    function draw() {
      const t = rad(state.deg);
      const sin = Math.sin(t);
      const cos = Math.cos(t);
      const defined = Math.abs(cos) > 1e-9;
      const tan = sin / cos;
      const { cx, cy, r } = stage;
      plot.clear();
      const wide = plot.dx > 0.7;
      plot.axisX({
        from: -Math.PI - 0.1,
        ticks: [
          { at: -Math.PI, label: "−π" },
          { at: -Math.PI / 2, label: wide ? null : "−π/2" },
          { at: Math.PI / 2, label: wide ? null : "π/2" },
          { at: Math.PI, label: "π" }
        ],
        name: "θ"
      });
      plot.axisY({ ticks: [{ at: 1, label: "1" }, { at: -1, label: "−1" }] });
      for (const a of [-Math.PI / 2, Math.PI / 2]) plot.vline(a, { cls: "pc-gray", width: 1.2, dash: "3 5" });
      const gap = 0.03;
      for (const [a, b] of [[-Math.PI, -Math.PI / 2 - gap], [-Math.PI / 2 + gap, Math.PI / 2 - gap], [Math.PI / 2 + gap, Math.PI]]) {
        plot.curve(Math.tan, { cls: "pc-orange", width: 2.2, from: a, to: b });
      }

      drawCircle(plot, stage);
      const tx = cx + r;
      pxLine(plot, [tx, 3], [tx, plot.H - 3], "pc-gray", 1.6);
      pxText(plot, [tx + plot.cell * 0.25, plot.H - plot.cell * 0.35], "x = 1", { anchor: "start", size: 0.6 });
      const centre = [cx, cy];
      const P = onCircle(stage, t);
      if (defined) {
        // The line through the centre and P, up to the tangent line (or the frame).
        const k = Math.min(1, LIMIT / Math.abs(tan));
        pxLine(plot, cos < 0 ? P : centre, [cx + r * k, cy - r * tan * k], "pc-gray", 1.2, "4 5");
        const shown = Math.max(-LIMIT, Math.min(LIMIT, tan));
        pxLine(plot, [tx, cy], [tx, cy - r * shown], "pc-orange", 3.6);
        if (Math.abs(tan) <= LIMIT) {
          const T = [tx, cy - r * tan];
          pxLine(plot, T, [plot.X(t), plot.Y(tan)], "pc-orange", 1.1, "4 5");
          pxDot(plot, T, "pc-orange");
          plot.line(t, 0, t, tan, { cls: "pc-orange", width: 3.2 });
          plot.dot(t, tan, { cls: "pc-orange" });
        }
      } else {
        pxLine(plot, [cx, 3], [cx, plot.H - 3], "pc-gray", 1.2, "4 5");
      }
      pxLine(plot, centre, P, "pc-purple", 2.2);
      pxDot(plot, P, "pc-purple");
    }

    function update() {
      draw();
      const t = rad(state.deg);
      const sin = Math.sin(t);
      const cos = Math.cos(t);
      const degrees = m(`${fmt(state.deg, 0)}°`);
      if (Math.abs(cos) < 1e-9) {
        ui.say(`בזווית ${degrees} הקרן אנכית ומקבילה לישר ${m("x = 1")}, ולכן אינה פוגשת אותו. כאן ${m("cos θ = 0")}, ו-${m("tan θ")} <strong>אינו מוגדר</strong>. בגרף זה הקו המקווקו: אסימפטוטה אנכית.`);
        return;
      }
      const tan = sin / cos;
      const far = Math.abs(tan) > LIMIT ? " נקודת המפגש כבר מחוץ לציור: ככל שהקרן מתקרבת למצב אנכי, הגובה גדל בלי חסם." : "";
      ui.say(
        `בזווית ${m(`θ = ${fmt(t)} rad`)} (${degrees}) מתקבל ${m(`tan θ = sin θ / cos θ = ${fmt(sin)} / ${fmt(cos)} = ${fmt(tan)}`)}. זה הגובה הכתום שבו הקרן פוגשת את הישר ${m("x = 1")}, וזה גם השיפוע של הקרן.${far}`
      );
    }

    place();
    update();
    return {
      render() {
        place();
        draw();
      }
    };
  };

  // Compound interest: (1 + 1/n)^n climbs towards e and never passes it.
  DEMOS.compound = (fig) => {
    const ui = frame(fig, "ריבית דריבית: כך מגיעים ל-\\(e\\)");
    const plot = new Plot(ui.plotHost, { view: { xmin: 0, xmax: 1, ymin: 0, ymax: 3 }, rows: 12, xAlign: "start" });
    const state = { n: 1 };
    const TOP = 1000;
    const presets = [
      ["פעם בשנה", 1],
      ["כל חצי שנה", 2],
      ["כל רבעון", 4],
      ["כל חודש", 12],
      ["כל שבוע", 52],
      ["כל יום", 365],
      ["כל שעה", 8760]
    ];
    const count = slider({
      label: "מספר הצירופים בשנה \\(n\\)",
      log: true,
      min: 1,
      max: 100000,
      value: state.n,
      format: (v) => String(Math.round(v)),
      onInput: (v) => {
        run.stop();
        state.n = Math.round(v);
        often.select.value = "0";
        update();
      }
    });
    const often = choice("כל כמה זמן מצרפים", ["בחרו…", ...presets.map((p) => p[0])], (i) => {
      if (!i) return;
      run.stop();
      state.n = presets[i - 1][1];
      count.set(state.n);
      update();
    });
    const run = player(fig, ui, {
      label: "להגדיל את n",
      seconds: 11,
      from: () => Math.log(state.n) / Math.log(TOP),
      onFrame: (k) => {
        state.n = Math.max(1, Math.round(Math.pow(TOP, k)));
        count.set(state.n);
        update();
      }
    });
    ui.controls.append(count.el, often.el);
    ui.buttons.append(run.el);

    function place() {
      plot.layout();
      plot.spanX(0, 1, 2, 5);
    }

    function draw() {
      const { n } = state;
      const growth = 1 + 1 / n;
      const final = Math.pow(growth, n);
      plot.clear();
      plot.axisX({
        from: 0,
        ticks: [
          { at: 0.25, label: "¼" },
          { at: 0.5, label: "½" },
          { at: 0.75, label: "¾" },
          { at: 1, label: "1" }
        ],
        name: "שנים"
      });
      plot.axisY({ ticks: [{ at: 1, label: "1" }, { at: 2, label: "2" }], name: "₪" });
      plot.line(0, Math.E, plot.xRight, Math.E, { cls: "pc-green", width: 1.4, dash: "6 5" });
      plot.text(plot.xRight - plot.dx * 0.4, Math.E, "e ≈ 2.718", { cls: "pc-green-text", anchor: "end", dy: -0.4 });
      plot.curve(Math.exp, { cls: "pc-green", width: 1.5, dash: "6 5", from: 0, to: 1 });
      if (n <= 500) {
        const steps = [[0, 1]];
        let value = 1;
        for (let k = 1; k <= n; k += 1) {
          steps.push([k / n, value]);
          value *= growth;
          steps.push([k / n, value]);
        }
        plot.polyline(steps, { cls: "pc-blue", width: 2.4 });
      } else {
        plot.curve((t) => Math.pow(growth, Math.floor(n * t + 1e-9)), { cls: "pc-blue", width: 2.4, from: 0, to: 1 });
      }
      plot.line(1, final, plot.xRight, final, { cls: "pc-red", width: 1.2, dash: "2 4" });
      plot.dot(1, final, { cls: "pc-red" });
      plot.text(1 + plot.dx * 0.6, final, final.toFixed(4), { cls: "pc-red-text", anchor: "start", dy: 1.05, size: 0.8 });
    }

    function update() {
      draw();
      const { n } = state;
      const final = Math.pow(1 + 1 / n, n);
      const share = 100 / n;
      const times = n === 1 ? "פעם אחת בשנה" : `${m(String(n))} פעמים בשנה`;
      ui.say(
        `שקל אחד בריבית שנתית של ${m("100%")}, שמצרפים ${times} (${m(`${fmt(share, share < 1 ? 4 : 2)}%`)} בכל פעם). בסוף השנה יש ${m(`(1 + 1/${n})^${n} = ${final.toFixed(5)}`)} שקלים. המרחק מ-${m("e = 2.71828…")} הוא ${m(fmt(Math.E - final, 5))}. המדרגות הכחולות מתקרבות לעקומה הירוקה ${m("eᵗ")} ואינן עוברות אותה.`
      );
    }

    place();
    update();
    return {
      render() {
        place();
        draw();
      }
    };
  };

  // Among all bases a, e is the one whose graph is as steep as it is high.
  DEMOS["e-slope"] = (fig) => {
    const ui = frame(fig, "למה דווקא \\(e\\): הבסיס שבו השיפוע שווה לגובה");
    const plot = new Plot(ui.plotHost, { view: { xmin: -3, xmax: 3, ymin: -0.5, ymax: 6 }, rows: 13, square: true });
    const state = { a: 2, x: 1 };
    const snap = (v) => (Math.abs(v - Math.E) < 0.006 ? Math.E : v);
    const base = slider({
      label: "הבסיס \\(a\\)",
      min: 1.2,
      max: 4,
      step: 0.01,
      value: state.a,
      onInput: (v) => {
        run.stop();
        state.a = snap(v);
        update();
      }
    });
    const at = slider({
      label: "הנקודה \\(x\\)",
      min: -2,
      max: 2,
      step: 0.1,
      value: state.x,
      onInput: (v) => {
        state.x = v;
        update();
      }
    });
    const setBase = (a) => () => {
      run.stop();
      state.a = a;
      base.set(a);
      update();
    };
    const run = player(fig, ui, {
      label: "לחפש את הבסיס",
      seconds: 5,
      onFrame: (k) => {
        state.a = 1.5 + (Math.E - 1.5) * k;
        base.set(state.a);
        update();
      }
    });
    ui.controls.append(base.el, at.el);
    ui.buttons.append(run.el, button("\\(a=2\\)", setBase(2), "is-quiet"), button("\\(a=e\\)", setBase(Math.E), "is-quiet"), button("\\(a=3\\)", setBase(3), "is-quiet"));

    function draw() {
      const { a, x } = state;
      const f = (u) => Math.pow(a, u);
      const y = f(x);
      const slope = Math.log(a) * y;
      plot.clear();
      plot.drawAxes();
      plot.curve(f, { cls: "pc-blue", width: 2.4 });
      plot.curve((u) => y + slope * (u - x), { cls: "pc-red", width: 1.6 });
      plot.line(x, 0, x, y, { cls: "pc-green", width: 3.4 });
      plot.text(x - plot.dx * 0.35, y / 2, fmt(y), { cls: "pc-green-text", anchor: "end", dy: 0.25 });
      // One step to the right, and how much the tangent climbs over it.
      plot.line(x, y, x + 1, y, { cls: "pc-gray", width: 1.4, dash: "3 4" });
      plot.text(x + 0.5, y, "1", { dy: 0.9 });
      plot.line(x + 1, y, x + 1, y + slope, { cls: "pc-red", width: 3.4 });
      plot.text(x + 1 + plot.dx * 0.35, y + slope / 2, fmt(slope), { cls: "pc-red-text", anchor: "start", dy: 0.25 });
      plot.dot(x, y, { cls: "pc-blue" });
    }

    function update() {
      draw();
      const { a, x } = state;
      const y = Math.pow(a, x);
      const ratio = Math.log(a);
      const isE = a === Math.E;
      const head = `כאשר ${m(`a = ${isE ? "e ≈ 2.718" : fmt(a)}`)}, בנקודה ${m(`x = ${fmt(x)}`)}: גובה הגרף (ירוק) הוא ${m(fmt(y, 3))}, והשיפוע של המשיק (אדום) הוא ${m(fmt(ratio * y, 3))}.`;
      const tail = isE
        ? ` השיפוע <strong>שווה לגובה</strong>, ובכל נקודה שתבחרו. זו התכונה שמייחדת את ${m("e")}.`
        : ` השיפוע הוא ${m(fmt(ratio, 3))} כפול הגובה, ובכל נקודה זה אותו מספר. ${ratio < 1 ? `הוא קטן מ-1, כלומר הבסיס קטן מדי: הגדילו את ${m("a")}.` : `הוא גדול מ-1, כלומר הבסיס גדול מדי: הקטינו את ${m("a")}.`}`;
      ui.say(head + tail);
    }

    update();
    return {
      render() {
        plot.layout();
        draw();
      }
    };
  };

  // The inverse function is the mirror image in the line y = x.
  DEMOS["inverse-mirror"] = (fig) => {
    const pairs = [
      { name: "eˣ ↔ ln x", f: Math.exp, lo: -4, hi: 1.6, t: 1, note: `התחום של ${m("ln")} הוא הטווח של ${m("eˣ")}: המספרים החיוביים בלבד.` },
      { name: "x² (x ≥ 0) ↔ √x", f: (x) => x * x, lo: 0, hi: 2.05, t: 1.5, note: `צמצמנו את ${m("x²")} ל-${m("x ≥ 0")}, ושם היא עולה ולכן הפיכה.` },
      { name: "x² על כל הישר", f: (x) => x * x, lo: -2.05, hi: 2.05, tMin: 0.5, t: 1.5, broken: true },
      { name: "sin x ↔ arcsin x", f: Math.sin, lo: -Math.PI / 2, hi: Math.PI / 2, t: 1, note: `הסינוס אינו חד־חד־ערכי על כל הישר, ולכן מצמצמים אותו לקטע ${m("[−π/2, π/2]")}. שם ההפוכה שלו היא ${m("arcsin")}.` },
      { name: "tan x ↔ arctan x", f: Math.tan, lo: -1.33, hi: 1.33, t: 1, note: `האסימפטוטות האנכיות של ${m("tan")} ב-${m("±π/2")} הופכות לאסימפטוטות אופקיות של ${m("arctan")}.` },
      { name: "x³ ↔ ∛x", f: (x) => x ** 3, lo: -1.6, hi: 1.6, t: 1.2, note: `${m("x³")} עולה על כל הישר, ולכן אין צורך לצמצם את התחום.` }
    ];
    const ui = frame(fig, "פונקציה הפוכה: שיקוף בישר \\(y=x\\)");
    const plot = new Plot(ui.plotHost, { view: { xmin: -4.2, xmax: 4.2, ymin: -4, ymax: 4 }, rows: 16, square: true });
    const state = { i: 0, t: pairs[0].t, k: 1 };
    const pick = choice("זוג פונקציות", pairs.map((p) => p.name), (i) => {
      run.stop();
      state.i = i;
      state.k = 1;
      const p = pairs[i];
      state.t = p.t;
      input.range(p.tMin ?? p.lo, p.hi, p.t);
      update();
    });
    const input = slider({
      label: "הקלט \\(t\\)",
      min: pairs[0].lo,
      max: pairs[0].hi,
      step: 0.05,
      value: state.t,
      onInput: (v) => {
        state.t = v;
        update();
      }
    });
    const run = player(fig, ui, {
      label: "לשקף",
      seconds: 2.6,
      onFrame: (k) => {
        state.k = k;
        update();
      }
    });
    ui.controls.append(pick.el, input.el);
    ui.buttons.append(run.el);

    function draw() {
      const p = pairs[state.i];
      const { t, k } = state;
      // A turn about the line y = x, seen from above: at k = 1 the two
      // coordinates have changed places.
      const c = Math.cos(Math.PI * k);
      const flip = ([x, y]) => [(x + y) / 2 + ((x - y) / 2) * c, (x + y) / 2 - ((x - y) / 2) * c];
      plot.clear();
      plot.drawAxes();
      plot.curve((x) => x, { cls: "pc-gray", width: 1.3, dash: "6 5" });
      plot.curve(p.f, { cls: "pc-blue", width: 2.4, from: p.lo, to: p.hi });
      const copy = [];
      for (let i = 0; i <= 200; i += 1) {
        const x = p.lo + ((p.hi - p.lo) * i) / 200;
        copy.push(flip([x, p.f(x)]));
      }
      const mirror = p.broken ? "pc-orange" : "pc-red";
      plot.polyline(copy, { cls: mirror, width: 2.4 });
      const A = [t, p.f(t)];
      const B = flip(A);
      plot.line(A[0], A[1], B[0], B[1], { cls: "pc-gray", width: 1.2, dash: "3 4" });
      plot.dot(A[0], A[1], { cls: "pc-blue" });
      plot.dot(B[0], B[1], { cls: mirror });
      if (p.broken && k === 1) {
        plot.vline(B[0], { cls: "pc-gray", width: 1.2, dash: "3 4" });
        plot.dot(B[0], -B[1], { cls: mirror });
      }
    }

    function update() {
      draw();
      const p = pairs[state.i];
      const { t } = state;
      const y = p.f(t);
      if (state.k < 1) {
        ui.say(`העותק מסתובב סביב הישר ${m("y = x")}: כל נקודה ${m("(x, y)")} בדרך אל ${m("(y, x)")}.`);
      } else if (p.broken) {
        ui.say(
          `העקומה הכתומה היא השיקוף של ${m("y = x²")}, אבל היא <strong>אינה גרף של פונקציה</strong>: לקלט ${m(fmt(y))} מתאימים שני פלטים, ${m(fmt(t))} ו-${m(fmt(-t))}, והישר האנכי פוגש אותה פעמיים. לכן ל-${m("x²")} על כל הישר אין פונקציה הפוכה, ומצמצמים את התחום.`
        );
      } else {
        ui.say(
          `כאן ${m(`f(${fmt(t)}) = ${fmt(y)}`)}, ולכן ההפוכה מחזירה את הקלט: ${m(`f⁻¹(${fmt(y)}) = ${fmt(t)}`)}. הנקודה הכחולה ${m(`(${fmt(t)}, ${fmt(y)})`)} והנקודה האדומה ${m(`(${fmt(y)}, ${fmt(t)})`)} הן תמונות ראי ביחס לישר ${m("y = x")}. ${p.note}`
        );
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

  // y = a f(x - h) + k, one move at a time.
  DEMOS.transform = (fig) => {
    const bases = [
      { name: "x²", f: (x) => x * x, anchor: [0, 0] },
      { name: "|x|", f: Math.abs, anchor: [0, 0] },
      { name: "√x", f: (x) => (x >= 0 ? Math.sqrt(x) : NaN), anchor: [0, 0] },
      { name: "sin x", f: Math.sin, anchor: [Math.PI / 2, 1] },
      { name: "1/x", f: (x) => 1 / x, anchor: [1, 1], pole: 0 },
      { name: "2ˣ", f: (x) => Math.pow(2, x), anchor: [0, 1] }
    ];
    const ui = frame(fig, "הזזות ומתיחות: \\(y=a\\,f(x-h)+k\\)");
    const plot = new Plot(ui.plotHost, { view: { xmin: -6, xmax: 6, ymin: -3, ymax: 4 }, rows: 14 });
    const state = { i: 0, a: 1, h: 2, k: 1, phase: 3 };
    const settle = () => {
      run.stop();
      state.phase = 3;
    };
    const pick = choice("הפונקציה \\(f\\)", bases.map((b) => b.name), (i) => {
      settle();
      state.i = i;
      update();
    });
    const shift = slider({ label: "הזזה אופקית \\(h\\)", min: -4, max: 4, step: 0.5, value: state.h, onInput: (v) => (settle(), (state.h = v), update()) });
    const stretch = slider({ label: "כפל הגובה \\(a\\)", min: -3, max: 3, step: 0.25, value: state.a, onInput: (v) => (settle(), (state.a = v), update()) });
    const lift = slider({ label: "הזזה אנכית \\(k\\)", min: -3, max: 3, step: 0.5, value: state.k, onInput: (v) => (settle(), (state.k = v), update()) });
    const run = player(fig, ui, {
      label: "צעד אחר צעד",
      seconds: 5,
      onFrame: (q) => {
        state.phase = 3 * q;
        update();
      }
    });
    ui.controls.append(pick.el, shift.el, stretch.el, lift.el);
    ui.buttons.append(
      run.el,
      button("איפוס", () => {
        settle();
        Object.assign(state, { a: 1, h: 0, k: 0 });
        shift.set(0);
        stretch.set(1);
        lift.set(0);
        update();
      }, "is-quiet")
    );

    // The three moves in order: slide sideways, multiply the height, slide up.
    function current() {
      const { a, h, k, phase } = state;
      return { h: h * clamp01(phase), a: 1 + (a - 1) * clamp01(phase - 1), k: k * clamp01(phase - 2) };
    }

    function draw() {
      const base = bases[state.i];
      const now = current();
      plot.clear();
      plot.drawAxes();
      plot.curve(base.f, { cls: "pc-gray", width: 1.5, dash: "5 5", skip: base.pole ?? null });
      plot.curve((x) => now.a * base.f(x - now.h) + now.k, { cls: "pc-blue", width: 2.4, skip: base.pole == null ? null : base.pole + now.h });
      const [x0, y0] = base.anchor;
      const end = [x0 + now.h, now.a * y0 + now.k];
      plot.polyline([[x0, y0], [end[0], y0], end], { cls: "pc-green", width: 1.4, dash: "3 4" });
      plot.dot(x0, y0, { cls: "pc-gray", hollow: true });
      plot.dot(end[0], end[1], { cls: "pc-blue" });
    }

    function formula() {
      const { a, h, k } = state;
      const inner = h === 0 ? "x" : `x ${h > 0 ? "−" : "+"} ${fmt(Math.abs(h))}`;
      const front = a === 1 ? "" : a === -1 ? "−" : `${fmt(a)}·`;
      const tail = k === 0 ? "" : ` ${k > 0 ? "+" : "−"} ${fmt(Math.abs(k))}`;
      return `y = ${front}f(${inner})${tail}`;
    }

    function update() {
      draw();
      const base = bases[state.i];
      const { a, h, k, phase } = state;
      if (phase < 3) {
        const step = phase < 1 ? `שלב 1: מזיזים ${m(fmt(Math.abs(h)))} ${h >= 0 ? "ימינה" : "שמאלה"}.` : phase < 2 ? `שלב 2: מכפילים כל גובה ב-${m(fmt(a))}.` : `שלב 3: מזיזים ${m(fmt(Math.abs(k)))} ${k >= 0 ? "למעלה" : "למטה"}.`;
        ui.say(`הנוסחה: ${m(formula())}, כאשר ${m(`f(x) = ${base.name}`)}. ${step}`);
        return;
      }
      const moves = [];
      if (h !== 0) moves.push(`זז ${m(fmt(Math.abs(h)))} ${h > 0 ? "ימינה" : "שמאלה"}`);
      if (a === 0) moves.push("התמוטט לישר אופקי, כי כל גובה הוכפל באפס");
      else {
        if (a < 0) moves.push(`התהפך סביב ציר ${m("x")}`);
        if (Math.abs(a) > 1) moves.push(`נמתח לגובה פי ${m(fmt(Math.abs(a)))}`);
        if (Math.abs(a) < 1) moves.push(`התכווץ לגובה פי ${m(fmt(Math.abs(a)))}`);
      }
      if (k !== 0) moves.push(`זז ${m(fmt(Math.abs(k)))} ${k > 0 ? "למעלה" : "למטה"}`);
      const [x0, y0] = base.anchor;
      const told = moves.length ? `ביחס לגרף המקווקו, הגרף הכחול ${moves.join(", ")}.` : "הגרף הכחול מכסה את הגרף המקווקו: עוד לא שיניתם דבר.";
      const trap = h !== 0 ? ` שימו לב לסימן: ${m(h > 0 ? "x − h" : "x + |h|")} בתוך הסוגריים מזיז ${h > 0 ? "ימינה" : "שמאלה"}.` : "";
      ui.say(`הנוסחה: ${m(formula())}, כאשר ${m(`f(x) = ${base.name}`)}. ${told} הנקודה ${m(`(${fmt(x0)}, ${fmt(y0)})`)} עברה אל ${m(`(${fmt(x0 + h)}, ${fmt(a * y0 + k)})`)}.${trap}`);
    }

    update();
    return {
      render() {
        plot.layout();
        draw();
      }
    };
  };

  // A function as a machine: one input, one output, and inputs it refuses.
  DEMOS["function-machine"] = (fig) => {
    const all = "כל המספרים הממשיים";
    const list = [
      { name: "f(x) = x² − 1", f: (x) => x * x - 1, domain: all, range: m("y ≥ −1") },
      { name: "f(x) = √x", f: Math.sqrt, ok: (x) => x >= 0, why: "למספר שלילי אין שורש ריבועי ממשי", domain: m("x ≥ 0"), range: m("y ≥ 0") },
      { name: "f(x) = 1/x", f: (x) => 1 / x, ok: (x) => Math.abs(x) > 1e-9, why: "אי אפשר לחלק באפס", domain: m("x ≠ 0"), range: m("y ≠ 0"), pole: 0 },
      { name: "f(x) = |x| − 2", f: (x) => Math.abs(x) - 2, domain: all, range: m("y ≥ −2") },
      { name: "f(x) = ⌊x⌋", f: Math.floor, domain: all, range: "המספרים השלמים", steps: true },
      { name: "f(x) = sin x", f: Math.sin, domain: all, range: m("−1 ≤ y ≤ 1") }
    ];
    const ui = frame(fig, "פונקציה כמכונה: קלט נכנס, פלט יוצא");
    const plot = new Plot(ui.plotHost, { view: { xmin: -4.5, xmax: 4.5, ymin: -3, ymax: 4 }, rows: 14 });
    const state = { i: 0, x: 2, seen: [] };
    const pick = choice("הפונקציה", list.map((item) => item.name), (i) => {
      run.stop();
      state.i = i;
      state.seen = [];
      update();
    });
    const input = slider({
      label: "הקלט \\(x\\)",
      min: -4,
      max: 4,
      step: 0.1,
      value: state.x,
      onInput: (v) => {
        run.stop();
        state.x = v;
        update();
      }
    });
    const run = player(fig, ui, {
      label: "להריץ את כל הקלטים",
      seconds: 7,
      from: () => {
        state.seen = [];
        return 0;
      },
      onFrame: (k) => {
        state.x = -4 + 8 * k;
        input.set(state.x);
        update();
      },
      onStop: () => {
        state.x = Math.round(state.x * 10) / 10;
        update();
      }
    });
    ui.controls.append(pick.el, input.el);
    ui.buttons.append(run.el);

    const inDomain = (item, x) => (item.ok ? item.ok(x) : true);

    function draw() {
      const item = list[state.i];
      const { x } = state;
      plot.clear();
      plot.drawAxes();
      if (item.steps) {
        for (let k = Math.floor(plot.xLeft); k < plot.xRight; k += 1) {
          plot.line(k, k, k + 1, k, { cls: "pc-blue", width: 2.4 });
          plot.dot(k + 1, k, { cls: "pc-blue", hollow: true, r: plot.cell * 0.17 });
          plot.dot(k, k, { cls: "pc-blue", r: plot.cell * 0.17 });
        }
      } else {
        plot.curve((u) => (inDomain(item, u) ? item.f(u) : NaN), { cls: "pc-blue", width: 2.4, skip: item.pole ?? null });
      }
      // Every output so far, marked on the y axis: together they are the image.
      const x0 = plot.X(0);
      const marks = state.seen.map((y) => `M${x0 - 5} ${plot.Y(y).toFixed(1)}h10`).join("");
      if (marks) plot.shape("path", { d: marks, class: "demo-line pc-red", "stroke-width": 1.4, "stroke-opacity": 0.55 });
      if (!inDomain(item, x)) {
        plot.dot(x, 0, { cls: "pc-red", hollow: true });
        return;
      }
      const y = item.f(x);
      plot.line(x, 0, x, y, { cls: "pc-blue", width: 1.5, dash: "4 4" });
      plot.line(x, y, 0, y, { cls: "pc-red", width: 1.5, dash: "4 4" });
      plot.dot(x, 0, { cls: "pc-blue" });
      plot.dot(0, y, { cls: "pc-red" });
      plot.dot(x, y, { cls: "pc-purple" });
    }

    function update() {
      const item = list[state.i];
      const { x } = state;
      const ok = inDomain(item, x);
      if (ok) {
        const y = Math.round(item.f(x) * 50) / 50;
        if (Number.isFinite(y) && !state.seen.includes(y) && state.seen.length < 500) state.seen.push(y);
      }
      draw();
      if (!ok) {
        ui.say(`הקלט ${m(`x = ${fmt(x)}`)} <strong>אינו בתחום</strong>: ${item.why}. המכונה אינה מחזירה פלט. התחום: ${item.domain}.`);
        return;
      }
      ui.say(
        `הקלט ${m(`x = ${fmt(x)}`)} (כחול, על ציר ${m("x")}) נכנס, והפלט ${m(`f(${fmt(x)}) = ${fmt(item.f(x), 3)}`)} (אדום, על ציר ${m("y")}) יוצא. לכל קלט בתחום יש פלט אחד בלבד. התחום: ${item.domain}. הסימנים האדומים על ציר ${m("y")} הם הפלטים שכבר התקבלו, וכולם יחד הם התמונה: ${item.range}.`
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
        const render = (force = false) => {
          const width = fig.clientWidth;
          const cell = cellOf(fig);
          // A folded callout has no plot width. Opening it must lay out the
          // curves again, even if its previous visible width was the same.
          if (!width) {
            item.width = 0;
            return;
          }
          if (!force && width === item.width && cell === item.cell) return;
          item.width = width;
          item.cell = cell;
          demo.render();
          notifyResize();
        };
        item.render = render;
        render();
        if ("ResizeObserver" in window) {
          item.observer = new ResizeObserver(() => render());
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

  function refresh(root) {
    mount(root);
    for (const item of live) if (root.contains(item.fig)) item.render(true);
  }

  // toggle does not bubble. Capture it for graphs in nested callouts too;
  // resize is also the fallback in browsers without ResizeObserver.
  document.addEventListener("toggle", (event) => {
    if (event.target.matches("details") && event.target.open) refresh(event.target);
  }, true);
  window.addEventListener("resize", () => {
    for (const item of live) if (item.fig.isConnected) item.render();
  });

  // A change of text size changes the grid cell without changing the width.
  new MutationObserver(() => {
    for (const item of live) item.render?.();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-text-size"] });

  window.InfiDemos = { mount, refresh, compileTex };
})();
