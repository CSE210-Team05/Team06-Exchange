/**
 * The page: paste CSV, apply it, pick line or scatter, edit the axis titles,
 * and read the plotted values in the data table.
 */
import { parseCSV } from '../src/csv.js';
import { renderChart } from '../src/chart.js';

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
const csvInput = $('csv');
const xLabelInput = $('x-label');
const yLabelInput = $('y-label');
const status = $('status');

let points = [];
let type = 'line';

function drawChart() {
  $('chart').innerHTML = renderChart({ points, type, xLabel: xLabelInput.value, yLabel: yLabelInput.value });
}

function drawTable() {
  const table = document.createElement('table');
  const headRow = table.createTHead().insertRow();
  for (const label of [xLabelInput.value || 'x', yLabelInput.value || 'y']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label; // textContent: labels come from pasted data
    headRow.appendChild(cell);
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

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('status-error', isError);
}

/** Parse the textarea; on success draw it, on failure keep the last chart and explain. */
function applyData() {
  let parsed;
  try {
    parsed = parseCSV(csvInput.value);
  } catch (error) {
    showStatus(error.message, true);
    return;
  }
  points = parsed.points;
  xLabelInput.value = parsed.xLabel;
  yLabelInput.value = parsed.yLabel;

  const notes = [`${points.length.toLocaleString('en-US')} points plotted.`];
  if (parsed.skipped) notes.push(`${parsed.skipped} ${parsed.skipped === 1 ? 'row was' : 'rows were'} skipped because x or y is not a number.`);
  if (parsed.columns > 2) notes.push('Only the first two columns are used.');
  showStatus(notes.join(' '));

  drawChart();
  drawTable();
}

$('apply').addEventListener('click', applyData);
csvInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    applyData();
  }
});

for (const input of [xLabelInput, yLabelInput]) {
  input.addEventListener('input', () => {
    drawChart();
    drawTable();
  });
}

for (const radio of document.querySelectorAll('input[name="plot-type"]')) {
  radio.addEventListener('change', () => {
    type = radio.value;
    drawChart();
  });
}

csvInput.value = SAMPLE_CSV;
applyData();