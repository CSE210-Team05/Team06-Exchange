import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REDUCE_THRESHOLD, reduce_line, reduce_scatter } from '../app_main/features/plot_handling/point_reduction.js';
import { build_chart } from '../app_main/features/plot_handling/chart_rendering.js';
import { find_hover_points } from '../app_main/features/plot_handling/hover_tooltip.js';

const identity = (value) => value;
const bounds = { left: 0, right: 100, top: 0, bottom: 100 };

test('reduce_line keeps first, last, minimum and maximum of each pixel column in order', () => {
  // Column 5 holds a spike (y=90) and a dip (y=-20) between two ordinary points.
  const points = [[5.1, 10], [5.2, 90], [5.3, -20], [5.4, 12], [6.5, 1]];
  const kept = reduce_line(points, identity, identity, bounds);
  assert.deepEqual(kept.map(([x, y]) => [x, y]), points);
  assert.deepEqual(reduce_line([[5.1, 10], [5.2, 11], [5.3, 12], [5.4, 13]], identity, identity, bounds).map(([x]) => x), [5.1, 5.4]);
});

test('reduce_line handles empty, single, duplicate and unsorted input', () => {
  assert.deepEqual(reduce_line([], identity, identity, bounds), []);
  assert.equal(reduce_line([[3, 4]], identity, identity, bounds).length, 1);
  assert.equal(reduce_line([[3, 4], [3, 4], [3, 4]], identity, identity, bounds).length, 2); // first and last of the column
  const unsorted = [[50, 1], [10, 2], [50, 3]];
  assert.deepEqual(reduce_line(unsorted, identity, identity, bounds).map(([x]) => x), [50, 10, 50]);
});

test('reduce_line collapses points outside the plot but keeps the segments entering it', () => {
  const points = [];
  for (let i = 0; i < 100; i++) points.push([-1000 - i, i]);
  points.push([50, 7]);
  const kept = reduce_line(points, identity, identity, bounds);
  assert.ok(kept.length <= 5);
  assert.deepEqual(kept.at(-1).slice(0, 2), [50, 7]);
  assert.deepEqual(kept.at(-2).slice(0, 2), [-1099, 99]);
});

test('reduce_scatter keeps one point per cell, outliers and negative values, and drops far-off points', () => {
  const points = [[10.1, 10.1], [10.2, 10.3], [10.3, 10.2], [90, 90], [-5, 50], [-500, 50], [50, NaN]];
  const kept = reduce_scatter(points, identity, identity, bounds, 4, 7);
  assert.deepEqual(kept.map(([x, y]) => [x, y]), [[10.1, 10.1], [90, 90], [-5, 50]]);
});

test('reduction is deterministic', () => {
  const points = Array.from({ length: 5000 }, (_, i) => [i, Math.sin(i / 7)]);
  const map = (x) => x / 50;
  assert.deepEqual(reduce_line(points, map, identity, bounds), reduce_line(points, map, identity, bounds));
});

const SPIKE = 500;
const dense = (count) => Array.from({ length: count }, (_, i) => [i, i === 7777 ? SPIKE : Math.sin(i / 100) * 10]);

test('a huge line series is drawn with a bounded number of vertices and keeps its spike', () => {
  const chart = build_chart({ series: [{ name: 'a', points: dense(200000) }] });
  const vertices = chart.svg.match(/<polyline[^>]*points="([^"]*)"/)[1].split(' ').length;
  assert.ok(vertices < 4 * 720, `vertices: ${vertices}`);
  assert.ok(chart.hit_points.some((p) => p.y === SPIKE), 'spike is a drawn, hoverable point');
  assert.ok(chart.hit_points.length < 4 * 720);
  assert.match(chart.svg, /condensed/);
});

test('a huge scatter series is drawn with a bounded number of markers and hover returns original values', () => {
  const points = Array.from({ length: 200000 }, (_, i) => [(i * 7919) % 1000, (i * 104729) % 997]);
  const chart = build_chart({ series: [{ name: 'a', points }], type: 'scatter' });
  const circles = (chart.svg.match(/<circle/g) || []).length;
  assert.ok(circles < 20000, `circles: ${circles}`);
  const target = chart.hit_points[100];
  const [found] = find_hover_points(chart.hit_points, target.px, target.py, 'scatter');
  assert.ok(points.some(([x, y]) => x === found.x && y === found.y));
});

test('series are reduced independently and small series are untouched', () => {
  const small = [[0, 0], [0.01, 1], [0.02, 0]];
  const chart = build_chart({ series: [{ name: 'big', points: dense(50000) }, { name: 'small', points: small }] });
  assert.equal(chart.hit_points.filter((p) => p.series === 1).length, 3);
  assert.ok(REDUCE_THRESHOLD > small.length);
});

test('zooming in shows more detail of a condensed series', () => {
  const series = [{ name: 'a', points: dense(50000) }];
  const full = build_chart({ series });
  const zoomed = build_chart({ series, full_domains: full.full_domains, viewport: { x: [0, 500], y: full.full_domains.y } });
  assert.ok(zoomed.hit_points.filter((p) => p.x <= 500).length >= 400);
});
