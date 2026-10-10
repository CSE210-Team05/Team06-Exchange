/**
 * Series normalisation: turns the many accepted input shapes into parallel
 * Float64Arrays (`xs`, `ys`) that the rest of the library works with.
 *
 * Accepted shapes for one series:
 *   { data: [[x, y], ...] }                 tuples
 *   { data: [{ x, y }, ...] }               objects with x / y keys
 *   { data: rows, x: 'date', y: 'price' }   objects with named columns
 *   { data: rows, x: (d) => ..., y: (d) => ... }  accessor functions
 *   { data: [y0, y1, ...] }                 plain numbers (x = index)
 *   { x: [...], y: [...] }                  separate arrays
 *   { y: [...] }                            y only (x = index)
 *
 * x and y may be numbers, numeric strings, Date objects or ISO date strings.
 * Anything that is not a finite number becomes NaN, which the renderers
 * treat as a gap.
 */

// "2026-10-10", "2026/10", "2026-1-5" - parsed as *local* midnight. (The
// built-in Date.parse treats date-only ISO strings as UTC, which would shift
// every day by the viewer's time zone offset.)
const DATE_ONLY = /^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/;
// "2026-10-10T14:30", "2026-10-10 14:30:05Z" - local unless an offset is given.
const DATE_TIME = /^\d{4}-\d{1,2}-\d{1,2}[T ]\d{1,2}:\d{2}/;

/**
 * Parse a date-like string to epoch milliseconds, or NaN.
 * @param {string} text
 */
export function parseDate(text) {
  const trimmed = text.trim();
  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, day ? Number(day) : 1).getTime();
  }
  if (DATE_TIME.test(trimmed)) return Date.parse(trimmed.replace(' ', 'T'));
  return NaN;
}

/**
 * Convert one raw value to a number and report whether it was a date.
 * @param {unknown} value
 * @returns {[number, boolean]} [numeric value, isDate]
 */
export function toNumeric(value) {
  if (typeof value === 'number') return [value, false];
  if (value instanceof Date) return [value.getTime(), true];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return [NaN, false];
    const numeric = Number(trimmed.replace(/−/g, '-'));
    if (!Number.isNaN(numeric)) return [numeric, false];
    const time = parseDate(trimmed);
    return [time, !Number.isNaN(time)];
  }
  if (typeof value === 'bigint') return [Number(value), false];
  return [NaN, false];
}

/**
 * Build a row accessor for the x or y channel.
 * @param {unknown} spec the series' `x` or `y` option
 * @param {'x'|'y'} channel
 * @param {unknown} sample first non-empty row, used to detect the row shape
 */
function makeAccessor(spec, channel, sample) {
  if (typeof spec === 'function') return spec;
  if (typeof spec === 'string' || typeof spec === 'number') return (row) => (row == null ? undefined : row[spec]);
  if (Array.isArray(sample)) {
    const position = channel === 'x' ? 0 : 1;
    return (row) => (row == null ? undefined : row[position]);
  }
  if (sample !== null && typeof sample === 'object' && !(sample instanceof Date)) {
    return (row) => (row == null ? undefined : row[channel]);
  }
  // Plain values: they are the y values and x is the index.
  return channel === 'x' ? (row, index) => index : (row) => row;
}

/**
 * True when every x is finite and x never decreases. Sorted series allow
 * binary search (viewport culling, tooltips) and M4 line simplification.
 * @param {Float64Array} xs
 */
function isSortedAscending(xs) {
  let previous = -Infinity;
  for (let index = 0; index < xs.length; index++) {
    const value = xs[index];
    if (!Number.isFinite(value) || value < previous) return false;
    previous = value;
  }
  return true;
}

/**
 * @typedef {object} NormalizedSeries
 * @property {string} key stable identity (id, else name, else position)
 * @property {number} index position in the options' series array
 * @property {string} name
 * @property {'line'|'scatter'} type
 * @property {Float64Array} xs
 * @property {Float64Array} ys
 * @property {Float64Array|null} sizes per-point marker sizes (bubble charts)
 * @property {number} length
 * @property {boolean} xIsTime
 * @property {boolean} yIsTime
 * @property {boolean} sorted x is ascending
 * @property {(index: number) => unknown} datum original input for point `index`
 * @property {object} options the series options as given by the user
 */

/**
 * Normalise one series.
 * @param {object} seriesOptions
 * @param {number} index
 * @param {'line'|'scatter'} defaultType
 * @returns {NormalizedSeries}
 */
export function normalizeSeries(seriesOptions, index, defaultType = 'line') {
  const options = seriesOptions || {};
  const rows = Array.isArray(options.data) ? options.data : null;
  let length;
  let getX;
  let getY;
  let rowAt;

  if (rows) {
    length = rows.length;
    const sample = rows.find((row) => row !== null && row !== undefined);
    getX = makeAccessor(options.x, 'x', sample);
    getY = makeAccessor(options.y, 'y', sample);
    rowAt = (position) => rows[position];
  } else {
    const xValues = Array.isArray(options.x) || ArrayBuffer.isView(options.x) ? options.x : null;
    const yValues = Array.isArray(options.y) || ArrayBuffer.isView(options.y) ? options.y : [];
    length = yValues.length;
    getX = xValues ? (row, position) => xValues[position] : (row, position) => position;
    getY = (row, position) => yValues[position];
    rowAt = (position) => ({ x: getX(null, position), y: yValues[position] });
  }

  const xs = new Float64Array(length);
  const ys = new Float64Array(length);
  let xDates = 0;
  let yDates = 0;
  for (let position = 0; position < length; position++) {
    const row = rowAt(position);
    const [x, xIsDate] = toNumeric(getX(row, position));
    const [y, yIsDate] = toNumeric(getY(row, position));
    xs[position] = x;
    ys[position] = y;
    if (xIsDate) xDates++;
    if (yIsDate) yDates++;
  }

  const type = options.type === 'scatter' || options.type === 'line' ? options.type : defaultType;
  const marker = options.marker || {};
  let sizes = null;
  if (typeof marker.size === 'function') {
    sizes = new Float64Array(length);
    for (let position = 0; position < length; position++) {
      const value = Number(marker.size(rowAt(position), position));
      sizes[position] = Number.isFinite(value) && value > 0 ? value : 0;
    }
  }

  return {
    key: String(options.id ?? options.name ?? `series-${index}`),
    index,
    name: options.name != null && options.name !== '' ? String(options.name) : `Series ${index + 1}`,
    type,
    xs,
    ys,
    sizes,
    length,
    xIsTime: xDates > 0 && xDates >= length / 2,
    yIsTime: yDates > 0 && yDates >= length / 2,
    sorted: isSortedAscending(xs),
    datum: (position) => rowAt(position),
    options,
  };
}

/**
 * Min and max of the finite values in `values` (optionally only positives).
 * @param {Float64Array} values
 * @param {boolean} [positiveOnly]
 * @returns {[number, number] | null}
 */
export function finiteExtent(values, positiveOnly = false) {
  let low = Infinity;
  let high = -Infinity;
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!Number.isFinite(value) || (positiveOnly && value <= 0)) continue;
    if (value < low) low = value;
    if (value > high) high = value;
  }
  return low <= high ? [low, high] : null;
}

/**
 * Index of the element of an ascending array (finite values only) that is
 * closest to `target`, found by binary search in O(log n).
 * @param {ArrayLike<number>} sorted
 * @param {number} target
 * @returns {number} -1 for an empty array
 */
export function nearestIndexSorted(sorted, target) {
  const length = sorted.length;
  if (length === 0) return -1;
  // First index whose value is >= target.
  let low = 0;
  let high = length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] < target) low = middle + 1;
    else high = middle;
  }
  if (low === 0) return 0;
  if (low === length) return length - 1;
  return target - sorted[low - 1] <= sorted[low] - target ? low - 1 : low;
}
