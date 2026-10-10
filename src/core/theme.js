/**
 * Visual themes.
 *
 * The categorical palette is an eight-colour set whose order was checked for
 * colour-vision-deficiency separation: neighbouring slots stay distinguishable
 * under protanopia, deuteranopia and tritanopia simulation, in light and in
 * dark mode. The dark palette uses the same hues re-stepped for the dark
 * surface instead of an automatic inversion. Chart chrome (grid, axes, text)
 * is deliberately quiet so the data is the loudest thing on the page.
 */

const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const PALETTE_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const PALETTE_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

/** @typedef {typeof light} Theme */

const light = {
  name: 'light',
  background: '#fcfcfb',
  text: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#898781',
  grid: '#e1e0d9',
  gridMinor: '#efeee9',
  axis: '#c3c2b7',
  palette: PALETTE_LIGHT,
  /** Colour for series beyond the eighth: a neutral that never poses as a category. */
  overflow: '#898781',
  tooltipBackground: '#ffffff',
  tooltipBorder: 'rgba(11, 11, 11, 0.10)',
  tooltipShadow: '0 4px 16px rgba(11, 11, 11, 0.10)',
  selection: 'rgba(42, 120, 214, 0.10)',
  selectionBorder: 'rgba(42, 120, 214, 0.55)',
  fontFamily: FONT_FAMILY,
  fontSize: { title: 15, subtitle: 12, axisLabel: 12, tick: 11, legend: 12, annotation: 11 },
};

const dark = {
  ...light,
  name: 'dark',
  background: '#1a1a19',
  text: '#f0efec',
  textSecondary: '#c3c2b7',
  textMuted: '#898781',
  grid: '#2c2c2a',
  gridMinor: '#232322',
  axis: '#4a4a46',
  palette: PALETTE_DARK,
  overflow: '#898781',
  tooltipBackground: '#262624',
  tooltipBorder: 'rgba(255, 255, 255, 0.10)',
  tooltipShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
  selection: 'rgba(57, 135, 229, 0.16)',
  selectionBorder: 'rgba(57, 135, 229, 0.70)',
};

export const themes = { light, dark };

/**
 * Work out whether 'auto' should currently mean light or dark. A
 * `data-theme` attribute on <html> (set by a site's theme toggle) wins over
 * the operating-system preference.
 * @returns {'light'|'dark'}
 */
export function detectColorScheme() {
  if (typeof document !== 'undefined') {
    const explicit = document.documentElement.getAttribute('data-theme');
    if (explicit === 'light' || explicit === 'dark') return explicit;
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

/**
 * Resolve the `theme` option into a complete theme object.
 * @param {'auto'|'light'|'dark'|object} [option] a name, or an object of overrides
 *   (`{ base: 'dark', grid: '#333' }`)
 * @returns {Theme}
 */
export function resolveTheme(option = 'auto') {
  if (option && typeof option === 'object') {
    const baseName = option.base === 'dark' || option.base === 'light' ? option.base : detectColorScheme();
    const base = themes[baseName];
    return {
      ...base,
      ...option,
      fontSize: { ...base.fontSize, ...(option.fontSize || {}) },
      palette: option.palette || base.palette,
    };
  }
  if (option === 'light' || option === 'dark') return themes[option];
  return themes[detectColorScheme()];
}
