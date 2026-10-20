import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_FILE_NAME, csv_blob } from '../app_main/features/plot_handling/plot_export.js';

describe('CSV export', () => {
  it('preserves the current data field verbatim with a CSV MIME type and file name', async () => {
    const csv = 'Time,Value\r\n0,10\r\n1,20\r\n';
    const blob = csv_blob(csv);

    assert.equal(CSV_FILE_NAME, 'zeroplot-data.csv');
    assert.equal(blob.type, 'text/csv;charset=utf-8');
    assert.equal(await blob.text(), csv);
  });
});
