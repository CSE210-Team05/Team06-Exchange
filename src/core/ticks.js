/**
 * Tick generation for numeric axes.
 *
 * Linear ticks use the classic "1-2-5" rule described by Paul Heckbert in
 * "Nice Numbers for Graph Labels" (Graphics Gems, 1990): the distance between
 * two ticks is always 1, 2 or 5 times a power of ten, so labels stay short and
 * easy to read. Log ticks place labels on powers of ten and, when there is
 * room, on 2x and 5x multiples inside each decade.
 */

// Thresholds sit at the geometric means between neighbouring mantissas
// (sqrt(2) between 1 and 2, sqrt(10) between 2 and 5, sqrt(50) between 5 and
// 10), so the chosen step is the closest "nice" step on a logarithmic scale.
const BETWEEN_1_AND_2 = Math.SQRT2;
const BETWEEN_2_AND_5 = Math.sqrt(10);
const BETWEEN_5_AND_10 = Math.sqrt(50);

/**
 * Number of decimal places needed to write `value` exactly (up to 15).
 * 0.25 -> 2, 5 -> 0, 0.1 -> 1.
 * @param {number} value
 * @returns {number}
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
 * Round `value` to `digits` decimals and normalise -0 to 0. Used to remove
 * floating point noise such as 0.30000000000000004.
 * @param {number} value
 * @param {number} digits
 */
export function roundTo(value, digits) {
  const rounded = Number(value.toFixed(Math.min(100, Math.max(0, digits))));
  return rounded === 0 ? 0 : rounded;
}

/**
 * A "nice" distance between ticks so that [start, stop] is cut into roughly
 * `count` intervals.
 * @param {number} start
 * @param {number} stop
 * @param {number} count
 * @returns {number} the step, or 0 when no sensible step exists
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
 * Evenly spaced, human friendly tick values inside [start, stop].
 * @param {number} start
 * @param {number} stop
 * @param {number} count approximate number of intervals
 * @returns {number[]}
 */
export function linearTicks(start, stop, count) {
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return [];
  if (start === stop) return [start];
  const reversed = stop < start;
  const [low, high] = reversed ? [stop, start] : [start, stop];
  const step = tickStep(low, high, count);
  if (!step) return [low];

  // Ticks are generated as integer multiples of the step and then rounded to
  // the step's own precision, which keeps 0.1 + 0.2 style noise out of labels.
  const digits = decimalsOf(step);
  const firstIndex = Math.ceil(low / step - 1e-9);
  const lastIndex = Math.floor(high / step + 1e-9);
  const ticks = [];
  for (let index = firstIndex; index <= lastIndex; index++) {
    ticks.push(roundTo(index * step, digits));
  }
  return reversed ? ticks.reverse() : ticks;
}

/**
 * Ticks at every multiple of a fixed `step` inside [start, stop].
 * @param {number} start
 * @param {number} stop
 * @param {number} step
 * @returns {number[]}
 */
export function ticksWithStep(start, stop, step) {
  if (!(step > 0) || !Number.isFinite(start) || !Number.isFinite(stop)) return [];
  const [low, high] = start <= stop ? [start, stop] : [stop, start];
  // Guard against a step that would produce an absurd number of ticks.
  if ((high - low) / step > 1000) return linearTicks(low, high, 10);
  const digits = decimalsOf(step);
  const ticks = [];
  for (let index = Math.ceil(low / step - 1e-9); index <= Math.floor(high / step + 1e-9); index++) {
    ticks.push(roundTo(index * step, digits));
  }
  return start <= stop ? ticks : ticks.reverse();
}

/**
 * Extend [start, stop] outwards to the nearest multiples of the tick step,
 * so the axis begins and ends on a labelled value.
 *
 * This is a single pass on purpose: re-computing the step for the widened
 * domain (as some libraries do) can escalate it, e.g. [-2.1, 5.3] -> [-4, 6]
 * -> [-5, 10], leaving most of the plot empty. Use the returned step for the
 * ticks so they line up with the new domain ends.
 * @param {number} start
 * @param {number} stop
 * @param {number} count
 * @returns {{ domain: [number, number], step: number }}
 */
export function niceExtent(start, stop, count) {
  if (!Number.isFinite(start) || !Number.isFinite(stop) || start === stop) return { domain: [start, stop], step: 0 };
  const reversed = stop < start;
  const [low, high] = reversed ? [stop, start] : [start, stop];
  const step = tickStep(low, high, count);
  if (!step) return { domain: [start, stop], step: 0 };
  const digits = decimalsOf(step);
  const niceLow = roundTo(Math.floor(low / step + 1e-9) * step, digits);
  const niceHigh = roundTo(Math.ceil(high / step - 1e-9) * step, digits);
  return { domain: reversed ? [niceHigh, niceLow] : [niceLow, niceHigh], step };
}

/**
 * Extend [start, stop] to round tick values (see niceExtent).
 * @param {number} start
 * @param {number} stop
 * @param {number} count
 * @returns {[number, number]}
 */
export function niceDomain(start, stop, count) {
  return niceExtent(start, stop, count).domain;
}

/**
 * Tick values for a base-10 logarithmic axis.
 * @param {number} start positive lower bound
 * @param {number} stop positive upper bound
 * @param {number} count approximate number of labels wanted
 * @returns {{ major: number[], minor: number[] }}
 */
export function logTicks(start, stop, count) {
  let [low, high] = start <= stop ? [start, stop] : [stop, start];
  if (!(low > 0) || !Number.isFinite(high)) return { major: [], minor: [] };

  const decades = Math.log10(high / low);
  // Less than one decade: a log axis looks almost linear, so linear ticks
  // inside the range read better than a single power of ten.
  if (decades < 1) {
    const major = linearTicks(low, high, Math.max(2, Math.round(count))).filter((value) => value > 0);
    return { major, minor: [] };
  }

  const firstExponent = Math.floor(Math.log10(low));
  const lastExponent = Math.ceil(Math.log10(high));
  const inRange = (value) => value >= low * (1 - 1e-9) && value <= high * (1 + 1e-9);
  const clean = (value) => Number(value.toPrecision(12));

  // Pick the densest set of in-decade multiples that still fits the budget.
  const multiplierSets = [[1, 2, 5], [1, 3], [1]];
  const multipliers = multiplierSets.find((set) => decades * set.length <= count * 1.6);

  const major = [];
  const minor = [];
  if (multipliers) {
    for (let exponent = firstExponent; exponent <= lastExponent; exponent++) {
      for (let multiplier = 1; multiplier <= 9; multiplier++) {
        const value = clean(multiplier * 10 ** exponent);
        if (!inRange(value)) continue;
        if (multipliers.includes(multiplier)) major.push(value);
        else minor.push(value);
      }
    }
  } else {
    // Many decades: label every k-th power of ten, keep the others as minor.
    const every = Math.ceil(decades / Math.max(1, count));
    for (let exponent = firstExponent; exponent <= lastExponent; exponent++) {
      const value = clean(10 ** exponent);
      if (!inRange(value)) continue;
      if (exponent % every === 0) major.push(value);
      else minor.push(value);
    }
  }
  return { major, minor };
}
