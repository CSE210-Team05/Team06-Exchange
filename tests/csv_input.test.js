import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SERIES, detect_delimiter, parse_csv, read_rows, to_number, to_series } from '../app_main/features/plot_handling/csv_input.js';

describe('parse_csv', () => {
  it('reads x and y from the first two columns and the header as labels', () => {
    const parsed = parse_csv('Time (s),Height (m)\n0,0\n0.5,8.78\n1,15.1');
    assert.deepEqual(parsed.rows, [[0, 0], [0.5, 8.78], [1, 15.1]]);
    assert.equal(parsed.x_label, 'Time (s)');
    assert.equal(parsed.y_label, 'Height (m)');
    assert.deepEqual(parsed.names, ['Height (m)']);
    assert.equal(parsed.skipped, 0);
  });

  it('works without a header row', () => {
    const parsed = parse_csv('1,2\n3,4');
    assert.deepEqual(parsed.rows, [[1, 2], [3, 4]]);
    assert.equal(parsed.x_label, 'x');
    assert.equal(parsed.y_label, 'y');
  });

  it('accepts semicolons with decimal commas (German spreadsheet export)', () => {
    const parsed = parse_csv('Zeit;Temperatur\n0,5;21,3\n1,0;22');
    assert.deepEqual(parsed.rows, [[0.5, 21.3], [1, 22]]);
  });

  it('accepts tabs (copied from a spreadsheet)', () => {
    assert.deepEqual(parse_csv('a\tb\n1\t2').rows, [[1, 2]]);
  });

  it('skips and counts rows without two numbers', () => {
    const parsed = parse_csv('x,y\n1,2\n2,n/a\n\n3,\n4,5');
    assert.deepEqual(parsed.rows, [[1, 2], [4, 5]]);
    assert.equal(parsed.skipped, 2);
  });

  it('sorts the rows by x, so a line never runs backwards', () => {
    const parsed = parse_csv('3,1\n1,2\n2,3');
    assert.deepEqual(parsed.rows, [[1, 2], [2, 3], [3, 1]]);
    assert.equal(parsed.reordered, true);
    assert.equal(parse_csv('1,2\n2,3').reordered, false);
  });

  it('keeps the first row of a repeated x and counts the others', () => {
    const parsed = parse_csv('x,y\n1,10\n2,20\n1,99\n1,98');
    assert.deepEqual(parsed.rows, [[1, 10], [2, 20]]);
    assert.equal(parsed.duplicates, 2);
    assert.equal(parsed.skipped, 0);
  });

  it('turns every further numeric column into a series', () => {
    const parsed = parse_csv('Time,Ball A,Ball B\n0,0,0\n1,15.1,10.1\n2,20.4,');
    assert.deepEqual(parsed.names, ['Ball A', 'Ball B']);
    assert.deepEqual(parsed.rows, [[0, 0, 0], [1, 15.1, 10.1], [2, 20.4, null]]);
    assert.equal(parsed.x_label, 'Time');
    assert.equal(parsed.y_label, '');
  });

  it('names series without a header and keeps repeated names apart', () => {
    assert.deepEqual(parse_csv('1,2,3,4').names, ['y', 'y2', 'y3']);
    assert.deepEqual(parse_csv('x,Run,Run\n1,2,3').names, ['Run', 'Run (2)']);
  });

  it('does not plot columns without numbers and reports them', () => {
    const parsed = parse_csv('x,y,Note\n1,2,ok\n2,3,late');
    assert.deepEqual(parsed.names, ['y']);
    assert.deepEqual(parsed.rows, [[1, 2], [2, 3]]);
    assert.deepEqual(parsed.ignored_columns, ['Note']);
    // A trailing delimiter is not a column worth reporting.
    assert.deepEqual(parse_csv('x,y,\n1,2,').ignored_columns, []);
  });

  it('plots at most MAX_SERIES columns', () => {
    const header = ['x', ...Array.from({ length: MAX_SERIES + 1 }, (_, index) => `s${index + 1}`)];
    const parsed = parse_csv(`${header.join(',')}\n${header.map((_, index) => index).join(',')}`);
    assert.equal(parsed.names.length, MAX_SERIES);
    assert.deepEqual(parsed.ignored_columns, [`s${MAX_SERIES + 1}`]);
  });

  it('explains what is wrong with unusable input', () => {
    assert.throws(() => parse_csv('   '), /Paste CSV data/);
    assert.throws(() => parse_csv('just one column\n1\n2'), /two values/);
    assert.throws(() => parse_csv('a,b\nfoo,bar'), /No row contains two numbers/);
  });
});

describe('to_series', () => {
  it('gives each series its own points and leaves out missing values', () => {
    const { names, rows } = parse_csv('x,a,b\n1,10,\n2,20,200\n3,,300');
    assert.deepEqual(to_series(names, rows), [
      { name: 'a', points: [[1, 10], [2, 20]] },
      { name: 'b', points: [[2, 200], [3, 300]] },
    ]);
  });
});

describe('CSV helpers', () => {
  it('detects the delimiter from the first line', () => {
    assert.equal(detect_delimiter('a,b\n1,2'), ',');
    assert.equal(detect_delimiter('a;b\n1;2'), ';');
    assert.equal(detect_delimiter('a\tb'), '\t');
    assert.equal(detect_delimiter('"a;b",c\n1,2'), ',');
  });

  it('handles quoted fields, escaped quotes and CRLF line endings', () => {
    assert.deepEqual(read_rows('"Speed, max",1\r\n"say ""hi""",2\r\n', ','), [['Speed, max', '1'], ['say "hi"', '2']]);
  });

  it('reads numbers strictly', () => {
    assert.equal(to_number(' 2.5 '), 2.5);
    assert.equal(to_number('−3'), -3);
    assert.equal(to_number('1e3'), 1000);
    assert.ok(Number.isNaN(to_number('12abc')));
    assert.ok(Number.isNaN(to_number('')));
    assert.ok(Number.isNaN(to_number('1,5', ',')));
    assert.equal(to_number('1,5', ';'), 1.5);
  });
});
