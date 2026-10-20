/**
 * Pixel-aware point reduction for dense series.
 *
 * A chart is only a few hundred pixels wide, so thousands of points that fall
 * on the same pixels add markup but no information. Both reducers return
 * original data points (never averages), so tooltips keep showing real values,
 * and the input is never modified. They are pure and deterministic.
 */

/** A series with at most this many points is drawn as is. */
export const REDUCE_THRESHOLD = 2000;

/**
 * @typedef {[number, number, number, number]} DrawnPoint data x, data y, pixel x, pixel y
 */

/**
 * Line plot: keep the first, last, lowest and highest point of every pixel
 * column (the "M4" reduction), in their original order. A line drawn through
 * them looks the same as one through all points, and peaks and dips survive.
 * Consecutive points are grouped, so unsorted input is still drawn in order.
 * Points left or right of the plot share one column each, which keeps the
 * segments that enter or leave the view.
 * @param {Array<[number, number]>} points
 * @param {(x: number) => number} map_x
 * @param {(y: number) => number} map_y
 * @param {{ left: number, right: number }} bounds plot area in px
 * @returns {DrawnPoint[]}
 */
export function reduce_line(points, map_x, map_y, { left, right }) {
  const kept = [];
  const emit = (index, px, py) => kept.push([points[index][0], points[index][1], px, py]);
  let column = null;
  let first = 0;
  let last = 0;
  let low = 0;
  let high = 0;
  // Pixel positions of the four candidates of the current column.
  let pixels = {};
  const flush = () => {
    if (column === null) return;
    for (const index of [...new Set([first, low, high, last])].sort((a, b) => a - b)) emit(index, ...pixels[index]);
  };
  for (let index = 0; index < points.length; index++) {
    const px = map_x(points[index][0]);
    const py = map_y(points[index][1]);
    const current = Math.min(right + 1, Math.max(left - 1, Math.floor(px)));
    // NaN never equals itself, so a non-finite point is its own column.
    if (current !== column) {
      flush();
      column = current;
      first = low = high = index;
      pixels = {};
    }
    pixels[index] = [px, py];
    last = index;
    if (py < pixels[low][1] || Number.isNaN(pixels[low][1])) low = index;
    if (py > pixels[high][1] || Number.isNaN(pixels[high][1])) high = index;
  }
  flush();
  return kept;
}

/**
 * Scatter plot: keep one point per `cell` x `cell` pixel square (the first
 * one) and drop points that lie too far outside the plot to be visible.
 * Isolated outliers always survive because their cell is theirs alone.
 * @param {Array<[number, number]>} points
 * @param {(x: number) => number} map_x
 * @param {(y: number) => number} map_y
 * @param {{ left: number, right: number, top: number, bottom: number }} bounds plot area in px
 * @param {number} cell edge of the square in px
 * @param {number} margin how far outside the plot a marker can still reach into it, in px
 * @returns {DrawnPoint[]}
 */
export function reduce_scatter(points, map_x, map_y, { left, right, top, bottom }, cell, margin) {
  const kept = [];
  const seen = new Set();
  const columns = Math.ceil((right - left + 2 * margin) / cell) + 1;
  for (const [x, y] of points) {
    const px = map_x(x);
    const py = map_y(y);
    // Written so that NaN is dropped as well.
    if (!(px >= left - margin && px <= right + margin && py >= top - margin && py <= bottom + margin)) continue;
    const key = Math.floor((py - top + margin) / cell) * columns + Math.floor((px - left + margin) / cell);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push([x, y, px, py]);
  }
  return kept;
}
