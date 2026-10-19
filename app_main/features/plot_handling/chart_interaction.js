/** DOM-only chart navigation. Attach once to the persistent host, never to redraws. */
import { pan_view, zoom_view } from './viewport.js';

export function svg_pointer(svg, event) {
  const matrix = svg?.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(matrix.inverse());
}

export function attach_navigation(host, controls, get_chart, set_view, clear_hover) {
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
    set_view(zoom_view(chart.viewport, chart.full_domains, Math.exp(Math.sign(event.deltaY) * 0.2), {
      x: (p.x - a.left) / (a.right - a.left), y: (a.bottom - p.y) / (a.bottom - a.top),
    }));
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
    if (action === 'reset') { set_view(null); return; }
    if (action === 'in' || action === 'out') {
      set_view(zoom_view(chart.viewport, chart.full_domains, action === 'in' ? 0.8 : 1.25));
    } else {
      const [dx, dy] = { left: [-0.2, 0], right: [0.2, 0], up: [0, 0.2], down: [0, -0.2] }[action];
      set_view(pan_view(chart.viewport, chart.full_domains, dx, dy));
    }
  });
  return { is_dragging: () => drag !== null, cancel: finish };
}
