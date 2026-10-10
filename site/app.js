/**
 * Plot builder: CSV in, interactive plot + reproducible code out.
 *
 * The page keeps one `state` object, turns it into ZeroPlot options with
 * buildOptions(), and hands those to a single Plot instance. The same
 * options object is printed in the Code tab, so the code shown is exactly
 * the code that drew the chart.
 */
import { Plot, SYMBOLS, resolveOptions, resolveTheme } from '../src/index.js';
import { DATASETS } from './datasets.js';
import { columnTypes, parseCSV, toObjects } from './csv.js';
import { setupThemeToggle } from './theme.js';

const $ = (id) => document.getElementById(id);

/** Most columns we turn into series; the palette has eight colours. */
const MAX_SERIES = 8;
/** Rows shown in the data table tab. */
const TABLE_ROWS = 400;

const CURVE_LABELS = {
  linear: 'Straight',
  monotone: 'Smooth (monotone)',
  step: 'Step',
  'step-before': 'Step before',
  'step-after': 'Step after',
};
const SYMBOL_LABELS = {
  auto: 'Automatic',
  circle: 'Circle',
  square: 'Square',
  triangle: 'Triangle',
  diamond: 'Diamond',
  cross: 'Cross',
  plus: 'Plus',
  star: 'Star',
  'triangle-down': 'Triangle down',
};

const state = {
  datasetId: DATASETS[0].id,
  csvText: '',
  headers: [],
  types: {},
  rows: [],
  mapping: { x: '', y: [], group: '' },
  options: null,
  /** Per-series style overrides keyed by series name. */
  styles: {},
};

let plot = null;
let exportUrl = null;

// ------------------------------------------------------------------ helpers

/** Marker for code that should be printed verbatim (not as a string literal). */
class RawCode {
  constructor(code) {
    this.code = code;
  }
}

const quote = (text) => `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const isIdentifier = (key) => /^[A-Za-z_$][\w$]*$/.test(key);

/**
 * Print a value as JavaScript source (objects with unquoted keys, single-quoted strings).
 * @param {unknown} value
 * @param {number} depth indentation level
 */
function toCode(value, depth = 0) {
  const indent = '  '.repeat(depth);
  const inner = '  '.repeat(depth + 1);
  if (value instanceof RawCode) return value.code;
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== 'object')) return `[${value.map((item) => toCode(item)).join(', ')}]`;
    return `[\n${value.map((item) => `${inner}${toCode(item, depth + 1)},`).join('\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
    if (!entries.length) return '{}';
    const flat = entries.every(([, entry]) => entry === null || typeof entry !== 'object' || entry instanceof RawCode);
    const parts = entries.map(([key, entry]) => `${isIdentifier(key) ? key : quote(key)}: ${toCode(entry, depth + 1)}`);
    const oneLine = `{ ${parts.join(', ')} }`;
    if (flat && oneLine.length + indent.length < 96) return oneLine;
    return `{\n${parts.map((part) => `${inner}${part},`).join('\n')}\n${indent}}`;
  }
  return 'undefined';
}

function datasetById(id) {
  return DATASETS.find((dataset) => dataset.id === id);
}

function defaultOptions() {
  return {
    type: 'line',
    renderer: 'svg',
    title: '',
    subtitle: '',
    legend: 'top',
    height: 420,
    x: { label: '', scale: 'auto', grid: true },
    y: { label: '', scale: 'auto', grid: true, zero: false, min: null, max: null },
  };
}

function distinctValues(column, limit = Infinity) {
  const values = [];
  const seen = new Set();
  for (const row of state.rows) {
    const value = row[column];
    if (value === null || value === undefined || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
    if (values.length > limit) break;
  }
  return values;
}

// ------------------------------------------------------------------ data

/**
 * Parse CSV text into state. Returns an error message or ''.
 * @param {string} text
 * @param {{x: string, y: string[], group: string}} [mapping] preferred mapping
 */
function loadCSV(text, mapping) {
  const { headers, rows } = parseCSV(text);
  if (headers.length < 2) return 'The data needs a header row and at least two columns.';
  if (!rows.length) return 'The data has a header row but no values below it.';
  const types = columnTypes(headers, rows);
  const plottable = headers.filter((header) => types[header] !== 'text');
  if (plottable.length < 2) return 'At least two columns must contain numbers or dates. Check that the first row holds the column names.';

  state.csvText = text;
  state.headers = headers;
  state.types = types;
  state.rows = toObjects(headers, rows, types);

  // Keep the current mapping where it still fits the new columns.
  const wanted = mapping || state.mapping;
  const xOk = plottable.includes(wanted.x);
  const x = xOk ? wanted.x : headers.find((header) => types[header] === 'date') || plottable[0];
  let y = (wanted.y || []).filter((header) => header !== x && types[header] === 'number');
  if (!y.length) y = headers.filter((header) => header !== x && types[header] === 'number').slice(0, MAX_SERIES);
  const group = wanted.group && headers.includes(wanted.group) && wanted.group !== x ? wanted.group : '';
  state.mapping = { x, y, group };
  return '';
}

/** The series to draw: one per Y column, or one per Y column and group value. */
function seriesDefinitions() {
  const { x, y, group } = state.mapping;
  const definitions = [];
  if (group) {
    const groups = distinctValues(group, MAX_SERIES);
    for (const column of y) {
      for (const value of groups) {
        definitions.push({
          name: y.length > 1 ? `${value} (${column})` : String(value),
          x,
          y: column,
          rows: state.rows.filter((row) => row[group] === value),
          code: `rows.filter((row) => row[${quote(group)}] === ${typeof value === 'number' ? value : quote(value)})`,
        });
      }
    }
  } else {
    for (const column of y) definitions.push({ name: column, x, y: column, rows: state.rows, code: 'rows' });
  }
  return definitions.slice(0, MAX_SERIES);
}

function styleFor(name) {
  if (!state.styles[name]) state.styles[name] = {};
  return state.styles[name];
}

/**
 * Options for the current state, containing only values that differ from
 * the library defaults so the printed code stays short.
 * @param {boolean} forCode replace data arrays with the code that produces them
 */
function buildOptions(forCode = false) {
  const settings = state.options;
  const options = { type: settings.type };
  if (settings.renderer !== 'svg') options.renderer = settings.renderer;
  options.height = settings.height;
  if (settings.title) options.title = settings.title;
  if (settings.subtitle) options.subtitle = settings.subtitle;

  const x = {};
  if (settings.x.label) x.label = settings.x.label;
  if (settings.x.scale !== 'auto') x.scale = settings.x.scale;
  if (!settings.x.grid) x.grid = false;
  const y = {};
  if (settings.y.label) y.label = settings.y.label;
  if (settings.y.scale !== 'auto') y.scale = settings.y.scale;
  if (settings.y.zero) y.zero = true;
  if (Number.isFinite(settings.y.min)) y.min = settings.y.min;
  if (Number.isFinite(settings.y.max)) y.max = settings.y.max;
  if (!settings.y.grid) y.grid = false;
  if (Object.keys(x).length) options.x = x;
  if (Object.keys(y).length) options.y = y;
  if (settings.legend === 'none') options.legend = false;
  else if (settings.legend !== 'top') options.legend = settings.legend;

  options.series = seriesDefinitions().map((definition) => {
    const style = styleFor(definition.name);
    const series = {
      name: definition.name,
      data: forCode ? new RawCode(definition.code) : definition.rows,
      x: definition.x,
      y: definition.y,
    };
    const type = style.type || settings.type;
    if (style.type && style.type !== settings.type) series.type = style.type;
    if (style.color) series.color = style.color;
    if (type === 'line') {
      if (style.curve && style.curve !== 'linear') series.curve = style.curve;
      if (style.lineWidth && style.lineWidth !== 2) series.lineWidth = style.lineWidth;
      if (style.dashed) series.dash = [6, 4];
      if (style.area) series.area = true;
      if (style.markers) series.markers = true;
    }
    if (style.symbol && style.symbol !== 'auto' && (type === 'scatter' || style.markers)) series.marker = { symbol: style.symbol };
    if (style.visible === false) series.visible = false;
    return series;
  });
  return options;
}

// ------------------------------------------------------------------ rendering

function render({ dataChanged = false } = {}) {
  const error = $('csv-error');
  try {
    const options = resolveOptions(buildOptions());
    if (!plot) {
      plot = new Plot($('chart'), options);
      plot.on('viewchange', updateResetButton);
      plot.on('render', updateResetButton);
      plot.on('toggle', ({ series, visible }) => {
        styleFor(series).visible = visible;
        const checkbox = document.querySelector(`[data-series-visible="${CSS.escape(series)}"]`);
        if (checkbox) checkbox.checked = visible;
        renderCode();
        refreshOpenTab();
      });
    } else {
      // Style changes keep the current zoom; new data starts from the full view.
      const view = plot.isZoomed && !dataChanged ? plot.view : null;
      plot.update(options);
      if (view) plot.setView(view);
    }
    if (error.dataset.source === 'render') error.textContent = '';
  } catch (problem) {
    console.error(problem);
    error.dataset.source = 'render';
    error.textContent = `The plot could not be drawn: ${problem.message}`;
  }
  renderCode();
  refreshOpenTab();
}

function renderCode() {
  const sample = state.rows[0];
  const lines = [
    "import { Plot } from './src/index.js';",
    '',
    `// rows: your data as objects, one per CSV line (${state.rows.length.toLocaleString('en-US')} here), for example`,
    `// ${JSON.stringify(sample)}`,
    'const rows = [/* ... */];',
    '',
    `const plot = new Plot('#chart', ${toCode(buildOptions(true))});`,
  ];
  $('code').textContent = lines.join('\n');
}

function updateResetButton() {
  $('reset-view').disabled = !plot?.isZoomed;
}

// ------------------------------------------------------------------ controls

function fillSelect(select, entries, value) {
  select.replaceChildren(...entries.map(([optionValue, label]) => new Option(label, optionValue)));
  select.value = value;
}

function renderColumnControls() {
  const { headers, types, mapping } = state;
  const plottable = headers.filter((header) => types[header] !== 'text');
  fillSelect($('x-column'), plottable.map((header) => [header, `${header} (${types[header]})`]), mapping.x);

  const list = $('y-columns');
  list.replaceChildren();
  const candidates = headers.filter((header) => header !== mapping.x && types[header] === 'number');
  for (const header of candidates) {
    const label = document.createElement('label');
    label.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = header;
    input.checked = mapping.y.includes(header);
    input.addEventListener('change', () => {
      const chosen = [...list.querySelectorAll('input:checked')].map((box) => box.value);
      if (!chosen.length) {
        input.checked = true;
        $('csv-error').dataset.source = 'mapping';
        $('csv-error').textContent = 'Keep at least one Y column selected.';
        return;
      }
      $('csv-error').textContent = '';
      state.mapping.y = chosen;
      renderSeriesControls();
      render({ dataChanged: true });
    });
    const name = document.createElement('span');
    name.textContent = header;
    const left = document.createElement('span');
    left.className = 'inline';
    left.style.gap = '6px';
    left.append(input, name);
    const type = document.createElement('span');
    type.className = 'column-type';
    type.textContent = types[header];
    label.append(left, type);
    list.appendChild(label);
  }
  if (!candidates.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No other numeric columns to plot.';
    list.appendChild(empty);
  }

  // Grouping makes sense for columns with a handful of distinct values.
  const groupable = headers.filter((header) => header !== mapping.x && distinctValues(header, 12).length <= 12);
  fillSelect($('group-column'), [['', 'Nothing (one series per Y column)'], ...groupable.map((header) => [header, header])], mapping.group);
}

function renderSeriesControls() {
  const list = $('series-list');
  list.replaceChildren();
  const theme = resolveTheme(plot?.options.theme ?? 'auto');
  seriesDefinitions().forEach((definition, index) => {
    const style = styleFor(definition.name);
    const type = style.type || state.options.type;
    const card = document.createElement('div');
    card.className = 'series-card';
    const id = `series-${index}`;

    const head = document.createElement('div');
    head.className = 'series-head';
    const color = document.createElement('input');
    color.type = 'color';
    color.id = `${id}-color`;
    color.value = style.color || theme.palette[index] || theme.overflow;
    color.setAttribute('aria-label', `Colour of ${definition.name}`);
    color.addEventListener('input', () => {
      style.color = color.value;
      render();
    });
    const name = document.createElement('span');
    name.className = 'series-name';
    name.textContent = definition.name;
    name.title = definition.name;
    const typeSelect = document.createElement('select');
    typeSelect.id = `${id}-type`;
    typeSelect.setAttribute('aria-label', `Type of ${definition.name}`);
    fillSelect(typeSelect, [['line', 'Line'], ['scatter', 'Scatter']], type);
    typeSelect.addEventListener('change', () => {
      style.type = typeSelect.value;
      renderSeriesControls();
      render();
    });
    head.append(color, name, typeSelect);
    card.appendChild(head);

    const row = document.createElement('div');
    row.className = 'row';
    if (type === 'line') {
      const curve = document.createElement('label');
      curve.className = 'field';
      curve.htmlFor = `${id}-curve`;
      curve.innerHTML = '<span>Curve</span>';
      const curveSelect = document.createElement('select');
      curveSelect.id = `${id}-curve`;
      fillSelect(curveSelect, Object.entries(CURVE_LABELS), style.curve || 'linear');
      curveSelect.addEventListener('change', () => {
        style.curve = curveSelect.value;
        render();
      });
      curve.appendChild(curveSelect);
      row.appendChild(curve);
    }
    if (type === 'scatter' || style.markers) {
      const marker = document.createElement('label');
      marker.className = 'field';
      marker.htmlFor = `${id}-symbol`;
      marker.innerHTML = '<span>Marker</span>';
      const symbolSelect = document.createElement('select');
      symbolSelect.id = `${id}-symbol`;
      fillSelect(symbolSelect, ['auto', ...SYMBOLS].map((symbol) => [symbol, SYMBOL_LABELS[symbol] || symbol]), style.symbol || 'auto');
      symbolSelect.addEventListener('change', () => {
        style.symbol = symbolSelect.value;
        render();
      });
      marker.appendChild(symbolSelect);
      row.appendChild(marker);
    }
    if (row.children.length) card.appendChild(row);

    const checks = document.createElement('div');
    checks.className = 'inline';
    const addCheck = (label, key, checked, onChange) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `${id}-${key}`;
      input.checked = checked;
      if (key === 'visible') input.dataset.seriesVisible = definition.name;
      input.addEventListener('change', () => onChange(input.checked));
      wrapper.append(input, document.createTextNode(label));
      checks.appendChild(wrapper);
    };
    if (type === 'line') {
      addCheck('Markers', 'markers', Boolean(style.markers), (checked) => {
        style.markers = checked;
        renderSeriesControls();
        render();
      });
      addCheck('Dashed', 'dashed', Boolean(style.dashed), (checked) => {
        style.dashed = checked;
        render();
      });
      addCheck('Fill area', 'area', Boolean(style.area), (checked) => {
        style.area = checked;
        render();
      });
    }
    addCheck('Visible', 'visible', style.visible !== false, (checked) => {
      style.visible = checked;
      plot.toggleSeries(definition.name, checked);
    });
    card.appendChild(checks);
    list.appendChild(card);
  });
}

/** Copy every value from state into the form controls. */
function syncControls() {
  const settings = state.options;
  $(settings.type === 'scatter' ? 'type-scatter' : 'type-line').checked = true;
  $(settings.renderer === 'canvas' ? 'renderer-canvas' : 'renderer-svg').checked = true;
  $('title').value = settings.title;
  $('subtitle').value = settings.subtitle;
  $('legend').value = settings.legend;
  $('height').value = String(settings.height);
  $('height-value').textContent = `${settings.height} px`;
  $('x-label').value = settings.x.label;
  $('x-scale').value = settings.x.scale;
  $('y-label').value = settings.y.label;
  $('y-scale').value = settings.y.scale;
  $('y-min').value = Number.isFinite(settings.y.min) ? String(settings.y.min) : '';
  $('y-max').value = Number.isFinite(settings.y.max) ? String(settings.y.max) : '';
  $('y-zero').checked = settings.y.zero;
  $('x-grid').checked = settings.x.grid;
  $('y-grid').checked = settings.y.grid;
  $('csv').value = state.csvText;
  renderColumnControls();
  renderSeriesControls();
}

function loadDataset(id) {
  const dataset = datasetById(id);
  if (!dataset) return;
  state.datasetId = id;
  const base = defaultOptions();
  const preset = dataset.options;
  state.options = {
    ...base,
    ...preset,
    height: preset.height || base.height,
    x: { ...base.x, ...(preset.x || {}) },
    y: { ...base.y, ...(preset.y || {}) },
  };
  state.styles = structuredClone(dataset.styles || {});
  const error = loadCSV(dataset.csv(), dataset.mapping);
  $('csv-error').textContent = error;
  $('dataset').value = id;
  syncControls();
  render({ dataChanged: true });
}

// ------------------------------------------------------------------ output tabs

function selectTab(tab) {
  for (const other of document.querySelectorAll('[role="tab"]')) {
    const selected = other === tab;
    other.setAttribute('aria-selected', String(selected));
    other.tabIndex = selected ? 0 : -1;
    $(other.getAttribute('aria-controls')).hidden = !selected;
  }
  refreshOpenTab();
}

function refreshOpenTab() {
  if (!plot) return;
  if (!$('panel-table').hidden) {
    const table = plot.dataTable({ maxRows: TABLE_ROWS });
    $('table-host').replaceChildren(table);
    const shown = table.tBodies[0]?.rows.length ?? 0;
    const total = Number(table.dataset.totalRows) || shown;
    $('table-note').textContent = shown < total
      ? `Showing the first ${shown.toLocaleString('en-US')} rows of ${total.toLocaleString('en-US')}. Values are formatted as in the tooltips.`
      : 'Every visible value in the plot, formatted as in the tooltips.';
  }
  if (!$('panel-svg').hidden) {
    const markup = plot.toSVG();
    const limit = 1_500_000;
    $('svg-markup').value = markup.length > limit ? `${markup.slice(0, limit)}\n<!-- truncated preview -->` : markup;
    plot.toPNG(1.5).then((blob) => {
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      exportUrl = URL.createObjectURL(blob);
      $('export-preview').src = exportUrl;
    }).catch(() => {});
  }
}

async function copyText(text, button) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Select and copy manually';
  }
  setTimeout(() => {
    button.textContent = original;
  }, 1600);
}

/** Downloads are blocked inside sandboxed frames; show the export tab instead. */
const embedded = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

function download(format) {
  if (embedded) {
    selectTab($('tab-svg'));
    $('export-note').textContent = 'Downloads are blocked in this embedded view. Right-click the image to save it, or copy the SVG markup.';
    $('panel-svg').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  plot.download(format);
}

// ------------------------------------------------------------------ wiring

function bind() {
  setupThemeToggle($('theme-toggle'));

  fillSelect($('dataset'), [...DATASETS.map((dataset) => [dataset.id, dataset.label])], state.datasetId);
  $('dataset').addEventListener('change', () => {
    if ($('dataset').value !== 'custom') loadDataset($('dataset').value);
  });

  const applyCSV = () => {
    const error = loadCSV($('csv').value);
    const message = $('csv-error');
    message.dataset.source = 'csv';
    message.textContent = error;
    if (error) return;
    if (![...$('dataset').options].some((option) => option.value === 'custom')) {
      $('dataset').appendChild(new Option('Your data', 'custom'));
    }
    $('dataset').value = 'custom';
    renderColumnControls();
    renderSeriesControls();
    render({ dataChanged: true });
  };
  $('apply-csv').addEventListener('click', applyCSV);
  $('csv').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      applyCSV();
    }
  });

  $('x-column').addEventListener('change', () => {
    state.mapping.x = $('x-column').value;
    state.mapping.y = state.mapping.y.filter((column) => column !== state.mapping.x);
    if (state.mapping.group === state.mapping.x) state.mapping.group = '';
    loadCSV(state.csvText, state.mapping);
    renderColumnControls();
    renderSeriesControls();
    render({ dataChanged: true });
  });
  $('group-column').addEventListener('change', () => {
    state.mapping.group = $('group-column').value;
    renderSeriesControls();
    render({ dataChanged: true });
  });

  for (const radio of document.querySelectorAll('input[name="plot-type"]')) {
    radio.addEventListener('change', () => {
      state.options.type = radio.value;
      // A global type switch applies to every series.
      for (const style of Object.values(state.styles)) delete style.type;
      renderSeriesControls();
      render();
    });
  }
  for (const radio of document.querySelectorAll('input[name="renderer"]')) {
    radio.addEventListener('change', () => {
      state.options.renderer = radio.value;
      render();
    });
  }

  const text = (id, apply) => $(id).addEventListener('input', () => {
    apply($(id).value);
    render();
  });
  text('title', (value) => { state.options.title = value; });
  text('subtitle', (value) => { state.options.subtitle = value; });
  text('x-label', (value) => { state.options.x.label = value; });
  text('y-label', (value) => { state.options.y.label = value; });

  const numberOrNull = (value) => (value.trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value));
  text('y-min', (value) => { state.options.y.min = numberOrNull(value); });
  text('y-max', (value) => { state.options.y.max = numberOrNull(value); });

  const change = (id, apply) => $(id).addEventListener('change', () => {
    apply($(id));
    render();
  });
  change('legend', (element) => { state.options.legend = element.value; });
  change('x-scale', (element) => { state.options.x.scale = element.value; });
  change('y-scale', (element) => { state.options.y.scale = element.value; });
  change('y-zero', (element) => { state.options.y.zero = element.checked; });
  change('x-grid', (element) => { state.options.x.grid = element.checked; });
  change('y-grid', (element) => { state.options.y.grid = element.checked; });
  $('height').addEventListener('input', () => {
    state.options.height = Number($('height').value);
    $('height-value').textContent = `${state.options.height} px`;
    render();
  });

  $('reset-view').addEventListener('click', () => plot.resetZoom());
  $('download-svg').addEventListener('click', () => download('svg'));
  $('download-png').addEventListener('click', () => download('png'));
  $('copy-code').addEventListener('click', (event) => copyText($('code').textContent, event.currentTarget));
  $('copy-svg').addEventListener('click', (event) => copyText($('svg-markup').value, event.currentTarget));

  // Tabs: click, or arrow keys between tabs (WAI-ARIA tabs pattern).
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab, position) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const next = tabs[(position + step + tabs.length) % tabs.length];
      next.focus();
      selectTab(next);
    });
  });

  // Cursor readout in data coordinates.
  const readout = $('readout');
  $('chart').addEventListener('pointermove', (event) => {
    if (!plot?.scene) return;
    const rect = plot.root.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const { plotArea, scales, format } = plot.scene;
    if (px < plotArea.x || px > plotArea.x + plotArea.width || py < plotArea.y || py > plotArea.y + plotArea.height) return;
    const xLabel = document.createElement('strong');
    xLabel.textContent = 'x ';
    const yLabel = document.createElement('strong');
    yLabel.textContent = 'y ';
    readout.replaceChildren(xLabel, `${format.x(scales.x.invert(px))}   `, yLabel, format.y(scales.y.invert(py)));
  });
  $('chart').addEventListener('pointerleave', () => {
    readout.textContent = 'Point at the plot to read values';
  });

  // Series colour pickers show theme colours, so refresh them when the theme changes.
  new MutationObserver(() => renderSeriesControls()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

bind();
loadDataset(state.datasetId);
