/**
 * Default options and option merging.
 *
 * Users pass a partial options object; it is deep-merged over DEFAULTS.
 * Arrays (series, annotations, dash patterns) replace the default instead of
 * merging element by element.
 */

export const DEFAULTS = Object.freeze({
  /** Default series type: 'line' or 'scatter'. Each series may override it. */
  type: 'line',
  /** 'svg' or 'canvas'. */
  renderer: 'svg',
  /** Pixel width; null fills the container and follows its size. */
  width: null,
  /** Pixel height; null uses the container height (falls back to 360). */
  height: 360,
  /** Space between the chart edge and its content, in px. */
  padding: 16,
  title: '',
  subtitle: '',
  /** Accessible description; generated from the data when empty. */
  description: '',
  /** 'auto' (follows OS / data-theme), 'light', 'dark' or an override object. */
  theme: 'auto',
  x: {
    label: '',
    /** 'auto' | 'linear' | 'log' | 'time' ('auto' picks 'time' for date data). */
    scale: 'auto',
    min: null,
    max: null,
    /** Round the domain to tick values. 'auto': off for line-only x axes. */
    nice: 'auto',
    /** Always include zero in the domain. */
    zero: false,
    /** Approximate tick count; null derives it from the available space. */
    ticks: null,
    /** 'auto' | 'percent' | 'compact' | 'fixed:N' | (value) => string */
    format: 'auto',
    prefix: '',
    suffix: '',
    grid: true,
    line: true,
  },
  y: {
    label: '',
    scale: 'auto',
    min: null,
    max: null,
    nice: true,
    zero: false,
    ticks: null,
    format: 'auto',
    prefix: '',
    suffix: '',
    grid: true,
    line: false,
  },
  legend: {
    /** 'auto' shows a legend for two or more series. */
    show: 'auto',
    /** 'top' | 'right' | 'bottom' */
    position: 'top',
  },
  tooltip: {
    show: true,
    /** 'auto' | 'x' (all series at the hovered x) | 'nearest' (closest point) */
    mode: 'auto',
  },
  /** Vertical hairline that follows the pointer in 'x' tooltip mode. */
  crosshair: true,
  interaction: {
    /** Axes that zoom and pan: 'xy' | 'x' | 'y' | false */
    zoom: 'xy',
    pan: true,
    /** Mouse-wheel zoom: 'ctrl' (needs Ctrl/⌘, page keeps scrolling) | 'always' | false */
    wheel: 'ctrl',
    keyboard: true,
  },
  /** Reference lines: { type: 'hline' | 'vline', value, label?, color?, dash? } */
  annotations: [],
  series: [],
});

/** Defaults applied to every series. */
export const SERIES_DEFAULTS = Object.freeze({
  name: '',
  type: null,
  color: null,
  lineWidth: 2,
  dash: null,
  /** 'linear' | 'monotone' | 'step' | 'step-before' | 'step-after' */
  curve: 'linear',
  /** Fill the area between the line and zero (or the bottom of the plot). */
  area: false,
  areaOpacity: 0.1,
  opacity: 1,
  /** Draw point markers; defaults to true for scatter and false for line series. */
  markers: null,
  marker: {
    /** 'auto' | 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'plus' | 'star' | 'triangle-down' */
    symbol: 'auto',
    /** Diameter in px, or (datum, index) => px for bubble charts. */
    size: 8,
    /** 'auto' fades dense scatter plots so overlaps show density. */
    opacity: 'auto',
    /** Width of the background-coloured ring that separates overlapping markers. */
    ring: 2,
  },
  visible: true,
});

/** True for `{}`-style objects (not arrays, dates, typed arrays or class instances). */
export function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Deep merge `patch` into a copy of `base`. Plain objects merge recursively;
 * everything else (arrays, functions, dates, primitives) replaces.
 * `undefined` values in the patch are ignored.
 * @template T
 * @param {T} base
 * @param {object} [patch]
 * @returns {T}
 */
export function mergeOptions(base, patch) {
  if (!isPlainObject(patch)) return /** @type {T} */ (isPlainObject(base) ? { ...base } : base);
  const result = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    result[key] = isPlainObject(value) && isPlainObject(result[key]) ? mergeOptions(result[key], value) : value;
  }
  return /** @type {T} */ (result);
}

/**
 * Expand shorthand forms into full option objects:
 *   x: 'Time (s)'        -> x: { label: 'Time (s)' }
 *   legend: false        -> legend: { show: false }
 *   legend: 'right'      -> legend: { position: 'right' }
 *   tooltip: false       -> tooltip: { show: false }
 *   interaction: false   -> no zoom, pan or wheel handling
 * @param {object} userOptions
 */
export function normalizeShorthand(userOptions = {}) {
  const patch = { ...userOptions };
  for (const axis of ['x', 'y']) {
    if (typeof patch[axis] === 'string') patch[axis] = { label: patch[axis] };
  }
  if (typeof patch.legend === 'boolean') patch.legend = { show: patch.legend };
  if (typeof patch.legend === 'string') patch.legend = { position: patch.legend };
  if (typeof patch.tooltip === 'boolean') patch.tooltip = { show: patch.tooltip };
  if (patch.interaction === false) patch.interaction = { zoom: false, pan: false, wheel: false, keyboard: true };
  return patch;
}

/**
 * Full options from user input (defaults + shorthand expansion).
 * @param {object} userOptions
 */
export function resolveOptions(userOptions = {}) {
  return mergeOptions(DEFAULTS, normalizeShorthand(userOptions));
}

/**
 * Series options with defaults filled in (marker options merged).
 * @param {object} seriesOptions
 */
export function resolveSeriesOptions(seriesOptions = {}) {
  const patch = { ...seriesOptions };
  if (typeof patch.marker === 'string') patch.marker = { symbol: patch.marker };
  if (typeof patch.dash === 'string') patch.dash = patch.dash.split(/[\s,]+/).map(Number).filter((n) => n >= 0);
  const merged = mergeOptions(SERIES_DEFAULTS, patch);
  // Data-like fields are passed through untouched (they can be huge arrays).
  for (const key of ['data', 'x', 'y']) {
    if (key in seriesOptions) merged[key] = seriesOptions[key];
  }
  return merged;
}
