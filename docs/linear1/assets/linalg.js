/* Exact row reduction for the linear algebra demos. Entries are fractions, so a
 * step shows 1/3 and never 0.333. Runs in the browser and in tests/linalg.test.mjs.
 * Rows and columns are 0-based. An operation is one of the book's three types:
 *   { type: "swap", i, j }       R_i <-> R_j
 *   { type: "scale", i, k }      R_i -> k R_i, with k != 0
 *   { type: "add", i, j, k }     R_i -> R_i + k R_j, with i != j
 */
(() => {
  "use strict";

  const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));

  class Fraction {
    constructor(n, d = 1) {
      if (d === 0) throw new RangeError("zero denominator");
      const g = gcd(n, d) || 1;
      const sign = d < 0 ? -1 : 1;
      this.n = (sign * n) / g || 0;
      this.d = (sign * d) / g;
    }

    add(other) {
      return new Fraction(this.n * other.d + other.n * this.d, this.d * other.d);
    }

    mul(other) {
      return new Fraction(this.n * other.n, this.d * other.d);
    }

    neg() {
      return new Fraction(-this.n, this.d);
    }

    inverse() {
      return new Fraction(this.d, this.n);
    }

    isZero() {
      return this.n === 0;
    }

    isOne() {
      return this.n === 1 && this.d === 1;
    }

    toString() {
      return this.d === 1 ? String(this.n) : `${this.n}/${this.d}`;
    }
  }

  const fraction = (n, d = 1) => new Fraction(n, d);
  const toFraction = (value) => (value instanceof Fraction ? value : fraction(value));
  const toFractions = (matrix) => matrix.map((row) => row.map(toFraction));

  function applyOp(matrix, op) {
    const out = matrix.map((row) => row.slice());
    if (op.type === "swap") {
      [out[op.i], out[op.j]] = [out[op.j], out[op.i]];
    } else if (op.type === "scale") {
      if (op.k.isZero()) throw new RangeError("scaling by zero is not elementary");
      out[op.i] = out[op.i].map((value) => value.mul(op.k));
    } else if (op.type === "add") {
      if (op.i === op.j) throw new RangeError("adding a row to itself is not elementary");
      out[op.i] = out[op.i].map((value, column) => value.add(out[op.j][column].mul(op.k)));
    } else {
      throw new RangeError(`unknown operation ${op.type}`);
    }
    return out;
  }

  // The next operation toward the canonical form, or null if it is already there.
  // Works left to right: bring a pivot up, make it 1, then clear its column.
  function nextStep(matrix) {
    const rows = matrix.length;
    const columns = matrix[0]?.length ?? 0;
    let top = 0;
    for (let column = 0; column < columns && top < rows; column += 1) {
      let below = top;
      while (below < rows && matrix[below][column].isZero()) below += 1;
      if (below === rows) continue;
      if (below !== top) return { type: "swap", i: top, j: below };
      if (!matrix[top][column].isOne()) return { type: "scale", i: top, k: matrix[top][column].inverse() };
      for (let row = 0; row < rows; row += 1) {
        if (row !== top && !matrix[row][column].isZero()) return { type: "add", i: row, j: top, k: matrix[row][column].neg() };
      }
      top += 1;
    }
    return null;
  }

  function pivotsOf(matrix) {
    const pivots = [];
    for (const row of matrix) {
      const column = row.findIndex((value) => !value.isZero());
      if (column >= 0) pivots.push(column);
    }
    return pivots;
  }

  function rref(input) {
    let matrix = toFractions(input);
    const steps = [];
    for (let op = nextStep(matrix); op; op = nextStep(matrix)) {
      matrix = applyOp(matrix, op);
      steps.push({ op, matrix });
    }
    return { steps, result: matrix, pivots: pivotsOf(matrix) };
  }

  // The kind of solution set of a system given by its augmented matrix.
  function classify(augmented) {
    const { result, pivots } = rref(augmented);
    const variables = (augmented[0]?.length ?? 1) - 1;
    if (pivots.includes(variables)) return { kind: "none", free: [], solution: null, result, pivots };
    const free = Array.from({ length: variables }, (_, column) => column).filter((column) => !pivots.includes(column));
    if (free.length) return { kind: "infinite", free, solution: null, result, pivots };
    return { kind: "one", free, solution: result.slice(0, variables).map((row) => row[variables]), result, pivots };
  }

  (typeof window === "undefined" ? globalThis : window).Linalg = { fraction, toFractions, applyOp, nextStep, rref, classify };
})();
