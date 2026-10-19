import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MINUS, logarithmic_axis, nice_axis, tick_formatter, tick_step } from '../app_main/features/plot_handling/axis_rendering.js';
import { compute_decimals, compute_interpolation_factor } from '../libs/custom/math_operations.js';

describe('tick_step (1-2-5 rule)', () => {
  it('picks 1, 2 or 5 times a power of ten', () => {
    assert.equal(tick_step(0, 10, 5), 2);
    assert.equal(tick_step(0, 100, 10), 10);
    assert.equal(tick_step(0, 1, 5), 0.2);
    assert.equal(tick_step(0, 1e6, 4), 200000);
  });

  it('returns 0 for empty or invalid intervals', () => {
    assert.equal(tick_step(3, 3, 5), 0);
    assert.equal(tick_step(NaN, 1, 5), 0);
  });
});

describe('nice_axis', () => {
  it('extends the data range to round tick values', () => {
    const axis = nice_axis(0.13, 9.7, 5);
    assert.deepEqual(axis.domain, [0, 10]);
    assert.deepEqual(axis.ticks, [0, 2, 4, 6, 8, 10]);
  });

  it('produces clean decimals without floating point noise', () => {
    assert.deepEqual(nice_axis(0, 1, 10).ticks, [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  it('does not let the step escalate', () => {
    // Re-computing the step for the widened range would turn [-2.1, 5.3] into [-5, 10].
    assert.deepEqual(nice_axis(-2.1, 5.3, 3).domain, [-4, 6]);
  });

  it('opens a window around a single value', () => {
    const axis = nice_axis(5, 5, 5);
    assert.ok(axis.domain[0] < 5 && axis.domain[1] > 5);
    assert.deepEqual(nice_axis(0, 0, 4).domain, [-1, 1]);
  });

  it('never returns -0', () => {
    assert.ok(nice_axis(-2, 2, 4).ticks.every((tick) => !Object.is(tick, -0)));
  });
});

describe('logarithmic_axis', () => {
  it('uses evenly spaced powers of ten with labels in the original units', () => {
    const axis = logarithmic_axis(0, 4, 8);
    assert.deepEqual(axis.domain, [0, 4]);
    assert.deepEqual(axis.ticks, [0, 1, 2, 3, 4]);
    assert.deepEqual(axis.ticks.map(axis.format), ['1', '10', '100', '1000', '10K']);
  });

  it('keeps widely separated labels distinct', () => {
    const axis = logarithmic_axis(-12, 12, 8);
    const labels = axis.ticks.map(axis.format);
    assert.equal(new Set(labels).size, labels.length);
    assert.deepEqual(labels, [`1e${MINUS}12`, `1e${MINUS}9`, `1e${MINUS}6`, '0.001', '1', '1000', '1M', '1B', '1T']);
  });

  it('does not add an irregular final tick', () => {
    const axis = logarithmic_axis(0, 20, 8);
    const intervals = axis.ticks.slice(1).map((value, index) => value - axis.ticks[index]);
    assert.deepEqual(axis.ticks, [0, 3, 6, 9, 12, 15, 18]);
    assert.deepEqual([...new Set(intervals)], [3]);
  });
});

describe('compute_interpolation_factor', () => {
  it('maps the domain onto the range, including inverted ranges', () => {
    const map = compute_interpolation_factor([0, 10], [400, 0]);
    assert.equal(map(0), 400);
    assert.equal(map(5), 200);
    assert.equal(map(10), 0);
  });
});

describe('compute_decimals', () => {
  it('counts the decimals of a tick step (1, 2 or 5 times a power of ten)', () => {
    assert.equal(compute_decimals(5), 0);
    assert.equal(compute_decimals(0.5), 1);
    assert.equal(compute_decimals(0.1), 1);
    assert.equal(compute_decimals(0.02), 2);
  });
});

describe('tick_formatter', () => {
  it('uses one precision for all labels of an axis', () => {
    const format = tick_formatter([0, 0.5, 1, 1.5], 0.5);
    assert.deepEqual([0, 0.5, 1, 1.5].map(format), ['0.0', '0.5', '1.0', '1.5']);
  });

  it('uses compact units for large numbers but keeps years intact', () => {
    const format = tick_formatter([0, 5000, 10000, 15000], 5000);
    assert.deepEqual([0, 5000, 10000, 15000].map(format), ['0', '5K', '10K', '15K']);
    assert.equal(tick_formatter([2e6], 1e6)(2e6), '2M');
    assert.equal(tick_formatter([1990, 2000, 2010], 10)(2000), '2000');
  });

  it('uses the typographic minus sign', () => {
    assert.equal(tick_formatter([-1, 0, 1], 1)(-1), `${MINUS}1`);
  });

  it('shares an exponent for tiny values', () => {
    assert.equal(tick_formatter([0, 1e-5, 2e-5], 1e-5)(2e-5), `2e${MINUS}5`);
  });
});
