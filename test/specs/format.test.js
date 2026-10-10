import { assert, describe, it } from '../harness.js';
import { MINUS, formatCompact, formatNumber, linearTickFormatter, resolveFormat } from '../../src/core/format.js';

describe('linearTickFormatter', () => {
  it('uses one precision for all labels of an axis', () => {
    const format = linearTickFormatter([0, 0.5, 1, 1.5], 0.5);
    assert.deepEqual([0, 0.5, 1, 1.5].map(format), ['0.0', '0.5', '1.0', '1.5']);
  });

  it('switches to compact units for large numbers', () => {
    const format = linearTickFormatter([0, 5000, 10000, 15000], 5000);
    assert.deepEqual([0, 5000, 10000, 15000].map(format), ['0', '5K', '10K', '15K']);
    assert.equal(linearTickFormatter([0, 2e6], 1e6)(2e6), '2M');
  });

  it('compacts whole thousands but keeps years intact', () => {
    assert.equal(linearTickFormatter([0, 1000, 2000], 1000)(2000), '2K');
    assert.equal(linearTickFormatter([1990, 2000, 2010], 10)(2000), '2000');
  });

  it('uses the typographic minus sign', () => {
    assert.equal(linearTickFormatter([-1, 0, 1], 1)(-1), `${MINUS}1`);
  });

  it('shares an exponent for tiny magnitudes', () => {
    const format = linearTickFormatter([0, 0.00001, 0.00002], 0.00001);
    assert.equal(format(0.00002), '2e-5'.replace('-', MINUS));
  });
});

describe('formatNumber (tooltips)', () => {
  it('groups thousands and keeps integers exact', () => {
    assert.equal(formatNumber(1234567), '1,234,567');
  });

  it('shows about six significant digits', () => {
    assert.equal(formatNumber(Math.PI), '3.14159');
    assert.equal(formatNumber(0.000123456), '0.0001235');
  });

  it('uses exponents for extreme values', () => {
    assert.equal(formatNumber(6.022e23), '6.022e23');
  });

  it('marks missing values', () => {
    assert.equal(formatNumber(NaN), '–');
    assert.equal(formatNumber(null), '–');
  });
});

describe('formatCompact (log axes)', () => {
  it('keeps labels short across magnitudes', () => {
    assert.deepEqual([0.01, 1, 20, 1000, 2.5e6, 1e9].map(formatCompact), ['0.01', '1', '20', '1K', '2.5M', '1B']);
  });
});

describe('resolveFormat', () => {
  it('accepts a function and adds prefix and suffix', () => {
    const format = resolveFormat({ format: (value) => value.toFixed(1), prefix: '$', suffix: '/h' });
    assert.equal(format.value(2), '$2.0/h');
    assert.equal(format.tick([0, 1], 1)(1), '$1.0/h');
  });

  it("formats 'percent'", () => {
    const format = resolveFormat({ format: 'percent' });
    assert.deepEqual([0, 0.05, 0.1].map(format.tick([0, 0.05, 0.1], 0.05)), ['0%', '5%', '10%']);
    assert.equal(format.value(0.256), '25.6%');
  });

  it("formats 'fixed:N'", () => {
    assert.equal(resolveFormat({ format: 'fixed:3' }).value(1.5), '1.500');
  });

  it('falls back to the scale formatter by default', () => {
    const format = resolveFormat({});
    assert.equal(format.tick([0], 1, (value) => `<${value}>`)(4), '<4>');
  });
});
