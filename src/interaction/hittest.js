/**
 * Hit testing: which data point is under (or closest to) the pointer?
 *
 * Two strategies match the two tooltip modes:
 *  - nearest point in 2D, accelerated with a uniform grid so a lookup only
 *    checks the few cells around the pointer instead of every point;
 *  - nearest x position, using binary search on series sorted by x.
 * All coordinates are pixels relative to the chart's top-left corner.
 */
import { nearestIndexSorted } from '../core/data.js';

/** Grid cell size in px; about the size of the search radius. */
const CELL_SIZE = 32;

export class PointIndex {
  /**
   * @param {Array<{xs: number[], ys: number[], sizes: number[]}>} seriesList hit data from the scene
   */
  constructor(seriesList) {
    this.seriesList = seriesList;
    /** @type {Map<number, number[]>} cell key -> flat [seriesPosition, pointPosition, ...] */
    this.cells = new Map();
    this.maxRadius = 0;
    seriesList.forEach((series, seriesPosition) => {
      for (let point = 0; point < series.xs.length; point++) {
        const key = this.key(Math.floor(series.xs[point] / CELL_SIZE), Math.floor(series.ys[point] / CELL_SIZE));
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push(seriesPosition, point);
        this.maxRadius = Math.max(this.maxRadius, (series.sizes[point] || 0) / 2);
      }
    });
  }

  /** Cantor-style packing of two (possibly negative) cell coordinates into one number. */
  key(column, row) {
    return (column + 32768) * 65536 + (row + 32768);
  }

  /**
   * Closest point to (x, y). For large markers (bubbles) the distance is
   * measured to the marker's edge, so the pointer anywhere inside a bubble hits it.
   * @param {number} x
   * @param {number} y
   * @param {number} [maxDistance] search radius beyond the marker edge, in px
   * @returns {{ series: number, point: number, distance: number } | null}
   */
  nearest(x, y, maxDistance = 32) {
    const reach = maxDistance + this.maxRadius;
    const firstColumn = Math.floor((x - reach) / CELL_SIZE);
    const lastColumn = Math.floor((x + reach) / CELL_SIZE);
    const firstRow = Math.floor((y - reach) / CELL_SIZE);
    const lastRow = Math.floor((y + reach) / CELL_SIZE);
    let best = null;
    let bestScore = Infinity;
    let bestDistance = Infinity;
    for (let column = firstColumn; column <= lastColumn; column++) {
      for (let row = firstRow; row <= lastRow; row++) {
        const bucket = this.cells.get(this.key(column, row));
        if (!bucket) continue;
        for (let entry = 0; entry < bucket.length; entry += 2) {
          const seriesPosition = bucket[entry];
          const point = bucket[entry + 1];
          const series = this.seriesList[seriesPosition];
          const distance = Math.hypot(series.xs[point] - x, series.ys[point] - y);
          const score = Math.max(0, distance - (series.sizes[point] || 0) / 2);
          // Later series are drawn on top, so they win ties (>= keeps the topmost).
          if (score < bestScore || (score === bestScore && distance <= bestDistance)) {
            best = { series: seriesPosition, point, distance };
            bestScore = score;
            bestDistance = distance;
          }
        }
      }
    }
    return bestScore <= maxDistance ? best : null;
  }
}

/**
 * Every series' point at the x position closest to `x`.
 *
 * The global nearest x wins; other series are included when they have a
 * point at the same pixel column, so a tooltip can list all series at once
 * without mixing values from different x positions.
 * @param {Array<{xs: number[], sorted: boolean}>} seriesList
 * @param {number} x
 * @returns {{ x: number, items: Array<{ series: number, point: number }> } | null}
 */
export function nearestByX(seriesList, x) {
  const candidates = [];
  seriesList.forEach((series, seriesPosition) => {
    const { xs } = series;
    if (!xs.length) return;
    let point;
    if (series.sorted) {
      point = nearestIndexSorted(xs, x);
    } else {
      point = 0;
      let bestDistance = Infinity;
      for (let index = 0; index < xs.length; index++) {
        const distance = Math.abs(xs[index] - x);
        if (distance < bestDistance) {
          bestDistance = distance;
          point = index;
        }
      }
    }
    candidates.push({ series: seriesPosition, point, distance: Math.abs(xs[point] - x), px: xs[point] });
  });
  if (!candidates.length) return null;
  const best = candidates.reduce((winner, candidate) => (candidate.distance < winner.distance ? candidate : winner));
  const items = candidates
    .filter((candidate) => Math.abs(candidate.px - best.px) <= 1)
    .map(({ series, point }) => ({ series, point }));
  return { x: best.px, items };
}

/**
 * Sorted, de-duplicated x pixel positions of all points (keyboard navigation
 * in 'x' mode steps through these).
 * @param {Array<{xs: number[]}>} seriesList
 */
export function uniqueXPositions(seriesList) {
  const total = seriesList.reduce((sum, series) => sum + series.xs.length, 0);
  const all = new Float64Array(total);
  let offset = 0;
  for (const series of seriesList) {
    all.set(series.xs, offset);
    offset += series.xs.length;
  }
  all.sort();
  const unique = [];
  for (const value of all) {
    if (!unique.length || value - unique[unique.length - 1] > 1) unique.push(value);
  }
  return unique;
}
