/** Pure viewport operations. At most 100x zoom; every view stays inside full domains. */
export const MAX_ZOOM = 100;
const valid = (d) => Array.isArray(d) && d.length === 2 && d.every(Number.isFinite)
  && d[1] > d[0] && Number.isFinite(d[1] - d[0]);

export function clamp_domain(domain, full) {
  if (!valid(full)) throw new RangeError('Full domain must be finite and increasing');
  if (!valid(domain)) return [...full];
  const full_width = full[1] - full[0];
  const width = Math.min(full_width, Math.max(full_width / MAX_ZOOM, domain[1] - domain[0]));
  const start = Math.max(full[0], Math.min(full[1] - width, domain[0]));
  const result = [start, start + width];
  return valid(result) ? result : [...full];
}

export function reset_view(full) {
  return { x: [...full.x], y: [...full.y] };
}

export function clamp_view(view, full) {
  return { x: clamp_domain(view?.x, full.x), y: clamp_domain(view?.y, full.y) };
}

/** factor < 1 zooms in; anchor fractions run left-to-right and bottom-to-top. */
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

/** Move by fractions of the current spans (positive means increasing data values). */
export function pan_view(view, full, dx, dy) {
  const current = clamp_view(view, full);
  return Object.fromEntries(['x', 'y'].map((axis, index) => {
    const delta = [dx, dy][index];
    const offset = Number.isFinite(delta) ? delta * (current[axis][1] - current[axis][0]) : 0;
    return [axis, clamp_domain(current[axis].map((value) => value + offset), full[axis])];
  }));
}
