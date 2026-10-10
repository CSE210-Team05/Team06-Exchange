/**
 * Seeded random numbers for the demo data, so every visitor (and every
 * screenshot) sees exactly the same "random" datasets.
 */

/**
 * Mulberry32 pseudo-random generator (Tommy Ettinger, public domain):
 * a tiny 32-bit generator with good statistical quality for demos.
 * @param {number} seed
 * @returns {() => number} uniform numbers in [0, 1)
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard normal samples via the Box-Muller transform.
 * @param {() => number} random uniform generator
 * @returns {() => number}
 */
export function normal(random) {
  return () => {
    const u = 1 - random(); // (0, 1], avoids log(0)
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/** [0, 1, ..., count - 1] */
export const range = (count) => Array.from({ length: count }, (_, index) => index);
