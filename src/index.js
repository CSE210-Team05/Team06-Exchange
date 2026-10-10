/**
 * ZeroPlot - a dependency-free plotting library for line and scatter plots.
 *
 *   import { Plot, scatter, line } from './src/index.js';
 *
 *   line('#chart', [[0, 1], [1, 3], [2, 2]], { title: 'Hello' });
 *
 * The pieces below the Plot class are exported too, so the scales, tick
 * generators and renderers can be reused (or tested) on their own.
 */
import { Plot } from './plot.js';
import { isPlainObject } from './core/options.js';

export const VERSION = '1.0.0';

export { Plot };
export { buildScene, styleSeries, densityOpacity } from './scene/build.js';
export { renderSVG, escapeXML } from './render/svg.js';
export { renderCanvas, paintCanvas } from './render/canvas.js';
export { LinearScale, LogScale, TimeScale, createScale } from './core/scale.js';
export { linearTicks, logTicks, niceDomain, tickStep, decimalsOf } from './core/ticks.js';
export { timeTicks, formatTimeTick, formatTimeFull, niceTimeDomain } from './core/time.js';
export { formatNumber, formatCompact, linearTickFormatter, resolveFormat, MINUS } from './core/format.js';
export { linePath, areaPath, decimateM4, finiteRuns, CURVES } from './core/curves.js';
export { SYMBOLS, appendSymbol, symbolPath } from './core/symbols.js';
export { Path, toSVGPathData } from './core/path.js';
export { normalizeSeries, toNumeric, parseDate } from './core/data.js';
export { DEFAULTS, SERIES_DEFAULTS, resolveOptions, mergeOptions } from './core/options.js';
export { themes, resolveTheme, PALETTE_LIGHT, PALETTE_DARK } from './core/theme.js';

/**
 * True when `data` is a list of series objects rather than a list of points.
 * @param {unknown} data
 */
function isSeriesList(data) {
  if (!Array.isArray(data) || !data.length) return false;
  const first = data[0];
  return isPlainObject(first) && (Array.isArray(first.data) || Array.isArray(first.y) || ArrayBuffer.isView(first.y));
}

function toSeries(data) {
  if (data == null) return [];
  if (isSeriesList(data)) return data;
  if (isPlainObject(data) && (Array.isArray(data.data) || Array.isArray(data.y))) return [data];
  return [{ data }];
}

/**
 * Quick scatter plot.
 * @param {string|HTMLElement} target container or selector
 * @param {unknown} data points ([[x, y], ...], [{x, y}, ...]) or a list of series ([{ name, data }, ...])
 * @param {object} [options] any Plot option
 * @returns {Plot}
 */
export function scatter(target, data, options = {}) {
  return new Plot(target, { ...options, type: 'scatter', series: options.series ?? toSeries(data) });
}

/**
 * Quick line plot.
 * @param {string|HTMLElement} target container or selector
 * @param {unknown} data points ([[x, y], ...], [y0, y1, ...]) or a list of series
 * @param {object} [options] any Plot option
 * @returns {Plot}
 */
export function line(target, data, options = {}) {
  return new Plot(target, { ...options, type: 'line', series: options.series ?? toSeries(data) });
}
