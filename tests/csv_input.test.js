import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detect_delimiter, parse_csv, read_rows, to_number } from '../app_main/features/plot_handling/csv_input.js';

describe('parse_csv', () => {
  it('reads x and y from the first two columns and the header as labels', () => {
    const parsed = parse_csv('Time (s),Height (m)\n0,0\n0.5,8.78\n1,15.1');
    assert.deepEqual(parsed.points, [[0, 0], [0.5, 8.78], [1, 15.1]]);
    assert.equal(parsed.x_label, 'Time (s)');
    assert.equal(parsed.y_label, 'Height (m)');
    assert.equal(parsed.skipped, 0);
  });

  it('works without a header row', () => {
    const parsed = parse_csv('1,2\n3,4');
    assert.deepEqual(parsed.points, [[1, 2], [3, 4]]);
    assert.equal(parsed.x_label, 'x');
    assert.equal(parsed.y_label, 'y');
  });

  it('accepts semicolons with decimal commas (German spreadsheet export)', () => {
    const parsed = parse_csv('Zeit;Temperatur\n0,5;21,3\n1,0;22');
    assert.deepEqual(parsed.points, [[0.5, 21.3], [1, 22]]);
  });

  it('accepts tabs (copied from a spreadsheet)', () => {
    assert.deepEqual(parse_csv('a\tb\n1\t2').points, [[1, 2]]);
  });

  it('skips and counts rows without two numbers', () => {
    const parsed = parse_csv('x,y\n1,2\n2,n/a\n\n3,\n4,5');
    assert.deepEqual(parsed.points, [[1, 2], [4, 5]]);
    assert.equal(parsed.skipped, 2);
  });

  it('keeps the CSV order of the points', () => {
    assert.deepEqual(parse_csv('3,1\n1,2\n2,3').points, [[3, 1], [1, 2], [2, 3]]);
  });

  it('reports extra columns', () => {
    assert.equal(parse_csv('x,y,z\n1,2,3').columns, 3);
  });

  it('explains what is wrong with unusable input', () => {
    assert.throws(() => parse_csv('   '), /Paste CSV data/);
    assert.throws(() => parse_csv('just one column\n1\n2'), /two values/);
    assert.throws(() => parse_csv('a,b\nfoo,bar'), /No row contains two numbers/);
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
