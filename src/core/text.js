/**
 * Text measurement for layout.
 *
 * Axis margins depend on how wide the tick labels are, so the layout needs
 * real text widths before anything is drawn. In a browser we ask a hidden
 * canvas; outside the browser (Node tests) we fall back to an estimate based
 * on the average glyph width of common sans-serif fonts.
 */

/** Average advance width of a sans-serif glyph, as a fraction of the font size. */
const FALLBACK_GLYPH_WIDTH = 0.56;
const CACHE_LIMIT = 4000;

let measuringContext = null;
const widthCache = new Map();

function getMeasuringContext() {
  if (measuringContext !== null) return measuringContext;
  measuringContext = false;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      measuringContext = new OffscreenCanvas(1, 1).getContext('2d') || false;
    } else if (typeof document !== 'undefined') {
      measuringContext = document.createElement('canvas').getContext('2d') || false;
    }
  } catch {
    measuringContext = false;
  }
  return measuringContext;
}

/**
 * CSS font shorthand, e.g. "600 13px system-ui".
 * @param {{ size: number, weight?: number|string, family: string }} font
 */
export function fontString(font) {
  return `${font.weight || 400} ${font.size}px ${font.family}`;
}

/**
 * Width of `text` in CSS pixels.
 * @param {string} text
 * @param {{ size: number, weight?: number|string, family: string }} font
 */
export function measureText(text, font) {
  const css = fontString(font);
  const key = `${css}|${text}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;

  const context = getMeasuringContext();
  let width;
  if (context) {
    context.font = css;
    width = context.measureText(text).width;
  } else {
    const boldFactor = Number(font.weight) >= 600 ? 1.06 : 1;
    width = String(text).length * font.size * FALLBACK_GLYPH_WIDTH * boldFactor;
  }
  if (widthCache.size > CACHE_LIMIT) widthCache.clear();
  widthCache.set(key, width);
  return width;
}

/**
 * Vertical offset (in px) that moves an alphabetic baseline so the text is
 * aligned as requested. Both renderers use these same offsets, which keeps
 * SVG and canvas output aligned to the pixel.
 * @param {'top'|'middle'|'bottom'|'alphabetic'} baseline
 * @param {number} size font size in px
 */
export function baselineShift(baseline, size) {
  switch (baseline) {
    case 'top': return 0.8 * size; // roughly the ascender height
    case 'middle': return 0.35 * size; // half the x-height above the baseline
    case 'bottom': return -0.22 * size; // descender depth
    default: return 0;
  }
}

/**
 * Shorten `text` with an ellipsis so it fits in `maxWidth` pixels.
 * @param {string} text
 * @param {number} maxWidth
 * @param {{ size: number, weight?: number|string, family: string }} font
 */
export function truncateText(text, maxWidth, font) {
  if (measureText(text, font) <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measureText(`${text.slice(0, middle)}…`, font) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return low > 0 ? `${text.slice(0, low)}…` : '';
}
