/**
 * The page: paste CSV, apply it, pick line or scatter and SVG or Canvas,
 * edit the axis titles, point at the plot to read values, read all plotted
 * values in the data table and download the plot as SVG or PNG.
 */
import { MAX_SERIES, parse_csv, to_series } from '../features/plot_handling/csv_input.js';
import { build_chart, SERIES_COLORS } from '../features/plot_handling/chart_rendering.js';
import { render_canvas } from '../features/plot_handling/canvas_rendering.js';
import { attach_navigation } from '../features/plot_handling/chart_interaction.js';
import { attach_hover } from '../features/plot_handling/hover_tooltip.js';
import { download_blob, download_csv, svg_blob, svg_to_png } from '../features/plot_handling/plot_export.js';
import { clamp_domain } from '../features/plot_handling/viewport.js';

/**
 * Example data shown on first load: two balls thrown straight up, at 20 m/s
 * and at 15 m/s. The slower one lands first, so its last cells are empty.
 */
const SAMPLE_CSV = `Time (s),Ball A,Ball B
0,0,0
0.25,4.69,3.44
0.5,8.78,6.28
0.75,12.24,8.49
1,15.1,10.1
1.25,17.34,11.09
1.5,18.98,11.48
1.75,19.99,11.24
2,20.4,10.4
2.25,20.19,8.94
2.5,19.38,6.88
2.75,17.94,4.19
3,15.9,0.9
3.25,13.24,
3.5,9.98,
3.75,6.09,
4,1.6,`;
/** With several series the y axis has no header to take its title from. */
const SAMPLE_Y_LABEL = 'Height (m)';

/** The table shows at most this many rows; the plot always holds every row. */
const TABLE_LIMIT = 1000;
/** File name of a downloaded plot, without the extension. */
const DOWNLOAD_NAME = 'zeroplot-plot';
/** The largest CSV file read into the textarea. Dense series are condensed when drawn, so this only bounds parsing time. */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Shorthand for document.getElementById.
 * @param {string} id element id
 * @returns {HTMLElement} the element
 */
const $ = (id) => document.getElementById(id);
const csv_input = $('csv');
const file_input = $('file-input');
const x_label_input = $('x-label');
const y_label_input = $('y-label');
const status = $('status');
const tooltip = $('tooltip');

// Dark Mode toggle
const theme_toggle = $('theme-toggle');
const log_toggle = $('log-toggle');
const renderer_toggle = $('renderer-toggle');
const settings = document.querySelector('.settings');
const settings_button = $('settings-button');
const settings_menu = $('settings-menu');

/**
 * Show or hide the settings menu and keep the button's ARIA state in sync.
 * @param {boolean} open true to show the menu
 */
function set_settings_open(open) {
  settings_menu.hidden = !open;
  settings_button.setAttribute('aria-expanded', String(open));
  settings_button.setAttribute('aria-label', open ? 'Close settings' : 'Open settings');
}

settings_button.addEventListener('click', () => {
  set_settings_open(settings_menu.hidden);
});

document.addEventListener('click', (event) => {
  if (!settings_menu.hidden && !settings.contains(event.target)) set_settings_open(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !settings_menu.hidden) {
    set_settings_open(false);
    settings_button.focus();
  }
});

/**
 * The theme in use, read from the page's data-theme attribute.
 * @returns {'light'|'dark'} the theme name
 */
const current_theme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

// Restore the user's previously selected theme
const saved_theme = localStorage.getItem('theme');
const is_dark = saved_theme === 'dark';

document.documentElement.dataset.theme = is_dark ? 'dark' : 'light';
theme_toggle.checked = is_dark;

// Switch themes when the toggle is clicked
theme_toggle.addEventListener('change', () => {
  const theme = theme_toggle.checked ? 'dark' : 'light';

  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  if (data) draw_chart(); // the chart's own colours follow the theme
});

log_toggle.checked = localStorage.getItem('logarithmic-view') === 'true';

/** @type {?module:plot_handling/csv_input~ParsedData} */
let data = null;
let type = 'line';
let renderer = localStorage.getItem('renderer') === 'canvas' ? 'canvas' : 'svg';
let visibility = [];
let viewport = null;
let full_domains = null;
const clip_id = `plot-${crypto.randomUUID()}`;
/** @type {?module:plot_handling/chart_rendering~Chart} */
let chart = null;

function update_renderer_toggle() {
  const using_canvas = renderer === 'canvas';
  renderer_toggle.setAttribute('aria-pressed', String(using_canvas));
  renderer_toggle.setAttribute('aria-label', `Switch to ${using_canvas ? 'SVG' : 'Canvas'} rendering`);
  renderer_toggle.textContent = `Renderer: ${using_canvas ? 'Canvas' : 'SVG'}`;
}

update_renderer_toggle();

const count_text = (count) => count.toLocaleString('en-US');

/**
 * Column headers of the data table: x, then one per series.
 * A single series is named by the y axis title, several by their CSV headers.
 * @returns {string[]} the column titles
 */
function column_headers() {
  const series_names = data.names.length === 1 ? [y_label_input.value || data.names[0]] : data.names;
  return [x_label_input.value || 'x', ...series_names];
}

/** Rebuild the chart from the current data and settings, and put it into the page. */
function draw_chart() {
  const series = to_series(column_headers().slice(1), data.rows);
  chart = build_chart({ series, type, theme: current_theme(), scale: log_toggle.checked ? 'log' : 'linear', visibility, viewport, full_domains, clip_id, x_label: x_label_input.value, y_label: y_label_input.value });
  full_domains ??= chart.full_domains;
  if (renderer === 'canvas') {
    const canvas = document.createElement('canvas');
    render_canvas(chart, canvas);
    $('chart').replaceChildren(canvas);
  } else {
    $('chart').innerHTML = chart.svg;
  }
  tooltip.hidden = true; // it described the previous drawing
  show_status(describe_data());
}

/**
 * Pick black or white text for a background colour, by relative luminance.
 * @param {string} background colour as `#rrggbb`
 * @returns {string} `#0b0b0b` or `#ffffff`
 */
function contrast_text(background) {
  const channels = background.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255);
  const luminance = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, channel) => sum + value * [0.2126, 0.7152, 0.0722][channel], 0);
  return luminance > 0.179 ? '#0b0b0b' : '#ffffff';
}

/** Native controls keep focus while the chart redraws; CSV names are text only. */
function draw_visibility_controls() {
  const controls = data.names.map((name, index) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = visibility[index];
    input.addEventListener('change', () => {
      visibility[index] = input.checked;
      draw_chart();
      const color = SERIES_COLORS[index % SERIES_COLORS.length];
      show_view_hint(`${input.checked ? 'Enabled' : 'Disabled'} ${name} visibility`, color, contrast_text(color));
    });
    const key = document.createElement('span');
    key.className = 'series-key';
    key.style.background = SERIES_COLORS[index % SERIES_COLORS.length];
    key.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = name;
    label.append(input, key, text);
    return label;
  });
  $('series-controls').replaceChildren(...controls);
}

/** Fill the data table with the rows of the current data (at most TABLE_LIMIT rows). */
function draw_table() {
  if (!data.rows.length) {
    const empty = document.createElement('p');
    empty.className = 'table-empty';
    empty.textContent = 'No data to display.';
    $('table').replaceChildren(empty);
    $('table-note').textContent = '0 rows';
    return;
  }
  const table = document.createElement('table');
  const head_row = table.createTHead().insertRow();
  for (const label of column_headers()) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label; // textContent: labels come from pasted data
    head_row.appendChild(cell);
  }
  const body = table.createTBody();
  for (const values of data.rows.slice(0, TABLE_LIMIT)) {
    const row = body.insertRow();
    for (const [column, value] of values.entries()) {
      const cell = row.insertCell();
      if (value === null) continue;
      const button = document.createElement('button');
      button.className = 'table-value';
      button.type = 'button';
      button.title = 'Click to see in the graph';
      button.textContent = String(value);
      button.addEventListener('click', () => center_table_value(values, column));
      cell.appendChild(button);
    }
  }
  $('table').replaceChildren(table);
  $('table-note').textContent = data.rows.length > TABLE_LIMIT
    ? `First ${count_text(TABLE_LIMIT)} of ${count_text(data.rows.length)} rows`
    : `${count_text(data.rows.length)} rows`;
}

/**
 * Move the view so that a value from the data table is centred, and mark it in the chart.
 * @param {Array<?number>} values the table row: x, then one value per series
 * @param {number} column index of the clicked cell in the row (0 = the x value)
 */
function center_table_value(values, column) {
  if (!chart) return;
  if (log_toggle.checked && (values[0] <= 0 || (column > 0 && values[column] <= 0))) {
    show_view_hint('This value cannot be shown in logarithmic view');
    $('chart').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const centered = (axis, value) => {
    const full = chart.full_domains[axis];
    const current_width = chart.viewport[axis][1] - chart.viewport[axis][0];
    const width = Math.min(current_width, (full[1] - full[0]) / 2);
    const coordinate = log_toggle.checked ? Math.log10(value) : value;
    return clamp_domain([coordinate - width / 2, coordinate + width / 2], full);
  };
  viewport = { x: centered('x', values[0]), y: [...chart.viewport.y] };
  if (column > 0) {
    viewport.y = centered('y', values[column]);
    if (!visibility[column - 1]) {
      visibility[column - 1] = true;
      draw_visibility_controls();
    }
  }
  draw_chart();
  const selected_points = highlight_table_value(values, column);
  const headers = column_headers();
  if (column === 0) {
    show_view_hint(`${headers[0]}: ${values[0]}`, undefined, undefined, true);
  } else {
    const color = SERIES_COLORS[(column - 1) % SERIES_COLORS.length];
    show_view_hint(`${headers[column]}: ${values[column]} · ${headers[0]}: ${values[0]}`,
      color, contrast_text(color), true, selected_points[0]);
  }
  $('chart').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function create_chart_overlay(class_name) {
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.classList.add('chart-overlay', class_name);
  overlay.setAttribute('width', chart.width);
  overlay.setAttribute('height', chart.height);
  overlay.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  overlay.setAttribute('aria-hidden', 'true');
  return overlay;
}

function highlight_table_value(values, column) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  if (column === 0) {
    const x = log_toggle.checked ? Math.log10(values[0]) : values[0];
    const [low, high] = chart.viewport.x;
    if (!Number.isFinite(x) || x < low || x > high) return [];
    const { left, right, top, bottom } = chart.plot_area;
    const px = left + (x - low) / (high - low) * (right - left);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', px);
    line.setAttribute('x2', px);
    line.setAttribute('y1', top);
    line.setAttribute('y2', bottom);
    line.setAttribute('stroke', chart.colors.tick_text);
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '5 4');
    group.appendChild(line);
    const overlay = create_chart_overlay('table-selection-marker');
    overlay.appendChild(group);
    $('chart').appendChild(overlay);
    return [];
  }
  const points = chart.hit_points.filter((point) => point.x === values[0]
    && point.series === column - 1 && point.y === values[column]);
  if (!points.length) return [];
  for (const point of points) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', point.px);
    circle.setAttribute('cy', point.py);
    circle.setAttribute('r', '7');
    circle.setAttribute('fill', point.color);
    circle.setAttribute('stroke', chart.colors.background);
    circle.setAttribute('stroke-width', '3');
    group.appendChild(circle);
  }
  const overlay = create_chart_overlay('table-selection-marker');
  overlay.appendChild(group);
  $('chart').appendChild(overlay);
  return points;
}

/**
 * Show a message about the plotted data.
 * @param {string} message the text
 * @param {boolean} [is_error=false] true to style the message as an error
 */
function show_status(message, is_error = false) {
  status.textContent = message;
  status.classList.toggle('status-error', is_error);
}

/**
 * What was plotted, and what happened to the rows and columns that were not.
 * @returns {string} a sentence for each note
 */
function describe_data() {
  const rows_were = (count) => `${count_text(count)} ${count === 1 ? 'row was' : 'rows were'}`;
  const notes = [data.names.length > 1
    ? `${count_text(data.rows.length)} rows plotted in ${data.names.length} series.`
    : `${count_text(data.rows.length)} points plotted.`];
  if (data.skipped) notes.push(`${rows_were(data.skipped)} skipped because x or y is not a number.`);
  if (data.duplicates) notes.push(`${rows_were(data.duplicates)} skipped because an earlier row has the same x.`);
  if (data.reordered) notes.push('The rows were sorted by x.');
  if (data.ignored_columns.length) {
    notes.push(`Not plotted (no numbers, or more than ${MAX_SERIES} series): ${data.ignored_columns.join(', ')}.`);
  }
  if (log_toggle.checked && chart?.excluded_points) {
    const count = chart.excluded_points;
    notes.push(`Logarithmic view: ${count_text(count)} non-positive ${count === 1 ? 'point was' : 'points were'} not plotted.`);
  }
  return notes.join(' ');
}

/** Parse the textarea; on success draw it, on failure keep the last chart and explain. */
function apply_data() {
  let parsed;
  try {
    parsed = parse_csv(csv_input.value);
  } catch (error) {
    show_status(error.message, true);
    return;
  }
  navigation.cancel();
  viewport = null;
  full_domains = null;
  data = parsed;
  visibility = data.names.map(() => true);
  draw_visibility_controls();
  x_label_input.value = data.x_label;
  // Multi-series data has no single Y header, so keep the user's shared title.
  y_label_input.value = data.y_label || y_label_input.value;
  draw_chart();
  draw_table();
}

log_toggle.addEventListener('change', () => {
  localStorage.setItem('logarithmic-view', String(log_toggle.checked));
  if (!data) return;
  navigation.cancel();
  viewport = null;
  full_domains = null;
  draw_chart();
});

$('download-csv').addEventListener('click', () => {
  download_csv(csv_input.value);
  set_settings_open(false);
});

/**
 * Read a CSV file into the textarea and apply it. The hidden file input is
 * clicked by the Load CSV file button; picking a file loads it, cancelling
 * changes nothing.
 */
async function load_file() {
  const picked = file_input.files[0];
  file_input.value = ''; // so picking the same file again fires change again
  if (!picked) return;
  if (picked.size > MAX_FILE_SIZE) {
    show_status(`"${picked.name}" is larger than ${MAX_FILE_SIZE / (1024 * 1024)} MB. Use a smaller CSV file.`, true);
    return;
  }
  try {
    csv_input.value = await picked.text();
  } catch {
    show_status(`"${picked.name}" could not be read.`, true);
    return;
  }
  apply_data();
}

$('apply').addEventListener('click', apply_data);
$('load-file').addEventListener('click', () => file_input.click());
file_input.addEventListener('change', load_file);
csv_input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    apply_data();
  }
});

for (const input of [x_label_input, y_label_input]) {
  input.addEventListener('input', () => {
    if (!data) return;
    draw_chart();
    draw_table();
  });
}

for (const radio of document.querySelectorAll('input[name="plot-type"]')) {
  radio.addEventListener('change', () => {
    type = radio.value;
    if (data) draw_chart();
  });
}

renderer_toggle.addEventListener('click', () => {
  navigation.cancel();
  renderer = renderer === 'svg' ? 'canvas' : 'svg';
  localStorage.setItem('renderer', renderer);
  update_renderer_toggle();
  if (data) draw_chart();
});

// Both downloads use the chart's own markup, not the page, so a hover highlight never ends up in the file.
$('download-svg').addEventListener('click', () => {
  document.querySelector('.download-menu').open = false;
  if (chart) download_blob(`${DOWNLOAD_NAME}.svg`, svg_blob(chart.svg));
});

$('download-png').addEventListener('click', async () => {
  document.querySelector('.download-menu').open = false;
  if (!chart) return;
  try {
    download_blob(`${DOWNLOAD_NAME}.png`, await svg_to_png(chart.svg));
  } catch (error) {
    show_status(error.message, true);
  }
});

/** Hide the tooltip and remove the hover highlight from the chart. */
const clear_hover = () => {
  tooltip.hidden = true;
  $('chart').querySelector('.hover')?.remove();
};
/**
 * Show a short hint about the view (zoom level, limits, selected value).
 * @param {string} message the text; an empty text hides the hint
 * @param {string} [background] hint background colour
 * @param {string} [color] hint text colour
 * @param {boolean} [persistent=false] true to keep the hint until the next one replaces it
 * @param {?module:plot_handling/chart_rendering~HitPoint} [point] chart point the hint points at
 */
const show_view_hint = (message, background = '#1e1e1e', color = '#f5f5f5', persistent = false, point = null) => {
  const hint = $('view-status');
  hint.classList.remove('view-status-visible', 'view-status-persistent', 'view-status-above', 'view-status-below');
  hint.style.removeProperty('left');
  hint.style.removeProperty('top');
  hint.textContent = message;
  hint.style.setProperty('--view-hint-background', background);
  hint.style.setProperty('--view-hint-color', color);
  if (!message) return;
  if (point) {
    const host = $('chart');
    hint.style.left = `${host.offsetLeft + point.px}px`;
    hint.style.top = `${host.offsetTop + point.py}px`;
    hint.classList.add(point.py > (chart.plot_area.top + chart.plot_area.bottom) / 2
      ? 'view-status-above' : 'view-status-below');
  }
  if (persistent) { hint.classList.add('view-status-persistent'); return; }
  void hint.offsetWidth;
  hint.classList.add('view-status-visible');
};
const navigation = attach_navigation($('chart'), $('view-controls'), () => chart, (view) => {
  viewport = view;
  draw_chart();
}, clear_hover, show_view_hint);
attach_hover($('chart'), tooltip, () => !navigation.is_dragging() && chart && { ...chart, type, x_label: x_label_input.value });

csv_input.value = SAMPLE_CSV;
apply_data();
y_label_input.value = SAMPLE_Y_LABEL;
draw_chart();

// Canvas text is rasterized, so repaint once the web font has finished loading.
document.fonts?.ready.then(() => {
  if (renderer === 'canvas' && data) draw_chart();
});
