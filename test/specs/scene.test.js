import { assert, describe, it } from '../harness.js';
import { COLORS, HEIGHT, WIDTH, buildScene } from '../../src/scene.js';
import { renderSVG } from '../../src/render-svg.js';
import { renderCanvas } from '../../src/render-canvas.js';

const sample = [[0, 0], [1, 15.1], [2, 20.4], [3, 15.9], [4, 1.6]];
const byRole = (scene, role) => scene.nodes.filter((node) => node.role === role);

describe('buildScene layout', () => {
  it('always has the fixed size', () => {
    const scene = buildScene({ points: sample });
    assert.equal(scene.width, WIDTH);
    assert.equal(scene.height, HEIGHT);
  });

  it('draws a vertical and a horizontal grid on the tick values', () => {
    const scene = buildScene({ points: sample });
    // The grid line on the first tick of each axis coincides with the axis line.
    assert.equal(byRole(scene, 'grid-x').length, scene.xTicks.length - 1);
    assert.equal(byRole(scene, 'grid-y').length, scene.yTicks.length - 1);
    assert.ok(byRole(scene, 'grid-x').every((line) => line.x1 === line.x2));
    assert.ok(byRole(scene, 'grid-y').every((line) => line.y1 === line.y2));
  });

  it('scales the axes automatically to round values around the data', () => {
    const scene = buildScene({ points: sample });
    assert.deepEqual(scene.xDomain, [0, 4]);
    assert.deepEqual(scene.yDomain, [0, 25]);
  });

  it('labels both axes with the given titles', () => {
    const scene = buildScene({ points: sample, xLabel: 'Time (s)', yLabel: 'Height (m)' });
    assert.equal(byRole(scene, 'label-x')[0].text, 'Time (s)');
    assert.equal(byRole(scene, 'label-y')[0].text, 'Height (m)');
    assert.equal(byRole(scene, 'label-y')[0].rotate, -90);
  });

  it('shortens axis titles that would not fit', () => {
    const scene = buildScene({ points: sample, yLabel: 'A very long axis title '.repeat(10) });
    assert.ok(byRole(scene, 'label-y')[0].text.endsWith('…'));
  });
});

describe('buildScene data', () => {
  it('draws a line through the points in CSV order', () => {
    const line = buildScene({ points: sample, type: 'line' }).nodes.find((node) => node.type === 'polyline');
    assert.equal(line.points.length, sample.length * 2);
    assert.equal(line.stroke, COLORS.series);
  });

  it('draws scatter markers fully inside the plot area', () => {
    const scene = buildScene({ points: [[0, 0], [10, 10], [5, 3]], type: 'scatter' });
    const { x, y, width, height } = scene.plot;
    const markers = scene.nodes.find((node) => node.type === 'circles');
    markers.xs.forEach((px, index) => {
      const py = markers.ys[index];
      assert.ok(px - markers.r >= x && px + markers.r <= x + width, `marker ${index} sticks out horizontally`);
      assert.ok(py - markers.r >= y && py + markers.r <= y + height, `marker ${index} sticks out vertically`);
    });
  });

  it('shows a single point as a marker even in line mode', () => {
    const scene = buildScene({ points: [[1, 1]], type: 'line' });
    assert.ok(scene.nodes.some((node) => node.type === 'circles'));
  });

  it('shows an empty state without points', () => {
    const scene = buildScene({ points: [] });
    assert.ok(scene.nodes.some((node) => node.type === 'text' && node.text === 'No data'));
  });

  it('describes the chart for screen readers', () => {
    const scene = buildScene({ points: sample, type: 'scatter', xLabel: 'Time', yLabel: 'Height' });
    assert.match(scene.description, /^Scatter plot of Height against Time with 5 points/);
  });
});

describe('renderSVG', () => {
  it('produces a standalone SVG document with title and description', () => {
    const markup = renderSVG(buildScene({ points: sample, xLabel: 'Time', yLabel: 'Height' }));
    assert.match(markup, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="720" height="440"/);
    assert.match(markup, /<title>Height vs Time<\/title>/);
    assert.match(markup, /<polyline /);
  });

  it('escapes labels taken from the data', () => {
    const markup = renderSVG(buildScene({ points: sample, xLabel: '<script>alert(1)</script>', yLabel: 'a & b' }));
    assert.ok(!markup.includes('<script>'));
    assert.match(markup, /&lt;script&gt;/);
    assert.match(markup, /a &amp; b/);
  });

  it('draws one circle per scatter point', () => {
    const markup = renderSVG(buildScene({ points: sample, type: 'scatter' }));
    assert.equal((markup.match(/<circle /g) || []).length, sample.length);
  });
});

describe('renderCanvas', () => {
  /** Records every call so the canvas renderer can be tested without a browser. */
  function recordingContext() {
    const calls = [];
    return new Proxy({ calls }, {
      get: (target, property) => (property in target ? target[property] : (...args) => calls.push([property, ...args])),
      set: () => true,
    });
  }

  it('scales for high-density screens and draws every label', () => {
    const scene = buildScene({ points: sample, xLabel: 'Time', yLabel: 'Height' });
    const ctx = recordingContext();
    renderCanvas(scene, ctx, 2);
    assert.deepEqual(ctx.calls[0], ['setTransform', 2, 0, 0, 2, 0, 0]);
    const drawn = ctx.calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    const labels = scene.nodes.filter((node) => node.type === 'text').map((node) => node.text);
    assert.deepEqual(drawn, labels);
  });

  it('draws one arc per scatter point', () => {
    const ctx = recordingContext();
    renderCanvas(buildScene({ points: sample, type: 'scatter' }), ctx);
    assert.equal(ctx.calls.filter(([name]) => name === 'arc').length, sample.length);
  });
});
