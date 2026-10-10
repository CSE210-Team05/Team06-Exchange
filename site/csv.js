/**
 * A small CSV parser for the plot builder (RFC 4180 style).
 *
 * Handles quoted fields ("a, b"), escaped quotes (""), CRLF line endings,
 * and comma, semicolon or tab delimiters (detected from the header line).
 */

/**
 * Guess the delimiter by counting candidates in the first line, outside quotes.
 * @param {string} text
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
  return count > 0 ? best : ',';
}

/**
 * Parse CSV text into a header row and data rows.
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][], delimiter: string }}
 */
export function parseCSV(text) {
  const delimiter = detectDelimiter(text);
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"' && field === '') {
      quoted = true;
    } else if (character === delimiter) {
      record.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }

  // Drop blank lines (a single empty field).
  const nonEmpty = records.filter((row) => !(row.length === 1 && row[0].trim() === ''));
  if (!nonEmpty.length) return { headers: [], rows: [], delimiter };

  const headers = nonEmpty[0].map((name, position) => name.trim() || `column ${position + 1}`);
  // Make duplicate header names unique so every column can be addressed.
  const seen = new Map();
  const uniqueHeaders = headers.map((name) => {
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    return count ? `${name} (${count + 1})` : name;
  });
  const rows = nonEmpty.slice(1).map((row) => uniqueHeaders.map((_, position) => (row[position] ?? '').trim()));
  return { headers: uniqueHeaders, rows, delimiter };
}

const DATE_LIKE = /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?([T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Classify each column as 'number', 'date' or 'text' from its non-empty values.
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {Record<string, 'number'|'date'|'text'>}
 */
export function columnTypes(headers, rows) {
  const types = {};
  headers.forEach((header, position) => {
    let numbers = 0;
    let dates = 0;
    let filled = 0;
    const sample = rows.length > 2000 ? rows.filter((_, index) => index % Math.ceil(rows.length / 2000) === 0) : rows;
    for (const row of sample) {
      const value = row[position];
      if (value === '' || value === undefined) continue;
      filled++;
      if (DATE_LIKE.test(value)) dates++;
      else if (value.trim() !== '' && Number.isFinite(Number(value))) numbers++;
    }
    if (filled === 0) types[header] = 'text';
    else if (dates >= filled * 0.9) types[header] = 'date';
    else if (numbers >= filled * 0.9) types[header] = 'number';
    else types[header] = 'text';
  });
  return types;
}

/**
 * Rows as objects keyed by header: [{ date: '2025-01-01', Munich: '3.1' }, ...].
 * Numeric strings are converted to numbers; empty cells become null (gaps).
 * @param {string[]} headers
 * @param {string[][]} rows
 * @param {Record<string, string>} types
 */
export function toObjects(headers, rows, types) {
  return rows.map((row) => {
    const object = {};
    headers.forEach((header, position) => {
      const value = row[position];
      if (value === '') object[header] = null;
      else if (types[header] === 'number') object[header] = Number(value);
      else object[header] = value;
    });
    return object;
  });
}
