/**
 * Scene builder: points + settings -> a list of drawing primitives.
 *
 * The layout is fixed: a 720 x 440 px chart with constant margins, a vertical
 * and a horizontal grid, axis lines on the left and bottom, and an axis title
 * on each axis. Only the scales are automatic. The scene never touches the
 * DOM, so the SVG and canvas renderers draw exactly the same picture from it.
 *
 * Primitives (coordinates in pixels):
 *   rect     { x, y, width, height, fill }
 *   line     { x1, y1, x2, y2, stroke }               1 px hairline
 *   polyline { points: [x0, y0, x1, y1, ...], stroke, width }
 *   circles  { xs, ys, r, fill, ring, ringColor }      scatter markers
 *   text     { x, y, text, size, weight, fill, anchor, baseline, rotate }
 */
import { linearScale, niceAxis } from './scale.js';
import { tickFormatter } from './format.js';

export const WIDTH = 720;
export const HEIGHT = 440;
export const MARGIN = { top: 24, right: 32, bottom: 62, left: 88 };
export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

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
/** Scatter marker radius and the background-coloured ring around it, in px. */
const MARKER_RADIUS = 4;
const MARKER_RING = 2;
const LINE_WIDTH = 2;
const TICK_FONT = 11;
const LABEL_FONT = 12;

/**
 * Shorten text that would not fit in `maxWidth` pixels. Uses the average
 * glyph width of sans-serif fonts (~0.56 em), which is close enough for
 * axis titles and keeps the layout independent of the browser.
 */
function fitText(text, maxWidth, size) {
  const maxChars = Math.floor(maxWidth / (size * 0.56));
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text;
}

/** Smallest and largest value of one coordinate. */
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
 * `padPx` pixels of space to the plot edge (so they are not cut in half).
 * The ticks stay on their round values.
 */
function padDomain([d0, d1], [low, high], spanPx, padPx) {
  const unitsPerPixel = (d1 - d0) / spanPx;
  const start = (low - d0) / unitsPerPixel < padPx ? low - padPx * unitsPerPixel : d0;
  const stop = (d1 - high) / unitsPerPixel < padPx ? high + padPx * unitsPerPixel : d1;
  return [Math.min(d0, start), Math.max(d1, stop)];
}

/** Align a 1 px line to the pixel grid so it renders crisp, not blurred over two pixels. */
const crisp = (value) => Math.round(value) + 0.5;

/**
 * @typedef {object} SceneInput
 * @property {Array<[number, number]>} points
 * @property {'line'|'scatter'} [type]
 * @property {string} [xLabel]
 * @property {string} [yLabel]
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * Build the primitives for one chart.
 * @param {SceneInput} input
 */
export function buildScene({ points = [], type = 'line', xLabel = 'x', yLabel = 'y', width = WIDTH, height = HEIGHT }) {
  const plot = {
    x: MARGIN.left,
    y: MARGIN.top,
    width: width - MARGIN.left - MARGIN.right,
    height: height - MARGIN.top - MARGIN.bottom,
  };
  const left = plot.x;
  const right = plot.x + plot.width;
  const top = plot.y;
  const bottom = plot.y + plot.height;
  const hasData = points.length > 0;

  // ------------------------------------------------------------ automatic scales
  const [xLow, xHigh] = hasData ? extent(points, 0) : [0, 1];
  const [yLow, yHigh] = hasData ? extent(points, 1) : [0, 1];
  const xAxis = niceAxis(xLow, xHigh, X_TICKS);
  const yAxis = niceAxis(yLow, yHigh, Y_TICKS);
  let xDomain = xAxis.domain;
  let yDomain = yAxis.domain;
  if (type === 'scatter' && hasData) {
    const padPx = MARKER_RADIUS + MARKER_RING + 1;
    xDomain = padDomain(xDomain, [xLow, xHigh], plot.width, padPx);
    yDomain = padDomain(yDomain, [yLow, yHigh], plot.height, padPx);
  }
  const mapX = linearScale(xDomain, [left, right]);
  const mapY = linearScale(yDomain, [bottom, top]);
  const formatX = tickFormatter(xAxis.ticks, xAxis.step);
  const formatY = tickFormatter(yAxis.ticks, yAxis.step);

  const nodes = [{ type: 'rect', x: 0, y: 0, width, height, fill: COLORS.background }];

  // ------------------------------------------------------------ grid
  // Grid lines that coincide with the axis lines are left out.
  for (const value of xAxis.ticks) {
    const x = crisp(mapX(value));
    if (Math.abs(x - crisp(left)) < 1) continue;
    nodes.push({ type: 'line', x1: x, y1: top, x2: x, y2: bottom, stroke: COLORS.grid, role: 'grid-x' });
  }
  for (const value of yAxis.ticks) {
    const y = crisp(mapY(value));
    if (Math.abs(y - crisp(bottom)) < 1) continue;
    nodes.push({ type: 'line', x1: left, y1: y, x2: right, y2: y, stroke: COLORS.grid, role: 'grid-y' });
  }

  // ------------------------------------------------------------ data
  // A single point cannot form a line, so it is drawn as a marker in both modes.
  if (hasData && (type === 'scatter' || points.length === 1)) {
    nodes.push({
      type: 'circles',
      xs: points.map(([x]) => mapX(x)),
      ys: points.map(([, y]) => mapY(y)),
      r: MARKER_RADIUS,
      fill: COLORS.series,
      ring: MARKER_RING,
      ringColor: COLORS.background,
    });
  } else if (hasData) {
    nodes.push({
      type: 'polyline',
      points: points.flatMap(([x, y]) => [mapX(x), mapY(y)]),
      stroke: COLORS.series,
      width: LINE_WIDTH,
    });
  } else {
    nodes.push({
      type: 'text', x: left + plot.width / 2, y: top + plot.height / 2, text: 'No data',
      size: 13, weight: 400, fill: COLORS.tickText, anchor: 'middle', baseline: 'middle',
    });
  }

  // ------------------------------------------------------------ axes
  nodes.push({ type: 'line', x1: left, y1: crisp(bottom), x2: right, y2: crisp(bottom), stroke: COLORS.axis, role: 'axis' });
  nodes.push({ type: 'line', x1: crisp(left), y1: top, x2: crisp(left), y2: bottom, stroke: COLORS.axis, role: 'axis' });

  for (const value of xAxis.ticks) {
    const x = mapX(value);
    if (x < left - 0.5 || x > right + 0.5) continue;
    nodes.push({
      type: 'text', x, y: bottom + 8, text: formatX(value), size: TICK_FONT, weight: 400,
      fill: COLORS.tickText, anchor: 'middle', baseline: 'top', role: 'tick-x',
    });
  }
  for (const value of yAxis.ticks) {
    const y = mapY(value);
    if (y < top - 0.5 || y > bottom + 0.5) continue;
    nodes.push({
      type: 'text', x: left - 8, y, text: formatY(value), size: TICK_FONT, weight: 400,
      fill: COLORS.tickText, anchor: 'end', baseline: 'middle', role: 'tick-y',
    });
  }

  nodes.push({
    type: 'text', x: left + plot.width / 2, y: bottom + 34, text: fitText(String(xLabel), plot.width, LABEL_FONT),
    size: LABEL_FONT, weight: 500, fill: COLORS.labelText, anchor: 'middle', baseline: 'top', role: 'label-x',
  });
  nodes.push({
    type: 'text', x: 18, y: top + plot.height / 2, text: fitText(String(yLabel), plot.height, LABEL_FONT),
    size: LABEL_FONT, weight: 500, fill: COLORS.labelText, anchor: 'middle', baseline: 'top', rotate: -90, role: 'label-y',
  });

  const kind = type === 'scatter' ? 'Scatter plot' : 'Line plot';
  const description = hasData
    ? `${kind} of ${yLabel} against ${xLabel} with ${points.length} points. `
      + `${xLabel} ranges from ${xLow} to ${xHigh}, ${yLabel} from ${yLow} to ${yHigh}.`
    : `${kind} with no data.`;

  return { width, height, plot, nodes, xDomain, yDomain, xTicks: xAxis.ticks, yTicks: yAxis.ticks, title: `${yLabel} vs ${xLabel}`, description };
}
