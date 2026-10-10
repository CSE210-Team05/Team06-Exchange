/**
 * Site theme switch: System -> Light -> Dark. The choice is written to
 * <html data-theme>, which charts with theme 'auto' follow automatically.
 */
const STORAGE_KEY = 'zeroplot-theme';
const LABELS = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' };
const ORDER = ['system', 'light', 'dark'];

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return ORDER.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

function apply(mode) {
  if (mode === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
}

/**
 * Wire up a theme button.
 * @param {HTMLButtonElement} button
 */
export function setupThemeToggle(button) {
  let mode = readStored();
  apply(mode);
  const render = () => {
    button.textContent = LABELS[mode];
    button.setAttribute('aria-label', `${LABELS[mode]}. Activate to change.`);
  };
  render();
  button.addEventListener('click', () => {
    mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    apply(mode);
    render();
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage can be unavailable (private mode, sandboxed frames); the toggle still works.
    }
  });
}
