import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { build_chart } from '../app_main/features/plot_handling/chart_rendering.js';
import { HOVER_RADIUS, find_hover_points } from '../app_main/features/plot_handling/hover_tooltip.js';

const two_series = [
  { name: 'Ball A', points: [[0, 0], [1, 15.1], [2, 20.4], [3, 15.9], [4, 1.6]] },
  { name: 'Ball B', points: [[0, 0], [1, 10.1], [2, 10.4], [3, 0.9]] },
];

/** A hit point with just the fields find_hover_points() reads. */
const at = (series, px, py) => ({ series, px, py });

describe('find_hover_points in a scatter plot', () => {
  const points = [at(0, 100, 100), at(0, 200, 100), at(1, 200, 150)];

  it('returns the point closest to the pointer', () => {
    assert.deepEqual(find_hover_points(points, 195, 110, 'scatter'), [points[1]]);
    assert.deepEqual(find_hover_points(points, 195, 140, 'scatter'), [points[2]]);
  });

  it('returns nothing when no point is within the hover radius', () => {
    assert.deepEqual(find_hover_points(points, 100 + HOVER_RADIUS, 100, 'scatter'), [points[0]]);
    assert.deepEqual(find_hover_points(points, 100, 100 + HOVER_RADIUS + 1, 'scatter'), []);
  });

  it('prefers the later series when two points are equally close, because it is drawn on top', () => {
    const stacked = [at(0, 50, 50), at(1, 50, 50)];
    assert.deepEqual(find_hover_points(stacked, 52, 50, 'scatter'), [stacked[1]]);
  });
});

describe('find_hover_points in a line plot', () => {
  it('returns one point per series at the x position closest to the pointer', () => {
    const { hit_points, plot_area } = build_chart({ series: two_series });
    const target = hit_points.find((point) => point.series === 0 && point.x === 2);
    // Far above the lines: only the x position counts.
    const found = find_hover_points(hit_points, target.px + 3, plot_area.top, 'line');
    assert.deepEqual(found.map((point) => [point.name, point.x, point.y]), [['Ball A', 2, 20.4], ['Ball B', 2, 10.4]]);
  });

  it('leaves out a series that has no point at that x position', () => {
    const { hit_points, plot_area } = build_chart({ series: two_series });
    const found = find_hover_points(hit_points, plot_area.right, plot_area.bottom, 'line');
    assert.deepEqual(found.map((point) => [point.name, point.x]), [['Ball A', 4]]);
  });

  it('returns a single point per series even when many points share a pixel column', () => {
    const dense = [at(0, 100, 10), at(0, 100.4, 20), at(0, 100.8, 30), at(1, 100.2, 40)];
    assert.deepEqual(find_hover_points(dense, 100.5, 0, 'line'), [dense[1], dense[3]]);
  });
});

describe('find_hover_points without data', () => {
  it('returns nothing', () => {
    assert.deepEqual(find_hover_points([], 10, 10, 'line'), []);
    assert.deepEqual(find_hover_points([], 10, 10, 'scatter'), []);
  });
});

describe('hover with hidden series', () => {
  for (const type of ['line', 'scatter']) {
    it(`uses only visible targets and handles all hidden in ${type}`, () => {
      const { hit_points } = build_chart({ series: two_series, type, visibility: [false, true] });
      const target = hit_points[0];
      const found = find_hover_points(hit_points, target.px, target.py, type);
      assert.deepEqual(found.map((point) => point.series), [1]);
      const empty = build_chart({ series: two_series, type, visibility: [false, false] });
      assert.deepEqual(find_hover_points(empty.hit_points, target.px, target.py, type), []);
    });
  }
});
