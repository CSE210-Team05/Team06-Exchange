import { assert, describe, it } from '../harness.js';
import { finiteExtent, nearestIndexSorted, normalizeSeries, parseDate, toNumeric } from '../../src/core/data.js';
import { mergeOptions, resolveOptions, resolveSeriesOptions } from '../../src/core/options.js';

const normalize = (options, index = 0) => normalizeSeries(resolveSeriesOptions(options), index, 'line');

describe('normalizeSeries input shapes', () => {
  it('accepts [x, y] tuples', () => {
    const series = normalize({ data: [[1, 2], [3, 4]] });
    assert.deepEqual(series.xs, [1, 3]);
    assert.deepEqual(series.ys, [2, 4]);
  });

  it('accepts {x, y} objects', () => {
    const series = normalize({ data: [{ x: 1, y: 2 }, { x: 3, y: 4 }] });
    assert.deepEqual(series.ys, [2, 4]);
  });

  it('accepts named columns and accessor functions', () => {
    const rows = [{ t: 1, v: 10 }, { t: 2, v: 20 }];
    assert.deepEqual(normalize({ data: rows, x: 't', y: 'v' }).ys, [10, 20]);
    assert.deepEqual(normalize({ data: rows, x: (d) => d.t * 2, y: (d) => d.v / 10 }).xs, [2, 4]);
  });

  it('accepts plain numbers (x is the index)', () => {
    const series = normalize({ data: [5, 6, 7] });
    assert.deepEqual(series.xs, [0, 1, 2]);
    assert.deepEqual(series.ys, [5, 6, 7]);
  });

  it('accepts separate x and y arrays, including typed arrays', () => {
    const series = normalize({ x: [1, 2, 3], y: new Float32Array([4, 5, 6]) });
    assert.deepEqual(series.ys, [4, 5, 6]);
  });

  it('turns invalid values into gaps', () => {
    const series = normalize({ data: [[0, 1], [1, null], [2, 'abc'], [3, '4.5']] });
    assert.ok(Number.isNaN(series.ys[1]) && Number.isNaN(series.ys[2]));
    assert.equal(series.ys[3], 4.5);
  });

  it('detects dates and parses date-only strings as local midnight', () => {
    const series = normalize({ data: [['2026-03-01', 1], ['2026-03-02', 2]] });
    assert.ok(series.xIsTime);
    assert.equal(series.xs[0], new Date(2026, 2, 1).getTime());
  });

  it('reports whether x is sorted', () => {
    assert.ok(normalize({ data: [[0, 1], [1, 1], [1, 2], [5, 0]] }).sorted);
    assert.ok(!normalize({ data: [[0, 1], [3, 1], [2, 2]] }).sorted);
  });

  it('evaluates per-point marker sizes', () => {
    const series = normalize({ data: [{ x: 0, y: 0, r: 4 }], marker: { size: (d) => d.r * 2 } });
    assert.deepEqual(series.sizes, [8]);
  });

  it('names unnamed series and keeps the original datum', () => {
    const series = normalize({ data: [{ x: 1, y: 2, label: 'a' }] }, 2);
    assert.equal(series.name, 'Series 3');
    assert.equal(series.datum(0).label, 'a');
  });
});

describe('value parsing', () => {
  it('converts the supported types', () => {
    assert.deepEqual(toNumeric('  3.5 '), [3.5, false]);
    assert.deepEqual(toNumeric('−2'), [-2, false]);
    assert.equal(toNumeric(new Date(5))[0], 5);
    assert.ok(Number.isNaN(toNumeric(undefined)[0]));
  });

  it('parses ISO dates and date-times', () => {
    assert.equal(parseDate('2026-10-10'), new Date(2026, 9, 10).getTime());
    assert.equal(parseDate('2026/10'), new Date(2026, 9, 1).getTime());
    assert.equal(parseDate('2026-10-10 14:30'), new Date(2026, 9, 10, 14, 30).getTime());
    assert.ok(Number.isNaN(parseDate('yesterday')));
  });
});

describe('helpers', () => {
  it('finiteExtent ignores gaps and optionally non-positive values', () => {
    assert.deepEqual(finiteExtent(new Float64Array([3, NaN, -2, 8])), [-2, 8]);
    assert.deepEqual(finiteExtent(new Float64Array([3, -2, 0, 8]), true), [3, 8]);
    assert.equal(finiteExtent(new Float64Array([NaN])), null);
  });

  it('nearestIndexSorted finds the closest value', () => {
    const values = [0, 10, 20, 30];
    assert.equal(nearestIndexSorted(values, 14), 1);
    assert.equal(nearestIndexSorted(values, 16), 2);
    assert.equal(nearestIndexSorted(values, -5), 0);
    assert.equal(nearestIndexSorted(values, 99), 3);
    assert.equal(nearestIndexSorted([], 1), -1);
  });
});

describe('options', () => {
  it('merges objects deeply and replaces arrays', () => {
    const merged = mergeOptions({ x: { label: 'a', grid: true }, dash: [1, 2] }, { x: { label: 'b' }, dash: [5] });
    assert.deepEqual(merged, { x: { label: 'b', grid: true }, dash: [5] });
  });

  it('expands shorthands', () => {
    const options = resolveOptions({ x: 'Time', legend: 'right', tooltip: false, interaction: false });
    assert.equal(options.x.label, 'Time');
    assert.equal(options.legend.position, 'right');
    assert.equal(options.tooltip.show, false);
    assert.equal(options.interaction.zoom, false);
  });

  it('passes data arrays through without copying', () => {
    const data = [[0, 1]];
    assert.equal(resolveSeriesOptions({ data }).data, data);
  });
});
