/**
 * Line interpolation ("curves") and line simplification.
 *
 * All functions work in pixel space on parallel x/y arrays and append to a
 * Path. Missing values (NaN, null) split a series into separate runs, so a
 * gap in the data is a visible gap in the line.
 */
import { Path } from './path.js';

export const CURVES = ['linear', 'monotone', 'step', 'step-before', 'step-after'];

/**
 * Index ranges [start, end) of consecutive points with finite x and y.
 * @param {ArrayLike<number>} xs
 * @param {ArrayLike<number>} ys
 * @returns {Array<[number, number]>}
 */
export function finiteRuns(xs, ys) {
  const runs = [];
  let runStart = -1;
  for (let index = 0; index < xs.length; index++) {
    const ok = Number.isFinite(xs[index]) && Number.isFinite(ys[index]);
    if (ok && runStart < 0) runStart = index;
    if (!ok && runStart >= 0) {
      runs.push([runStart, index]);
      runStart = -1;
    }
  }
  if (runStart >= 0) runs.push([runStart, xs.length]);
  return runs;
}

/**
 * Tangents for monotone cubic interpolation using Steffen's method
 * (M. Steffen, "A simple method for monotonic interpolation in one dimension",
 * Astronomy & Astrophysics 239, 1990). Unlike a natural spline it never
 * overshoots: between two points the curve stays within their y values.
 */
function monotoneTangents(xs, ys, start, end) {
  const count = end - start;
  const tangents = new Float64Array(count);
  if (count < 2) return tangents;
  if (count === 2) {
    const slope = (ys[start + 1] - ys[start]) / (xs[start + 1] - xs[start]);
    tangents[0] = slope;
    tangents[1] = slope;
    return tangents;
  }
  for (let local = 1; local < count - 1; local++) {
    const index = start + local;
    const widthBefore = xs[index] - xs[index - 1];
    const widthAfter = xs[index + 1] - xs[index];
    const slopeBefore = (ys[index] - ys[index - 1]) / widthBefore;
    const slopeAfter = (ys[index + 1] - ys[index]) / widthAfter;
    const parabolaSlope = (slopeBefore * widthAfter + slopeAfter * widthBefore) / (widthBefore + widthAfter);
    tangents[local] = (Math.sign(slopeBefore) + Math.sign(slopeAfter))
      * Math.min(Math.abs(slopeBefore), Math.abs(slopeAfter), 0.5 * Math.abs(parabolaSlope)) || 0;
  }
  // One-sided end tangents: the slope a quadratic through the end point would have.
  const firstSlope = (ys[start + 1] - ys[start]) / (xs[start + 1] - xs[start]);
  const lastSlope = (ys[end - 1] - ys[end - 2]) / (xs[end - 1] - xs[end - 2]);
  tangents[0] = (3 * firstSlope - tangents[1]) / 2;
  tangents[count - 1] = (3 * lastSlope - tangents[count - 2]) / 2;
  return tangents;
}

/** True when x strictly increases over [start, end) - required for monotone curves. */
function strictlyIncreasing(xs, start, end) {
  for (let index = start + 1; index < end; index++) {
    if (!(xs[index] > xs[index - 1])) return false;
  }
  return true;
}

/**
 * Append one continuous run of points to `path` using the chosen curve.
 * The first point is reached with moveTo unless `connect` is true.
 * @param {Path} path
 * @param {ArrayLike<number>} xs pixel x
 * @param {ArrayLike<number>} ys pixel y
 * @param {number} start
 * @param {number} end exclusive
 * @param {string} [curve]
 * @param {boolean} [connect] continue the current sub-path with lineTo
 */
export function traceRun(path, xs, ys, start, end, curve = 'linear', connect = false) {
  if (end - start < 1) return path;
  if (connect) path.lineTo(xs[start], ys[start]);
  else path.moveTo(xs[start], ys[start]);

  switch (curve) {
    case 'step':
      for (let index = start + 1; index < end; index++) {
        const middle = (xs[index - 1] + xs[index]) / 2;
        path.lineTo(middle, ys[index - 1]);
        path.lineTo(middle, ys[index]);
        path.lineTo(xs[index], ys[index]);
      }
      break;
    case 'step-after':
      for (let index = start + 1; index < end; index++) {
        path.lineTo(xs[index], ys[index - 1]);
        path.lineTo(xs[index], ys[index]);
      }
      break;
    case 'step-before':
      for (let index = start + 1; index < end; index++) {
        path.lineTo(xs[index - 1], ys[index]);
        path.lineTo(xs[index], ys[index]);
      }
      break;
    case 'monotone':
      if (end - start > 2 && strictlyIncreasing(xs, start, end)) {
        const tangents = monotoneTangents(xs, ys, start, end);
        for (let index = start; index < end - 1; index++) {
          const third = (xs[index + 1] - xs[index]) / 3;
          const local = index - start;
          path.bezierCurveTo(
            xs[index] + third, ys[index] + tangents[local] * third,
            xs[index + 1] - third, ys[index + 1] - tangents[local + 1] * third,
            xs[index + 1], ys[index + 1],
          );
        }
        break;
      }
      // Not monotone in x (or too short): fall back to straight segments.
      for (let index = start + 1; index < end; index++) path.lineTo(xs[index], ys[index]);
      break;
    default:
      for (let index = start + 1; index < end; index++) path.lineTo(xs[index], ys[index]);
      break;
  }
  return path;
}

/**
 * Path for a line through all points, broken at missing values.
 * @param {ArrayLike<number>} xs
 * @param {ArrayLike<number>} ys
 * @param {string} [curve]
 */
export function linePath(xs, ys, curve = 'linear') {
  const path = new Path();
  for (const [start, end] of finiteRuns(xs, ys)) traceRun(path, xs, ys, start, end, curve);
  return path;
}

/**
 * Closed path for the area between a line and a horizontal baseline.
 * @param {ArrayLike<number>} xs
 * @param {ArrayLike<number>} ys
 * @param {number} baselineY pixel y of the baseline
 * @param {string} [curve]
 */
export function areaPath(xs, ys, baselineY, curve = 'linear') {
  const path = new Path();
  for (const [start, end] of finiteRuns(xs, ys)) {
    path.moveTo(xs[start], baselineY);
    traceRun(path, xs, ys, start, end, curve, true);
    path.lineTo(xs[end - 1], baselineY);
    path.closePath();
  }
  return path;
}

/**
 * M4 aggregation: keep only the first, minimum, maximum and last point of
 * every pixel column. A line drawn through the result is visually identical
 * to the full line, but a million points shrink to ~4 per pixel.
 * (Jugel et al., "M4: A Visualization-Oriented Time Series Data Aggregation",
 * Proc. VLDB Endowment 7(10), 2014.)
 *
 * Expects points sorted by x. Gaps (non-finite values) are kept as NaN
 * entries so missing data stays visible.
 *
 * @param {ArrayLike<number>} xs pixel x
 * @param {ArrayLike<number>} ys pixel y
 * @param {number} [columnWidth] pixels per aggregation bucket
 * @returns {{ xs: Float64Array, ys: Float64Array }}
 */
export function decimateM4(xs, ys, columnWidth = 1) {
  const outX = [];
  const outY = [];
  let column = null;
  let first = 0;
  let last = 0;
  let lowest = 0;
  let highest = 0;

  const flush = () => {
    if (column === null) return;
    // Emit the (up to) four representative points in their original order.
    const picks = [...new Set([first, lowest, highest, last])].sort((a, b) => a - b);
    for (const index of picks) {
      outX.push(xs[index]);
      outY.push(ys[index]);
    }
    column = null;
  };

  for (let index = 0; index < xs.length; index++) {
    const x = xs[index];
    const y = ys[index];
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      flush();
      if (outX.length && Number.isFinite(outX[outX.length - 1])) {
        outX.push(NaN);
        outY.push(NaN);
      }
      continue;
    }
    const bucket = Math.floor(x / columnWidth);
    if (bucket !== column) {
      flush();
      column = bucket;
      first = index;
      last = index;
      lowest = index;
      highest = index;
    } else {
      last = index;
      if (y < ys[lowest]) lowest = index;
      if (y > ys[highest]) highest = index;
    }
  }
  flush();
  return { xs: Float64Array.from(outX), ys: Float64Array.from(outY) };
}
