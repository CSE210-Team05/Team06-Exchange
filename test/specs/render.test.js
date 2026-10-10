import { assert, describe, it } from '../harness.js';
import { renderCanvas } from '../../src/render/canvas.js';
import { buildScene } from '../../src/scene/build.js';
import { normalizeSeries } from '../../src/core/data.js';
import { resolveOptions, resolveSeriesOptions } from '../../src/core/options.js';
import { themes } from '../../src/core/theme.js';
import { PointIndex, nearestByX, uniqueXPositions } from '../../src/interaction/hittest.js';

/**
 * A stand-in for CanvasRenderingContext2D that records every call, so the
 * canvas renderer can be tested without a browser.
 */
function recordingContext() {
  const calls = [];
  const target = { calls };
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      return (...args) => calls.push([property, ...args]);
    },
    set(object, property, value) {
      calls.push([`set:${String(property)}`, value]);
      return true;
    },
  });
}

function scene(userOptions) {
  const options = resolveOptions(userOptions);
  const series = options.series.map((entry, index) => normalizeSeries(resolveSeriesOptions(entry), index, options.type));
  return buildScene({ options, series, theme: themes.light, width: 400, height: 300 });
}

describe('renderCanvas', () => {
  it('scales for high-density screens and clears first', () => {
    const ctx = recordingContext();
    renderCanvas(scene({ series: [{ data: [1, 2, 3] }] }), ctx, { pixelRatio: 2 });
    assert.deepEqual(ctx.calls.find(([name]) => name === 'setTransform'), ['setTransform', 2, 0, 0, 2, 0, 0]);
    assert.equal(ctx.calls.findIndex(([name]) => name === 'clearRect') < ctx.calls.findIndex(([name]) => name === 'fill'), true);
  });

  it('draws every tick label as text', () => {
    const built = scene({ series: [{ data: [1, 2, 3] }] });
    const ctx = recordingContext();
    renderCanvas(built, ctx);
    const drawn = ctx.calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    const labels = built.nodes.filter((node) => node.type === 'text').map((node) => node.text);
    assert.deepEqual(drawn, labels);
  });

  it('draws circular markers with arcs and clips data to the plot area', () => {
    const ctx = recordingContext();
    renderCanvas(scene({ type: 'scatter', series: [{ data: [[0, 0], [1, 1]] }] }), ctx);
    assert.ok(ctx.calls.filter(([name]) => name === 'arc').length >= 2);
    assert.ok(ctx.calls.some(([name]) => name === 'clip'));
  });
});

describe('hit testing', () => {
  const seriesList = [
    { xs: [10, 50, 90], ys: [10, 50, 90], sizes: [8, 8, 8], sorted: true },
    { xs: [10, 50, 90], ys: [80, 40, 20], sizes: [8, 8, 8], sorted: true },
  ];

  it('finds the nearest point within the search radius', () => {
    const index = new PointIndex(seriesList);
    assert.deepEqual(index.nearest(52, 41, 32), { series: 1, point: 1, distance: Math.hypot(2, 1) });
    assert.equal(index.nearest(300, 300, 32), null);
  });

  it('counts the inside of a large bubble as a hit', () => {
    const index = new PointIndex([{ xs: [100], ys: [100], sizes: [80] }]);
    assert.equal(index.nearest(130, 100, 4).point, 0);
  });

  it('collects every series at the nearest x', () => {
    const found = nearestByX(seriesList, 47);
    assert.equal(found.x, 50);
    assert.deepEqual(found.items, [{ series: 0, point: 1 }, { series: 1, point: 1 }]);
  });

  it('lists distinct x positions for keyboard navigation', () => {
    assert.deepEqual(Array.from(uniqueXPositions(seriesList)), [10, 50, 90]);
  });
});
