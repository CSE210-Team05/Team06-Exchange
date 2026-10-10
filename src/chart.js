/**
 * Draws a line or scatter plot as SVG markup.
 *
 * The layout is fixed: a 720 x 440 px chart with constant margins, a vertical
 * and a horizontal grid, axis lines on the left and bottom, and a title on
 * each axis. Only the axis ranges are automatic.
 *
 * renderChart() is a pure function (data in, SVG text out). It never touches
 * the DOM, so it runs unchanged in Node tests, and the page only has to put
 * the returned string into an element.
 */
import { linearScale, niceAxis, tickFormatter } from './axis.js';

export const WIDTH = 720;
export const HEIGHT = 440;
const MARGIN = { top: 24, right: 32, bottom: 62, left: 88 };
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Chart colours. The series blue keeps 4.6:1 contrast against the background. */
export const COLORS = {
  background: '#fcfcfb',
  grid: '#e1e0d9',
  axis: '#a8a79f',
  tickText: '#52514e',
  labelText: '#2b2b29',
  series: '#2a78d6',
};

/** Approximate number of tick intervals per axis. */
const X_TICKS = 8;
const Y_TICKS = 6;
/** Scatter marker radius and the background-coloured ring that separates overlapping markers, in px. */
export const MARKER_RADIUS = 4;
const MARKER_RING = 2;
const LINE_WIDTH = 2;
const TICK_FONT = 11;
const LABEL_FONT = 12;

/**
 * Vertical text alignment as an offset from the alphabetic baseline.
 * `dy` behaves the same in every browser, unlike `dominant-baseline`.
 */
const BASELINE_SHIFT = { top: '0.8em', middle: '0.35em' };

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for SVG content and attributes (axis titles come from pasted data). */
export function escapeXML(text) {
  return String(text).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/** Two decimals are plenty for screen coordinates and keep the markup small. */
const num = (value) => Math.round(value * 100) / 100;

/** Align a 1 px line to the pixel grid so it renders crisp instead of blurred over two pixels. */
const crisp = (value) => Math.round(value) + 0.5;

function hairline(className, x1, y1, x2, y2, color) {
  return `<line class="${className}" x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${color}" stroke-width="1"/>`;
}

function text(className, x, y, content, { size, weight = 400, fill, anchor = 'middle', baseline, rotate = 0 }) {
  const position = rotate
    ? `transform="translate(${num(x)} ${num(y)}) rotate(${rotate})"`
    : `x="${num(x)}" y="${num(y)}"`;
  const shift = BASELINE_SHIFT[baseline] ? ` dy="${BASELINE_SHIFT[baseline]}"` : '';
  const bold = weight !== 400 ? ` font-weight="${weight}"` : '';
  return `<text class="${className}" ${position}${shift} font-size="${size}"${bold} fill="${fill}" text-anchor="${anchor}">${escapeXML(content)}</text>`;
}

/**
 * Shorten text that would not fit in `maxWidth` pixels, using the average
 * glyph width of sans-serif fonts (about 0.56 em).
 */
function fitText(content, maxWidth, size) {
  const maxChars = Math.floor(maxWidth / (size * 0.56));
  return content.length > maxChars ? `${content.slice(0, Math.max(1, maxChars - 1))}…` : content;
}

/** Smallest and largest value of one coordinate (0 = x, 1 = y). */
function extent(points, coordinate) {
  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    low = Math.min(low, point[coordinate]);
    high = Math.max(high, point[coordinate]);
  }
  return [low, high];
}

/**
 * Widen a nice domain just enough that markers at the data extremes keep
 * `padPx` pixels of space to the plot edge, so they are not cut in half.
 * The ticks stay on their round values.
 */
function padDomain([d0, d1], [low, high], spanPx, padPx) {
  const unitsPerPixel = (d1 - d0) / spanPx;
  const start = (low - d0) / unitsPerPixel < padPx ? low - padPx * unitsPerPixel : d0;
  const stop = (d1 - high) / unitsPerPixel < padPx ? high + padPx * unitsPerPixel : d1;
  return [Math.min(d0, start), Math.max(d1, stop)];
}

/**
 * Draw a chart.
 * @param {object} chart
 * @param {Array<[number, number]>} [chart.points] x/y pairs, drawn in this order
 * @param {'line'|'scatter'} [chart.type]
 * @param {string} [chart.xLabel]
 * @param {string} [chart.yLabel]
 * @returns {string} a standalone SVG document
 */
export function renderChart({ points = [], type = 'line', xLabel = 'x', yLabel = 'y' } = {}) {
  const left = MARGIN.left;
  const right = WIDTH - MARGIN.right;
  const top = MARGIN.top;
  const bottom = HEIGHT - MARGIN.bottom;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const hasData = points.length > 0;
  const showMarkers = type === 'scatter' || points.length === 1; // one point cannot form a line

  // Automatic axis ranges and ticks.
  const [xLow, xHigh] = hasData ? extent(points, 0) : [0, 1];
  const [yLow, yHigh] = hasData ? extent(points, 1) : [0, 1];
  const xAxis = niceAxis(xLow, xHigh, X_TICKS);
  const yAxis = niceAxis(yLow, yHigh, Y_TICKS);
  let xDomain = xAxis.domain;
  let yDomain = yAxis.domain;
  if (showMarkers && hasData) {
    const padPx = MARKER_RADIUS + MARKER_RING + 1;
    xDomain = padDomain(xDomain, [xLow, xHigh], plotWidth, padPx);
    yDomain = padDomain(yDomain, [yLow, yHigh], plotHeight, padPx);
  }
  const mapX = linearScale(xDomain, [left, right]);
  const mapY = linearScale(yDomain, [bottom, top]);
  const formatX = tickFormatter(xAxis.ticks, xAxis.step);
  const formatY = tickFormatter(yAxis.ticks, yAxis.step);

  const parts = [`<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.background}"/>`];

  // Grid. Lines that coincide with the axis lines are left out.
  for (const value of xAxis.ticks) {
    const x = crisp(mapX(value));
    if (x !== crisp(left)) parts.push(hairline('grid-x', x, top, x, bottom, COLORS.grid));
  }
  for (const value of yAxis.ticks) {
    const y = crisp(mapY(value));
    if (y !== crisp(bottom)) parts.push(hairline('grid-y', left, y, right, y, COLORS.grid));
  }

  // Data. Markers paint their ring first (paint-order), so the ring only shows
  // outside the dot and separates overlapping markers.
  if (hasData && showMarkers) {
    const circles = points.map(([x, y]) => `<circle cx="${num(mapX(x))}" cy="${num(mapY(y))}" r="${MARKER_RADIUS}"/>`).join('');
    parts.push(`<g class="markers" fill="${COLORS.series}" stroke="${COLORS.background}" stroke-width="${MARKER_RING * 2}" paint-order="stroke">${circles}</g>`);
  } else if (hasData) {
    const coordinates = points.map(([x, y]) => `${num(mapX(x))},${num(mapY(y))}`).join(' ');
    parts.push(`<polyline class="series" points="${coordinates}" fill="none" stroke="${COLORS.series}" stroke-width="${LINE_WIDTH}" stroke-linejoin="round" stroke-linecap="round"/>`);
  } else {
    parts.push(text('empty', left + plotWidth / 2, top + plotHeight / 2, 'No data', { size: 13, fill: COLORS.tickText, baseline: 'middle' }));
  }

  // Axis lines, tick labels and axis titles.
  parts.push(hairline('axis', left, crisp(bottom), right, crisp(bottom), COLORS.axis));
  parts.push(hairline('axis', crisp(left), top, crisp(left), bottom, COLORS.axis));
  for (const value of xAxis.ticks) {
    parts.push(text('tick-x', mapX(value), bottom + 8, formatX(value), { size: TICK_FONT, fill: COLORS.tickText, baseline: 'top' }));
  }
  for (const value of yAxis.ticks) {
    parts.push(text('tick-y', left - 8, mapY(value), formatY(value), { size: TICK_FONT, fill: COLORS.tickText, anchor: 'end', baseline: 'middle' }));
  }
  parts.push(text('label-x', left + plotWidth / 2, bottom + 34, fitText(String(xLabel), plotWidth, LABEL_FONT), {
    size: LABEL_FONT, weight: 500, fill: COLORS.labelText, baseline: 'top',
  }));
  parts.push(text('label-y', 18, top + plotHeight / 2, fitText(String(yLabel), plotHeight, LABEL_FONT), {
    size: LABEL_FONT, weight: 500, fill: COLORS.labelText, baseline: 'top', rotate: -90,
  }));

  // Title and description make the chart readable for screen readers.
  const kind = type === 'scatter' ? 'Scatter plot' : 'Line plot';
  const description = hasData
    ? `${kind} of ${yLabel} against ${xLabel} with ${points.length} points. `
      + `${xLabel} ranges from ${xLow} to ${xHigh}, ${yLabel} from ${yLow} to ${yHigh}.`
    : `${kind} with no data.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" `
    + `role="img" font-family="${escapeXML(FONT_FAMILY)}">`
    + `<title>${escapeXML(`${yLabel} vs ${xLabel}`)}</title><desc>${escapeXML(description)}</desc>`
    + `${parts.join('')}</svg>`;
}
