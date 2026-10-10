import { assert, describe, it } from '../harness.js';
import { LinearScale, LogScale, TimeScale, createScale } from '../../src/core/scale.js';

describe('LinearScale', () => {
  it('maps the domain onto the range', () => {
    const scale = new LinearScale([0, 10], [100, 200]);
    assert.equal(scale.map(0), 100);
    assert.equal(scale.map(5), 150);
    assert.equal(scale.map(20), 300);
  });

  it('inverts pixels back to values', () => {
    const scale = new LinearScale([-3, 7], [400, 0]);
    for (const value of [-3, 0, 2.5, 7]) assert.close(scale.invert(scale.map(value)), value);
  });

  it('supports inverted ranges (y axes grow upwards)', () => {
    const scale = new LinearScale([0, 1], [300, 0]);
    assert.equal(scale.map(1), 0);
    assert.equal(scale.map(0), 300);
  });

  it('uses the nice step for its ticks', () => {
    const scale = new LinearScale([-2.1, 5.3], [0, 100]).nice(3);
    assert.deepEqual(scale.domain, [-4, 6]);
    assert.deepEqual(scale.ticks(3).major, [-4, -2, 0, 2, 4, 6]);
  });

  it('forgets the nice step when the domain changes', () => {
    const scale = new LinearScale([0, 9.5], [0, 100]).nice(5);
    scale.domain = [0, 1];
    assert.deepEqual(scale.ticks(5).major, [0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('does not divide by zero for a collapsed domain', () => {
    const scale = new LinearScale([5, 5], [0, 100]);
    assert.equal(scale.map(5), 50);
  });

  it('copies independently', () => {
    const scale = new LinearScale([0, 1], [0, 10]);
    const copy = scale.copy();
    copy.domain = [0, 2];
    assert.deepEqual(scale.domain, [0, 1]);
  });
});

describe('LogScale', () => {
  it('places each decade at equal distance', () => {
    const scale = new LogScale([1, 100], [0, 200]);
    assert.close(scale.map(10), 100);
    assert.close(scale.invert(100), 10);
  });

  it('maps non-positive values to NaN (they cannot be drawn)', () => {
    assert.ok(Number.isNaN(new LogScale([1, 10], [0, 1]).map(0)));
  });

  it('rounds the domain to 1, 2 or 5 times a power of ten', () => {
    assert.deepEqual(new LogScale([9600, 2.1e9], [0, 1]).nice().domain, [5000, 5e9]);
    assert.deepEqual(new LogScale([1, 1000], [0, 1]).nice().domain, [1, 1000]);
  });
});

describe('TimeScale', () => {
  it('produces calendar ticks and remembers their interval', () => {
    const scale = new TimeScale([new Date(2026, 0, 1).getTime(), new Date(2026, 11, 31).getTime()], [0, 800]);
    const { major } = scale.ticks(12);
    assert.equal(scale.interval.unit, 'month');
    assert.equal(major.length, 12);
    assert.equal(scale.tickFormatter()(major[0]), '2026');
  });
});

describe('createScale', () => {
  it('creates scales by name', () => {
    assert.ok(createScale('log') instanceof LogScale);
    assert.ok(createScale('time') instanceof TimeScale);
    assert.equal(createScale('linear').type, 'linear');
  });
});
