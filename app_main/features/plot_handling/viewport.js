/**
 * Pure viewport operations. At most 100x zoom; every view stays inside full domains.
 *
 * A domain is a `[low, high]` pair of data values on one axis. A view holds one
 * domain per axis.
 *
 * @module plot_handling/viewport
 */

/**
 * The visible part of the chart: one `[low, high]` domain per axis.
 * @typedef {object} View
 * @property {Array<number>} x visible x values, `[low, high]`
 * @property {Array<number>} y visible y values, `[low, high]`
 */

/** Largest zoom: the visible span never drops below 1/MAX_ZOOM of the full span. */
export const MAX_ZOOM = 100;

/**
 * Check for a finite, increasing `[low, high]` pair.
 * @param {*} d value to test
 * @returns {boolean} true for a usable domain
 */
const valid = (d) => Array.isArray(d) && d.length === 2 && d.every(Number.isFinite)
  && d[1] > d[0] && Number.isFinite(d[1] - d[0]);

/**
 * Fit a domain into the full domain: its width is kept between 1/MAX_ZOOM of the full
 * width and the full width, and it is moved inside the full domain. An invalid
 * domain becomes a copy of the full domain.
 * @param {Array<number>} domain `[low, high]` to fit; anything else means "no view"
 * @param {Array<number>} full `[low, high]` of all data, finite and increasing
 * @returns {Array<number>} a new `[low, high]` pair inside `full`
 * @throws {RangeError} when `full` is not finite and increasing
 */
export function clamp_domain(domain, full) {
  if (!valid(full)) throw new RangeError('Full domain must be finite and increasing');
  if (!valid(domain)) return [...full];
  const full_width = full[1] - full[0];
  const width = Math.min(full_width, Math.max(full_width / MAX_ZOOM, domain[1] - domain[0]));
  const start = Math.max(full[0], Math.min(full[1] - width, domain[0]));
  const result = [start, start + width];
  return valid(result) ? result : [...full];
}

/**
 * The view that shows everything.
 * @param {View} full full domains
 * @returns {View} a copy of `full`
 */
export function reset_view(full) {
  return { x: [...full.x], y: [...full.y] };
}

/**
 * Fit both axes of a view into the full domains.
 * @param {?View} view the view to fit; null or missing axes show the full domain
 * @param {View} full full domains
 * @returns {View} a new view inside `full`
 */
export function clamp_view(view, full) {
  return { x: clamp_domain(view?.x, full.x), y: clamp_domain(view?.y, full.y) };
}

/**
 * Zoom around an anchor. factor < 1 zooms in; anchor fractions run left-to-right and bottom-to-top.
 * @param {?View} view current view
 * @param {View} full full domains
 * @param {number} factor multiplier for the visible spans; an invalid factor leaves the view as it is
 * @param {{x: number, y: number}} [anchor] fixed point as fractions (0 to 1) of each span, the centre by default
 * @returns {View} the new view, inside `full`
 */
export function zoom_view(view, full, factor, anchor = { x: 0.5, y: 0.5 }) {
  const current = clamp_view(view, full);
  if (!Number.isFinite(factor) || factor <= 0) return current;
  const result = {};
  for (const axis of ['x', 'y']) {
    const [lo, hi] = current[axis];
    const fraction = Number.isFinite(anchor[axis]) ? Math.max(0, Math.min(1, anchor[axis])) : 0.5;
    const width = Math.min(full[axis][1] - full[axis][0], Math.max((full[axis][1] - full[axis][0]) / MAX_ZOOM, (hi - lo) * factor));
    const start = lo + (hi - lo) * fraction - width * fraction;
    result[axis] = clamp_domain([start, start + width], full[axis]);
  }
  return result;
}

/**
 * Move by fractions of the current spans (positive means increasing data values).
 * @param {?View} view current view
 * @param {View} full full domains
 * @param {number} dx fraction of the visible x span to move by
 * @param {number} dy fraction of the visible y span to move by
 * @returns {View} the new view, inside `full`
 */
export function pan_view(view, full, dx, dy) {
  const current = clamp_view(view, full);
  return Object.fromEntries(['x', 'y'].map((axis, index) => {
    const delta = [dx, dy][index];
    const offset = Number.isFinite(delta) ? delta * (current[axis][1] - current[axis][0]) : 0;
    return [axis, clamp_domain(current[axis].map((value) => value + offset), full[axis])];
  }));
}
