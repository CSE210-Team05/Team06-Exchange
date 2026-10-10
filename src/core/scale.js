/**
 * Scales map data values to pixel positions and back.
 *
 * Every scale shares the same contract:
 *   map(value) -> pixel, invert(pixel) -> value,
 *   ticks(count) -> { major, minor }, tickFormatter(major) -> fn,
 *   nice(count) -> extends the domain to round values.
 *
 * Because pan and zoom are implemented purely through map/invert, they work
 * identically on linear, logarithmic and time axes.
 */
import { linearTicks, logTicks, niceDomain, niceExtent, tickStep, ticksWithStep } from './ticks.js';
import { formatCompact, formatNumber, linearTickFormatter } from './format.js';
import { formatTimeFull, formatTimeTick, niceTimeDomain, timeTicks } from './time.js';

export class LinearScale {
  /**
   * @param {[number, number]} [domain] data interval
   * @param {[number, number]} [range] pixel interval
   */
  constructor(domain = [0, 1], range = [0, 1]) {
    this.type = 'linear';
    this._domain = [0, 1];
    this._range = [0, 1];
    /**
     * Tick distance chosen by nice(); ticks() reuses it so the ticks line up
     * with the niced domain ends. Cleared whenever the domain is set.
     */
    this.tickStepHint = 0;
    this.domain = domain;
    this.range = range;
  }

  get domain() { return [this._domain[0], this._domain[1]]; }
  set domain(values) {
    this._domain = [Number(values[0]), Number(values[1])];
    this.tickStepHint = 0;
    this._update();
  }

  get range() { return [this._range[0], this._range[1]]; }
  set range(values) {
    this._range = [Number(values[0]), Number(values[1])];
    this._update();
  }

  /** Value -> linear "working space" (identity here, log10 for log scales). */
  transform(value) { return value; }

  /** Working space -> value. */
  untransform(position) { return position; }

  /** Cache the coefficients so map() is a single multiply-add per point. */
  _update() {
    this._t0 = this.transform(this._domain[0]);
    this._t1 = this.transform(this._domain[1]);
    const span = this._t1 - this._t0;
    this._k = span === 0 || !Number.isFinite(span) ? 0 : (this._range[1] - this._range[0]) / span;
  }

  /**
   * Data value -> pixel.
   * @param {number} value
   */
  map(value) {
    if (this._k === 0) return (this._range[0] + this._range[1]) / 2;
    return this._range[0] + (this.transform(value) - this._t0) * this._k;
  }

  /**
   * Pixel -> data value.
   * @param {number} pixel
   */
  invert(pixel) {
    if (this._k === 0) return this._domain[0];
    return this.untransform(this._t0 + (pixel - this._range[0]) / this._k);
  }

  /** @returns {{ major: number[], minor: number[] }} */
  ticks(count = 6) {
    const [start, stop] = this._domain;
    if (this.tickStepHint) return { major: ticksWithStep(start, stop, this.tickStepHint), minor: [] };
    return { major: linearTicks(start, stop, count), minor: [] };
  }

  /**
   * Formatter shared by all tick labels of this axis.
   * @param {number[]} major the tick values that will be labelled
   */
  tickFormatter(major) {
    const step = major.length > 1 ? Math.abs(major[1] - major[0]) : 0;
    return linearTickFormatter(major, step);
  }

  /** Default formatter for single values (tooltips). */
  valueFormatter() {
    return formatNumber;
  }

  /** Distance between ticks for `count` intervals (used by tests and layout). */
  tickStep(count = 6) {
    return tickStep(this._domain[0], this._domain[1], count);
  }

  /** Extend the domain to round tick values. */
  nice(count = 6) {
    const { domain, step } = niceExtent(this._domain[0], this._domain[1], count);
    this.domain = domain;
    this.tickStepHint = step;
    return this;
  }

  /** An independent scale with the same type, domain and range. */
  copy() {
    const Constructor = /** @type {any} */ (this.constructor);
    const clone = new Constructor(this.domain, this.range);
    if (this.interval) clone.interval = { ...this.interval };
    clone.tickStepHint = this.tickStepHint;
    return clone;
  }
}

export class LogScale extends LinearScale {
  constructor(domain = [1, 10], range = [0, 1]) {
    super(domain, range);
    this.type = 'log';
  }

  transform(value) { return value > 0 ? Math.log10(value) : NaN; }

  untransform(position) { return 10 ** position; }

  ticks(count = 6) {
    return logTicks(this._domain[0], this._domain[1], count);
  }

  tickFormatter(major) {
    const [low, high] = this._domain[0] <= this._domain[1] ? this._domain : [this._domain[1], this._domain[0]];
    // Within a single decade the ticks are linear, so format them that way.
    if (Math.log10(high / low) < 1) return super.tickFormatter(major);
    return formatCompact;
  }

  /**
   * Round the ends to 1, 2 or 5 times a power of ten. Rounding to whole
   * decades (1, 10, 100) is common but can leave almost a full decade of
   * empty plot, e.g. data starting at 9,600 would get an axis from 1,000.
   */
  nice(count = 6) {
    const [low, high] = this._domain;
    if (!(low > 0 && high > 0)) return this;
    if (Math.log10(high / low) < 1) {
      const [niceLow, niceHigh] = niceDomain(low, high, count);
      this.domain = [niceLow > 0 ? niceLow : low, niceHigh];
      return this;
    }
    const mantissas = [1, 2, 5, 10];
    const split = (value) => {
      const exponent = Math.floor(Math.log10(value));
      return [value / 10 ** exponent, exponent];
    };
    const [lowMantissa, lowExponent] = split(low);
    const [highMantissa, highExponent] = split(high);
    const floorMantissa = [...mantissas].reverse().find((candidate) => candidate <= lowMantissa * (1 + 1e-9)) ?? 1;
    const ceilMantissa = mantissas.find((candidate) => candidate >= highMantissa * (1 - 1e-9)) ?? 10;
    this.domain = [
      Number((floorMantissa * 10 ** lowExponent).toPrecision(12)),
      Number((ceilMantissa * 10 ** highExponent).toPrecision(12)),
    ];
    return this;
  }
}

export class TimeScale extends LinearScale {
  constructor(domain = [0, 1], range = [0, 1]) {
    super(domain, range);
    this.type = 'time';
    /** The interval of the most recent ticks() call, e.g. { unit: 'day', step: 1 }. */
    this.interval = { unit: 'day', step: 1 };
  }

  ticks(count = 6) {
    const { ticks, interval } = timeTicks(this._domain[0], this._domain[1], count);
    this.interval = interval;
    return { major: ticks, minor: [] };
  }

  tickFormatter() {
    return formatTimeTick;
  }

  valueFormatter() {
    const unit = this.interval.unit;
    return (value) => formatTimeFull(value, unit);
  }

  nice(count = 6) {
    this.domain = niceTimeDomain(this._domain[0], this._domain[1], count);
    return this;
  }
}

/**
 * Create a scale by name.
 * @param {'linear'|'log'|'time'} type
 * @param {[number, number]} [domain]
 * @param {[number, number]} [range]
 */
export function createScale(type, domain, range) {
  if (type === 'log') return new LogScale(domain, range);
  if (type === 'time') return new TimeScale(domain, range);
  return new LinearScale(domain, range);
}
