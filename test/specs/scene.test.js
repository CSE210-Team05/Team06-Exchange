import { assert, describe, it } from '../harness.js';
import { buildScene, densityOpacity } from '../../src/scene/build.js';
import { normalizeSeries } from '../../src/core/data.js';
import { resolveOptions, resolveSeriesOptions } from '../../src/core/options.js';
import { themes } from '../../src/core/theme.js';
import { renderSVG } from '../../src/render/svg.js';
import { measureText } from '../../src/core/text.js';

/** Build a scene from user-level options, like Plot does. */
function scene(userOptions, { width = 640, height = 400, hidden = new Set(), view } = {}) {
  const options = resolveOptions(userOptions);
  const series = options.series.map((entry, index) => normalizeSeries(resolveSeriesOptions(entry), index, options.type));
  return buildScene({ options, series, theme: themes.light, width, height, hidden, view });
}

/** Flatten nested groups into one list of primitives. */
const flatten = (nodes) => nodes.flatMap((node) => (node.type === 'group' ? flatten(node.children) : [node]));
const byClass = (built, name) => flatten(built.nodes).filter((node) => (node.className || '').split(' ').includes(name));

const twoSeries = {
  title: 'Test',
  series: [
    { name: 'a', data: [[0, 1], [1, 3], [2, 2]] },
    { name: 'b', data: [[0, 2], [1, 1], [2, 4]] },
  ],
};

describe('buildScene layout', () => {
  it('keeps the plot area inside the chart', () => {
    const built = scene(twoSeries);
    const { x, y, width, height } = built.plotArea;
    assert.ok(x > 0 && y > 0 && x + width < 640 && y + height < 400);
  });

  it('shows a legend for two or more series only', () => {
    assert.equal(scene(twoSeries).legend.length, 2);
    assert.equal(scene({ series: [twoSeries.series[0]] }).legend.length, 0);
    assert.equal(scene({ ...twoSeries, legend: false }).legend.length, 0);
  });

  it('never lets x tick labels overlap, even on a narrow chart', () => {
    const built = scene({ series: [{ data: [[0, 0], [123456789, 1]] }] }, { width: 260 });
    const labels = byClass(built, 'zp-x').filter((node) => node.className.includes('zp-tick-label'));
    const font = labels[0].font;
    for (let index = 1; index < labels.length; index++) {
      const previousRight = labels[index - 1].x + measureText(labels[index - 1].text, font) / 2;
      const currentLeft = labels[index].x - measureText(labels[index].text, font) / 2;
      assert.ok(currentLeft > previousRight, `labels ${labels[index - 1].text} and ${labels[index].text} overlap`);
    }
  });

  it('keeps every marker fully inside the plot area', () => {
    const built = scene({ type: 'scatter', series: [{ data: [[0, 0], [10, 10], [5, 3]] }] });
    const { x, y, width, height } = built.plotArea;
    const markers = flatten(built.nodes).find((node) => node.type === 'markers');
    markers.xs.forEach((px, index) => {
      const py = markers.ys[index];
      assert.ok(px - 4 >= x && px + 4 <= x + width && py - 4 >= y && py + 4 <= y + height, `marker ${index} is clipped`);
    });
  });

  it('starts and ends nice axes on round numbers', () => {
    const built = scene({ series: [{ data: [[0, 0.13], [1, 9.7]] }] });
    assert.deepEqual(built.scales.y.domain, [0, 10]);
  });

  it('follows the zoom window when one is given', () => {
    const built = scene(twoSeries, { view: { x: [0.5, 1.5], y: null } });
    assert.deepEqual(built.scales.x.domain, [0.5, 1.5]);
  });
});

describe('buildScene data', () => {
  it('draws hidden series in the legend but not in the plot', () => {
    const built = scene(twoSeries, { hidden: new Set(['b']) });
    assert.deepEqual(built.series.map((series) => series.key), ['a']);
    assert.equal(built.legend.find((entry) => entry.key === 'b').hidden, true);
  });

  it('keeps colours tied to the series, not to visibility', () => {
    const built = scene(twoSeries, { hidden: new Set(['a']) });
    assert.equal(built.series[0].color, themes.light.palette[1]);
  });

  it('reduces huge sorted lines to a few points per pixel', () => {
    const data = Array.from({ length: 50000 }, (_, index) => [index, Math.sin(index)]);
    const built = scene({ series: [{ data }] }, { width: 500 });
    const line = flatten(built.nodes).find((node) => node.className === 'zp-line');
    assert.ok(line.path.ops.length <= 4 * 500, `line has ${line.path.ops.length} points`);
  });

  it('drops values a log axis cannot show', () => {
    const built = scene({ y: { scale: 'log' }, series: [{ data: [[0, -1], [1, 0], [2, 10], [3, 100]] }] });
    assert.equal(built.series[0].xs.length, 2);
    assert.ok(built.scales.y.domain[0] > 0);
  });

  it('shows an empty state without data', () => {
    const built = scene({ series: [] });
    assert.equal(byClass(built, 'zp-empty')[0].text, 'No data');
  });

  it('uses a time axis for dates', () => {
    const built = scene({ series: [{ data: [[new Date(2026, 0, 1), 1], [new Date(2026, 5, 1), 2]] }] });
    assert.equal(built.scales.x.type, 'time');
  });

  it('describes the chart for screen readers', () => {
    assert.match(scene(twoSeries).description, /2 series: a \(3 points\), b \(3 points\)/);
  });

  it('fades dense scatter plots', () => {
    assert.equal(densityOpacity(100), 1);
    assert.ok(densityOpacity(30000) < 0.35);
  });
});

describe('renderSVG', () => {
  it('produces a standalone, accessible SVG document', () => {
    const markup = renderSVG(scene(twoSeries), { id: 'chart' });
    assert.match(markup, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(markup, /<title id="chart-title">Test<\/title>/);
    assert.match(markup, /clip-path="url\(#chart-clip-0\)"/);
  });

  it('escapes text from the data', () => {
    const markup = renderSVG(scene({ title: '<script>alert(1)</script>', series: [{ name: 'a&b', data: [1, 2] }, { name: '"q"', data: [3, 4] }] }));
    assert.ok(!markup.includes('<script>'));
    assert.includes(markup, '&lt;script&gt;');
    assert.includes(markup, 'a&amp;b');
  });

  it('balances its group tags', () => {
    const markup = renderSVG(scene({ ...twoSeries, type: 'scatter' }));
    assert.equal((markup.match(/<g[\s>]/g) || []).length, (markup.match(/<\/g>/g) || []).length);
  });
});
