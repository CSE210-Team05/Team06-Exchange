/**
 * Draws a line or scatter plot as SVG markup.
 *
 * The layout is fixed: a 720 x 440 px chart with constant margins, a vertical
 * and a horizontal grid, axis lines on the left and bottom, and a title on
 * each axis. Only the axis ranges are automatic. With two or more series a
 * legend sits above the plot, which then starts a little lower.
 *
 * build_chart() is a pure function (data in, SVG text and point positions
 * out). It never touches the DOM, so it runs unchanged in Node tests, and the
 * page only has to put the returned markup into an element.
 */
import { nice_axis, tick_formatter } from './axis_rendering.js';
import { clamp_view } from './viewport.js';
import { compute_interpolation_factor } from '../../../libs/custom/math_operations.js';

export const WIDTH = 720;
export const HEIGHT = 440;
const MARGIN = { top: 24, right: 32, bottom: 62, left: 88 };
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Chart colours. */
export const COLORS = {
  background: '#fcfcfb',
  grid: '#e1e0d9',
  axis: '#a8a79f',
  tick_text: '#52514e',
  label_text: '#2b2b29',
};

/**
 * One colour per series, used in this order (the palette of the first
 * ZeroPlot version). The first blue keeps 4.6:1 contrast against the
 * background. A ninth series starts again with the first colour.
 */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

/** Approximate number of tick intervals per axis. */
const X_TICKS = 8;
const Y_TICKS = 6;
/** Scatter marker radius and the background-coloured ring that separates overlapping markers, in px. */
export const MARKER_RADIUS = 4;
const MARKER_RING = 2;
const LINE_WIDTH = 2;
const TICK_FONT = 11;
const LABEL_FONT = 12;

/** Legend: distance from the chart's top edge, row height, key width and the gaps around them, in px. */
const LEGEND_TOP = 12;
const LEGEND_ROW = 20;
const LEGEND_KEY = 18;
const LEGEND_KEY_GAP = 6;
const LEGEND_ITEM_GAP = 18;
const LEGEND_PLOT_GAP = 10;
const LEGEND_FONT = 12;
/** Longer series names are shortened in the legend. */
const LEGEND_MAX_TEXT = 180;

/** Average glyph width of sans-serif fonts, as a fraction of the font size. */
const GLYPH_WIDTH = 0.56;

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
 * glyph width of sans-serif fonts.
 */
function fit_text(content, max_width, size) {
  const max_chars = Math.floor(max_width / (size * GLYPH_WIDTH));
  return content.length > max_chars ? `${content.slice(0, Math.max(1, max_chars - 1))}…` : content;
}

/** Smallest and largest value of one coordinate (0 = x, 1 = y) over all series. */
function extent(series_list, coordinate) {
  let low = Infinity;
  let high = -Infinity;
  for (const entry of series_list) {
    for (const point of entry.points) {
      low = Math.min(low, point[coordinate]);
      high = Math.max(high, point[coordinate]);
    }
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
 * Arrange the legend entries from left to right, starting a new row when the
 * next entry would not fit into `max_width` pixels. Text widths are estimated
 * from the average glyph width, so no DOM is needed.
 * @param {string[]} names
 * @param {number} max_width
 * @returns {{ rows: number, entries: Array<{ label: string, dx: number, row: number }> }}
 */
function layout_legend(names, max_width) {
  let x = 0;
  let row = 0;
  const entries = names.map((name) => {
    const label = fit_text(name, LEGEND_MAX_TEXT, LEGEND_FONT);
    const width = LEGEND_KEY + LEGEND_KEY_GAP + label.length * LEGEND_FONT * GLYPH_WIDTH;
    if (x > 0 && x + width > max_width) {
      row++;
      x = 0;
    }
    const entry = { label, dx: x, row };
    x += width + LEGEND_ITEM_GAP;
    return entry;
  });
  return { rows: names.length ? row + 1 : 0, entries };
}

/**
 * @typedef {object} HitPoint a drawn data point, for hover feedback
 * @property {number} series position of its series
 * @property {string} name name of its series
 * @property {string} color colour of its series
 * @property {number} x data value
 * @property {number} y data value
 * @property {number} px pixel position in the chart
 * @property {number} py pixel position in the chart
 */

/**
 * @typedef {object} Chart
 * @property {string} svg a standalone SVG document
 * @property {HitPoint[]} hit_points every drawn point, series by series
 * @property {{ left: number, right: number, top: number, bottom: number }} plot_area the area inside the axes, in px
 */

/**
 * Draw a chart and report where its points are.
 * @param {object} chart
 * @param {Array<{ name: string, points: Array<[number, number]> }>} [chart.series] one entry per line or marker group
 * @param {Array<[number, number]>} [chart.points] shorthand for a single series named by `y_label`
 * @param {boolean[]} [chart.visibility] flags by original series index; omitted entries are visible
 * @param {'line'|'scatter'} [chart.type]
 * @param {string} [chart.x_label]
 * @param {string} [chart.y_label]
 * @param {{ x: number[], y: number[] }} [chart.viewport] explicit view, clamped to full domains
 * @param {{ x: number[], y: number[] }} [chart.full_domains] stable padded bounds supplied by the application
 * @param {string} [chart.clip_id] unique per mounted chart; allocated outside this pure renderer
 * @returns {Chart}
 */
export function build_chart({ series, points, type = 'line', x_label = 'x', y_label = 'y', visibility, viewport, full_domains, clip_id } = {}) {
  const series_list = (series ?? [{ name: y_label, points: points ?? [] }]).map((entry, position) => ({
    name: String(entry.name ?? `Series ${position + 1}`),
    points: entry.points ?? [],
    color: SERIES_COLORS[position % SERIES_COLORS.length],
    visible: visibility?.[position] !== false,
    // One point cannot form a line, so it is shown as a marker.
    markers: type === 'scatter' || entry.points?.length === 1,
  }));
  const point_count = series_list.reduce((sum, entry) => sum + entry.points.length, 0);
  const has_data = point_count > 0;
  const visible_series = series_list.filter((entry) => entry.visible);
  const all_hidden = series_list.length > 0 && !visible_series.length;
  const visible_count = visible_series.reduce((sum, entry) => sum + entry.points.length, 0);
  const show_markers = series_list.some((entry) => entry.markers && entry.points.length > 0);

  const left = MARGIN.left;
  const right = WIDTH - MARGIN.right;
  const plot_width = right - left;
  const legend = layout_legend((series_list.length > 1 || visibility !== undefined) ? series_list.map((entry) => entry.name) : [], plot_width);
  const top = legend.rows ? LEGEND_TOP + legend.rows * LEGEND_ROW + LEGEND_PLOT_GAP : MARGIN.top;
  const bottom = HEIGHT - MARGIN.bottom;
  const plot_height = bottom - top;

  // Automatic axis ranges and ticks.
  const [x_low, x_high] = has_data ? extent(series_list, 0) : [0, 1];
  const [y_low, y_high] = has_data ? extent(series_list, 1) : [0, 1];
  let x_axis = nice_axis(x_low, x_high, X_TICKS);
  let y_axis = nice_axis(y_low, y_high, Y_TICKS);
  let x_domain = x_axis.domain;
  let y_domain = y_axis.domain;
  if (show_markers) {
    const pad_px = MARKER_RADIUS + MARKER_RING + 1;
    x_domain = pad_domain(x_domain, [x_low, x_high], plot_width, pad_px);
    y_domain = pad_domain(y_domain, [y_low, y_high], plot_height, pad_px);
  }
  const full = full_domains ? clamp_view(full_domains, full_domains) : { x: x_domain, y: y_domain };
  const view = clamp_view(viewport, full);
  [x_domain, y_domain] = [view.x, view.y];
  if (viewport) {
    const viewport_axis = (domain, count) => {
      const axis = nice_axis(...domain, count);
      return { ...axis, ticks: axis.ticks.filter((value) => value >= domain[0] && value <= domain[1]) };
    };
    x_axis = viewport_axis(x_domain, X_TICKS);
    y_axis = viewport_axis(y_domain, Y_TICKS);
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

  // Data: all lines first, then all markers on top. Markers paint their ring
  // first (paint-order), so the ring only shows outside the dot and separates
  // overlapping markers.
  const lines = [];
  const markers = [];
  /** @type {HitPoint[]} */
  const hit_points = [];
  series_list.forEach((entry, position) => {
    if (!entry.visible || !entry.points.length) return;
    const pixels = entry.points.map(([x, y]) => [num(map_x(x)), num(map_y(y))]);
    entry.points.forEach(([x, y], index) => {
      if (x < x_domain[0] || x > x_domain[1] || y < y_domain[0] || y > y_domain[1]) return;
      hit_points.push({ series: position, name: entry.name, color: entry.color, x, y, px: pixels[index][0], py: pixels[index][1] });
    });
    if (entry.markers) {
      const circles = pixels.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="${MARKER_RADIUS}"/>`).join('');
      markers.push(`<g class="markers" fill="${entry.color}" stroke="${COLORS.background}" stroke-width="${MARKER_RING * 2}" paint-order="stroke">${circles}</g>`);
    } else {
      const coordinates = pixels.map(([px, py]) => `${px},${py}`).join(' ');
      lines.push(`<polyline class="series" points="${coordinates}" fill="none" stroke="${entry.color}" stroke-width="${LINE_WIDTH}" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
  });
  // Keep all line vertices, including those outside the view, so crossing segments survive.
  // Without a caller ID, a nested SVG provides local rectangular clipping without global IDs.
  const clip = clip_id ? ` clip-path="url(#${escape_xml(clip_id)})"` : '';
  if (clip_id) parts.push(`<defs><clipPath id="${escape_xml(clip_id)}"><rect x="${left}" y="${top}" width="${plot_width}" height="${plot_height}"/></clipPath></defs>`);
  parts.push(clip_id ? `<g class="data"${clip}>` : `<svg class="data" x="${left}" y="${top}" width="${plot_width}" height="${plot_height}" viewBox="${left} ${top} ${plot_width} ${plot_height}" overflow="hidden">`, ...lines, ...markers, clip_id ? '</g>' : '</svg>');
  if (all_hidden || !has_data) {
    parts.push(text('empty', left + plot_width / 2, top + plot_height / 2, all_hidden ? 'No series selected' : 'No data', { size: 13, fill: COLORS.tick_text, baseline: 'middle' }));
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

  // Legend: a short line or a dot in the series colour, then the series name.
  legend.entries.forEach((entry, position) => {
    const { color, markers: as_marker, visible } = series_list[position];
    parts.push(`<g class="legend-entry"${visible ? '' : ' opacity="0.45" text-decoration="line-through"'}>`);
    const x = left + entry.dx;
    const y = LEGEND_TOP + entry.row * LEGEND_ROW + LEGEND_ROW / 2;
    parts.push(as_marker
      ? `<circle class="legend-key" cx="${num(x + LEGEND_KEY / 2)}" cy="${num(y)}" r="${MARKER_RADIUS}" fill="${color}"/>`
      : `<line class="legend-key" x1="${num(x)}" y1="${num(y)}" x2="${num(x + LEGEND_KEY)}" y2="${num(y)}" stroke="${color}" stroke-width="${LINE_WIDTH}" stroke-linecap="round"/>`);
    parts.push(text('legend-label', x + LEGEND_KEY + LEGEND_KEY_GAP, y, entry.label, {
      size: LEGEND_FONT, fill: COLORS.tick_text, anchor: 'start', baseline: 'middle',
    }));
    parts.push('</g>');
  });

  // Title and description make the chart readable for screen readers.
  const kind = type === 'scatter' ? 'Scatter plot' : 'Line plot';
  const several = series_list.length > 1;
  const names = visible_series.map((entry) => entry.name).join(', ');
  const subject = several ? names : y_label;
  let description = `${kind} with no data.`;
  if (all_hidden) description = `${kind}. No series selected. 0 visible points.`;
  else if (has_data) {
    description = `${kind} of ${several ? `${visible_series.length} series (${names})` : y_label} against ${x_label} with ${visible_count} points. `
      + `${x_label} ranges from ${x_low} to ${x_high}, ${several ? 'the values' : y_label} from ${y_low} to ${y_high}.`;
  }

  if (viewport) description += ` Viewport: ${x_label} ${x_domain[0]} to ${x_domain[1]}; ${y_label} ${y_domain[0]} to ${y_domain[1]}.`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" `
    + `role="img" font-family="${escape_xml(FONT_FAMILY)}">`
    + `<title>${escape_xml(`${subject} vs ${x_label}`)}</title><desc>${escape_xml(description)}</desc>`
    + `${parts.join('')}</svg>`;
  return { svg, hit_points, full_domains: full, viewport: view, clip_id, plot_area: { left, right, top, bottom } };
}

/**
 * Draw a chart (see build_chart for the options).
 * @param {object} [chart]
 * @returns {string} a standalone SVG document
 */
export function render_chart(chart) {
  return build_chart(chart).svg;
}
