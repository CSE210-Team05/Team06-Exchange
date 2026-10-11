import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, HEIGHT, MARKER_RADIUS, WIDTH, render_chart } from '../app_main/features/plot_handling/chart_rendering.js';

const sample = [[0, 0], [1, 15.1], [2, 20.4], [3, 15.9], [4, 1.6]];

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
    assert.ok(line.includes(`stroke="${COLORS.series}"`));
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
