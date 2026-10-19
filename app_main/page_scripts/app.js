/**
 * The page: paste CSV, apply it, pick line or scatter, edit the axis titles,
 * point at the plot to read values, read all plotted values in the data
 * table and download the plot as SVG or PNG.
 */
import { MAX_SERIES, parse_csv, to_series } from '../features/plot_handling/csv_input.js';
import { build_chart, SERIES_COLORS } from '../features/plot_handling/chart_rendering.js';
import { attach_navigation } from '../features/plot_handling/chart_interaction.js';
import { attach_hover } from '../features/plot_handling/hover_tooltip.js';
import { download_blob, download_csv, svg_blob, svg_to_png } from '../features/plot_handling/plot_export.js';

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
/** The largest CSV file read into the textarea, roughly 1 MB of text. */
const MAX_FILE_SIZE = 1024 * 1024;

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
const settings = document.querySelector('.settings');
const settings_button = $('settings-button');
const settings_menu = $('settings-menu');

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
});

log_toggle.checked = localStorage.getItem('logarithmic-view') === 'true';

/** @type {import('../features/plot_handling/csv_input.js').ParsedData | null} */
let data = null;
let type = 'line';
let visibility = [];
let viewport = null;
let full_domains = null;
const clip_id = `plot-${crypto.randomUUID()}`;
/** @type {import('../features/plot_handling/chart_rendering.js').Chart | null} */
let chart = null;

const count_text = (count) => count.toLocaleString('en-US');

/**
 * Column headers of the data table: x, then one per series.
 * A single series is named by the y axis title, several by their CSV headers.
 */
function column_headers() {
  const series_names = data.names.length === 1 ? [y_label_input.value || data.names[0]] : data.names;
  return [x_label_input.value || 'x', ...series_names];
}

function draw_chart() {
  const series = to_series(column_headers().slice(1), data.rows);
  chart = build_chart({ series, type, scale: log_toggle.checked ? 'log' : 'linear', visibility, viewport, full_domains, clip_id, x_label: x_label_input.value, y_label: y_label_input.value });
  full_domains ??= chart.full_domains;
  $('chart').innerHTML = chart.svg;
  tooltip.hidden = true; // it described the previous drawing
  show_status(describe_data());
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

function draw_table() {
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
    for (const value of values) row.insertCell().textContent = value === null ? '' : String(value);
  }
  $('table').replaceChildren(table);
  $('table-note').textContent = data.rows.length > TABLE_LIMIT
    ? `First ${count_text(TABLE_LIMIT)} of ${count_text(data.rows.length)} rows`
    : `${count_text(data.rows.length)} rows`;
}

function show_status(message, is_error = false) {
  status.textContent = message;
  status.classList.toggle('status-error', is_error);
}

/** What was plotted, and what happened to the rows and columns that were not. */
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
  y_label_input.value = data.y_label;
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
    show_status(`"${picked.name}" is larger than 1 MB. Paste smaller CSV data instead.`, true);
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

// Both downloads use the chart's own markup, not the page, so a hover highlight never ends up in the file.
$('download-svg').addEventListener('click', () => {
  if (chart) download_blob(`${DOWNLOAD_NAME}.svg`, svg_blob(chart.svg));
});

$('download-png').addEventListener('click', async () => {
  if (!chart) return;
  try {
    download_blob(`${DOWNLOAD_NAME}.png`, await svg_to_png(chart.svg));
  } catch (error) {
    show_status(error.message, true);
  }
});

const clear_hover = () => {
  tooltip.hidden = true;
  $('chart').querySelector('.hover')?.remove();
};
const navigation = attach_navigation($('chart'), $('view-controls'), () => chart, (view) => {
  viewport = view;
  draw_chart();
}, clear_hover);
attach_hover($('chart'), tooltip, () => !navigation.is_dragging() && chart && { ...chart, type, x_label: x_label_input.value });

csv_input.value = SAMPLE_CSV;
apply_data();
y_label_input.value = SAMPLE_Y_LABEL;
draw_chart();
