/**
 * A minimal test harness (describe / it / assert) that runs unchanged in
 * Node and in the browser, so the project needs no test framework.
 *
 *   describe('scale', () => {
 *     it('maps the domain onto the range', () => {
 *       assert.equal(new LinearScale([0, 10], [0, 100]).map(5), 50);
 *     });
 *     it.browser('only runs where a DOM exists', () => { ... });
 *   });
 */

const suites = [];
let currentSuite = null;

/**
 * Group related tests.
 * @param {string} name
 * @param {() => void} body
 */
export function describe(name, body) {
  const suite = { name, tests: [] };
  suites.push(suite);
  const previous = currentSuite;
  currentSuite = suite;
  try {
    body();
  } finally {
    currentSuite = previous;
  }
}

/**
 * Declare a test. The body may be async.
 * @param {string} name
 * @param {() => unknown} body
 */
export function it(name, body, { browserOnly = false } = {}) {
  if (!currentSuite) describe('(top level)', () => it(name, body, { browserOnly }));
  else currentSuite.tests.push({ name, body, browserOnly });
}

/** A test that needs a real DOM (skipped in Node). */
it.browser = (name, body) => it(name, body, { browserOnly: true });

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

const show = (value) => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (ArrayBuffer.isView(value)) return `${value.constructor.name}[${Array.from(value).join(', ')}]`;
  try {
    return JSON.stringify(value, (key, entry) => (Number.isNaN(entry) ? 'NaN' : entry));
  } catch {
    return String(value);
  }
};

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) && !Array.isArray(a)) return false;
    if (!ArrayBuffer.isView(b) && !Array.isArray(b)) return false;
    return a.length === b.length && Array.from(a).every((value, index) => Object.is(value, b[index]));
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => deepEqual(a[key], b[key]));
}

export const assert = {
  ok(value, message = `expected a truthy value, got ${show(value)}`) {
    if (!value) throw new AssertionError(message);
  },
  equal(actual, expected, message) {
    if (!Object.is(actual, expected)) throw new AssertionError(message || `expected ${show(expected)}, got ${show(actual)}`);
  },
  notEqual(actual, unexpected, message) {
    if (Object.is(actual, unexpected)) throw new AssertionError(message || `did not expect ${show(actual)}`);
  },
  deepEqual(actual, expected, message) {
    if (!deepEqual(actual, expected)) throw new AssertionError(message || `expected ${show(expected)}, got ${show(actual)}`);
  },
  close(actual, expected, tolerance = 1e-9, message) {
    if (!(Math.abs(actual - expected) <= tolerance)) {
      throw new AssertionError(message || `expected ${expected} ± ${tolerance}, got ${actual}`);
    }
  },
  match(text, pattern, message) {
    if (!pattern.test(text)) throw new AssertionError(message || `expected ${show(String(text).slice(0, 200))} to match ${pattern}`);
  },
  includes(container, item, message) {
    if (!container.includes(item)) throw new AssertionError(message || `expected ${show(container)} to include ${show(item)}`);
  },
  throws(body, pattern, message) {
    try {
      body();
    } catch (error) {
      if (pattern && !pattern.test(error.message)) throw new AssertionError(`error "${error.message}" does not match ${pattern}`);
      return;
    }
    throw new AssertionError(message || 'expected the function to throw');
  },
};

/**
 * Run every registered test.
 * @param {{ inBrowser?: boolean, onResult?: (result: object) => void }} [settings]
 * @returns {Promise<{ passed: number, failed: number, skipped: number, results: object[] }>}
 */
export async function run({ inBrowser = typeof document !== 'undefined', onResult = () => {} } = {}) {
  const results = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const suite of suites) {
    for (const test of suite.tests) {
      const result = { suite: suite.name, name: test.name, status: 'passed', error: null, ms: 0 };
      if (test.browserOnly && !inBrowser) {
        result.status = 'skipped';
        skipped++;
      } else {
        const started = (typeof performance !== 'undefined' ? performance : Date).now();
        try {
          await test.body();
          passed++;
        } catch (error) {
          result.status = 'failed';
          result.error = error;
          failed++;
        }
        result.ms = (typeof performance !== 'undefined' ? performance : Date).now() - started;
      }
      results.push(result);
      onResult(result);
    }
  }
  return { passed, failed, skipped, results };
}
