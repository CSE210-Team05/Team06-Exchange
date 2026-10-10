/**
 * Tick label formatting.
 *
 * All labels on one axis share one precision (0.0, 0.5, 1.0 rather than
 * 0, 0.5, 1). Long numbers use compact units (5K, 2.5M), and negative numbers
 * get the typographic minus sign, which is as wide as a plus sign.
 */
import { decimalsOf, roundTo } from './scale.js';

export const MINUS = '−';

const UNITS = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/**
 * Fixed-point text without "-0" and with a proper minus sign.
 * @param {number} value
 * @param {number} digits
 */
function fixed(value, digits) {
  return roundTo(value, digits).toFixed(digits).replace('-', MINUS);
}

/**
 * Formatter for the ticks of one axis.
 * @param {number[]} ticks
 * @param {number} step distance between ticks
 * @returns {(value: number) => string}
 */
export function tickFormatter(ticks, step) {
  const maxAbs = ticks.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);

  // Compact units from 10,000 up, or from 1,000 when the ticks are whole
  // thousands. The second rule keeps years such as 1990 or 2020 intact.
  if (maxAbs >= 1e4 || (maxAbs >= 1e3 && step >= 1e3)) {
    const [unit, suffix] = UNITS.find(([size]) => maxAbs >= size);
    const digits = decimalsOf(roundTo(step / unit, 12));
    return (value) => (value === 0 ? '0' : fixed(value / unit, digits) + suffix);
  }

  // Tiny magnitudes: a shared exponent, e.g. 2.5e−5.
  if (maxAbs > 0 && maxAbs < 1e-3) {
    const exponent = Math.floor(Math.log10(maxAbs));
    const digits = decimalsOf(roundTo(step / 10 ** exponent, 12));
    return (value) => (value === 0 ? '0' : `${fixed(value / 10 ** exponent, digits)}e${String(exponent).replace('-', MINUS)}`);
  }

  const digits = decimalsOf(step);
  return (value) => fixed(value, digits);
}
