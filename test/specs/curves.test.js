import { assert, describe, it } from '../harness.js';
import { areaPath, decimateM4, finiteRuns, linePath } from '../../src/core/curves.js';
import { SYMBOLS, symbolPath } from '../../src/core/symbols.js';
import { toSVGPathData } from '../../src/core/path.js';

describe('finiteRuns', () => {
  it('splits at missing values', () => {
    assert.deepEqual(finiteRuns([0, 1, 2, 3, 4], [1, NaN, 2, 3, NaN]), [[0, 1], [2, 4]]);
  });
});

describe('linePath', () => {
  it('draws straight segments and starts a new sub-path after a gap', () => {
    const path = linePath([0, 10, 20, 30], [5, 6, NaN, 8]);
    assert.deepEqual(path.ops, ['M', 'L', 'M']);
  });

  it('draws step curves with horizontal then vertical moves', () => {
    const path = linePath([0, 10], [0, 5], 'step-after');
    assert.equal(toSVGPathData(path), 'M0,0L10,0L10,5');
  });

  it('draws a monotone curve that never overshoots the data', () => {
    const xs = [0, 10, 20, 30, 40];
    const ys = [0, 0, 10, 10, 10];
    const path = linePath(xs, ys, 'monotone');
    assert.ok(path.ops.includes('C'));
    // Every Bezier control point stays within the y range of its segment.
    const { args } = path;
    let cursor = 2;
    let previousY = ys[0];
    for (const op of path.ops.slice(1)) {
      const [, c1y, , c2y, , y] = args.slice(cursor, cursor + 6);
      const low = Math.min(previousY, y) - 1e-9;
      const high = Math.max(previousY, y) + 1e-9;
      assert.ok(c1y >= low && c1y <= high && c2y >= low && c2y <= high, `overshoot in ${op} segment`);
      previousY = y;
      cursor += 6;
    }
  });

  it('falls back to straight lines when x is not increasing', () => {
    const path = linePath([0, 10, 5], [0, 1, 2], 'monotone');
    assert.deepEqual(path.ops, ['M', 'L', 'L']);
  });
});

describe('areaPath', () => {
  it('closes each run down to the baseline', () => {
    const path = areaPath([0, 10, 20], [5, 2, 4], 50);
    assert.equal(path.ops[0], 'M');
    assert.equal(path.ops[path.ops.length - 1], 'Z');
    assert.equal(path.args[1], 50);
  });
});

describe('decimateM4', () => {
  it('keeps at most four points per pixel column including the extremes', () => {
    const count = 100000;
    const xs = Float64Array.from({ length: count }, (_, index) => (index / count) * 500);
    const ys = Float64Array.from({ length: count }, (_, index) => Math.sin(index / 50) * 100 + (index === 31337 ? 900 : 0));
    const { xs: outX, ys: outY } = decimateM4(xs, ys, 1);
    assert.ok(outX.length <= 4 * 501, `got ${outX.length} points`);
    const max = (values) => values.reduce((a, b) => Math.max(a, b), -Infinity);
    const min = (values) => values.reduce((a, b) => Math.min(a, b), Infinity);
    assert.equal(max(outY), max(ys));
    assert.equal(min(outY), min(ys));
  });

  it('preserves gaps', () => {
    const { ys } = decimateM4([0, 1, 2, 3], [1, NaN, 2, 3], 1);
    assert.ok(Array.from(ys).some(Number.isNaN));
  });
});

describe('symbols', () => {
  /** Polygon area by the shoelace formula. */
  const polygonArea = (path) => {
    const points = [];
    for (let index = 0; index < path.args.length; index += 2) points.push([path.args[index], path.args[index + 1]]);
    let sum = 0;
    points.forEach(([x1, y1], index) => {
      const [x2, y2] = points[(index + 1) % points.length];
      sum += x1 * y2 - x2 * y1;
    });
    return Math.abs(sum) / 2;
  };

  it('every symbol is a closed shape', () => {
    for (const symbol of SYMBOLS) {
      const path = symbolPath(symbol, 0, 0, 10);
      assert.ok(path.ops[path.ops.length - 1] === 'Z' || path.ops[0] === 'O', `${symbol} is not closed`);
    }
  });

  it('all shapes have the same area as the circle of the same size', () => {
    const circleArea = Math.PI * 5 ** 2;
    for (const symbol of SYMBOLS.filter((name) => name !== 'circle')) {
      assert.close(polygonArea(symbolPath(symbol, 0, 0, 10)), circleArea, 1e-6, `${symbol} has a different area`);
    }
  });
});
