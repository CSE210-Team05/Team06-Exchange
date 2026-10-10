/**
 * CSV input: turns pasted text into x/y points.
 *
 * - The first column is x, the second column is y. Further columns are ignored.
 * - A first row that is not numeric is treated as the header; its names become
 *   the default axis labels.
 * - Commas, semicolons and tabs are accepted as delimiters (detected from the
 *   first line). With semicolons or tabs, decimal commas work too ("1,5"), as
 *   exported by spreadsheet programs in German and many other locales.
 * - Quoted fields ("a, b") and escaped quotes ("") follow RFC 4180.
 * - Rows without two numbers are skipped and counted, not silently dropped.
 */

/**
 * Pick the delimiter that occurs most often in the first line (outside quotes).
 * @param {string} text
 * @returns {',' | ';' | '\t'}
 */
export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const character of firstLine) {
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
export function readRows(text, delimiter) {
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
export function toNumber(value, delimiter = ',') {
  let text = value.trim().replace(/−/g, '-');
  if (text === '') return NaN;
  // A decimal comma is unambiguous only when the comma is not the delimiter.
  if (delimiter !== ',' && /^[-+]?\d*,\d+$/.test(text)) text = text.replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
}

/**
 * @typedef {object} ParsedData
 * @property {Array<[number, number]>} points x/y pairs in CSV order
 * @property {string} xLabel header of the first column ('x' without a header)
 * @property {string} yLabel header of the second column ('y' without a header)
 * @property {number} skipped rows that did not contain two numbers
 * @property {number} columns largest number of columns in a row
 */

/**
 * Parse pasted CSV text. Throws an Error with a user-facing message when
 * nothing can be plotted.
 * @param {string} text
 * @returns {ParsedData}
 */
export function parseCSV(text) {
  if (!text || !text.trim()) throw new Error('Paste CSV data first: one row per point, x and y separated by a comma.');
  const delimiter = detectDelimiter(text);
  const rows = readRows(text, delimiter);
  const columns = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  if (columns < 2) throw new Error('Each row needs two values, x and y, separated by a comma, semicolon or tab.');

  const isNumericRow = (row) => !Number.isNaN(toNumber(row[0] ?? '', delimiter)) && !Number.isNaN(toNumber(row[1] ?? '', delimiter));
  const hasHeader = !isNumericRow(rows[0]);
  const header = hasHeader ? rows[0] : null;
  const body = hasHeader ? rows.slice(1) : rows;

  const points = [];
  let skipped = 0;
  for (const row of body) {
    const x = toNumber(row[0] ?? '', delimiter);
    const y = toNumber(row[1] ?? '', delimiter);
    if (Number.isNaN(x) || Number.isNaN(y)) skipped++;
    else points.push([x, y]);
  }
  if (!points.length) {
    throw new Error('No row contains two numbers. Check that the first two columns hold x and y values.');
  }

  return {
    points,
    xLabel: header?.[0] || 'x',
    yLabel: header?.[1] || 'y',
    skipped,
    columns,
  };
}
