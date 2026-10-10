/**
 * Scene builder: options + data -> a list of drawing primitives.
 *
 * This is the heart of the library. It decides scales, layout, ticks,
 * legend placement and the geometry of every mark, but it never touches the
 * DOM. The result is a plain data structure that the SVG renderer turns into
 * markup and the canvas renderer turns into draw calls, which is what keeps
 * both outputs identical.
 *
 * Primitive types (all coordinates in CSS pixels):
 *   rect    { x, y, width, height, fill, stroke, strokeWidth, radius }
 *   line    { x1, y1, x2, y2, stroke, strokeWidth, dash }
 *   path    { path: Path, fill, fillOpacity, stroke, strokeWidth, dash }
 *   text    { x, y, text, font, fill, anchor, baseline, rotate }
 *   markers { symbol, xs, ys, size, sizes, fill, fillOpacity, ring, ringColor }
 *   group   { clip, children }
 * Every primitive may carry a `className` (used by SVG output for styling hooks).
 */
import { createScale } from '../core/scale.js';
import { resolveFormat } from '../core/format.js';
import { finiteExtent, toNumeric } from '../core/data.js';
import { areaPath, decimateM4, linePath } from '../core/curves.js';
import { SYMBOLS, symbolPath } from '../core/symbols.js';
import { measureText, truncateText } from '../core/text.js';
import { DAY } from '../core/time.js';

/** Gap between tick labels and the plot area, in px. */
const TICK_GAP = 8;
/** Height of one legend row, in px. */
const LEGEND_ROW = 20;
/** Width of the legend key glyph (line / marker), in px. */
const LEGEND_KEY = 18;
const LEGEND_KEY_GAP = 6;
const LEGEND_ITEM_GAP = 18;
/** Minimum free space between neighbouring x tick labels, in px. */
const MIN_LABEL_GAP = 14;
/** Draw markers one by one (with separating rings) up to this many points. */
const INDIVIDUAL_MARKER_LIMIT = 2500;

/**
 * Marker opacity that keeps dense scatter plots readable: fully opaque up to
 * ~300 points, fading to 0.3 at ~30,000 points so overlaps reveal density.
 * @param {number} count
 */
export function densityOpacity(count) {
  const t = (Math.log10(Math.max(1, count)) - 2.5) / 2;
  return 1 - 0.7 * Math.min(1, Math.max(0, t));
}

function normalizePadding(padding) {
  if (typeof padding === 'number') return { top: padding, right: padding, bottom: padding, left: padding };
  return { top: 16, right: 16, bottom: 16, left: 16, ...(padding || {}) };
}

/**
 * Attach resolved styling (colour, symbol, marker settings) to each series.
 * Colours are assigned by the series' position in the options, never by
 * visibility, so hiding one series does not repaint the others.
 */
export function styleSeries(seriesList, theme) {
  const scatterCount = seriesList.filter((series) => series.type === 'scatter').length;
  let scatterOrdinal = 0;
  return seriesList.map((series) => {
    const options = series.options;
    const marker = options.marker || {};
    const color = options.color
      || (series.index < theme.palette.length ? theme.palette[series.index] : theme.overflow);
    const markers = options.markers ?? series.type === 'scatter';

    // With more than three scatter series, colour alone is not reliably
    // distinguishable for every reader, so shape becomes a second channel.
    let symbol = marker.symbol || 'auto';
    if (symbol === 'auto') {
      symbol = series.type === 'scatter' && scatterCount > 3 ? SYMBOLS[scatterOrdinal % SYMBOLS.length] : 'circle';
    }
    if (series.type === 'scatter') scatterOrdinal++;

    let markerOpacity = marker.opacity ?? 'auto';
    if (markerOpacity === 'auto') markerOpacity = series.type === 'scatter' ? densityOpacity(series.length) : 1;

    return {
      ...series,
      color,
      markers,
      symbol,
      markerSize: typeof marker.size === 'number' ? marker.size : 8,
      markerOpacity,
      ring: marker.ring ?? 2,
      lineWidth: options.lineWidth ?? 2,
      dash: Array.isArray(options.dash) && options.dash.length ? options.dash : null,
      curve: options.curve || 'linear',
      area: Boolean(options.area) && series.type === 'line',
      areaOpacity: options.areaOpacity ?? 0.1,
      opacity: options.opacity ?? 1,
      showLine: series.type === 'line',
    };
  });
}

/**
 * Pick 'time' when the data are dates, unless a scale type was requested.
 * @param {string} requested
 * @param {object[]} seriesList
 * @param {'xIsTime'|'yIsTime'} flag
 */
function resolveScaleType(requested, seriesList, flag) {
  if (requested === 'linear' || requested === 'log' || requested === 'time') return requested;
  const withData = seriesList.filter((series) => series.length > 0);
  return withData.length > 0 && withData.every((series) => series[flag]) ? 'time' : 'linear';
}

/** Combined [min, max] of one channel over several series, or null. */
function combinedExtent(seriesList, key, positiveOnly) {
  let low = Infinity;
  let high = -Infinity;
  for (const series of seriesList) {
    const extent = finiteExtent(series[key], positiveOnly);
    if (!extent) continue;
    low = Math.min(low, extent[0]);
    high = Math.max(high, extent[1]);
  }
  return low <= high ? [low, high] : null;
}

/** A sensible non-degenerate domain when the data cannot provide one. */
function fallbackExtent(type, extent) {
  if (!extent) {
    if (type === 'log') return [1, 10];
    if (type === 'time') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return [today.getTime() - 7 * DAY, today.getTime()];
    }
    return [0, 1];
  }
  const [low, high] = extent;
  if (low !== high) return extent;
  // A single distinct value: open up a window around it.
  if (type === 'log') return [low / Math.sqrt(10), low * Math.sqrt(10)];
  if (type === 'time') return [low - DAY / 2, low + DAY / 2];
  const delta = Math.abs(low) * 0.1 || 1;
  return [low - delta, low + delta];
}

/**
 * Build the scale for one axis.
 * @param {object} config
 * @param {'linear'|'log'|'time'} config.type
 * @param {object} config.axis axis options
 * @param {[number, number]} config.extent data extent (already non-degenerate)
 * @param {[number, number]|null} config.view zoom/pan override
 * @param {[number, number]} config.range pixel range
 * @param {number} config.count tick count used for nicing
 * @param {number} config.padPx keep markers this many px away from the edges
 * @param {boolean} config.nice
 */
function makeScale({ type, axis, extent, view, range, count, padPx, nice }) {
  const scale = createScale(type, [0, 1], range);
  if (view) {
    scale.domain = view;
    return scale;
  }
  let [low, high] = extent;
  const userMin = axis.min == null ? NaN : toNumeric(axis.min)[0];
  const userMax = axis.max == null ? NaN : toNumeric(axis.max)[0];
  const validMin = Number.isFinite(userMin) && (type !== 'log' || userMin > 0);
  const validMax = Number.isFinite(userMax) && (type !== 'log' || userMax > 0);
  if (validMin) low = userMin;
  if (validMax) high = userMax;
  if (!(high > low)) [low, high] = fallbackExtent(type, [low, low]);

  scale.domain = [low, high];
  let stepHint = 0;
  if (nice && !(validMin && validMax)) {
    scale.nice(count);
    stepHint = scale.tickStepHint;
    const [niceLow, niceHigh] = scale.domain;
    scale.domain = [validMin ? userMin : niceLow, validMax ? userMax : niceHigh];
  }

  // Keep markers at the extremes `padPx` away from the edge so they are not
  // cut in half. This runs after nicing: the ticks stay on round values and
  // the axis simply extends a few pixels past the outermost tick. The
  // padding is computed in the scale's working space, so it is a constant
  // number of pixels on log axes too. (Repeated because widening the domain
  // slightly changes the pixels-per-unit ratio.)
  const spanPx = Math.abs(range[1] - range[0]);
  if (padPx > 0 && spanPx > 4 * padPx) {
    const dataLow = scale.transform(extent[0]);
    const dataHigh = scale.transform(extent[1]);
    for (let iteration = 0; iteration < 3; iteration++) {
      const [d0, d1] = scale.domain;
      const t0 = scale.transform(d0);
      const t1 = scale.transform(d1);
      const unitsPerPixel = (t1 - t0) / spanPx;
      let next0 = t0;
      let next1 = t1;
      if (!validMin && (dataLow - t0) / unitsPerPixel < padPx) next0 = dataLow - padPx * unitsPerPixel;
      if (!validMax && (t1 - dataHigh) / unitsPerPixel < padPx) next1 = dataHigh + padPx * unitsPerPixel;
      if (next0 === t0 && next1 === t1) break;
      scale.domain = [scale.untransform(next0), scale.untransform(next1)];
    }
  }
  // Setting the domain clears the hint; restore it so ticks keep the nice step.
  scale.tickStepHint = stepHint;
  return scale;
}

/**
 * Ticks and their labels for a scale.
 * @returns {{ major: number[], minor: number[], labels: string[] }}
 */
function axisTicks(scale, axis, count) {
  const { major, minor } = scale.ticks(count);
  const [low, high] = scale.domain;
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const tolerance = (hi - lo) * 1e-9;
  const inside = (value) => value >= lo - tolerance && value <= hi + tolerance;
  const majorInside = major.filter(inside);
  const step = majorInside.length > 1 ? Math.abs(majorInside[1] - majorInside[0]) : 0;
  const formatter = resolveFormat(axis).tick(majorInside, step, scale.tickFormatter(majorInside));
  return { major: majorInside, minor: minor.filter(inside), labels: majorInside.map((value) => formatter(value)) };
}

/** True when neighbouring labels (centred at `positions`) collide. */
function labelsCollide(positions, widths, gap) {
  for (let index = 1; index < positions.length; index++) {
    const previousRight = positions[index - 1] + widths[index - 1] / 2;
    const currentLeft = positions[index] - widths[index] / 2;
    if (currentLeft < previousRight + gap) return true;
  }
  return false;
}

/**
 * Arrange legend entries in rows (top/bottom) or a column (right).
 * @returns {{ width: number, height: number, entries: object[] }}
 */
function layoutLegend(items, position, maxWidth, font) {
  const maxText = Math.max(40, maxWidth - LEGEND_KEY - LEGEND_KEY_GAP);
  const entries = items.map((item) => {
    const label = truncateText(item.name, maxText, font);
    const width = LEGEND_KEY + LEGEND_KEY_GAP + measureText(label, font);
    return { ...item, label, width };
  });
  if (position === 'right') {
    entries.forEach((entry, row) => {
      entry.dx = 0;
      entry.dy = row * LEGEND_ROW;
    });
    return {
      width: entries.reduce((widest, entry) => Math.max(widest, entry.width), 0),
      height: entries.length * LEGEND_ROW,
      entries,
    };
  }
  let x = 0;
  let row = 0;
  let width = 0;
  for (const entry of entries) {
    if (x > 0 && x + entry.width > maxWidth) {
      row++;
      x = 0;
    }
    entry.dx = x;
    entry.dy = row * LEGEND_ROW;
    x += entry.width + LEGEND_ITEM_GAP;
    width = Math.max(width, x - LEGEND_ITEM_GAP);
  }
  return { width, height: entries.length ? (row + 1) * LEGEND_ROW : 0, entries };
}

/** Primitives for one legend key: a line, a marker, or both. */
function legendKey(series, x, centerY, theme) {
  const nodes = [];
  if (series.showLine) {
    nodes.push({
      type: 'line', x1: x, y1: centerY, x2: x + LEGEND_KEY, y2: centerY,
      stroke: series.color, strokeWidth: 2, dash: series.dash, lineCap: 'round',
    });
  }
  if (series.markers || !series.showLine) {
    nodes.push({
      type: 'path', path: symbolPath(series.symbol, x + LEGEND_KEY / 2, centerY, 8),
      fill: series.color, stroke: series.showLine ? theme.background : null, strokeWidth: 3, paintOrder: 'stroke',
    });
  }
  return nodes;
}

/**
 * Index range [first, last] of a sorted series that falls inside
 * [low, high], widened by one point on each side so lines still run off
 * the edge of the plot instead of stopping short.
 * @param {Float64Array} xs ascending, all finite
 */
function visibleRange(xs, low, high) {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const middle = (lo + hi) >> 1;
    if (xs[middle] < low) lo = middle + 1;
    else hi = middle;
  }
  const first = Math.max(0, lo - 1);
  lo = first;
  hi = xs.length;
  while (lo < hi) {
    const middle = (lo + hi) >> 1;
    if (xs[middle] <= high) lo = middle + 1;
    else hi = middle;
  }
  const last = Math.min(xs.length - 1, lo);
  return [first, last];
}

/** Short accessible summary of the chart's content (used as the SVG <desc>). */
function describe(visible, dataExtent, format, kind) {
  if (!visible.length || !dataExtent.x || !dataExtent.y) return `${kind} with no visible data.`;
  const seriesText = visible.map((series) => `${series.name} (${series.length} points)`).join(', ');
  const [x0, x1] = dataExtent.x;
  const [y0, y1] = dataExtent.y;
  return `${kind} with ${visible.length} series: ${seriesText}. `
    + `X values range from ${format.x(x0)} to ${format.x(x1)}, Y values from ${format.y(y0)} to ${format.y(y1)}.`;
}

/**
 * @typedef {object} Scene
 * @property {number} width
 * @property {number} height
 * @property {string} background
 * @property {string} title accessible title
 * @property {string} description accessible description
 * @property {object[]} nodes drawing primitives
 * @property {{x: number, y: number, width: number, height: number}} plotArea
 * @property {{x: import('../core/scale.js').LinearScale, y: import('../core/scale.js').LinearScale}} scales
 * @property {{x: (v: number) => string, y: (v: number) => string}} format value formatters for tooltips
 * @property {object[]} series visible series with pixel coordinates (for hit testing)
 * @property {object[]} legend clickable legend boxes
 * @property {object} theme
 */

/**
 * Build the scene for one frame.
 * @param {object} input
 * @param {object} input.options resolved plot options
 * @param {import('../core/data.js').NormalizedSeries[]} input.series
 * @param {object} input.theme
 * @param {number} input.width
 * @param {number} input.height
 * @param {{x: [number, number]|null, y: [number, number]|null}} [input.view]
 * @param {Set<string>} [input.hidden] keys of hidden series
 * @returns {Scene}
 */
export function buildScene({ options, series, theme, width, height, view = { x: null, y: null }, hidden = new Set() }) {
  const pad = normalizePadding(options.padding);
  const sizes = theme.fontSize;
  const font = (size, weight = 400) => ({ size, weight, family: theme.fontFamily });
  const tickFont = font(sizes.tick);
  const labelFont = font(sizes.axisLabel, 500);
  const legendFont = font(sizes.legend);

  const styled = styleSeries(series, theme);
  const visible = styled.filter((entry) => !hidden.has(entry.key));
  const anyMarkers = visible.some((entry) => entry.markers);
  const kind = styled.length && styled.every((entry) => entry.type === 'scatter') ? 'Scatter plot'
    : styled.length && styled.every((entry) => entry.type === 'line') ? 'Line chart' : 'Chart';

  const xType = resolveScaleType(options.x.scale, styled, 'xIsTime');
  const yType = resolveScaleType(options.y.scale, styled, 'yIsTime');

  // Data extents (log axes ignore values <= 0, which cannot be placed).
  let xExtent = combinedExtent(visible, 'xs', xType === 'log');
  let yExtent = combinedExtent(visible, 'ys', yType === 'log');
  const hasData = Boolean(xExtent && yExtent);
  const dataExtent = { x: xExtent, y: yExtent };
  if (yExtent && yType !== 'log' && (options.y.zero || visible.some((entry) => entry.area))) {
    yExtent = [Math.min(yExtent[0], 0), Math.max(yExtent[1], 0)];
  }
  if (xExtent && xType !== 'log' && options.x.zero) xExtent = [Math.min(xExtent[0], 0), Math.max(xExtent[1], 0)];
  xExtent = fallbackExtent(xType, xExtent);
  yExtent = fallbackExtent(yType, yExtent);

  // Markers must not be cut in half at the plot edge: keep their radius
  // (plus the separating ring) inside the plot area.
  const markerPad = anyMarkers
    ? Math.max(...visible.filter((entry) => entry.markers).map((entry) => {
      const largest = entry.sizes ? entry.sizes.reduce((max, value) => Math.max(max, value), 0) : entry.markerSize;
      return largest / 2 + entry.ring + 1;
    }))
    : 0;
  const xNice = options.x.nice === 'auto' ? anyMarkers || !visible.length : Boolean(options.x.nice);
  const yNice = options.y.nice === 'auto' ? true : Boolean(options.y.nice);

  const nodes = [];
  nodes.push({ type: 'rect', x: 0, y: 0, width, height, fill: theme.background, className: 'zp-background' });

  // ---------------------------------------------------------------- titles
  let top = pad.top;
  const titleNodes = [];
  if (options.title) {
    titleNodes.push({
      type: 'text', x: pad.left, y: top, text: truncateText(String(options.title), width - pad.left - pad.right, font(sizes.title, 600)),
      font: font(sizes.title, 600), fill: theme.text, anchor: 'start', baseline: 'top', className: 'zp-title',
    });
    top += sizes.title * 1.35;
  }
  if (options.subtitle) {
    titleNodes.push({
      type: 'text', x: pad.left, y: top, text: truncateText(String(options.subtitle), width - pad.left - pad.right, font(sizes.subtitle)),
      font: font(sizes.subtitle), fill: theme.textSecondary, anchor: 'start', baseline: 'top', className: 'zp-subtitle',
    });
    top += sizes.subtitle * 1.4;
  }
  if (titleNodes.length) top += 10;
  nodes.push(...titleNodes);

  // ---------------------------------------------------------------- legend
  const legendSetting = options.legend.show;
  const showLegend = legendSetting === 'auto' ? styled.length >= 2 : Boolean(legendSetting) && styled.length > 0;
  const legendPosition = ['top', 'right', 'bottom'].includes(options.legend.position) ? options.legend.position : 'top';
  let legend = null;
  if (showLegend) {
    const available = legendPosition === 'right'
      ? Math.min(220, (width - pad.left - pad.right) * 0.32)
      : width - pad.left - pad.right;
    legend = layoutLegend(styled.map((entry) => ({ key: entry.key, name: entry.name, series: entry })), legendPosition, available, legendFont);
  }

  const legendTopY = top;
  if (legend && legendPosition === 'top') top += legend.height + 10;
  // Leave room for the upper half of the topmost y tick label.
  top = Math.max(top, pad.top + sizes.tick * 0.6);

  const xTickHeight = sizes.tick * 1.2;
  let bottom = pad.bottom + TICK_GAP + xTickHeight;
  if (options.x.label) bottom += 8 + sizes.axisLabel * 1.2;
  if (legend && legendPosition === 'bottom') bottom += legend.height + 12;

  let right = pad.right + (legend && legendPosition === 'right' ? legend.width + 20 : 0);
  const plotTop = top;
  const plotHeight = Math.max(10, height - top - bottom);
  const plotBottom = plotTop + plotHeight;

  // ---------------------------------------------------------------- y axis
  const yCount = options.y.ticks ?? Math.max(2, Math.min(10, Math.round(plotHeight / 56)));
  const yScale = makeScale({
    type: yType, axis: options.y, extent: yExtent, view: view.y, range: [plotBottom, plotTop],
    count: yCount, padPx: hasData ? markerPad : 0, nice: yNice,
  });
  const yTicks = axisTicks(yScale, options.y, yCount);
  const yLabelWidth = yTicks.labels.reduce((widest, label) => Math.max(widest, measureText(label, tickFont)), 0);
  const yTitleSpace = options.y.label ? sizes.axisLabel * 1.2 + 10 : 0;
  const left = pad.left + yTitleSpace + yLabelWidth + TICK_GAP;

  // ---------------------------------------------------------------- x axis
  // Choose the tick count so labels never collide; widen the right margin
  // if the last label would stick out of the chart.
  let xScale;
  let xTicks;
  let plotWidth = Math.max(10, width - left - right);
  let xCount = options.x.ticks ?? Math.max(2, Math.round(plotWidth / 90));
  for (let attempt = 0; attempt < 14; attempt++) {
    plotWidth = Math.max(10, width - left - right);
    xScale = makeScale({
      type: xType, axis: options.x, extent: xExtent, view: view.x, range: [left, left + plotWidth],
      count: xCount, padPx: hasData ? markerPad : 0, nice: xNice,
    });
    xTicks = axisTicks(xScale, options.x, xCount);
    const positions = xTicks.major.map((value) => xScale.map(value));
    const widths = xTicks.labels.map((label) => measureText(label, tickFont));
    if (labelsCollide(positions, widths, MIN_LABEL_GAP) && xCount > 2) {
      xCount = Math.max(2, Math.floor(xCount * 0.75));
      continue;
    }
    const lastIndex = positions.length - 1;
    const overflow = lastIndex >= 0 ? positions[lastIndex] + widths[lastIndex] / 2 - (width - pad.right) : 0;
    if (overflow > 0.5 && attempt < 13) {
      right += Math.ceil(overflow);
      continue;
    }
    break;
  }
  const plotArea = { x: left, y: plotTop, width: plotWidth, height: plotHeight };
  const plotRight = left + plotWidth;

  const format = {
    x: (value) => resolveFormat(options.x).value(value, xScale.valueFormatter()),
    y: (value) => resolveFormat(options.y).value(value, yScale.valueFormatter()),
  };

  // ---------------------------------------------------------------- grid & axes
  const crisp = (value) => Math.round(value) + 0.5;
  const gridNodes = [];
  if (options.y.grid) {
    for (const value of yTicks.minor) {
      const y = crisp(yScale.map(value));
      gridNodes.push({ type: 'line', x1: left, y1: y, x2: plotRight, y2: y, stroke: theme.gridMinor, strokeWidth: 1, className: 'zp-grid-minor' });
    }
    for (const value of yTicks.major) {
      const y = crisp(yScale.map(value));
      if (options.x.line && Math.abs(y - crisp(plotBottom)) < 1) continue;
      gridNodes.push({ type: 'line', x1: left, y1: y, x2: plotRight, y2: y, stroke: theme.grid, strokeWidth: 1, className: 'zp-grid' });
    }
  }
  if (options.x.grid) {
    for (const value of xTicks.minor) {
      const x = crisp(xScale.map(value));
      gridNodes.push({ type: 'line', x1: x, y1: plotTop, x2: x, y2: plotBottom, stroke: theme.gridMinor, strokeWidth: 1, className: 'zp-grid-minor' });
    }
    for (const value of xTicks.major) {
      const x = crisp(xScale.map(value));
      if (options.y.line && Math.abs(x - crisp(left)) < 1) continue;
      gridNodes.push({ type: 'line', x1: x, y1: plotTop, x2: x, y2: plotBottom, stroke: theme.grid, strokeWidth: 1, className: 'zp-grid' });
    }
  }
  nodes.push(...gridNodes);

  // Zero lines are stronger than the grid: they carry meaning (sign change).
  // They are skipped when zero only sits inside the marker padding, where a
  // rule would just look like a stray axis.
  const zeroPixel = (scale, type, start, end) => {
    if (type !== 'linear') return null;
    const position = scale.map(0);
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    return position > lo + markerPad + 1 && position < hi - markerPad - 1 ? position : null;
  };
  const [xLow, xHigh] = xScale.domain;
  const zeroY = zeroPixel(yScale, yType, plotTop, plotBottom);
  if (zeroY !== null) {
    nodes.push({ type: 'line', x1: left, y1: crisp(zeroY), x2: plotRight, y2: crisp(zeroY), stroke: theme.axis, strokeWidth: 1, className: 'zp-zero' });
  }
  const zeroX = zeroPixel(xScale, xType, left, plotRight);
  if (zeroX !== null) {
    nodes.push({ type: 'line', x1: crisp(zeroX), y1: plotTop, x2: crisp(zeroX), y2: plotBottom, stroke: theme.axis, strokeWidth: 1, className: 'zp-zero' });
  }

  // ---------------------------------------------------------------- annotations (under the data)
  const annotationNodes = [];
  for (const note of options.annotations || []) {
    const kind = note.type || (note.x !== undefined ? 'vline' : 'hline');
    const raw = note.value ?? (kind === 'vline' ? note.x : note.y);
    const [value] = toNumeric(raw);
    if (!Number.isFinite(value)) continue;
    const stroke = note.color || theme.textMuted;
    const dash = note.dash === undefined ? [4, 4] : note.dash;
    const noteFont = font(sizes.annotation);
    if (kind === 'vline') {
      const x = xScale.map(value);
      if (x < left - 0.5 || x > plotRight + 0.5) continue;
      annotationNodes.push({ type: 'line', x1: crisp(x), y1: plotTop, x2: crisp(x), y2: plotBottom, stroke, strokeWidth: 1, dash, className: 'zp-annotation' });
      if (note.label) {
        annotationNodes.push({ type: 'text', x: x + 5, y: plotTop + 4, text: String(note.label), font: noteFont, fill: theme.textSecondary, anchor: 'start', baseline: 'top', halo: theme.background, className: 'zp-annotation-label' });
      }
    } else {
      const y = yScale.map(value);
      if (y < plotTop - 0.5 || y > plotBottom + 0.5) continue;
      annotationNodes.push({ type: 'line', x1: left, y1: crisp(y), x2: plotRight, y2: crisp(y), stroke, strokeWidth: 1, dash, className: 'zp-annotation' });
      if (note.label) {
        annotationNodes.push({ type: 'text', x: plotRight - 4, y: y - 4, text: String(note.label), font: noteFont, fill: theme.textSecondary, anchor: 'end', baseline: 'bottom', halo: theme.background, className: 'zp-annotation-label' });
      }
    }
  }

  // ---------------------------------------------------------------- data
  const areaNodes = [];
  const lineNodes = [];
  const markerNodes = [];
  const hitSeries = [];
  const [visibleXLow, visibleXHigh] = [Math.min(xLow, xHigh), Math.max(xLow, xHigh)];

  // Baseline for area fills: zero when it is on screen, otherwise the nearer edge.
  let baselineY = plotBottom;
  if (yType !== 'log') {
    const zeroY = yScale.map(0);
    baselineY = Math.min(plotBottom, Math.max(plotTop, zeroY));
  }

  for (const entry of visible) {
    // Only project the part of a sorted series that can be on screen.
    let [first, last] = [0, entry.length - 1];
    if (entry.sorted && entry.length > 2) [first, last] = visibleRange(entry.xs, visibleXLow, visibleXHigh);
    const count = Math.max(0, last - first + 1);
    const px = new Float64Array(count);
    const py = new Float64Array(count);
    for (let offset = 0; offset < count; offset++) {
      const index = first + offset;
      px[offset] = xScale.map(entry.xs[index]);
      py[offset] = yScale.map(entry.ys[index]);
    }

    // Lines with far more points than pixels are reduced with M4 first.
    let lineX = px;
    let lineY = py;
    if (entry.showLine && entry.sorted && count > plotWidth * 4) {
      const reduced = decimateM4(px, py, 1);
      lineX = reduced.xs;
      lineY = reduced.ys;
    }

    if (entry.area) {
      areaNodes.push({
        type: 'path', path: areaPath(lineX, lineY, baselineY, entry.curve), fill: entry.color,
        fillOpacity: entry.areaOpacity * entry.opacity, className: 'zp-area', seriesKey: entry.key,
      });
    }
    if (entry.showLine && entry.lineWidth > 0) {
      lineNodes.push({
        type: 'path', path: linePath(lineX, lineY, entry.curve), fill: null, stroke: entry.color,
        strokeWidth: entry.lineWidth, strokeOpacity: entry.opacity, dash: entry.dash,
        lineJoin: 'round', lineCap: 'round', className: 'zp-line', seriesKey: entry.key,
      });
    }

    // Hit-test data: finite points that are inside (or just around) the plot.
    const hitX = [];
    const hitY = [];
    const hitIndex = [];
    const hitSize = [];
    const margin = entry.markers ? entry.markerSize : 0;
    for (let offset = 0; offset < count; offset++) {
      const x = px[offset];
      const y = py[offset];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < left - margin || x > plotRight + margin || y < plotTop - margin || y > plotBottom + margin) continue;
      const index = first + offset;
      if (entry.sizes && !(entry.sizes[index] > 0)) continue;
      hitX.push(x);
      hitY.push(y);
      hitIndex.push(index);
      hitSize.push(entry.sizes ? entry.sizes[index] : entry.markerSize);
    }

    if (entry.markers && hitX.length) {
      markerNodes.push({
        type: 'markers', symbol: entry.symbol, xs: hitX, ys: hitY,
        size: entry.markerSize, sizes: entry.sizes ? hitSize : null,
        fill: entry.color, fillOpacity: entry.markerOpacity * entry.opacity,
        ring: entry.ring, ringColor: theme.background,
        individual: hitX.length <= INDIVIDUAL_MARKER_LIMIT, className: 'zp-markers', seriesKey: entry.key,
      });
    }

    hitSeries.push({
      key: entry.key, index: entry.index, name: entry.name, type: entry.type, color: entry.color,
      symbol: entry.symbol, markers: entry.markers, showLine: entry.showLine, sorted: entry.sorted,
      xs: hitX, ys: hitY, indices: hitIndex, sizes: hitSize, source: entry,
    });
  }

  nodes.push({
    type: 'group', clip: plotArea, className: 'zp-data',
    children: [...annotationNodes.filter((node) => node.type === 'line'), ...areaNodes, ...lineNodes, ...markerNodes],
  });
  nodes.push(...annotationNodes.filter((node) => node.type === 'text'));

  if (!hasData) {
    nodes.push({
      type: 'text', x: left + plotWidth / 2, y: plotTop + plotHeight / 2, text: styled.length ? 'No visible data' : 'No data',
      font: font(13), fill: theme.textMuted, anchor: 'middle', baseline: 'middle', className: 'zp-empty',
    });
  }

  // Axis rules are drawn after the data so lines never paint over them.
  if (options.x.line) {
    nodes.push({ type: 'line', x1: left, y1: crisp(plotBottom), x2: plotRight, y2: crisp(plotBottom), stroke: theme.axis, strokeWidth: 1, className: 'zp-axis' });
  }
  if (options.y.line) {
    nodes.push({ type: 'line', x1: crisp(left), y1: plotTop, x2: crisp(left), y2: plotBottom, stroke: theme.axis, strokeWidth: 1, className: 'zp-axis' });
  }

  // ---------------------------------------------------------------- tick labels
  xTicks.major.forEach((value, position) => {
    nodes.push({
      type: 'text', x: xScale.map(value), y: plotBottom + TICK_GAP, text: xTicks.labels[position],
      font: tickFont, fill: theme.textSecondary, anchor: 'middle', baseline: 'top', className: 'zp-tick-label zp-x',
    });
  });
  yTicks.major.forEach((value, position) => {
    nodes.push({
      type: 'text', x: left - TICK_GAP, y: yScale.map(value), text: yTicks.labels[position],
      font: tickFont, fill: theme.textSecondary, anchor: 'end', baseline: 'middle', className: 'zp-tick-label zp-y',
    });
  });

  // ---------------------------------------------------------------- axis titles
  if (options.x.label) {
    nodes.push({
      type: 'text', x: left + plotWidth / 2, y: plotBottom + TICK_GAP + xTickHeight + 8,
      text: truncateText(String(options.x.label), plotWidth, labelFont), font: labelFont, fill: theme.textSecondary,
      anchor: 'middle', baseline: 'top', className: 'zp-axis-label zp-x',
    });
  }
  if (options.y.label) {
    nodes.push({
      type: 'text', x: pad.left, y: plotTop + plotHeight / 2,
      text: truncateText(String(options.y.label), plotHeight, labelFont), font: labelFont, fill: theme.textSecondary,
      anchor: 'middle', baseline: 'top', rotate: -90, className: 'zp-axis-label zp-y',
    });
  }

  // ---------------------------------------------------------------- legend
  const legendBoxes = [];
  if (legend) {
    let originX = pad.left;
    let originY = legendTopY;
    if (legendPosition === 'bottom') originY = height - pad.bottom - legend.height;
    if (legendPosition === 'right') {
      originX = width - pad.right - legend.width;
      originY = plotTop;
    }
    for (const entry of legend.entries) {
      const isHidden = hidden.has(entry.key);
      const x = originX + entry.dx;
      const y = originY + entry.dy;
      const centerY = y + LEGEND_ROW / 2;
      nodes.push({
        type: 'group', clip: null, opacity: isHidden ? 0.35 : 1, className: 'zp-legend-item',
        children: [
          ...legendKey(entry.series, x, centerY, theme),
          {
            type: 'text', x: x + LEGEND_KEY + LEGEND_KEY_GAP, y: centerY, text: entry.label, font: legendFont,
            fill: theme.textSecondary, anchor: 'start', baseline: 'middle', className: 'zp-legend-label',
          },
        ],
      });
      legendBoxes.push({
        key: entry.key, index: entry.series.index, name: entry.name, hidden: isHidden,
        x: x - 4, y, width: entry.width + 8, height: LEGEND_ROW,
      });
    }
  }

  const scales = { x: xScale, y: yScale };
  return {
    width,
    height,
    background: theme.background,
    title: options.title ? String(options.title) : kind,
    description: options.description || describe(visible, dataExtent, format, kind),
    nodes,
    plotArea,
    scales,
    format,
    series: hitSeries,
    legend: legendBoxes,
    theme,
    kind,
  };
}
