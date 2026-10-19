import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clamp_view, zoom_view, pan_view, reset_view, MAX_ZOOM } from '../app_main/features/plot_handling/viewport.js';
import { build_chart, SERIES_COLORS } from '../app_main/features/plot_handling/chart_rendering.js';

const full = { x: [-100, 100], y: [-50, 150] };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

describe('pure viewport transformations', () => {
  it('preserves the anchor coordinate and does not mutate inputs', () => {
    const snapshot = structuredClone(full);
    const anchor = { x: 0.25, y: 0.75 };
    const result = zoom_view(full, full, 0.5, anchor);
    for (const axis of ['x', 'y']) {
      close(result[axis][0] + (result[axis][1] - result[axis][0]) * anchor[axis],
        full[axis][0] + 200 * anchor[axis]);
    }
    assert.deepEqual(full, snapshot);
  });
  it('bounds zoom and pan, and rejects invalid domains and factors', () => {
    const zoom = zoom_view(full, full, 1e-20);
    for (const axis of ['x', 'y']) close(zoom[axis][1] - zoom[axis][0], 200 / MAX_ZOOM);
    const edge = pan_view(zoom, full, -10000, 10000);
    assert.equal(edge.x[0], full.x[0]);
    assert.equal(edge.y[1], full.y[1]);
    assert.deepEqual(zoom_view(full, full, 10000), full);
    assert.deepEqual(zoom_view(full, full, NaN), full);
    assert.deepEqual(clamp_view({ x: [1, 1], y: [NaN, Infinity] }, full), full);
    assert.deepEqual(reset_view(full), full);
    assert.notEqual(reset_view(full).x, full.x);
  });
  it('supports negative and constant data with finite nonzero domains', () => {
    for (const points of [[[-5, -9], [-2, -3]], [[-5, 0], [-5, 0]]]) {
      const chart = build_chart({ points, type: 'scatter' });
      const zoom = zoom_view(chart.viewport, chart.full_domains, 0.01);
      for (const axis of ['x', 'y']) assert.ok(zoom[axis].every(Number.isFinite) && zoom[axis][1] > zoom[axis][0]);
    }
  });
});

describe('viewport rendering', () => {
  const series = [
    { name: 'crossing', points: [[-10, -10], [10, 10]] },
    { name: 'inside', points: [[0, 0], [1, 1]] },
  ];
  for (const type of ['line', 'scatter']) {
    it(`uses viewport scales, ticks and clipping in ${type}`, () => {
      const viewport = { x: [-2, 2], y: [-2, 2] };
      const chart = build_chart({ series, type, viewport, clip_id: 'chart-one' });
      assert.deepEqual(chart.viewport, viewport);
      assert.equal(chart.hit_points.length, 2);
      const origin = chart.hit_points[0];
      close(origin.px, (chart.plot_area.left + chart.plot_area.right) / 2);
      close(origin.py, (chart.plot_area.top + chart.plot_area.bottom) / 2);
      for (const match of chart.svg.matchAll(/<text class="tick-[xy]"[^>]*>([^<]*)/g)) {
        const value = Number(match[1].replace('−', '-'));
        assert.ok(value >= -2 && value <= 2);
      }
      assert.match(chart.svg, /<clipPath id="chart-one"><rect/);
      assert.match(chart.svg, /<g class="data" clip-path="url\(#chart-one\)">/);
      assert.match(chart.svg, /<\/g><line class="axis"/);
      if (type === 'line') {
        const coordinates = chart.svg.match(/<polyline class="series" points="([^"]+)"/)[1].split(' ').map((p) => p.split(',').map(Number));
        assert.ok(coordinates[0][0] < chart.plot_area.left);
        assert.ok(coordinates[1][0] > chart.plot_area.right);
      }
      const hidden = build_chart({ series, type, viewport, visibility: [false, true], clip_id: 'chart-two' });
      assert.deepEqual(hidden.viewport, chart.viewport);
      assert.deepEqual(hidden.full_domains, chart.full_domains);
      assert.ok(hidden.hit_points.every((p) => p.series === 1 && p.color === SERIES_COLORS[1]));
      assert.ok(!hidden.svg.includes('chart-one'));
    });
  }
  it('reset restores original rendering and keeps omitted view behavior', () => {
    const original = build_chart({ series, clip_id: 'stable' });
    const changed = build_chart({ series, viewport: zoom_view(original.viewport, original.full_domains, 0.5), clip_id: 'stable' });
    assert.notDeepEqual(changed.viewport, original.viewport);
    const reset = build_chart({ series, viewport: null, full_domains: original.full_domains, clip_id: 'stable' });
    assert.deepEqual(reset, original);
  });
});
