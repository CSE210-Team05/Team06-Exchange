/**
 * Calendar-aware ticks and labels for time axes (values are epoch
 * milliseconds; all calendar maths uses the viewer's local time zone).
 *
 * Instead of evenly dividing milliseconds, ticks land on boundaries people
 * recognise: whole minutes, midnight, the first of a month, New Year. The
 * label format is chosen per tick ("multi-scale" labels): midnight shows the
 * date, the first of a month shows the month name, January 1st the year.
 */
import { linearTicks, tickStep } from './ticks.js';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
// Average Gregorian month and year (365.2425 days); only used to compare
// interval sizes, never to step through the calendar.
export const MONTH = (365.2425 / 12) * DAY;
export const YEAR = 365.2425 * DAY;

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const UNIT_DURATION = { second: SECOND, minute: MINUTE, hour: HOUR, day: DAY, week: WEEK, month: MONTH, year: YEAR };

/** Candidate tick intervals, finest first. */
const INTERVALS = [
  ['second', 1], ['second', 5], ['second', 15], ['second', 30],
  ['minute', 1], ['minute', 5], ['minute', 15], ['minute', 30],
  ['hour', 1], ['hour', 3], ['hour', 6], ['hour', 12],
  ['day', 1], ['day', 2],
  ['week', 1],
  ['month', 1], ['month', 3], ['month', 6],
  ['year', 1],
].map(([unit, step]) => ({ unit, step, duration: UNIT_DURATION[unit] * step }));

const pad2 = (value) => String(value).padStart(2, '0');
const pad3 = (value) => String(value).padStart(3, '0');

/**
 * Round `time` down to the start of its interval, e.g. 14:37 with
 * unit 'minute' and step 15 -> 14:30.
 * @param {number} time epoch ms
 * @param {'second'|'minute'|'hour'|'day'|'week'|'month'|'year'} unit
 * @param {number} [step]
 */
export function floorTime(time, unit, step = 1) {
  const date = new Date(time);
  switch (unit) {
    case 'second':
      date.setMilliseconds(0);
      date.setSeconds(Math.floor(date.getSeconds() / step) * step);
      break;
    case 'minute':
      date.setSeconds(0, 0);
      date.setMinutes(Math.floor(date.getMinutes() / step) * step);
      break;
    case 'hour':
      date.setMinutes(0, 0, 0);
      date.setHours(Math.floor(date.getHours() / step) * step);
      break;
    case 'day':
      date.setHours(0, 0, 0, 0);
      date.setDate(1 + Math.floor((date.getDate() - 1) / step) * step);
      break;
    case 'week':
      // Weeks start on Monday (ISO 8601).
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      break;
    case 'month':
      date.setHours(0, 0, 0, 0);
      date.setDate(1);
      date.setMonth(Math.floor(date.getMonth() / step) * step);
      break;
    case 'year':
      date.setHours(0, 0, 0, 0);
      date.setMonth(0, 1);
      date.setFullYear(Math.floor(date.getFullYear() / step) * step);
      break;
    default:
      break;
  }
  return date.getTime();
}

/**
 * Move `time` forward by `amount` calendar units. Using the Date setters
 * keeps daylight-saving changes and month lengths correct.
 * @param {number} time
 * @param {string} unit
 * @param {number} amount
 */
export function offsetTime(time, unit, amount) {
  const date = new Date(time);
  switch (unit) {
    case 'second': date.setSeconds(date.getSeconds() + amount); break;
    case 'minute': date.setMinutes(date.getMinutes() + amount); break;
    case 'hour': date.setHours(date.getHours() + amount); break;
    case 'day': date.setDate(date.getDate() + amount); break;
    case 'week': date.setDate(date.getDate() + 7 * amount); break;
    case 'month': date.setMonth(date.getMonth() + amount); break;
    case 'year': date.setFullYear(date.getFullYear() + amount); break;
    default: return time + amount;
  }
  return date.getTime();
}

/**
 * Pick the calendar interval whose tick count is closest to `count`.
 * Returns null when the span is so short that plain millisecond ticks fit.
 * @param {number} start
 * @param {number} stop
 * @param {number} count
 * @returns {{unit: string, step: number} | null}
 */
export function chooseInterval(start, stop, count) {
  const span = Math.abs(stop - start);
  const target = span / Math.max(1, count);
  if (!(target >= SECOND)) return null;
  if (target > YEAR) {
    // Multi-year spans: 1-2-5 steps on the year number (2, 5, 10, 20 years ...).
    const yearStep = Math.max(1, Math.round(tickStep(0, span / YEAR, count)));
    return { unit: 'year', step: yearStep };
  }
  let best = INTERVALS[0];
  let bestScore = Infinity;
  for (const interval of INTERVALS) {
    const score = Math.abs(Math.log(interval.duration / target));
    if (score < bestScore) {
      best = interval;
      bestScore = score;
    }
  }
  return { unit: best.unit, step: best.step };
}

/**
 * Tick positions for a time axis.
 * @param {number} start epoch ms
 * @param {number} stop epoch ms
 * @param {number} count approximate number of intervals
 * @returns {{ ticks: number[], interval: { unit: string, step: number } }}
 */
export function timeTicks(start, stop, count) {
  const [low, high] = start <= stop ? [start, stop] : [stop, start];
  if (!Number.isFinite(low) || !Number.isFinite(high)) return { ticks: [], interval: { unit: 'millisecond', step: 1 } };
  const interval = chooseInterval(low, high, count);
  if (!interval) {
    return { ticks: linearTicks(low, high, count), interval: { unit: 'millisecond', step: tickStep(low, high, count) } };
  }
  const { unit, step } = interval;
  const ticks = [];
  let time = floorTime(low, unit, step);
  if (time < low) time = offsetTime(time, unit, step);
  // The cap protects against pathological inputs (e.g. a 1-second interval over centuries).
  for (let guard = 0; time <= high && guard < 2000; guard++) {
    ticks.push(time);
    const next = offsetTime(time, unit, step);
    if (next <= time) break;
    time = next;
  }
  return { ticks, interval };
}

/**
 * Extend a time domain to whole intervals (e.g. full days).
 * @returns {[number, number]}
 */
export function niceTimeDomain(start, stop, count) {
  const interval = chooseInterval(start, stop, count);
  if (!interval) return [start, stop];
  const { unit, step } = interval;
  const low = floorTime(start, unit, step);
  let high = floorTime(stop, unit, step);
  if (high < stop) high = offsetTime(high, unit, step);
  return [low, high];
}

/**
 * Multi-scale tick label: the coarsest calendar field that changes at this
 * tick decides the format ("Oct 3", "Nov", "2027", "14:30", ":45").
 * @param {number} time
 */
export function formatTimeTick(time) {
  const date = new Date(time);
  const milliseconds = date.getMilliseconds();
  if (milliseconds) return `:${pad2(date.getSeconds())}.${pad3(milliseconds)}`;
  if (date.getSeconds()) return `:${pad2(date.getSeconds())}`;
  if (date.getMinutes() || date.getHours()) return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (date.getDate() !== 1) return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
  if (date.getMonth()) return MONTH_NAMES[date.getMonth()];
  return String(date.getFullYear());
}

/**
 * Unambiguous label for a single point in time (tooltips, tables). Only
 * shows the fields that carry information at the axis granularity.
 * @param {number} time
 * @param {string} [unit] the axis tick unit, used to drop meaningless fields
 */
export function formatTimeFull(time, unit = 'day') {
  if (!Number.isFinite(time)) return '–';
  const date = new Date(time);
  const year = date.getFullYear();
  const month = MONTH_NAMES[date.getMonth()];
  const milliseconds = date.getMilliseconds();
  const hasSeconds = date.getSeconds() !== 0 || milliseconds !== 0;
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || hasSeconds;

  if (!hasTime && date.getDate() === 1) {
    if (unit === 'year' && date.getMonth() === 0) return String(year);
    if (unit === 'year' || unit === 'month') return `${month} ${year}`;
  }
  let label = `${month} ${date.getDate()}, ${year}`;
  if (hasTime) {
    label += ` ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    if (hasSeconds) label += `:${pad2(date.getSeconds())}`;
    if (milliseconds) label += `.${pad3(milliseconds)}`;
  }
  return label;
}
