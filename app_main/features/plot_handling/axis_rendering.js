/**
 * Automatic axis scaling: nice tick values and tick labels.
 *
 * The distance between ticks is always 1, 2 or 5 times a power of ten
 * (Paul Heckbert, "Nice Numbers for Graph Labels", Graphics Gems, 1990),
 * and each axis is extended to start and end on a tick.
 */
import { compute_decimals, round_value } from '../../../libs/custom/math_operations.js';

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
 * A nice distance between ticks for cutting [start, stop] into about `count` parts.
 * @param {number} start
 * @param {number} stop
 * @param {number} count
 * @returns {number} 0 if the interval is empty or invalid
 */
export function tick_step(start, stop, count) {
  const raw_step = Math.abs(stop - start) / Math.max(1, count);
  if (!Number.isFinite(raw_step) || raw_step === 0) return 0;
  const power = Math.floor(Math.log10(raw_step));
  const mantissa = raw_step / 10 ** power;
  let factor = 1;
  if (mantissa >= BETWEEN_5_AND_10) factor = 10;
  else if (mantissa >= BETWEEN_2_AND_5) factor = 5;
  else if (mantissa >= BETWEEN_1_AND_2) factor = 2;
  return round_value(factor * 10 ** power, Math.max(0, -power));
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
export function nice_axis(low, high, count) {
  let start = Math.min(low, high);
  let stop = Math.max(low, high);
  if (!Number.isFinite(start) || !Number.isFinite(stop)) [start, stop] = [0, 1];
  if (start === stop) {
    // A single distinct value: open a window around it.
    const delta = Math.abs(start) * 0.1 || 1;
    start -= delta;
    stop += delta;
  }
  const step = tick_step(start, stop, count);
  const digits = compute_decimals(step);
  const first = Math.floor(start / step + 1e-9);
  const last = Math.ceil(stop / step - 1e-9);
  const ticks = [];
  for (let index = first; index <= last; index++) ticks.push(round_value(index * step, digits));
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks, step };
}

/**
 * Axis for values already transformed with log10. Whole powers of ten are
 * used across broad ranges; a regular nice axis keeps labels useful while
 * zoomed into less than one decade.
 */
export function logarithmic_axis(low, high, count) {
  let start = Math.min(low, high);
  let stop = Math.max(low, high);
  if (!Number.isFinite(start) || !Number.isFinite(stop)) [start, stop] = [0, 1];
  if (start === stop) [start, stop] = [start - 0.5, stop + 0.5];

  let axis;
  if (stop - start < 1) {
    axis = nice_axis(start, stop, count);
  } else {
    const first = Math.floor(start);
    const last = Math.ceil(stop);
    const step = Math.max(1, Math.ceil((last - first) / Math.max(1, count)));
    const ticks = [];
    for (let exponent = first; exponent <= last; exponent += step) ticks.push(exponent);
    if (ticks.at(-1) !== last) ticks.push(last);
    axis = { domain: [first, last], ticks, step };
  }

  const raw_ticks = axis.ticks.map((value) => 10 ** value);
  const raw_step = raw_ticks.length > 1 ? Math.abs(raw_ticks[1] - raw_ticks[0]) : raw_ticks[0];
  const format_raw = tick_formatter(raw_ticks, raw_step);
  return { ...axis, format: (value) => format_raw(10 ** value) };
}

/**
 * Formatter for the tick labels of one axis. All labels share one precision
 * (0.0, 0.5, 1.0), long numbers use compact units (5K, 2.5M), and negative
 * numbers get the typographic minus sign, which is as wide as a plus sign.
 * @param {number[]} ticks
 * @param {number} step distance between ticks
 * @returns {(value: number) => string}
 */
export function tick_formatter(ticks, step) {
  const max_abs = ticks.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
  const fixed = (value, digits) => round_value(value, digits).toFixed(digits).replace('-', MINUS);

  // Compact units from 10,000 up, or from 1,000 when the ticks are whole
  // thousands. The second rule keeps years such as 1990 or 2020 intact.
  if (max_abs >= 1e4 || (max_abs >= 1e3 && step >= 1e3)) {
    const [unit, suffix] = UNITS.find(([size]) => max_abs >= size);
    const digits = compute_decimals(round_value(step / unit, 12));
    return (value) => (value === 0 ? '0' : fixed(value / unit, digits) + suffix);
  }

  // Tiny magnitudes: a shared exponent, e.g. 2.5e−5.
  if (max_abs > 0 && max_abs < 1e-3) {
    const exponent = Math.floor(Math.log10(max_abs));
    const digits = compute_decimals(round_value(step / 10 ** exponent, 12));
    return (value) => (value === 0 ? '0' : `${fixed(value / 10 ** exponent, digits)}e${String(exponent).replace('-', MINUS)}`);
  }

  const digits = compute_decimals(step);
  return (value) => fixed(value, digits);
}
