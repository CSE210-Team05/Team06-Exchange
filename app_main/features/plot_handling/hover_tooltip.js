/**
 * Hover feedback for the chart: finds the data under the pointer, highlights
 * it and shows its values in a tooltip.
 *
 * - Scatter plot: the point closest to the pointer.
 * - Line plot: the x position closest to the pointer, with the value of every
 *   series there.
 *
 * find_hover_points() is a pure function and is tested in Node.
 * attach_hover() is the only part that touches the DOM.
 */
import { COLORS, MARKER_RADIUS, WIDTH } from './chart_rendering.js';

/** Scatter plot: a point is picked up to this many pixels away from the pointer. */
export const HOVER_RADIUS = 32;
/** Space between the hovered position and the tooltip, and between the tooltip and the chart edge, in px. */
const TOOLTIP_OFFSET = 14;
const TOOLTIP_EDGE = 4;
/** The highlighted point is drawn this much larger than a marker, with a ring in the background colour. */
const HIGHLIGHT_GROWTH = 1.5;
const HIGHLIGHT_RING = 2;

/**
 * The points to show for a pointer position.
 * @param {import('./chart_rendering.js').HitPoint[]} hit_points every drawn point, series by series
 * @param {number} px pointer position in the chart, in px
 * @param {number} py
 * @param {'line'|'scatter'} type
 * @returns {import('./chart_rendering.js').HitPoint[]} empty when nothing is close enough
 */
export function find_hover_points(hit_points, px, py, type) {
  if (!hit_points.length) return [];

  if (type === 'scatter') {
    let best = null;
    let best_distance = Infinity;
    for (const point of hit_points) {
      const distance = Math.hypot(point.px - px, point.py - py);
      // "<=": later series are drawn on top, so they win a tie.
      if (distance <= best_distance) {
        best = point;
        best_distance = distance;
      }
    }
    return best_distance <= HOVER_RADIUS ? [best] : [];
  }

  // Line plot: the pixel column closest to the pointer, then one point per
  // series in that column.
  let column = hit_points[0].px;
  for (const point of hit_points) {
    if (Math.abs(point.px - px) < Math.abs(column - px)) column = point.px;
  }
  const nearest = new Map();
  for (const point of hit_points) {
    const distance = Math.abs(point.px - column);
    if (distance > 1) continue;
    const current = nearest.get(point.series);
    if (!current || distance < Math.abs(current.px - column)) nearest.set(point.series, point);
  }
  return [...nearest.values()];
}

/** Markup of the highlight: a vertical hairline in a line plot, and a ringed dot on every point. */
function highlight_markup(found, type, plot_area) {
  const parts = [];
  if (type !== 'scatter') {
    const x = Math.round(found[0].px) + 0.5;
    parts.push(`<line x1="${x}" y1="${plot_area.top}" x2="${x}" y2="${plot_area.bottom}" stroke="${COLORS.axis}" stroke-width="1"/>`);
  }
  for (const point of found) {
    parts.push(`<circle cx="${point.px}" cy="${point.py}" r="${MARKER_RADIUS + HIGHLIGHT_GROWTH}" fill="${point.color}" `
      + `stroke="${COLORS.background}" stroke-width="${HIGHLIGHT_RING}"/>`);
  }
  return parts.join('');
}

/** Fill the tooltip: the x value as its title, then one row per series. */
function fill_tooltip(tooltip, found, x_label) {
  const title = document.createElement('div');
  title.className = 'tooltip-title';
  title.textContent = `${x_label || 'x'}: ${found[0].x}`; // textContent: labels come from pasted data
  const rows = found.map((point) => {
    const row = document.createElement('div');
    row.className = 'tooltip-row';
    const key = document.createElement('span');
    key.className = 'tooltip-key';
    key.style.background = point.color;
    const name = document.createElement('span');
    name.className = 'tooltip-name';
    name.textContent = point.name;
    const value = document.createElement('span');
    value.className = 'tooltip-value';
    value.textContent = String(point.y);
    row.append(key, name, value);
    return row;
  });
  tooltip.replaceChildren(title, ...rows);
}

/**
 * Put the tooltip beside the position (x, y) of the chart, on the left when
 * there is no room on the right, and keep it inside the chart.
 * @param {HTMLElement} tooltip
 * @param {HTMLElement} host the element that holds the chart
 * @param {number} x position in the chart as shown on screen, in px
 * @param {number} y
 * @param {number} width size of the chart as shown on screen, in px
 * @param {number} height
 */
function place_tooltip(tooltip, host, x, y, width, height) {
  const box_width = tooltip.offsetWidth;
  const box_height = tooltip.offsetHeight;
  let left = x + TOOLTIP_OFFSET;
  if (left + box_width > width - TOOLTIP_EDGE) left = x - TOOLTIP_OFFSET - box_width;
  left = Math.max(TOOLTIP_EDGE, Math.min(left, width - box_width - TOOLTIP_EDGE));
  const top = Math.max(TOOLTIP_EDGE, Math.min(y - box_height / 2, height - box_height - TOOLTIP_EDGE));
  tooltip.style.transform = `translate(${Math.round(host.offsetLeft + left)}px, ${Math.round(host.offsetTop + top)}px)`;
}

/**
 * Show hover feedback on a chart.
 * @param {HTMLElement} host the element that holds the chart's <svg>
 * @param {HTMLElement} tooltip an absolutely positioned element that shares the host's offset parent
 * @param {() => ({ hit_points: object[], plot_area: object, type: string, x_label: string } | null)} get_chart
 *   the chart as it is drawn right now
 */
export function attach_hover(host, tooltip, get_chart) {
  const hide = () => {
    tooltip.hidden = true;
    host.querySelector('.hover')?.remove();
  };

  const show = (event) => {
    const svg = host.querySelector('svg');
    const chart = get_chart();
    const box = svg?.getBoundingClientRect();
    if (!chart || !box?.width) {
      hide();
      return;
    }
    // The chart is shown at its natural size, so the scale is 1 unless a stylesheet resizes it.
    const scale = WIDTH / box.width;
    const px = (event.clientX - box.left) * scale;
    const py = (event.clientY - box.top) * scale;
    const { left, right, top, bottom } = chart.plot_area;
    const inside = px >= left && px <= right && py >= top && py <= bottom;
    const found = inside ? find_hover_points(chart.hit_points, px, py, chart.type) : [];
    if (!found.length) {
      hide();
      return;
    }

    // The highlight lives inside the chart's <svg>, so it disappears with the chart on a redraw.
    let highlight = svg.querySelector('.hover');
    if (!highlight) {
      highlight = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      highlight.setAttribute('class', 'hover');
      highlight.setAttribute('pointer-events', 'none');
      svg.appendChild(highlight);
    }
    highlight.innerHTML = highlight_markup(found, chart.type, chart.plot_area);

    fill_tooltip(tooltip, found, chart.x_label);
    tooltip.hidden = false;
    const anchor_y = chart.type === 'scatter' ? found[0].py : py;
    place_tooltip(tooltip, host, found[0].px / scale, anchor_y / scale, box.width, box.height);
  };

  host.addEventListener('pointermove', show);
  host.addEventListener('pointerdown', show);
  host.addEventListener('pointerleave', hide);
}
