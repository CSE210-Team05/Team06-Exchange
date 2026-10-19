import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HEIGHT, MARKER_RADIUS, SERIES_COLORS, WIDTH, build_chart, render_chart } from '../app_main/features/plot_handling/chart_rendering.js';

const sample = [[0, 0], [1, 15.1], [2, 20.4], [3, 15.9], [4, 1.6]];
const two_series = [
  { name: 'Ball A', points: sample },
  { name: 'Ball B', points: [[0, 0], [1, 10.1], [2, 10.4], [3, 0.9]] },
];

/** All elements with the given class in the SVG markup. */
const elements = (svg, class_name) => svg.match(new RegExp(`<[a-z]+ class="${class_name}"[^>]*>`, 'g')) || [];
/** Text content of all <text> elements with the given class. */
const texts = (svg, class_name) => [...svg.matchAll(new RegExp(`<text class="${class_name}"[^>]*>([^<]*)</text>`, 'g'))].map((match) => match[1]);
/** Numeric value of an attribute in one element's markup. */
const attribute = (element, name) => Number(element.match(new RegExp(` ${name}="([^"]+)"`))[1]);

describe('render_chart layout', () => {
  it('is a standalone SVG document of the fixed size', () => {
    const svg = render_chart({ points: sample });
    assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"`));
    assert.match(svg, /<\/svg>$/);
  });

  it('draws a vertical and a horizontal grid on the ticks', () => {
    const svg = render_chart({ points: sample });
    const x_ticks = texts(svg, 'tick-x');
    const y_ticks = texts(svg, 'tick-y');
    // The grid line on the first tick of each axis coincides with the axis line.
    assert.equal(elements(svg, 'grid-x').length, x_ticks.length - 1);
    assert.equal(elements(svg, 'grid-y').length, y_ticks.length - 1);
  });

  it('scales the axes automatically to round values around the data', () => {
    const svg = render_chart({ points: sample });
    assert.deepEqual(texts(svg, 'tick-x'), ['0.0', '0.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0']);
    assert.deepEqual(texts(svg, 'tick-y'), ['0', '5', '10', '15', '20', '25']);
  });

  it('shows the axis titles and escapes them', () => {
    const svg = render_chart({ points: sample, x_label: 'Time (s)', y_label: '<b>a & b</b>' });
    assert.deepEqual(texts(svg, 'label-x'), ['Time (s)']);
    assert.deepEqual(texts(svg, 'label-y'), ['&lt;b&gt;a &amp; b&lt;/b&gt;']);
    assert.ok(!svg.includes('<b>'));
  });

  it('shortens axis titles that would not fit', () => {
    const svg = render_chart({ points: sample, y_label: 'A very long axis title '.repeat(10) });
    assert.ok(texts(svg, 'label-y')[0].endsWith('…'));
  });

  it('describes the chart for screen readers', () => {
    const svg = render_chart({ points: sample, type: 'scatter', x_label: 'Time', y_label: 'Height' });
    assert.match(svg, /<title>Height vs Time<\/title>/);
    assert.match(svg, /<desc>Scatter plot of Height against Time with 5 points/);
  });
});

describe('render_chart data', () => {
  it('draws a line through the points in CSV order', () => {
    const [line] = elements(render_chart({ points: sample, type: 'line' }), 'series');
    const coordinates = line.match(/points="([^"]+)"/)[1].split(' ');
    assert.equal(coordinates.length, sample.length);
    assert.ok(line.includes(`stroke="${SERIES_COLORS[0]}"`));
  });

  it('draws one marker per scatter point, fully inside the plot area', () => {
    const svg = render_chart({ points: [[0, 0], [10, 10], [5, 3]], type: 'scatter' });
    const circles = svg.match(/<circle [^>]*>/g);
    assert.equal(circles.length, 3);
    const [x_axis, y_axis] = elements(svg, 'axis'); // bottom axis, then left axis
    const plot_left = attribute(y_axis, 'x1');
    const plot_bottom = attribute(x_axis, 'y1');
    const plot_right = attribute(x_axis, 'x2');
    const plot_top = attribute(y_axis, 'y1');
    for (const circle of circles) {
      const cx = attribute(circle, 'cx');
      const cy = attribute(circle, 'cy');
      assert.ok(cx - MARKER_RADIUS >= plot_left && cx + MARKER_RADIUS <= plot_right, `marker at x=${cx} sticks out`);
      assert.ok(cy - MARKER_RADIUS >= plot_top && cy + MARKER_RADIUS <= plot_bottom, `marker at y=${cy} sticks out`);
    }
  });

  it('shows a single point as a marker even in line mode', () => {
    const svg = render_chart({ points: [[1, 1]], type: 'line' });
    assert.equal((svg.match(/<circle /g) || []).length, 1);
  });

  it('shows an empty state without points', () => {
    assert.deepEqual(texts(render_chart({ points: [] }), 'empty'), ['No data']);
  });
});

describe('render_chart with several series', () => {
  it('draws one line per series, each in its own colour', () => {
    const lines = elements(render_chart({ series: two_series }), 'series');
    assert.equal(lines.length, 2);
    assert.ok(lines[0].includes(`stroke="${SERIES_COLORS[0]}"`));
    assert.ok(lines[1].includes(`stroke="${SERIES_COLORS[1]}"`));
    assert.equal(lines[1].match(/points="([^"]+)"/)[1].split(' ').length, 4);
  });

  it('draws one marker group per series in a scatter plot', () => {
    const groups = elements(render_chart({ series: two_series, type: 'scatter' }), 'markers');
    assert.equal(groups.length, 2);
    assert.ok(groups[1].includes(`fill="${SERIES_COLORS[1]}"`));
  });

  it('scales the axes to cover every series', () => {
    const svg = render_chart({ series: [{ name: 'a', points: [[0, 0], [1, 1]] }, { name: 'b', points: [[5, 40], [10, 90]] }] });
    assert.deepEqual(texts(svg, 'tick-x'), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    assert.deepEqual(texts(svg, 'tick-y'), ['0', '20', '40', '60', '80', '100']);
  });

  it('names the series in a legend, but only when there are several', () => {
    const svg = render_chart({ series: two_series });
    assert.deepEqual(texts(svg, 'legend-label'), ['Ball A', 'Ball B']);
    assert.equal(elements(svg, 'legend-key').length, 2);
    assert.deepEqual(texts(render_chart({ series: [two_series[0]] }), 'legend-label'), []);
  });

  it('starts a new legend row when the names do not fit and moves the plot down', () => {
    const many = Array.from({ length: 8 }, (_, index) => ({ name: `A rather long series name ${index + 1}`, points: sample }));
    const { svg, plot_area } = build_chart({ series: many });
    const rows = new Set(elements(svg, 'legend-label').map((label) => attribute(label, 'y')));
    assert.ok(rows.size > 1);
    assert.ok(plot_area.top > Math.max(...rows));
    assert.ok(plot_area.top > build_chart({ series: two_series }).plot_area.top);
  });

  it('escapes series names and lists them for screen readers', () => {
    const svg = render_chart({ series: [{ name: '<b>A</b>', points: sample }, { name: 'B & C', points: sample }], x_label: 'Time' });
    assert.ok(!svg.includes('<b>'));
    assert.deepEqual(texts(svg, 'legend-label'), ['&lt;b&gt;A&lt;/b&gt;', 'B &amp; C']);
    assert.match(svg, /<desc>Line plot of 2 series \(&lt;b&gt;A&lt;\/b&gt;, B &amp; C\) against Time with 10 points/);
  });
});

describe('build_chart', () => {
  it('reports every drawn point with its values and its pixel position', () => {
    const { svg, hit_points, plot_area } = build_chart({ series: two_series, type: 'scatter' });
    assert.equal(hit_points.length, 9);
    assert.deepEqual(hit_points.map((point) => point.series), [0, 0, 0, 0, 0, 1, 1, 1, 1]);
    assert.deepEqual(
      { name: hit_points[6].name, color: hit_points[6].color, x: hit_points[6].x, y: hit_points[6].y },
      { name: 'Ball B', color: SERIES_COLORS[1], x: 1, y: 10.1 },
    );
    const circles = svg.match(/<circle cx="[^>]*>/g);
    assert.deepEqual(hit_points.map((point) => [point.px, point.py]), circles.map((circle) => [attribute(circle, 'cx'), attribute(circle, 'cy')]));
    for (const { px, py } of hit_points) {
      assert.ok(px >= plot_area.left && px <= plot_area.right && py >= plot_area.top && py <= plot_area.bottom);
    }
  });

  it('returns the same markup as render_chart', () => {
    assert.equal(build_chart({ points: sample }).svg, render_chart({ points: sample }));
    assert.deepEqual(build_chart({ points: [] }).hit_points, []);
  });
});

describe('logarithmic view', () => {
  it('spaces decades evenly while retaining original hover values', () => {
    const chart = build_chart({ points: [[1, 1], [10, 10], [100, 100]], type: 'scatter', scale: 'log' });
    const [first, second, third] = chart.hit_points;
    assert.ok(Math.abs((second.px - first.px) - (third.px - second.px)) < 0.02);
    assert.deepEqual(chart.hit_points.map(({ x, y }) => [x, y]), [[1, 1], [10, 10], [100, 100]]);
    assert.deepEqual(texts(chart.svg, 'tick-x'), ['1', '10', '100']);
    assert.match(chart.svg, /Logarithmic scale/);
  });

  it('excludes non-positive points and breaks lines without changing the input', () => {
    const points = [[1, 1], [10, 0], [100, 100]];
    const before = structuredClone(points);
    const chart = build_chart({ points, scale: 'log' });
    assert.equal(chart.excluded_points, 1);
    assert.deepEqual(chart.hit_points.map(({ x, y }) => [x, y]), [[1, 1], [100, 100]]);
    assert.equal(elements(chart.svg, 'series').length, 0);
    assert.equal((chart.svg.match(/<circle /g) || []).length, 2);
    assert.match(chart.svg, /1 non-positive point was not plotted/);
    assert.deepEqual(points, before);
  });

  it('maps valid data safely when zero and negative values are present', () => {
    const points = [[-10, 5], [0, 10], [1, -2], [10, 10], [100, 100]];
    const chart = build_chart({ points, type: 'scatter', scale: 'log' });

    assert.equal(chart.excluded_points, 3);
    assert.deepEqual(chart.hit_points.map(({ x, y }) => [x, y]), [[10, 10], [100, 100]]);
    assert.ok(chart.hit_points.every(({ px, py }) => Number.isFinite(px) && Number.isFinite(py)));
    assert.ok(!chart.svg.includes('NaN'));
    assert.ok(!chart.svg.includes('undefined'));
  });

  it('shows an explanatory empty state when no positive points remain', () => {
    const chart = build_chart({ points: [[0, 1], [2, -1]], scale: 'log' });
    assert.deepEqual(texts(chart.svg, 'empty'), ['No positive data']);
    assert.equal(chart.excluded_points, 2);
  });

  it('uses a marker legend when exclusions leave no line segment', () => {
    const chart = build_chart({
      series: [
        { name: 'Broken', points: [[1, 1], [10, 0], [100, 100]] },
        { name: 'Connected', points: [[1, 1], [10, 10]] },
      ],
      scale: 'log',
    });
    const keys = elements(chart.svg, 'legend-key');
    assert.match(keys[0], /^<circle/);
    assert.match(keys[1], /^<line/);
  });
});

describe('series visibility', () => {
  for (const type of ['line', 'scatter']) {
    it(`removes hidden marks and targets with stable identity and geometry in ${type}`, () => {
      const series = [
        { name: 'Extreme', points: [[-100, -100], [100, 100]] },
        { name: '<Visible & safe>', points: [[0, 0], [1, 1]] },
        { name: 'Singleton', points: [[200, 200]] },
      ];
      const full = build_chart({ series, type });
      const hidden = build_chart({ series, type, visibility: [false, true, false] });
      assert.deepEqual(hidden.hit_points, full.hit_points.filter((point) => point.series === 1));
      assert.ok(hidden.hit_points.every((point) => point.color === SERIES_COLORS[1]));
      assert.equal(elements(hidden.svg, type === 'line' ? 'series' : 'markers').length, 1);
      assert.equal(elements(hidden.svg, type === 'line' ? 'markers' : 'series').length, 0);
      assert.deepEqual(hidden.plot_area, full.plot_area);
      for (const name of ['axis', 'grid-x', 'grid-y', 'tick-x', 'tick-y', 'legend-key', 'legend-label']) {
        assert.deepEqual(elements(hidden.svg, name), elements(full.svg, name));
      }
      assert.equal(elements(hidden.svg, 'legend-entry').filter((entry) => entry.includes('line-through')).length, 2);
      assert.match(hidden.svg, /1 series \(&lt;Visible &amp; safe&gt;\).*with 2 points/);
      assert.ok(!hidden.svg.includes('<Visible'));
      const empty = build_chart({ series, type, visibility: [false, false, false] });
      assert.deepEqual(empty.hit_points, []);
      assert.deepEqual(empty.plot_area, full.plot_area);
      assert.deepEqual(texts(empty.svg, 'empty'), ['No series selected']);
      assert.equal(elements(empty.svg, 'series').length + elements(empty.svg, 'markers').length, 0);
      assert.equal(elements(empty.svg, 'legend-label').length, 3);
      assert.match(empty.svg, /<desc>[^<]*No series selected. 0 visible points/);
      assert.ok(!empty.svg.includes('class="hover"'));
    });
  }

  it('defaults to visible, supports render_chart and leaves inputs untouched', () => {
    const series = structuredClone(two_series);
    const before = structuredClone(series);
    for (const entry of series) {
      entry.points.forEach(Object.freeze);
      Object.freeze(entry.points);
      Object.freeze(entry);
    }
    Object.freeze(series);
    const visibility = Object.freeze([false, true]);
    const options = Object.freeze({ series, visibility });
    assert.equal(render_chart(options), build_chart(options).svg);
    assert.deepEqual(series, before);
    assert.deepEqual(visibility, [false, true]);
    const defaults = build_chart({ series });
    assert.deepEqual(defaults, build_chart({ series, visibility: [true, true] }));
    assert.deepEqual(defaults, build_chart({ series, visibility: [] }));
    assert.equal(build_chart({ points: sample, visibility: [false] }).hit_points.length, 0);
    assert.deepEqual(texts(render_chart({ series: [] }), 'empty'), ['No data']);
    assert.deepEqual(texts(render_chart({ points: sample, visibility: [false] }), 'legend-label'), ['y']);
  });
});
