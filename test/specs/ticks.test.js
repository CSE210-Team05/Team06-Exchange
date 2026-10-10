import { assert, describe, it } from '../harness.js';
import { decimalsOf, linearTicks, logTicks, niceDomain, niceExtent, tickStep, ticksWithStep } from '../../src/core/ticks.js';

describe('tickStep (1-2-5 rule)', () => {
  it('picks 1, 2 or 5 times a power of ten', () => {
    assert.equal(tickStep(0, 10, 5), 2);
    assert.equal(tickStep(0, 100, 10), 10);
    assert.equal(tickStep(0, 1, 5), 0.2);
    assert.equal(tickStep(0, 7, 3), 2);
    assert.equal(tickStep(0, 1e6, 4), 200000);
  });

  it('returns 0 for an empty interval', () => {
    assert.equal(tickStep(3, 3, 5), 0);
  });

  it('returns 0 for invalid input instead of throwing', () => {
    assert.equal(tickStep(NaN, 1, 5), 0);
    assert.equal(tickStep(0, Infinity, 5), 0);
  });
});

describe('linearTicks', () => {
  it('produces round values inside the range', () => {
    assert.deepEqual(linearTicks(0, 10, 5), [0, 2, 4, 6, 8, 10]);
    assert.deepEqual(linearTicks(-1, 1, 4), [-1, -0.5, 0, 0.5, 1]);
  });

  it('has no floating point noise', () => {
    const ticks = linearTicks(0, 1, 10);
    assert.deepEqual(ticks, [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    assert.ok(linearTicks(0.1, 0.7, 6).every((tick) => String(tick).length <= 4));
  });

  it('keeps the direction of reversed ranges', () => {
    assert.deepEqual(linearTicks(10, 0, 5), [10, 8, 6, 4, 2, 0]);
  });

  it('handles a single value and tiny ranges', () => {
    assert.deepEqual(linearTicks(5, 5, 5), [5]);
    assert.deepEqual(linearTicks(1e-9, 5e-9, 4), [1e-9, 2e-9, 3e-9, 4e-9, 5e-9]);
  });

  it('never returns -0', () => {
    assert.ok(linearTicks(-2, 2, 4).every((tick) => !Object.is(tick, -0)));
  });
});

describe('niceDomain', () => {
  it('extends the domain to tick multiples', () => {
    assert.deepEqual(niceDomain(0.13, 9.7, 5), [0, 10]);
    assert.deepEqual(niceDomain(-0.9997, 1, 4), [-1, 1]);
  });

  it('does not escalate the step (single pass)', () => {
    // A repeated re-nicing would turn [-2.1, 5.3] into [-5, 10].
    const { domain, step } = niceExtent(-2.1, 5.3, 3);
    assert.deepEqual(domain, [-4, 6]);
    assert.equal(step, 2);
  });

  it('leaves degenerate input alone', () => {
    assert.deepEqual(niceDomain(4, 4, 5), [4, 4]);
  });
});

describe('ticksWithStep', () => {
  it('lists every multiple of the step', () => {
    assert.deepEqual(ticksWithStep(-0.2, 1.05, 0.25), [0, 0.25, 0.5, 0.75, 1]);
  });

  it('falls back to automatic ticks when the step is far too small', () => {
    assert.ok(ticksWithStep(0, 1e6, 1).length <= 12);
  });
});

describe('decimalsOf', () => {
  it('counts the decimals needed to write a number exactly', () => {
    assert.equal(decimalsOf(5), 0);
    assert.equal(decimalsOf(0.5), 1);
    assert.equal(decimalsOf(0.25), 2);
    assert.equal(decimalsOf(0.1 + 0.2), 1);
  });
});

describe('logTicks', () => {
  it('labels powers of ten over many decades', () => {
    const { major } = logTicks(1, 1e6, 6);
    assert.deepEqual(major, [1, 10, 100, 1000, 10000, 100000, 1000000]);
  });

  it('adds 2x and 5x ticks when there is room', () => {
    const { major } = logTicks(1, 100, 8);
    assert.deepEqual(major, [1, 2, 5, 10, 20, 50, 100]);
  });

  it('keeps unlabeled minor ticks for the grid', () => {
    const { major, minor } = logTicks(1, 100, 2);
    assert.deepEqual(major, [1, 10, 100]);
    assert.includes(minor, 3);
    assert.includes(minor, 70);
  });

  it('thins out powers of ten when there are too many decades', () => {
    const { major } = logTicks(1, 1e20, 5);
    assert.ok(major.length <= 6, `got ${major.length} ticks`);
  });

  it('uses linear ticks within a single decade', () => {
    const { major } = logTicks(2, 8, 6);
    assert.ok(major.length >= 3);
    assert.ok(major.every((value) => value >= 2 && value <= 8));
  });

  it('rejects non-positive domains', () => {
    assert.deepEqual(logTicks(0, 10, 5), { major: [], minor: [] });
  });
});
