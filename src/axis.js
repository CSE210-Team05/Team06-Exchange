/**
 * Automatic axis scaling: nice tick values, the data-to-pixel mapping and
 * tick labels.
 *
 * The distance between ticks is always 1, 2 or 5 times a power of ten
 * (Paul Heckbert, "Nice Numbers for Graph Labels", Graphics Gems, 1990),
 * and each axis is extended to start and end on a tick.
 */

// Thresholds at the geometric means between neighbouring mantissas
// (sqrt(2) between 1 and 2, sqrt(10) between 2 and 5, sqrt(50) between 5 and 10),
// so the chosen step is the closest nice step on a logarithmic scale.
const BETWEEN_1_AND_2 = Math.SQRT2;
const BETWEEN_2_AND_5 = Math.sqrt(10);
const BETWEEN_5_AND_10 = Math.sqrt(50);

export const MINUS = '−';

const UNITS = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/**
 * Decimal places needed to write `value` exactly: 0.25 -> 2, 5 -> 0.
 * @param {number} value
 */
export function decimalsOf(value) {
  if (!Number.isFinite(value) || value === 0) return 0;
  const abs = Math.abs(value);
  for (let digits = 0; digits < 15; digits++) {
    const scaled = abs * 10 ** digits;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9 * Math.max(1, scaled)) return digits;
  }
  return 15;
}

/**
 * Round to `digits` decimals and turn -0 into 0 (removes 0.30000000000000004 noise).
 * @param {number} value
 * @param {number} digits
 */
function roundTo(value, digits) {
  const rounded = Number(value.toFixed(Math.min(100, Math.max(0, digits))));
  return rounded === 0 ? 0 : rounded;
}

/**
 * A nice distance between ticks for cutting [start, stop] into about `count` parts.
 * @param {number} start
 * @param {number} stop
 * @param {number} count
 * @returns {number} 0 if the interval is empty or invalid
 */
export function tickStep(start, stop, count) {
  const rawStep = Math.abs(stop - start) / Math.max(1, count);
  if (!Number.isFinite(rawStep) || rawStep === 0) return 0;
  const power = Math.floor(Math.log10(rawStep));
  const mantissa = rawStep / 10 ** power;
  let factor = 1;
  if (mantissa >= BETWEEN_5_AND_10) factor = 10;
  else if (mantissa >= BETWEEN_2_AND_5) factor = 5;
  else if (mantissa >= BETWEEN_1_AND_2) factor = 2;
  return roundTo(factor * 10 ** power, Math.max(0, -power));
}

/**
 * Nice axis for the data range [low, high]: the domain is widened to the
 * nearest multiples of the tick step (in one pass, so the step cannot
 * escalate), and every multiple inside it is a tick.
 * @param {number} low smallest data value
 * @param {number} high largest data value
 * @param {number} count approximate number of intervals
 * @returns {{ domain: [number, number], ticks: number[], step: number }}
 */
export function niceAxis(low, high, count) {
  let start = Math.min(low, high);
  let stop = Math.max(low, high);
  if (!Number.isFinite(start) || !Number.isFinite(stop)) [start, stop] = [0, 1];
  if (start === stop) {
    // A single distinct value: open a window around it.
    const delta = Math.abs(start) * 0.1 || 1;
    start -= delta;
    stop += delta;
  }
  const step = tickStep(start, stop, count);
  const digits = decimalsOf(step);
  const first = Math.floor(start / step + 1e-9);
  const last = Math.ceil(stop / step - 1e-9);
  const ticks = [];
  for (let index = first; index <= last; index++) ticks.push(roundTo(index * step, digits));
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks, step };
}

/**
 * A linear mapping from a data interval to a pixel interval.
 * @param {[number, number]} domain
 * @param {[number, number]} range
 * @returns {(value: number) => number}
 */
export function linearScale([d0, d1], [r0, r1]) {
  const factor = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (value) => r0 + (value - d0) * factor;
}

/**
 * Formatter for the tick labels of one axis. All labels share one precision
 * (0.0, 0.5, 1.0), long numbers use compact units (5K, 2.5M), and negative
 * numbers get the typographic minus sign, which is as wide as a plus sign.
 * @param {number[]} ticks
 * @param {number} step distance between ticks
 * @returns {(value: number) => string}
 */
export function tickFormatter(ticks, step) {
  const maxAbs = ticks.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
  const fixed = (value, digits) => roundTo(value, digits).toFixed(digits).replace('-', MINUS);

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
