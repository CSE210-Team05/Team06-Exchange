
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SERIES,
  parse_csv,
} from '../app_main/features/plot_handling/csv_input.js';

describe('CSV column boundary tests', () => {
  it('accepts exactly the maximum number of valid Y-series', () => {
    const header = ['X', ...Array.from(
      { length: MAX_SERIES },
      (_, i) => `Y${i + 1}`
    )];

    const row = [1, ...Array.from(
      { length: MAX_SERIES },
      (_, i) => i + 2
    )];

    const parsed = parse_csv(
      `${header.join(',')}\n${row.join(',')}`
    );

    assert.equal(parsed.names.length, MAX_SERIES);
    assert.deepEqual(parsed.ignored_columns, []);
  });

  it('ignores additional valid series beyond the limit', () => {
    const parsed = parse_csv(
      'X,Y1,Y2,Y3,Y4,Y5,Y6,Y7,Y8,Y9\n' +
      '1,2,3,4,5,6,7,8,9,10\n' +
      '2,4,6,8,10,12,14,16,18,20'
    );

    assert.deepEqual(parsed.names, [
      'Y1', 'Y2', 'Y3', 'Y4',
      'Y5', 'Y6', 'Y7', 'Y8',
    ]);

    assert.deepEqual(parsed.ignored_columns, ['Y9']);
  });

  it('skips nonnumeric series without consuming a valid series slot', () => {
    const parsed = parse_csv(
      'X,Y1,Y2,Y3,Y4,Y5,Y6,Y7,Y8,Y9\n' +
      '1,2,3,4,5,6,7,8,N/A,10\n' +
      '2,4,6,8,10,12,14,16,N/A,20\n' +
      '3,6,9,12,15,18,21,24,N/A,30'
    );

    assert.deepEqual(parsed.names, [
      'Y1', 'Y2', 'Y3', 'Y4',
      'Y5', 'Y6', 'Y7', 'Y9',
    ]);

    assert.deepEqual(parsed.ignored_columns, ['Y8']);
    assert.equal(parsed.names.length, MAX_SERIES);
  });
});
