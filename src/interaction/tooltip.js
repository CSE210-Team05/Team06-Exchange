/**
 * Tooltip DOM and the library's small stylesheet.
 *
 * Series names usually come from user data (CSV headers, API fields), so
 * every piece of text is inserted with textContent - never innerHTML - which
 * makes the tooltip immune to markup injection.
 */

const STYLE_ID = 'zeroplot-styles';

const STYLES = `
.zp-root { position: relative; width: 100%; min-width: 0; outline: none; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
.zp-root:focus-visible { box-shadow: 0 0 0 2px var(--zp-focus, #2a78d6); border-radius: 6px; }
.zp-layer { position: absolute; left: 0; top: 0; }
.zp-layer > svg, .zp-layer > canvas { display: block; }
.zp-overlay { pointer-events: none; }
.zp-tooltip { position: absolute; left: 0; top: 0; z-index: 3; pointer-events: none; box-sizing: border-box;
  min-width: 132px; max-width: 280px; padding: 8px 10px; border-radius: 8px; border: 1px solid;
  font: 12px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.zp-tooltip[hidden] { display: none; }
.zp-tt-title { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 11px; }
.zp-tt-row { display: grid; grid-template-columns: 14px auto minmax(0, 1fr); align-items: center; column-gap: 8px; min-height: 18px; }
.zp-tt-row.zp-no-key { grid-template-columns: auto minmax(0, 1fr); }
.zp-tt-key { justify-self: center; width: 12px; height: 2px; border-radius: 1px; }
.zp-tt-key.zp-dot { width: 8px; height: 8px; border-radius: 50%; }
.zp-tt-value { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.zp-tt-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zp-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 4;
  pointer-events: none; opacity: 0; transition: opacity 160ms ease; border-radius: 6px;
  background: rgba(11, 11, 11, 0.55); color: #fff; font: 500 13px system-ui, -apple-system, "Segoe UI", sans-serif; }
.zp-hint.zp-visible { opacity: 1; }
.zp-sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
@media (prefers-reduced-motion: reduce) { .zp-hint { transition: none; } }
`;

/** Add the stylesheet to the document once (no external CSS file needed). */
export function injectStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

/**
 * @typedef {object} TooltipKey
 * @property {string} color
 * @property {'line'|'dot'} shape
 *
 * @typedef {object} TooltipRow
 * @property {TooltipKey} [key]
 * @property {string} value shown strong
 * @property {string} label shown secondary
 *
 * @typedef {object} TooltipContent
 * @property {string} title
 * @property {TooltipKey} [titleKey]
 * @property {TooltipRow[]} rows
 */

function keyElement(key) {
  const element = document.createElement('span');
  element.className = key.shape === 'dot' ? 'zp-tt-key zp-dot' : 'zp-tt-key';
  element.style.background = key.color;
  return element;
}

/**
 * Fill the tooltip element.
 * @param {HTMLElement} element
 * @param {TooltipContent} content
 * @param {object} theme
 */
export function fillTooltip(element, content, theme) {
  element.style.background = theme.tooltipBackground;
  element.style.borderColor = theme.tooltipBorder;
  element.style.boxShadow = theme.tooltipShadow;
  element.style.color = theme.text;
  element.replaceChildren();

  const title = document.createElement('div');
  title.className = 'zp-tt-title';
  title.style.color = theme.textSecondary;
  if (content.titleKey) title.appendChild(keyElement(content.titleKey));
  title.appendChild(document.createTextNode(content.title));
  element.appendChild(title);

  for (const row of content.rows) {
    const line = document.createElement('div');
    line.className = row.key ? 'zp-tt-row' : 'zp-tt-row zp-no-key';
    if (row.key) line.appendChild(keyElement(row.key));
    const value = document.createElement('span');
    value.className = 'zp-tt-value';
    value.textContent = row.value;
    const label = document.createElement('span');
    label.className = 'zp-tt-label';
    label.style.color = theme.textSecondary;
    label.textContent = row.label;
    line.append(value, label);
    element.appendChild(line);
  }
}

/**
 * Place the tooltip next to (x, y), flipping sides so it stays inside the
 * chart. Coordinates are relative to the chart root.
 * @param {HTMLElement} element
 * @param {number} x
 * @param {number} y
 * @param {number} width chart width
 * @param {number} height chart height
 */
export function placeTooltip(element, x, y, width, height) {
  const offset = 14;
  const box = element.getBoundingClientRect();
  let left = x + offset;
  if (left + box.width > width - 4) left = x - offset - box.width;
  left = Math.max(4, Math.min(left, width - box.width - 4));
  let top = y - box.height / 2;
  top = Math.max(4, Math.min(top, height - box.height - 4));
  element.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}
