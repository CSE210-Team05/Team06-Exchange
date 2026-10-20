import { it } from 'node:test';
import assert from 'node:assert/strict';
import { attach_navigation } from '../app_main/features/plot_handling/chart_interaction.js';

function setup() {
  const events = new Map();
  const captured = new Set();
  const svg = {
    getScreenCTM: () => ({ inverse: () => ({ scale: 0.5 }) }),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform(m) { return { x: this.x * m.scale, y: this.y * m.scale }; } }),
  };
  const host = {
    querySelector: () => svg,
    addEventListener: (name, callback) => { assert.ok(!events.has(name)); events.set(name, callback); },
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => captured.delete(id),
    classList: { add() {}, remove() {} },
  };
  let click;
  let clears = 0;
  const views = [];
  const hints = [];
  const chart = { viewport: { x: [25, 75], y: [25, 75] }, full_domains: { x: [0, 100], y: [0, 100] }, plot_area: { left: 0, right: 100, top: 0, bottom: 100 } };
  const nav = attach_navigation(host, { addEventListener: (_, cb) => { click = cb; } }, () => chart, (view) => views.push(view), () => clears++, (hint) => hints.push(hint));
  const send = (name, extra = {}) => {
    let prevented = false;
    events.get(name)({ clientX: 100, clientY: 100, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true,
      preventDefault: () => { prevented = true; }, ...extra });
    return prevented;
  };
  return { nav, views, hints, chart, captured, send, get_clears: () => clears, click: (action) => click({ target: { closest: () => ({ dataset: { view: action } }) } }) };
}

it('handles only Ctrl wheel inside the plot, using transformed pointer coordinates', () => {
  const s = setup();
  assert.equal(s.send('wheel', { deltaY: -100 }), false);
  assert.equal(s.send('wheel', { ctrlKey: true, deltaY: -100, clientX: 300 }), false);
  assert.equal(s.send('wheel', { ctrlKey: true, deltaY: -100, clientX: 50 }), true);
  const view = s.views[0];
  assert.ok(Math.abs(view.x[0] + (view.x[1] - view.x[0]) * 0.25 - 37.5) < 1e-8);
  assert.equal(s.get_clears(), 1);
});

it('captures drag beyond plot bounds and ends on up, cancel, loss or missing primary button', () => {
  for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointermove']) {
    const s = setup();
    assert.equal(s.send('pointerdown', { pointerType: 'touch' }), false);
    assert.equal(s.send('pointerdown', { button: 2 }), false);
    assert.equal(s.send('pointerdown'), true);
    assert.ok(s.captured.has(1));
    assert.ok(s.nav.is_dragging());
    s.send('pointermove', { clientX: 1000 });
    assert.deepEqual(s.views[0].x, [0, 50]);
    s.send(ending, { buttons: 0 });
    assert.equal(s.nav.is_dragging(), false);
    assert.equal(s.captured.size, 0);
    const count = s.views.length;
    s.send('pointermove');
    assert.equal(s.views.length, count);
  }
});

it('supports button actions and resetting without registering listeners on redraw', () => {
  const s = setup();
  for (const action of ['in', 'out', 'left', 'right', 'up', 'down', 'reset']) s.click(action);
  assert.equal(s.views.length, 7);
  assert.equal(s.views.at(-1), null);
  assert.equal(s.hints.at(-1), 'View reset');
  assert.equal(s.hints[0], 'Zoom level: 2.5×');
  assert.equal(s.hints[1], 'Zoom level: 1.6×');
  assert.deepEqual(s.views[2].x, [15, 65]);
  assert.deepEqual(s.views[4].y, [35, 85]);
});

it('explains when navigation buttons are already at their limits', () => {
  const s = setup();
  const limits = [
    ['out', { x: [0, 100], y: [0, 100] }, 'Already at max zoom out'],
    ['in', { x: [20, 21], y: [40, 41] }, 'Already at max zoom in'],
    ['left', { x: [0, 50], y: [25, 75] }, "Can't go further left"],
    ['right', { x: [50, 100], y: [25, 75] }, "Can't go further right"],
    ['up', { x: [25, 75], y: [50, 100] }, "Can't go further up"],
    ['down', { x: [25, 75], y: [0, 50] }, "Can't go further down"],
  ];
  for (const [action, viewport, message] of limits) {
    s.chart.viewport = viewport;
    s.click(action);
    assert.equal(s.hints.at(-1), message);
  }
  assert.equal(s.views.length, 0);
});
