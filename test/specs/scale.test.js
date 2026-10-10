import { assert, describe, it } from '../harness.js';
import { decimalsOf, linearScale, niceAxis, tickStep } from '../../src/scale.js';
import { MINUS, tickFormatter } from '../../src/format.js';

describe('tickStep (1-2-5 rule)', () => {
  it('picks 1, 2 or 5 times a power of ten', () => {
    assert.equal(tickStep(0, 10, 5), 2);
    assert.equal(tickStep(0, 100, 10), 10);
    assert.equal(tickStep(0, 1, 5), 0.2);
    assert.equal(tickStep(0, 1e6, 4), 200000);
  });

  it('returns 0 for empty or invalid intervals', () => {
    assert.equal(tickStep(3, 3, 5), 0);
    assert.equal(tickStep(NaN, 1, 5), 0);
  });
});

describe('niceAxis', () => {
  it('extends the data range to round tick values', () => {
    const axis = niceAxis(0.13, 9.7, 5);
    assert.deepEqual(axis.domain, [0, 10]);
    assert.deepEqual(axis.ticks, [0, 2, 4, 6, 8, 10]);
  });

  it('produces clean decimals without floating point noise', () => {
    assert.deepEqual(niceAxis(0, 1, 10).ticks, [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  it('does not let the step escalate', () => {
    // Re-nicing the widened domain would turn [-2.1, 5.3] into [-5, 10].
    assert.deepEqual(niceAxis(-2.1, 5.3, 3).domain, [-4, 6]);
  });

  it('opens a window around a single value', () => {
    const axis = niceAxis(5, 5, 5);
    assert.ok(axis.domain[0] < 5 && axis.domain[1] > 5);
    assert.deepEqual(niceAxis(0, 0, 4).domain, [-1, 1]);
  });

  it('never returns -0', () => {
    assert.ok(niceAxis(-2, 2, 4).ticks.every((tick) => !Object.is(tick, -0)));
  });
});

describe('linearScale', () => {
  it('maps the domain onto the range, including inverted ranges', () => {
    const map = linearScale([0, 10], [400, 0]);
    assert.equal(map(0), 400);
    assert.equal(map(5), 200);
    assert.equal(map(10), 0);
  });
});

describe('decimalsOf', () => {
  it('counts decimals needed to write a number exactly', () => {
    assert.equal(decimalsOf(5), 0);
    assert.equal(decimalsOf(0.25), 2);
    assert.equal(decimalsOf(0.1 + 0.2), 1);
  });
});

describe('tickFormatter', () => {
  it('uses one precision for all labels of an axis', () => {
    const format = tickFormatter([0, 0.5, 1, 1.5], 0.5);
    assert.deepEqual([0, 0.5, 1, 1.5].map(format), ['0.0', '0.5', '1.0', '1.5']);
  });

  it('uses compact units for large numbers but keeps years intact', () => {
    const format = tickFormatter([0, 5000, 10000, 15000], 5000);
    assert.deepEqual([0, 5000, 10000, 15000].map(format), ['0', '5K', '10K', '15K']);
    assert.equal(tickFormatter([2e6], 1e6)(2e6), '2M');
    assert.equal(tickFormatter([1990, 2000, 2010], 10)(2000), '2000');
  });

  it('uses the typographic minus sign', () => {
    assert.equal(tickFormatter([-1, 0, 1], 1)(-1), `${MINUS}1`);
  });

  it('shares an exponent for tiny values', () => {
    assert.equal(tickFormatter([0, 1e-5, 2e-5], 1e-5)(2e-5), `2e${MINUS}5`);
  });
});
