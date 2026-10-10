import { assert, describe, it } from '../harness.js';
import { DAY, HOUR, chooseInterval, floorTime, formatTimeFull, formatTimeTick, offsetTime, timeTicks } from '../../src/core/time.js';

// All dates are built in local time and avoid daylight-saving switch days,
// so the expectations hold in every time zone.
const local = (...parts) => new Date(...parts).getTime();

describe('floorTime / offsetTime', () => {
  it('rounds down to calendar boundaries', () => {
    const time = local(2026, 4, 13, 14, 37, 21, 500);
    assert.equal(floorTime(time, 'minute', 15), local(2026, 4, 13, 14, 30));
    assert.equal(floorTime(time, 'hour', 6), local(2026, 4, 13, 12));
    assert.equal(floorTime(time, 'day'), local(2026, 4, 13));
    assert.equal(floorTime(time, 'month', 3), local(2026, 3, 1));
    assert.equal(floorTime(time, 'year'), local(2026, 0, 1));
  });

  it('starts weeks on Monday', () => {
    // 13 May 2026 is a Wednesday.
    assert.equal(new Date(floorTime(local(2026, 4, 13, 9), 'week')).getDay(), 1);
  });

  it('adds calendar units with correct month lengths', () => {
    assert.equal(offsetTime(local(2026, 0, 31), 'day', 1), local(2026, 1, 1));
    assert.equal(offsetTime(local(2026, 0, 1), 'month', 2), local(2026, 2, 1));
  });
});

describe('timeTicks', () => {
  it('uses hours within a day', () => {
    const { ticks, interval } = timeTicks(local(2026, 4, 13), local(2026, 4, 14), 6);
    assert.equal(interval.unit, 'hour');
    assert.ok(ticks.every((tick) => new Date(tick).getMinutes() === 0));
  });

  it('uses months within a year', () => {
    const { ticks, interval } = timeTicks(local(2026, 0, 1), local(2026, 11, 31), 12);
    assert.equal(interval.unit, 'month');
    assert.equal(ticks.length, 12);
    assert.ok(ticks.every((tick) => new Date(tick).getDate() === 1));
  });

  it('uses multi-year steps for long spans', () => {
    const { ticks, interval } = timeTicks(local(1900, 0, 1), local(2020, 0, 1), 6);
    assert.equal(interval.unit, 'year');
    assert.ok(interval.step >= 10);
    assert.ok(ticks.every((tick) => new Date(tick).getFullYear() % interval.step === 0));
  });

  it('falls back to millisecond ticks for sub-second spans', () => {
    const start = local(2026, 4, 13, 12);
    const { interval } = timeTicks(start, start + 800, 5);
    assert.equal(interval.unit, 'millisecond');
  });

  it('chooses the interval closest to the requested count', () => {
    assert.deepEqual(chooseInterval(0, 7 * DAY, 7), { unit: 'day', step: 1 });
    assert.deepEqual(chooseInterval(0, 12 * HOUR, 4), { unit: 'hour', step: 3 });
  });
});

describe('time labels', () => {
  it('pick the coarsest changing field', () => {
    assert.equal(formatTimeTick(local(2026, 0, 1)), '2026');
    assert.equal(formatTimeTick(local(2026, 4, 1)), 'May');
    assert.equal(formatTimeTick(local(2026, 4, 13)), 'May 13');
    assert.equal(formatTimeTick(local(2026, 4, 13, 9, 30)), '09:30');
    assert.equal(formatTimeTick(local(2026, 4, 13, 9, 30, 15)), ':15');
  });

  it('write full timestamps for tooltips', () => {
    assert.equal(formatTimeFull(local(2026, 4, 13), 'day'), 'May 13, 2026');
    assert.equal(formatTimeFull(local(2026, 4, 13, 14, 5), 'hour'), 'May 13, 2026 14:05');
    assert.equal(formatTimeFull(local(2026, 4, 1), 'month'), 'May 2026');
    assert.equal(formatTimeFull(local(2026, 0, 1), 'year'), '2026');
  });
});
