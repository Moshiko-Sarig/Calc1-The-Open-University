// Theorem numbers: two levels in the calculus books (1.47), three in the linear
// algebra books (1.10.5). web-app/assets/study.js repeats NUMBER_SOURCE, because
// browser code cannot import this module; tests/numbers.test.mjs runs its copies.
export const NUMBER_SOURCE = "\\d+(?:\\.\\d+){1,2}";
export const NUMBER_KEY_SOURCE = "\\d+(?:-\\d+){1,2}";

export const numberKey = (number) => number.replace(/\./g, "-");
export const numberFromKey = (key) => key.replace(/-/g, ".");

export function compareNumbers(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return difference;
  }
  return 0;
}
