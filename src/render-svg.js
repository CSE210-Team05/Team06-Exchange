/**
 * SVG renderer: scene -> SVG markup string.
 *
 * Building a string keeps the renderer free of DOM calls (it runs in Node
 * tests too) and the browser parses the whole chart in one go. All styling
 * is written as attributes, so the markup is a standalone SVG file.
 */
import { FONT_FAMILY } from './scene.js';
import { baselineShift } from './text.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for XML content and attribute values (labels come from user data). */
export function escapeXML(text) {
  return String(text).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/** Two decimals are plenty for screen coordinates and keep the markup small. */
const num = (value) => Math.round(value * 100) / 100;

const ANCHORS = { start: 'start', middle: 'middle', end: 'end' };

function renderNode(node) {
  switch (node.type) {
    case 'rect':
      return `<rect x="${num(node.x)}" y="${num(node.y)}" width="${num(node.width)}" height="${num(node.height)}" fill="${node.fill}"/>`;

    case 'line':
      return `<line x1="${num(node.x1)}" y1="${num(node.y1)}" x2="${num(node.x2)}" y2="${num(node.y2)}" stroke="${node.stroke}" stroke-width="1"/>`;

    case 'polyline': {
      const coordinates = [];
      for (let index = 0; index < node.points.length; index += 2) {
        coordinates.push(`${num(node.points[index])},${num(node.points[index + 1])}`);
      }
      return `<polyline points="${coordinates.join(' ')}" fill="none" stroke="${node.stroke}" stroke-width="${node.width}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }

    case 'circles': {
      // The ring is painted first (paint-order) so it only shows outside the dot,
      // separating overlapping markers.
      const circles = node.xs.map((x, index) => `<circle cx="${num(x)}" cy="${num(node.ys[index])}" r="${node.r}"/>`).join('');
      return `<g fill="${node.fill}" stroke="${node.ringColor}" stroke-width="${node.ring * 2}" paint-order="stroke">${circles}</g>`;
    }

    case 'text': {
      const shift = num(baselineShift(node.baseline, node.size));
      const style = `font-size="${node.size}"${node.weight !== 400 ? ` font-weight="${node.weight}"` : ''} fill="${node.fill}" text-anchor="${ANCHORS[node.anchor] || 'start'}"`;
      if (node.rotate) {
        return `<text transform="translate(${num(node.x)} ${num(node.y)}) rotate(${node.rotate})" x="0" y="${shift}" ${style}>${escapeXML(node.text)}</text>`;
      }
      return `<text x="${num(node.x)}" y="${num(node.y + shift)}" ${style}>${escapeXML(node.text)}</text>`;
    }

    default:
      return '';
  }
}

/**
 * Render a scene as an SVG document.
 * @param {ReturnType<import('./scene.js').buildScene>} scene
 * @returns {string}
 */
export function renderSVG(scene) {
  const { width, height } = scene;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" `
    + `role="img" font-family="${escapeXML(FONT_FAMILY)}">`
    + `<title>${escapeXML(scene.title)}</title><desc>${escapeXML(scene.description)}</desc>`
    + scene.nodes.map(renderNode).join('')
    + '</svg>';
}
