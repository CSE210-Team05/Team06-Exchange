#!/usr/bin/env node
/**
 * Node test runner: node test/run.js   (or: npm test)
 *
 * Runs every spec that does not need a DOM. Browser-only tests are listed
 * as skipped here; open test/index.html through a local server to run them.
 */
import { run } from './harness.js';
import './specs/index.js';

const useColor = process.stdout.isTTY;
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);

let lastSuite = '';
const summary = await run({
  inBrowser: false,
  onResult(result) {
    if (result.suite !== lastSuite) {
      console.log(`\n${result.suite}`);
      lastSuite = result.suite;
    }
    const mark = { passed: paint(32, '✓'), failed: paint(31, '✗'), skipped: paint(90, '–') }[result.status];
    const note = result.status === 'skipped' ? paint(90, ' (browser only)') : '';
    console.log(`  ${mark} ${result.name}${note}`);
    if (result.error) console.log(paint(31, `      ${result.error.stack || result.error.message}`));
  },
});

console.log(`\n${paint(32, `${summary.passed} passed`)}, ${paint(summary.failed ? 31 : 90, `${summary.failed} failed`)}, ${summary.skipped} skipped`);
process.exitCode = summary.failed ? 1 : 0;
