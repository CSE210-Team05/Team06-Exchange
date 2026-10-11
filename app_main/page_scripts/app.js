/**
 * The page: paste CSV, apply it, pick line or scatter, edit the axis titles,
 * and read the plotted values in the data table.
 */
import { parse_csv } from '../features/plot_handling/csv_input.js';
import { render_chart } from '../features/plot_handling/chart_rendering.js';

/** Example data shown on first load: a ball thrown straight up at 20 m/s. */
const SAMPLE_CSV = `Time (s),Height (m)
0,0
0.25,4.69
0.5,8.78
0.75,12.24
1,15.1
1.25,17.34
1.5,18.98
1.75,19.99
2,20.4
2.25,20.19
2.5,19.38
2.75,17.94
3,15.9
3.25,13.24
3.5,9.98
3.75,6.09
4,1.6`;

/** The table shows at most this many rows; the plot always shows every point. */
const TABLE_LIMIT = 1000;

const $ = (id) => document.getElementById(id);
const csv_input = $('csv');
const x_label_input = $('x-label');
const y_label_input = $('y-label');
const status = $('status');

let points = [];
let type = 'line';

function draw_chart() {
  $('chart').innerHTML = render_chart({ points, type, x_label: x_label_input.value, y_label: y_label_input.value });
}

function draw_table() {
  const table = document.createElement('table');
  const head_row = table.createTHead().insertRow();
  for (const label of [x_label_input.value || 'x', y_label_input.value || 'y']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label; // textContent: labels come from pasted data
    head_row.appendChild(cell);
  }
  const body = table.createTBody();
  for (const [x, y] of points.slice(0, TABLE_LIMIT)) {
    const row = body.insertRow();
    row.insertCell().textContent = String(x);
    row.insertCell().textContent = String(y);
  }
  $('table').replaceChildren(table);
  $('table-note').textContent = points.length > TABLE_LIMIT
    ? `First ${TABLE_LIMIT.toLocaleString('en-US')} of ${points.length.toLocaleString('en-US')} rows`
    : `${points.length.toLocaleString('en-US')} rows`;
}

function show_status(message, is_error = false) {
  status.textContent = message;
  status.classList.toggle('status-error', is_error);
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
  points = parsed.points;
  x_label_input.value = parsed.x_label;
  y_label_input.value = parsed.y_label;

  const notes = [`${points.length.toLocaleString('en-US')} points plotted.`];
  if (parsed.skipped) notes.push(`${parsed.skipped} ${parsed.skipped === 1 ? 'row was' : 'rows were'} skipped because x or y is not a number.`);
  if (parsed.columns > 2) notes.push('Only the first two columns are used.');
  show_status(notes.join(' '));

  draw_chart();
  draw_table();
}

$('apply').addEventListener('click', apply_data);
csv_input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    apply_data();
  }
});

for (const input of [x_label_input, y_label_input]) {
  input.addEventListener('input', () => {
    draw_chart();
    draw_table();
  });
}

for (const radio of document.querySelectorAll('input[name="plot-type"]')) {
  radio.addEventListener('change', () => {
    type = radio.value;
    draw_chart();
  });
}

csv_input.value = SAMPLE_CSV;
apply_data();