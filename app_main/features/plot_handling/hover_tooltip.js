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
 *
 * @module plot_handling/hover_tooltip
 */
import { chart_pointer } from './chart_interaction.js';
import { MARKER_RADIUS } from './chart_rendering.js';

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
 * @param {Array<module:plot_handling/chart_rendering~HitPoint>} hit_points every drawn point, series by series
 * @param {number} px pointer position in the chart, in px
 * @param {number} py pointer position in the chart, in px
 * @param {'line'|'scatter'} type the plot type
 * @returns {Array<module:plot_handling/chart_rendering~HitPoint>} empty when nothing is close enough
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

/**
 * Markup of the highlight: a vertical hairline in a line plot, and a ringed dot on every point.
 * @param {Array<module:plot_handling/chart_rendering~HitPoint>} found the points to highlight
 * @param {'line'|'scatter'} type the plot type
 * @param {module:plot_handling/chart_rendering~PlotArea} plot_area the area inside the axes
 * @param {module:plot_handling/chart_rendering~Theme} colors the colours of the chart's theme
 * @returns {string} SVG markup
 */
function highlight_markup(found, type, plot_area, colors) {
  const parts = [];
  if (type !== 'scatter') {
    const x = Math.round(found[0].px) + 0.5;
    parts.push(`<line x1="${x}" y1="${plot_area.top}" x2="${x}" y2="${plot_area.bottom}" stroke="${colors.axis}" stroke-width="1"/>`);
  }
  for (const point of found) {
    parts.push(`<circle cx="${point.px}" cy="${point.py}" r="${MARKER_RADIUS + HIGHLIGHT_GROWTH}" fill="${point.color}" `
      + `stroke="${colors.background}" stroke-width="${HIGHLIGHT_RING}"/>`);
  }
  return parts.join('');
}

/**
 * Fill the tooltip: the x value as its title, then one row per series.
 * @param {HTMLElement} tooltip the tooltip element, emptied and refilled
 * @param {Array<module:plot_handling/chart_rendering~HitPoint>} found the points to describe
 * @param {string} x_label title of the x axis
 */
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
 * @param {number} y position in the chart as shown on screen, in px
 * @param {number} width size of the chart as shown on screen, in px
 * @param {number} height size of the chart as shown on screen, in px
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
 * What attach_hover() needs to know about the chart as it is drawn right now.
 * @typedef {object} HoverChart
 * @property {Array<module:plot_handling/chart_rendering~HitPoint>} hit_points every drawn point
 * @property {module:plot_handling/chart_rendering~PlotArea} plot_area the area inside the axes
 * @property {'line'|'scatter'} type the plot type
 * @property {string} x_label title of the x axis
 * @property {module:plot_handling/chart_rendering~Theme} [colors] colours of the chart's theme
 * @property {string} [clip_id] id of the chart's clip path
 */

/**
 * Show hover feedback on a chart.
 * @param {HTMLElement} host the element that holds the chart surface
 * @param {HTMLElement} tooltip an absolutely positioned element that shares the host's offset parent
 * @param {function(): ?HoverChart} get_chart the chart as it is drawn right now, or null
 */
export function attach_hover(host, tooltip, get_chart) {
  const hide = () => {
    tooltip.hidden = true;
    host.querySelector('.hover')?.remove();
  };

  const show = (event) => {
    const chart = get_chart();
    const surface = host.querySelector('svg:not(.chart-overlay), canvas');
    const box = surface?.getBoundingClientRect();
    if (!chart || !box?.width) {
      hide();
      return;
    }
    const pointer = chart_pointer(surface, event, chart);
    if (!pointer) { hide(); return; }
    const { x: px, y: py } = pointer;
    const { left, right, top, bottom } = chart.plot_area;
    const inside = px >= left && px <= right && py >= top && py <= bottom;
    const found = inside ? find_hover_points(chart.hit_points, px, py, chart.type) : [];
    if (!found.length) {
      hide();
      return;
    }

    // A separate SVG overlay works above either rendering backend and disappears on redraw.
    let highlight = host.querySelector('.hover');
    if (!highlight) {
      highlight = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [name, value] of Object.entries({ width: chart.width, height: chart.height, viewBox: `0 0 ${chart.width} ${chart.height}`, 'aria-hidden': 'true' })) highlight.setAttribute(name, value);
      highlight.classList.add('chart-overlay', 'hover');
      host.appendChild(highlight);
    }
    const clip = `${chart.clip_id || 'chart'}-hover`;
    const a = chart.plot_area;
    highlight.innerHTML = `<defs><clipPath id="${clip}"><rect x="${a.left}" y="${a.top}" width="${a.right - a.left}" height="${a.bottom - a.top}"/></clipPath></defs>`
      + `<g clip-path="url(#${clip})">${highlight_markup(found, chart.type, chart.plot_area, chart.colors)}</g>`;

    fill_tooltip(tooltip, found, chart.x_label);
    tooltip.hidden = false;
    const anchor_y = chart.type === 'scatter' ? found[0].py : py;
    place_tooltip(tooltip, host, found[0].px * box.width / chart.width, anchor_y * box.height / chart.height, box.width, box.height);
  };

  host.addEventListener('pointermove', show);
  host.addEventListener('pointerdown', show);
  host.addEventListener('pointerleave', hide);
}
