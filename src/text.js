/**
 * Vertical text alignment shared by both renderers.
 *
 * SVG's dominant-baseline behaves differently between browsers, so both
 * renderers draw on the alphabetic baseline and move the text by the same
 * em-based offset. That keeps SVG and canvas labels in identical positions.
 *
 * @param {'top'|'middle'|'bottom'|'alphabetic'} baseline
 * @param {number} size font size in px
 * @returns {number} offset in px to add to y
 */
export function baselineShift(baseline, size) {
  switch (baseline) {
    case 'top': return 0.8 * size; // roughly the ascender height
    case 'middle': return 0.35 * size; // half the x-height
    case 'bottom': return -0.22 * size; // descender depth
    default: return 0;
  }
}
