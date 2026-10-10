import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectDelimiter, parseCSV, readRows, toNumber } from '../src/csv.js';

describe('parseCSV', () => {
  it('reads x and y from the first two columns and the header as labels', () => {
    const parsed = parseCSV('Time (s),Height (m)\n0,0\n0.5,8.78\n1,15.1');
    assert.deepEqual(parsed.points, [[0, 0], [0.5, 8.78], [1, 15.1]]);
    assert.equal(parsed.xLabel, 'Time (s)');
    assert.equal(parsed.yLabel, 'Height (m)');
    assert.equal(parsed.skipped, 0);
  });

  it('works without a header row', () => {
    const parsed = parseCSV('1,2\n3,4');
    assert.deepEqual(parsed.points, [[1, 2], [3, 4]]);
    assert.equal(parsed.xLabel, 'x');
    assert.equal(parsed.yLabel, 'y');
  });

  it('accepts semicolons with decimal commas (German spreadsheet export)', () => {
    const parsed = parseCSV('Zeit;Temperatur\n0,5;21,3\n1,0;22');
    assert.deepEqual(parsed.points, [[0.5, 21.3], [1, 22]]);
  });

  it('accepts tabs (copied from a spreadsheet)', () => {
    assert.deepEqual(parseCSV('a\tb\n1\t2').points, [[1, 2]]);
  });

  it('skips and counts rows without two numbers', () => {
    const parsed = parseCSV('x,y\n1,2\n2,n/a\n\n3,\n4,5');
    assert.deepEqual(parsed.points, [[1, 2], [4, 5]]);
    assert.equal(parsed.skipped, 2);
  });

  it('keeps the CSV order of the points', () => {
    assert.deepEqual(parseCSV('3,1\n1,2\n2,3').points, [[3, 1], [1, 2], [2, 3]]);
  });

  it('reports extra columns', () => {
    assert.equal(parseCSV('x,y,z\n1,2,3').columns, 3);
  });

  it('explains what is wrong with unusable input', () => {
    assert.throws(() => parseCSV('   '), /Paste CSV data/);
    assert.throws(() => parseCSV('just one column\n1\n2'), /two values/);
    assert.throws(() => parseCSV('a,b\nfoo,bar'), /No row contains two numbers/);
  });
});

describe('CSV helpers', () => {
  it('detects the delimiter from the first line', () => {
    assert.equal(detectDelimiter('a,b\n1,2'), ',');
    assert.equal(detectDelimiter('a;b\n1;2'), ';');
    assert.equal(detectDelimiter('a\tb'), '\t');
    assert.equal(detectDelimiter('"a;b",c\n1,2'), ',');
  });

  it('handles quoted fields, escaped quotes and CRLF line endings', () => {
    assert.deepEqual(readRows('"Speed, max",1\r\n"say ""hi""",2\r\n', ','), [['Speed, max', '1'], ['say "hi"', '2']]);
  });

  it('reads numbers strictly', () => {
    assert.equal(toNumber(' 2.5 '), 2.5);
    assert.equal(toNumber('−3'), -3);
    assert.equal(toNumber('1e3'), 1000);
    assert.ok(Number.isNaN(toNumber('12abc')));
    assert.ok(Number.isNaN(toNumber('')));
    assert.ok(Number.isNaN(toNumber('1,5', ',')));
    assert.equal(toNumber('1,5', ';'), 1.5);
  });
});
