/**
 * Draws a line or scatter plot as SVG markup.
 *
 * The layout is fixed: a 720 x 440 px chart with constant margins, a vertical
 * and a horizontal grid, axis lines on the left and bottom, and a title on
 * each axis. Only the axis ranges are automatic.
 *
 * render_chart() is a pure function (data in, SVG text out). It never touches
 * the DOM, so it runs unchanged in Node tests, and the page only has to put
 * the returned string into an element.
 */
import { nice_axis, tick_formatter } from './axis_rendering.js';
import { compute_interpolation_factor } from '../../../libs/custom/math_operations.js';

export const WIDTH = 720;
export const HEIGHT = 440;
const MARGIN = { top: 24, right: 32, bottom: 62, left: 88 };
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Chart colours. The series blue keeps 4.6:1 contrast against the background. */
export const COLORS = {
  background: '#fcfcfb',
  grid: '#e1e0d9',
  axis: '#a8a79f',
  tick_text: '#52514e',
  label_text: '#2b2b29',
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
export function escape_xml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/** Two decimals are plenty for screen coordinates and keep the markup small. */
const num = (value) => Math.round(value * 100) / 100;

/** Align a 1 px line to the pixel grid so it renders crisp instead of blurred over two pixels. */
const crisp = (value) => Math.round(value) + 0.5;

function hairline(class_name, x1, y1, x2, y2, color) {
  return `<line class="${class_name}" x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${color}" stroke-width="1"/>`;
}

function text(class_name, x, y, content, { size, weight = 400, fill, anchor = 'middle', baseline, rotate = 0 }) {
  const position = rotate
    ? `transform="translate(${num(x)} ${num(y)}) rotate(${rotate})"`
    : `x="${num(x)}" y="${num(y)}"`;
  const shift = BASELINE_SHIFT[baseline] ? ` dy="${BASELINE_SHIFT[baseline]}"` : '';
  const bold = weight !== 400 ? ` font-weight="${weight}"` : '';
  return `<text class="${class_name}" ${position}${shift} font-size="${size}"${bold} fill="${fill}" text-anchor="${anchor}">${escape_xml(content)}</text>`;
}

/**
 * Shorten text that would not fit in `max_width` pixels, using the average
 * glyph width of sans-serif fonts (about 0.56 em).
 */
function fit_text(content, max_width, size) {
  const max_chars = Math.floor(max_width / (size * 0.56));
  return content.length > max_chars ? `${content.slice(0, Math.max(1, max_chars - 1))}…` : content;
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
 * `pad_px` pixels of space to the plot edge, so they are not cut in half.
 * The ticks stay on their round values.
 */
function pad_domain([d0, d1], [low, high], span_px, pad_px) {
  const units_per_pixel = (d1 - d0) / span_px;
  const start = (low - d0) / units_per_pixel < pad_px ? low - pad_px * units_per_pixel : d0;
  const stop = (d1 - high) / units_per_pixel < pad_px ? high + pad_px * units_per_pixel : d1;
  return [Math.min(d0, start), Math.max(d1, stop)];
}

/**
 * Draw a chart.
 * @param {object} chart
 * @param {Array<[number, number]>} [chart.points] x/y pairs, drawn in this order
 * @param {'line'|'scatter'} [chart.type]
 * @param {string} [chart.x_label]
 * @param {string} [chart.y_label]
 * @returns {string} a standalone SVG document
 */
export function render_chart({ points = [], type = 'line', x_label = 'x', y_label = 'y' } = {}) {
  const left = MARGIN.left;
  const right = WIDTH - MARGIN.right;
  const top = MARGIN.top;
  const bottom = HEIGHT - MARGIN.bottom;
  const plot_width = right - left;
  const plot_height = bottom - top;
  const has_data = points.length > 0;
  const show_markers = type === 'scatter' || points.length === 1; // one point cannot form a line

  // Automatic axis ranges and ticks.
  const [x_low, x_high] = has_data ? extent(points, 0) : [0, 1];
  const [y_low, y_high] = has_data ? extent(points, 1) : [0, 1];
  const x_axis = nice_axis(x_low, x_high, X_TICKS);
  const y_axis = nice_axis(y_low, y_high, Y_TICKS);
  let x_domain = x_axis.domain;
  let y_domain = y_axis.domain;
  if (show_markers && has_data) {
    const pad_px = MARKER_RADIUS + MARKER_RING + 1;
    x_domain = pad_domain(x_domain, [x_low, x_high], plot_width, pad_px);
    y_domain = pad_domain(y_domain, [y_low, y_high], plot_height, pad_px);
  }
  const map_x = compute_interpolation_factor(x_domain, [left, right]);
  const map_y = compute_interpolation_factor(y_domain, [bottom, top]);
  const format_x = tick_formatter(x_axis.ticks, x_axis.step);
  const format_y = tick_formatter(y_axis.ticks, y_axis.step);

  const parts = [`<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.background}"/>`];

  // Grid. Lines that coincide with the axis lines are left out.
  for (const value of x_axis.ticks) {
    const x = crisp(map_x(value));
    if (x !== crisp(left)) parts.push(hairline('grid-x', x, top, x, bottom, COLORS.grid));
  }
  for (const value of y_axis.ticks) {
    const y = crisp(map_y(value));
    if (y !== crisp(bottom)) parts.push(hairline('grid-y', left, y, right, y, COLORS.grid));
  }

  // Data. Markers paint their ring first (paint-order), so the ring only shows
  // outside the dot and separates overlapping markers.
  if (has_data && show_markers) {
    const circles = points.map(([x, y]) => `<circle cx="${num(map_x(x))}" cy="${num(map_y(y))}" r="${MARKER_RADIUS}"/>`).join('');
    parts.push(`<g class="markers" fill="${COLORS.series}" stroke="${COLORS.background}" stroke-width="${MARKER_RING * 2}" paint-order="stroke">${circles}</g>`);
  } else if (has_data) {
    const coordinates = points.map(([x, y]) => `${num(map_x(x))},${num(map_y(y))}`).join(' ');
    parts.push(`<polyline class="series" points="${coordinates}" fill="none" stroke="${COLORS.series}" stroke-width="${LINE_WIDTH}" stroke-linejoin="round" stroke-linecap="round"/>`);
  } else {
    parts.push(text('empty', left + plot_width / 2, top + plot_height / 2, 'No data', { size: 13, fill: COLORS.tick_text, baseline: 'middle' }));
  }

  // Axis lines, tick labels and axis titles.
  parts.push(hairline('axis', left, crisp(bottom), right, crisp(bottom), COLORS.axis));
  parts.push(hairline('axis', crisp(left), top, crisp(left), bottom, COLORS.axis));
  for (const value of x_axis.ticks) {
    parts.push(text('tick-x', map_x(value), bottom + 8, format_x(value), { size: TICK_FONT, fill: COLORS.tick_text, baseline: 'top' }));
  }
  for (const value of y_axis.ticks) {
    parts.push(text('tick-y', left - 8, map_y(value), format_y(value), { size: TICK_FONT, fill: COLORS.tick_text, anchor: 'end', baseline: 'middle' }));
  }
  parts.push(text('label-x', left + plot_width / 2, bottom + 34, fit_text(String(x_label), plot_width, LABEL_FONT), {
    size: LABEL_FONT, weight: 500, fill: COLORS.label_text, baseline: 'top',
  }));
  parts.push(text('label-y', 18, top + plot_height / 2, fit_text(String(y_label), plot_height, LABEL_FONT), {
    size: LABEL_FONT, weight: 500, fill: COLORS.label_text, baseline: 'top', rotate: -90,
  }));

  // Title and description make the chart readable for screen readers.
  const kind = type === 'scatter' ? 'Scatter plot' : 'Line plot';
  const description = has_data
    ? `${kind} of ${y_label} against ${x_label} with ${points.length} points. `
      + `${x_label} ranges from ${x_low} to ${x_high}, ${y_label} from ${y_low} to ${y_high}.`
    : `${kind} with no data.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" `
    + `role="img" font-family="${escape_xml(FONT_FAMILY)}">`
    + `<title>${escape_xml(`${y_label} vs ${x_label}`)}</title><desc>${escape_xml(description)}</desc>`
    + `${parts.join('')}</svg>`;
}
