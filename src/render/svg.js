/**
 * SVG renderer: scene -> SVG markup string.
 *
 * Producing a string (instead of creating DOM nodes one by one) keeps the
 * renderer usable outside the browser, makes "export as SVG" trivial and is
 * fast: the browser parses the whole chart in one go when it is assigned to
 * innerHTML. All styling is written as presentation attributes, so the
 * output is a self-contained SVG file that looks the same in any viewer.
 */
import { Path, toSVGPathData } from '../core/path.js';
import { appendSymbol } from '../core/symbols.js';
import { baselineShift } from '../core/text.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape text for use in SVG/XML content and attribute values.
 * @param {unknown} text
 */
export function escapeXML(text) {
  return String(text).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/** Two decimals are more than enough for screen coordinates. */
const num = (value) => Math.round(value * 100) / 100;

/**
 * Serialise an attribute map, skipping null/undefined/false values.
 * @param {Record<string, unknown>} attributes
 */
function attrs(attributes) {
  let out = '';
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    out += ` ${name}="${escapeXML(value)}"`;
  }
  return out;
}

const dashArray = (dash) => (Array.isArray(dash) && dash.length ? dash.join(' ') : null);
const opacityAttr = (value) => (value === undefined || value === null || value >= 1 ? null : num(value));

/**
 * Render a scene to an SVG document string.
 * @param {import('../scene/build.js').Scene} scene
 * @param {object} [settings]
 * @param {string} [settings.id] prefix for element ids (clip paths, title) - must be unique per page
 * @returns {string}
 */
export function renderSVG(scene, { id = 'zp' } = {}) {
  const defs = [];
  let clipCounter = 0;

  const renderNode = (node) => {
    switch (node.type) {
      case 'rect':
        return `<rect${attrs({
          x: num(node.x), y: num(node.y), width: num(node.width), height: num(node.height),
          rx: node.radius || null, fill: node.fill || 'none', stroke: node.stroke || null,
          'stroke-width': node.stroke ? node.strokeWidth ?? 1 : null, opacity: opacityAttr(node.opacity), class: node.className,
        })}/>`;

      case 'line':
        return `<line${attrs({
          x1: num(node.x1), y1: num(node.y1), x2: num(node.x2), y2: num(node.y2),
          stroke: node.stroke, 'stroke-width': node.strokeWidth ?? 1, 'stroke-dasharray': dashArray(node.dash),
          'stroke-linecap': node.lineCap || null, opacity: opacityAttr(node.opacity), class: node.className,
        })}/>`;

      case 'path': {
        if (!node.path || node.path.isEmpty) return '';
        return `<path${attrs({
          d: toSVGPathData(node.path), fill: node.fill || 'none', 'fill-opacity': opacityAttr(node.fillOpacity),
          stroke: node.stroke || null, 'stroke-width': node.stroke ? node.strokeWidth ?? 1 : null,
          'stroke-opacity': opacityAttr(node.strokeOpacity), 'stroke-dasharray': dashArray(node.dash),
          'stroke-linejoin': node.lineJoin || null, 'stroke-linecap': node.lineCap || null,
          'paint-order': node.paintOrder || null, class: node.className, 'data-series': node.seriesKey,
        })}/>`;
      }

      case 'text': {
        const shift = num(baselineShift(node.baseline, node.font.size));
        const anchor = node.anchor === 'middle' ? 'middle' : node.anchor === 'end' ? 'end' : null;
        const common = {
          fill: node.fill, 'font-size': node.font.size, 'font-weight': node.font.weight && node.font.weight !== 400 ? node.font.weight : null,
          'text-anchor': anchor,
          // A halo in the background colour keeps labels legible where they cross data.
          stroke: node.halo || null, 'stroke-width': node.halo ? 3 : null, 'stroke-linejoin': node.halo ? 'round' : null,
          'paint-order': node.halo ? 'stroke' : null,
          class: node.className,
        };
        if (node.rotate) {
          // Rotate around the anchor point; the baseline shift happens in the rotated frame.
          return `<text${attrs({ transform: `translate(${num(node.x)} ${num(node.y)}) rotate(${node.rotate})`, x: 0, y: shift, ...common })}>${escapeXML(node.text)}</text>`;
        }
        return `<text${attrs({ x: num(node.x), y: num(node.y + shift), ...common })}>${escapeXML(node.text)}</text>`;
      }

      case 'markers': {
        const { xs, ys, sizes, symbol } = node;
        if (!xs.length) return '';
        const ring = node.ring > 0 && node.individual ? node.ring : 0;
        const groupAttrs = attrs({
          fill: node.fill, 'fill-opacity': opacityAttr(node.fillOpacity),
          stroke: ring ? node.ringColor : null, 'stroke-width': ring ? ring * 2 : null,
          'paint-order': ring ? 'stroke' : null, 'stroke-linejoin': ring ? 'round' : null,
          class: node.className, 'data-series': node.seriesKey,
        });
        if (node.individual) {
          // One element per point: each marker gets its own separating ring.
          let children = '';
          for (let index = 0; index < xs.length; index++) {
            const size = sizes ? sizes[index] : node.size;
            if (symbol === 'circle') {
              children += `<circle cx="${num(xs[index])}" cy="${num(ys[index])}" r="${num(size / 2)}"/>`;
            } else {
              children += `<path d="${toSVGPathData(appendSymbol(new Path(), symbol, xs[index], ys[index], size))}"/>`;
            }
          }
          return `<g${groupAttrs}>${children}</g>`;
        }
        // Many points: a single path keeps the DOM small.
        const path = new Path();
        for (let index = 0; index < xs.length; index++) {
          appendSymbol(path, symbol, xs[index], ys[index], sizes ? sizes[index] : node.size);
        }
        return `<path${groupAttrs} d="${toSVGPathData(path)}"/>`;
      }

      case 'group': {
        let clipAttr = null;
        if (node.clip) {
          const clipId = `${id}-clip-${clipCounter++}`;
          const { x, y, width, height } = node.clip;
          defs.push(`<clipPath id="${escapeXML(clipId)}"><rect x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}"/></clipPath>`);
          clipAttr = `url(#${clipId})`;
        }
        const children = node.children.map(renderNode).join('');
        return `<g${attrs({ 'clip-path': clipAttr, opacity: opacityAttr(node.opacity), class: node.className })}>${children}</g>`;
      }

      default:
        return '';
    }
  };

  const body = scene.nodes.map(renderNode).join('');
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  const fontFamily = scene.theme?.fontFamily || 'system-ui, sans-serif';

  return `<svg${attrs({
    xmlns: 'http://www.w3.org/2000/svg',
    width: scene.width,
    height: scene.height,
    viewBox: `0 0 ${scene.width} ${scene.height}`,
    role: 'img',
    'aria-labelledby': `${titleId} ${descId}`,
    'font-family': fontFamily,
    class: 'zp-svg',
  })}><title id="${escapeXML(titleId)}">${escapeXML(scene.title || 'Chart')}</title>`
    + `<desc id="${escapeXML(descId)}">${escapeXML(scene.description || '')}</desc>`
    + (defs.length ? `<defs>${defs.join('')}</defs>` : '')
    + body
    + '</svg>';
}
