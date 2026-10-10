/**
 * Number formatting for tick labels and tooltips.
 *
 * Tick labels share one precision per axis (0.0, 0.5, 1.0 rather than
 * 0, 0.5, 1) and switch to compact units (1K, 2.5M) once numbers get long.
 * Negative numbers use the typographic minus sign (U+2212), which is as wide
 * as a plus sign and keeps columns of labels visually aligned.
 */
import { decimalsOf, roundTo } from './ticks.js';

export const MINUS = '−';

const COMPACT_UNITS = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** Replace ASCII hyphen-minus signs with the typographic minus sign. */
export function withMinus(text) {
  return text.replace(/-/g, MINUS);
}

/**
 * Fixed-point formatting without "-0.0".
 * @param {number} value
 * @param {number} digits
 */
export function toFixedClean(value, digits) {
  const rounded = roundTo(value, digits);
  return rounded.toFixed(Math.max(0, Math.min(100, digits)));
}

/** Insert thousands separators into the integer part of a plain number string. */
function groupThousands(text) {
  const [integerPart, fractionPart] = text.split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fractionPart === undefined ? grouped : `${grouped}.${fractionPart}`;
}

/** Remove trailing zeros after a decimal point: "2.50" -> "2.5", "3.00" -> "3". */
function stripZeros(text) {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/**
 * Build a formatter for the tick values of a linear axis. All labels of the
 * axis use the same unit and number of decimals.
 * @param {number[]} ticks
 * @param {number} [step] distance between ticks (derived from `ticks` if omitted)
 * @returns {(value: number) => string}
 */
export function linearTickFormatter(ticks, step) {
  const maxAbs = ticks.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
  const tickDistance = step || (ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : maxAbs || 1);

  // Compact units from 10,000 up, or from 1,000 when the ticks themselves are
  // whole thousands. The second condition keeps years (1990, 2000) intact.
  if (maxAbs >= 1e4 || (maxAbs >= 1e3 && tickDistance >= 1e3)) {
    const [unit, suffix] = COMPACT_UNITS.find(([size]) => maxAbs >= size) ?? [1, ''];
    const digits = decimalsOf(roundTo(tickDistance / unit, 12));
    return (value) => (value === 0 ? '0' : withMinus(toFixedClean(value / unit, digits) + suffix));
  }

  // Very small magnitudes: shared exponent, e.g. 2.5e−5.
  if (maxAbs > 0 && maxAbs < 1e-3) {
    const exponent = Math.floor(Math.log10(maxAbs));
    const scale = 10 ** exponent;
    const digits = decimalsOf(roundTo(tickDistance / scale, 12));
    return (value) => (value === 0 ? '0' : withMinus(`${toFixedClean(value / scale, digits)}e${exponent}`));
  }

  const digits = decimalsOf(tickDistance);
  return (value) => withMinus(toFixedClean(value, digits));
}

/**
 * Short label for a single value whose neighbours may have very different
 * magnitudes (log axes): 0.01, 0.5, 1, 20, 1K, 2.5M.
 * @param {number} value
 */
export function formatCompact(value) {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs < 1e-3) return withMinus(value.toExponential(1).replace(/\.0e/, 'e').replace('e+', 'e'));
  const unitEntry = COMPACT_UNITS.find(([size]) => abs >= size);
  if (unitEntry) {
    const [unit, suffix] = unitEntry;
    return withMinus(stripZeros(roundTo(value / unit, 2).toFixed(2)) + suffix);
  }
  return withMinus(stripZeros(Number(value.toPrecision(3)).toString()));
}

/**
 * Readable full-precision-ish value for tooltips and tables:
 * 1,234,568 · 3.14159 · 0.0001235 · 6.022e23.
 * @param {number} value
 */
export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : `${MINUS}∞`;
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-4)) {
    return withMinus(value.toExponential(3).replace(/\.?0+e/, 'e').replace('e+', 'e'));
  }
  const sign = value < 0 ? MINUS : '';
  if (Number.isInteger(value)) return sign + groupThousands(String(abs));
  if (abs < 1) return sign + stripZeros(Number(abs.toPrecision(4)).toString());
  const integerDigits = Math.floor(Math.log10(abs)) + 1;
  const decimals = Math.max(0, Math.min(10, 6 - integerDigits));
  return sign + groupThousands(stripZeros(abs.toFixed(decimals)));
}

/**
 * Turn the `format` option of an axis into a tick formatter factory.
 *
 * Accepted values:
 *  - a function `(value) => string` (used as-is, for ticks and tooltips)
 *  - 'auto' / undefined (scale specific defaults)
 *  - 'percent' (0.25 -> 25%)
 *  - 'fixed:N' (always N decimals)
 *  - 'compact' (1.2K, 3M regardless of range)
 *
 * The returned object is consumed by the scene builder:
 * `tick(ticks, step, scaleFormatter)` builds the tick formatter and
 * `value(v, fallback)` formats a single value for tooltips.
 *
 * @param {{ format?: any, prefix?: string, suffix?: string }} axisOptions
 */
export function resolveFormat(axisOptions = {}) {
  const { format = 'auto', prefix = '', suffix = '' } = axisOptions;
  const wrap = (fn) => (value) => `${prefix}${fn(value)}${suffix}`;

  if (typeof format === 'function') {
    return { tick: () => wrap(format), value: wrap(format), custom: true };
  }
  if (format === 'percent') {
    // Format the ticks as if they were already multiplied by 100 so the
    // shared-precision rules above still apply (5%, 10%, 15%).
    const percentTicks = (ticks, step) => {
      const inner = linearTickFormatter(ticks.map((tick) => tick * 100), (step || 0) * 100);
      return wrap((value) => `${inner(value * 100)}%`);
    };
    return {
      tick: percentTicks,
      value: wrap((value) => `${formatNumber(roundTo(value * 100, 10))}%`),
      custom: true,
    };
  }
  if (typeof format === 'string' && format.startsWith('fixed:')) {
    const digits = Math.max(0, Math.min(20, parseInt(format.slice(6), 10) || 0));
    const fn = (value) => withMinus(toFixedClean(value, digits));
    return { tick: () => wrap(fn), value: wrap(fn), custom: true };
  }
  if (format === 'compact') {
    return { tick: () => wrap(formatCompact), value: wrap(formatCompact), custom: true };
  }
  return {
    tick: (ticks, step, scaleFormatter) => wrap(scaleFormatter),
    value: (value, fallback) => wrap(fallback || formatNumber)(value),
    custom: false,
  };
}
