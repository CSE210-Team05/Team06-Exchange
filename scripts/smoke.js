import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Supply SMOKE_URL to check an existing deployment instead of the local server.
const deployed_url = process.env.SMOKE_URL;
const server = deployed_url ? null : spawn(process.execPath, ['server/launch.js', '0'], {
  stdio: ['ignore', 'pipe', 'inherit'],
});

try {
  let base_url = deployed_url;
  if (server) {
    base_url = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server did not start within 10 seconds')), 10000);
      let output = '';
      server.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:\d+\//);
        if (match) { clearTimeout(timeout); resolve(match[0]); }
      });
      server.once('error', (error) => { clearTimeout(timeout); reject(error); });
      server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
    });
  }
  const checked = new Set();
  async function check(path, content_type) {
    const url = new URL(path, base_url);
    if (checked.has(url.href)) return;
    checked.add(url.href);
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, `${url} must return 200`);
    assert.match(response.headers.get('content-type') || '', content_type, `${url} has the wrong MIME type`);
    const body = await response.text();
    assert.ok(body.trim(), `${url} must not be empty`);
    if (content_type.source.includes('javascript')) {
      for (const match of body.matchAll(/\bimport\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
        await check(new URL(match[1], url).href, /javascript/);
      }
    }
    return body;
  }
  const html = await check('./', /text\/html/);
  assert.match(html, /id="chart"/, 'Page must contain the chart container');
  assert.match(html, /id="apply"/, 'Page must contain the apply button');
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)];
  assert.ok(assets.length >= 2, 'Page must reference its script and stylesheet');
  for (const [, path] of assets) await check(path, path.endsWith('.css') ? /text\/css/ : /javascript/);
  console.log(`Smoke checks passed: ${checked.size} page and asset URLs`);
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
}
