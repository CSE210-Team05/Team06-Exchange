/**
 * CSV input: turns pasted text into a clean table of numbers.
 *
 * - The first column is x. Every further column that holds numbers is one
 *   series (one line, or one group of scatter markers).
 * - A first row whose first cell is not a number is treated as the header; its
 *   names become the x axis title and the series names.
 * - Commas, semicolons and tabs are accepted as delimiters (detected from the
 *   first line). With semicolons or tabs, decimal commas work too ("1,5"), as
 *   exported by spreadsheet programs in German and many other locales.
 * - Quoted fields ("a, b") and escaped quotes ("") follow RFC 4180.
 * - The rows are sorted by x, so a line never runs backwards.
 * - Every x appears once: of several rows with the same x the first one wins.
 * - Rows without a numeric x and y, and rows with a repeated x, are skipped
 *   and counted, not silently dropped.
 */

/** The chart has this many series colours; further columns are not plotted. */
export const MAX_SERIES = 8;

/**
 * Pick the delimiter that occurs most often in the first line (outside quotes).
 * @param {string} text
 * @returns {',' | ';' | '\t'}
 */
export function detect_delimiter(text) {
  const first_line = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const character of first_line) {
    if (character === '"') quoted = !quoted;
    else if (!quoted && character in counts) counts[character]++;
  }
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? /** @type {',' | ';' | '\t'} */ (best) : ',';
}

/**
 * Split CSV text into rows of fields.
 * @param {string} text
 * @param {string} delimiter
 * @returns {string[][]}
 */
export function read_rows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (character === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field.trim() !== '' || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  // Blank lines become rows with a single empty field; drop them.
  return rows.filter((fields) => fields.some((value) => value !== ''));
}

/**
 * Read one CSV field as a number, or NaN.
 * @param {string} value
 * @param {string} delimiter
 */
export function to_number(value, delimiter = ',') {
  let text = value.trim().replace(/−/g, '-');
  if (text === '') return NaN;
  // A decimal comma is unambiguous only when the comma is not the delimiter.
  if (delimiter !== ',' && /^[-+]?\d*,\d+$/.test(text)) text = text.replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
}

/** Give repeated names a number ("Run", "Run (2)") so every series can be told apart. */
function unique_names(names) {
  const seen = new Map();
  return names.map((name) => {
    const count = (seen.get(name) || 0) + 1;
    seen.set(name, count);
    return count > 1 ? `${name} (${count})` : name;
  });
}

/**
 * @typedef {object} ParsedData
 * @property {string} x_label header of the first column ('x' without a header)
 * @property {string} y_label name of the series when there is exactly one, otherwise ''
 * @property {string[]} names one name per series: the headers of the plotted columns
 * @property {Array<Array<number|null>>} rows [x, y1, y2, ...] per row, ascending x, every x once; null = no value
 * @property {number} skipped rows without a numeric x or without any numeric y
 * @property {number} duplicates rows dropped because an earlier row has the same x
 * @property {boolean} reordered true when the rows were not in ascending x order
 * @property {string[]} ignored_columns headers of columns that are not plotted (no numbers, or beyond MAX_SERIES)
 */

/**
 * Parse pasted CSV text. Throws an Error with a user-facing message when
 * nothing can be plotted.
 * @param {string} text
 * @returns {ParsedData}
 */
export function parse_csv(text) {
  if (!text || !text.trim()) throw new Error('Paste CSV data first: one row per x value, x and y separated by a comma.');
  const delimiter = detect_delimiter(text);
  const records = read_rows(text, delimiter);
  const width = records.reduce((widest, record) => Math.max(widest, record.length), 0);
  if (width < 2) throw new Error('Each row needs two values, x and y, separated by a comma, semicolon or tab.');

  const has_header = Number.isNaN(to_number(records[0][0] ?? '', delimiter));
  const header = has_header ? records[0] : null;
  const body = has_header ? records.slice(1) : records;
  const values = body.map((record) => Array.from({ length: width }, (_, column) => to_number(record[column] ?? '', delimiter)));

  // A column is a series when it holds a number in at least one row that has an x.
  const plotted = [];
  const ignored_columns = [];
  for (let column = 1; column < width; column++) {
    const has_numbers = values.some((row) => !Number.isNaN(row[0]) && !Number.isNaN(row[column]));
    const is_blank = records.every((record) => (record[column] ?? '') === '');
    if (has_numbers && plotted.length < MAX_SERIES) plotted.push(column);
    else if (!is_blank) ignored_columns.push(header?.[column] || `column ${column + 1}`);
  }

  const seen_x = new Set();
  const rows = [];
  let skipped = 0;
  let duplicates = 0;
  for (const row of values) {
    const x = row[0];
    const ys = plotted.map((column) => (Number.isNaN(row[column]) ? null : row[column]));
    if (Number.isNaN(x) || ys.every((y) => y === null)) skipped++;
    else if (seen_x.has(x)) duplicates++;
    else {
      seen_x.add(x);
      rows.push([x, ...ys]);
    }
  }
  if (!rows.length) {
    throw new Error('No row contains two numbers. Check that the first column holds x values and the following columns y values.');
  }

  const reordered = rows.some((row, index) => index > 0 && row[0] < rows[index - 1][0]);
  if (reordered) rows.sort((a, b) => a[0] - b[0]);

  const names = unique_names(plotted.map((column, position) => header?.[column] || (position === 0 ? 'y' : `y${position + 1}`)));
  return {
    x_label: header?.[0] || 'x',
    y_label: names.length === 1 ? names[0] : '',
    names,
    rows,
    skipped,
    duplicates,
    reordered,
    ignored_columns,
  };
}

/**
 * The points of every series, ready for the chart. Rows in which a series has
 * no value are left out of that series.
 * @param {string[]} names one name per series
 * @param {Array<Array<number|null>>} rows [x, y1, y2, ...] per row
 * @returns {Array<{ name: string, points: Array<[number, number]> }>}
 */
export function to_series(names, rows) {
  return names.map((name, position) => ({
    name,
    points: rows.filter((row) => row[position + 1] !== null).map((row) => [row[0], row[position + 1]]),
  }));
}
