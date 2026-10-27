/**
 * DOM-only chart navigation: zoom with Ctrl + wheel, pan by dragging, and the
 * zoom, pan and reset buttons. Attach once to the persistent host, never to redraws.
 *
 * @module plot_handling/chart_interaction
 */

import { MAX_ZOOM, pan_view, zoom_view } from './viewport.js';

/** Hint shown when a navigation action cannot go any further, by action. */
const LIMIT_MESSAGES = {
  in: 'Already at max zoom in',
  out: 'Already at max zoom out',
  left: "Can't go further left",
  right: "Can't go further right",
  up: "Can't go further up",
  down: "Can't go further down",
};

/**
 * Whether a zoom or pan action is already at its limit.
 * @param {string} action `in`, `out`, `left`, `right`, `up` or `down`
 * @param {{viewport: module:plot_handling/viewport~View, full_domains: module:plot_handling/viewport~View}} chart the chart as it is drawn now
 * @returns {boolean} true when the action would change nothing
 */
function at_limit(action, { viewport, full_domains }) {
  const epsilon = Number.EPSILON * 100;
  const close = (a, b) => Math.abs(a - b) <= epsilon * Math.max(1, Math.abs(a), Math.abs(b));
  if (action === 'in') return ['x', 'y'].every((axis) => close(
    viewport[axis][1] - viewport[axis][0],
    (full_domains[axis][1] - full_domains[axis][0]) / MAX_ZOOM,
  ));
  if (action === 'out') return ['x', 'y'].every((axis) => close(
    viewport[axis][1] - viewport[axis][0],
    full_domains[axis][1] - full_domains[axis][0],
  ));
  if (action === 'left') return close(viewport.x[0], full_domains.x[0]);
  if (action === 'right') return close(viewport.x[1], full_domains.x[1]);
  if (action === 'down') return close(viewport.y[0], full_domains.y[0]);
  if (action === 'up') return close(viewport.y[1], full_domains.y[1]);
  return false;
}

/**
 * The hint that names the zoom level of a view.
 * @param {module:plot_handling/viewport~View} view the visible domains
 * @param {module:plot_handling/viewport~View} full the full domains
 * @returns {string} for example `Zoom level: 2×`
 */
function zoom_message(view, full) {
  const level = (full.x[1] - full.x[0]) / (view.x[1] - view.x[0]);
  return `Zoom level: ${Math.round(level * 100) / 100}×`;
}

/**
 * Convert a pointer event to chart coordinates (the SVG's own coordinate system).
 * @param {?SVGSVGElement} svg the chart's SVG element
 * @param {PointerEvent|WheelEvent} event a pointer or wheel event
 * @returns {?DOMPoint} the position in chart coordinates, or null when the SVG is not displayed
 */
export function svg_pointer(svg, event) {
  const matrix = svg?.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(matrix.inverse());
}

/**
 * Add wheel zoom, drag panning and the view buttons to a chart.
 * @param {HTMLElement} host the persistent element that holds the chart's SVG
 * @param {HTMLElement} controls the element that holds the buttons with a `data-view` attribute
 * @param {function(): ?module:plot_handling/chart_rendering~Chart} get_chart the chart as it is drawn right now
 * @param {function(?module:plot_handling/viewport~View): void} set_view called with the new view, or null to reset
 * @param {function(): void} clear_hover called when a hover highlight must go away
 * @param {function(string): void} [show_hint] shows a short message about the view
 * @returns {{is_dragging: function(): boolean, cancel: function(): void}} whether a drag is
 *   in progress, and a way to end it
 */
export function attach_navigation(host, controls, get_chart, set_view, clear_hover, show_hint = () => {}) {
  let drag = null;
  const finish = (event) => {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const id = drag.id;
    drag = null;
    host.classList.remove('dragging');
    if (host.hasPointerCapture(id)) host.releasePointerCapture(id);
  };
  const inside = (p, a) => p && p.x >= a.left && p.x <= a.right && p.y >= a.top && p.y <= a.bottom;
  host.addEventListener('wheel', (event) => {
    const chart = get_chart();
    const p = svg_pointer(host.querySelector('svg'), event);
    if (!event.ctrlKey || !event.deltaY || drag || !chart || !inside(p, chart.plot_area)) return;
    const a = chart.plot_area;
    event.preventDefault();
    clear_hover();
    const action = event.deltaY < 0 ? 'in' : 'out';
    if (at_limit(action, chart)) { show_hint(LIMIT_MESSAGES[action]); return; }
    const view = zoom_view(chart.viewport, chart.full_domains, Math.exp(Math.sign(event.deltaY) * 0.2), {
      x: (p.x - a.left) / (a.right - a.left), y: (a.bottom - p.y) / (a.bottom - a.top),
    });
    show_hint(zoom_message(view, chart.full_domains));
    set_view(view);
  }, { passive: false });
  host.addEventListener('pointerdown', (event) => {
    const chart = get_chart();
    const p = svg_pointer(host.querySelector('svg'), event);
    if (drag || event.pointerType !== 'mouse' || event.button !== 0 || !event.isPrimary || !chart || !inside(p, chart.plot_area)) return;
    host.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, point: p, chart };
    host.classList.add('dragging');
    clear_hover();
    event.preventDefault();
  });
  host.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!(event.buttons & 1)) { finish(event); return; }
    const p = svg_pointer(host.querySelector('svg'), event);
    if (!p) return;
    const { chart, point } = drag;
    const a = chart.plot_area;
    event.preventDefault();
    show_hint('');
    set_view(pan_view(chart.viewport, chart.full_domains,
      (point.x - p.x) / (a.right - a.left), (p.y - point.y) / (a.bottom - a.top)));
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) host.addEventListener(name, finish);
  controls.addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.view;
    const chart = get_chart();
    if (!action || !chart) return;
    finish();
    clear_hover();
    if (action === 'reset') { show_hint('View reset'); set_view(null); return; }
    if (at_limit(action, chart)) { show_hint(LIMIT_MESSAGES[action]); return; }
    if (action === 'in' || action === 'out') {
      const view = zoom_view(chart.viewport, chart.full_domains, action === 'in' ? 0.8 : 1.25);
      show_hint(zoom_message(view, chart.full_domains));
      set_view(view);
    } else {
      show_hint('');
      const [dx, dy] = { left: [-0.2, 0], right: [0.2, 0], up: [0, 0.2], down: [0, -0.2] }[action];
      set_view(pan_view(chart.viewport, chart.full_domains, dx, dy));
    }
  });
  return { is_dragging: () => drag !== null, cancel: finish };
}
