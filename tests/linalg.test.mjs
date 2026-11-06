import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import vm from "node:vm";

import { root } from "./helpers.mjs";

let Linalg;
const text = (matrix) => matrix.map((row) => row.map(String));

before(() => {
  vm.runInThisContext(fs.readFileSync(path.join(root, "web-app/assets/linalg.js"), "utf8"));
  Linalg = globalThis.Linalg;
});

test("rref reaches the canonical form", () => {
  const { result, pivots } = Linalg.rref([[1, 2, 3], [4, 5, 6]]);
  assert.deepEqual(text(result), [["1", "0", "-1"], ["0", "1", "2"]]);
  assert.deepEqual(pivots, [0, 1]);
});

test("rref stays exact: a half is a fraction, not 0.5", () => {
  const { steps, result } = Linalg.rref([[2, 1], [1, 1]]);
  assert.deepEqual(steps[0].op, { type: "scale", i: 0, k: Linalg.fraction(1, 2) });
  assert.equal(String(steps[0].matrix[0][1]), "1/2");
  assert.deepEqual(text(result), [["1", "0"], ["0", "1"]]);
});

test("thirds do not drift through rounding", () => {
  const { result } = Linalg.rref([[3, 1, 1], [1, 3, 1]]);
  assert.deepEqual(text(result), [["1", "0", "1/4"], ["0", "1", "1/4"]]);
});

test("a zero matrix has no pivots and needs no steps", () => {
  const { steps, pivots, result } = Linalg.rref([[0, 0], [0, 0]]);
  assert.deepEqual(pivots, []);
  assert.deepEqual(steps, []);
  assert.deepEqual(text(result), [["0", "0"], ["0", "0"]]);
});

test("zero rows sink below the other rows", () => {
  const { result, pivots } = Linalg.rref([[0, 0, 0], [1, 2, 3]]);
  assert.deepEqual(text(result), [["1", "2", "3"], ["0", "0", "0"]]);
  assert.deepEqual(pivots, [0]);
});

test("rref leaves the matrix it was given alone", () => {
  const matrix = [[2, 4], [1, 1]];
  Linalg.rref(matrix);
  assert.deepEqual(matrix, [[2, 4], [1, 1]]);
});

test("every step of rref is an elementary operation of the three book types", () => {
  const { steps } = Linalg.rref([[0, 1, 2], [2, 4, 6], [1, 1, 1]]);
  assert.ok(steps.length > 0);
  for (const { op } of steps) assert.ok(["swap", "scale", "add"].includes(op.type));
});

test("applyOp performs each row operation", () => {
  const matrix = Linalg.toFractions([[1, 2], [3, 4]]);
  assert.deepEqual(text(Linalg.applyOp(matrix, { type: "swap", i: 0, j: 1 })), [["3", "4"], ["1", "2"]]);
  assert.deepEqual(text(Linalg.applyOp(matrix, { type: "scale", i: 1, k: Linalg.fraction(1, 2) })), [["1", "2"], ["3/2", "2"]]);
  assert.deepEqual(text(Linalg.applyOp(matrix, { type: "add", i: 1, j: 0, k: Linalg.fraction(-3) })), [["1", "2"], ["0", "-2"]]);
  assert.deepEqual(text(matrix), [["1", "2"], ["3", "4"]]);
});

test("applyOp refuses a change that is not elementary", () => {
  const matrix = Linalg.toFractions([[1, 2], [3, 4]]);
  assert.throws(() => Linalg.applyOp(matrix, { type: "scale", i: 0, k: Linalg.fraction(0) }));
  assert.throws(() => Linalg.applyOp(matrix, { type: "add", i: 0, j: 0, k: Linalg.fraction(1) }));
});

test("nextStep continues from a matrix the reader already changed", () => {
  const start = Linalg.toFractions([[1, 2], [3, 4]]);
  const changed = Linalg.applyOp(start, { type: "add", i: 1, j: 0, k: Linalg.fraction(-3) });
  assert.deepEqual(Linalg.nextStep(changed), { type: "scale", i: 1, k: Linalg.fraction(-1, 2) });
  assert.equal(Linalg.nextStep(Linalg.toFractions([[1, 0], [0, 1]])), null);
});

test("classify tells no solution, one solution and infinitely many apart", () => {
  assert.equal(Linalg.classify([[1, 1, 2], [1, 1, 3]]).kind, "none");
  assert.equal(Linalg.classify([[1, 1, 2], [1, -1, 0]]).kind, "one");
  const many = Linalg.classify([[1, 1, 2], [2, 2, 4]]);
  assert.equal(many.kind, "infinite");
  assert.deepEqual(many.free, [1]);
});

test("classify gives the solution when it is unique", () => {
  assert.deepEqual(Linalg.classify([[1, 1, 2], [1, -1, 0]]).solution.map(String), ["1", "1"]);
});

test("classify treats 0 = 0 as no constraint and 0 = 1 as no solution", () => {
  assert.equal(Linalg.classify([[1, 1, 2], [0, 0, 0]]).kind, "infinite");
  assert.equal(Linalg.classify([[1, 1, 2], [0, 0, 1]]).kind, "none");
});
