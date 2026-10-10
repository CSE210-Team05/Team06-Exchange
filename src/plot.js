/**
 * Plot: the public, interactive chart component.
 *
 * Responsibilities:
 *  - own the DOM (main layer, overlay layer, tooltip) inside a container;
 *  - turn options into a scene and hand it to the SVG or canvas renderer;
 *  - handle hover, tooltips, legend toggling, zoom/pan (mouse, wheel,
 *    touch pinch, keyboard), resizing and theme changes;
 *  - export the chart as SVG/PNG and as an accessible data table.
 *
 * Hover feedback (crosshair, highlighted points, zoom box) is drawn on a
 * separate overlay layer so moving the pointer never redraws the chart.
 */
import { buildScene } from './scene/build.js';
import { renderSVG } from './render/svg.js';
import { paintCanvas } from './render/canvas.js';
import { normalizeSeries } from './core/data.js';
import { mergeOptions, normalizeShorthand, resolveOptions, resolveSeriesOptions } from './core/options.js';
import { resolveTheme } from './core/theme.js';
import { PointIndex, nearestByX, uniqueXPositions } from './interaction/hittest.js';
import { fillTooltip, injectStyles, placeTooltip } from './interaction/tooltip.js';

let instanceCount = 0;

/** Zoom factor of one keyboard step (+/-). */
const KEY_ZOOM = 1.25;
/** Fraction of the plot moved by one Shift+Arrow press. */
const KEY_PAN = 0.1;
/** Pointer movement (px) below which a press counts as a click, not a drag. */
const CLICK_SLOP = 4;
/** Hover search radius for the nearest-point tooltip, in px. */
const HOVER_RADIUS = 32;

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

/** Does the zoom setting ('xy' | 'x' | 'y' | false) include this axis? */
const zoomsAxis = (setting, axis) => typeof setting === 'string' && setting.includes(axis);

export class Plot {
  /**
   * @param {string|HTMLElement} target a container element or CSS selector
   * @param {object} [options] see README / src/core/options.js for all options
   */
  constructor(target, options = {}) {
    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) throw new Error(`ZeroPlot: container "${target}" not found`);
    injectStyles();

    this.id = `zp${++instanceCount}`;
    this.container = container;
    this.options = resolveOptions(options);
    /** @type {import('./scene/build.js').Scene|null} */
    this.scene = null;

    this._listeners = new Map();
    this._view = { x: null, y: null };
    this._hidden = new Set();
    this._hover = null;
    this._hoverSource = null; // 'pointer' | 'keyboard'
    this._pointer = null;
    this._drag = null;
    this._pinch = null;
    this._box = null;
    this._pointers = new Map();
    this._frame = 0;
    this._hintTimer = 0;
    this._pointIndex = null;
    this._xPositions = null;

    this._createDOM();
    this._setSeries(this.options.series);
    this._bindEvents();
    this.render();
  }

  // ------------------------------------------------------------------ public API

  /**
   * Change options and redraw. Objects are merged deeply; arrays (such as
   * `series`) replace the previous value. New series data resets the zoom.
   * @param {object} patch
   * @returns {this}
   */
  update(patch = {}) {
    const normalized = normalizeShorthand(patch);
    const previous = this.options;
    this.options = mergeOptions(this.options, normalized);
    if ('series' in normalized || 'type' in normalized) {
      this._setSeries(this.options.series);
      this._view = { x: null, y: null };
    }
    // A different scale type makes the stored zoom window meaningless.
    if (previous.x.scale !== this.options.x.scale) this._view.x = null;
    if (previous.y.scale !== this.options.y.scale) this._view.y = null;
    if (previous.renderer !== this.options.renderer) this._createSurfaces();
    this._configureTouch();
    this.render();
    return this;
  }

  /**
   * Replace the data of one series (by index, id or name) - handy for live data.
   * @param {number|string} which
   * @param {unknown} data same shapes as a series' `data` option
   */
  setData(which, data) {
    const position = this._seriesPosition(which);
    if (position < 0) throw new Error(`ZeroPlot: unknown series "${which}"`);
    const list = this.options.series.slice();
    list[position] = { ...list[position], data };
    this.options = { ...this.options, series: list };
    this._series[position] = normalizeSeries(resolveSeriesOptions(list[position]), position, this.options.type);
    this._requestRender();
    return this;
  }

  /** Switch between 'svg' and 'canvas' output. */
  setRenderer(renderer) {
    return this.update({ renderer });
  }

  /**
   * Show or hide a series (by index, id or name). Returns the new visibility.
   * @param {number|string} which
   * @param {boolean} [visible] omit to toggle
   */
  toggleSeries(which, visible) {
    const position = this._seriesPosition(which);
    if (position < 0) return false;
    const { key, name } = this._series[position];
    const show = visible ?? this._hidden.has(key);
    if (show) this._hidden.delete(key);
    else this._hidden.add(key);
    this.render();
    this._emit('toggle', { series: name, index: position, visible: show });
    return show;
  }

  /** Is a series currently shown? */
  isSeriesVisible(which) {
    const position = this._seriesPosition(which);
    return position >= 0 && !this._hidden.has(this._series[position].key);
  }

  /** Current zoom window, e.g. { x: [0, 10], y: null } (null = automatic). */
  get view() {
    return { x: this._view.x && [...this._view.x], y: this._view.y && [...this._view.y] };
  }

  /** Set the zoom window explicitly. */
  setView({ x = this._view.x, y = this._view.y } = {}) {
    this._view = { x: x ? [Number(x[0]), Number(x[1])] : null, y: y ? [Number(y[0]), Number(y[1])] : null };
    this.render();
    this._emit('viewchange', { view: this.view });
    return this;
  }

  get isZoomed() {
    return Boolean(this._view.x || this._view.y);
  }

  /** Return to the automatic (data-fitted) view. */
  resetZoom() {
    if (!this.isZoomed) return this;
    this._view = { x: null, y: null };
    this.render();
    this._emit('viewchange', { view: this.view });
    return this;
  }

  /** Re-measure the container and redraw (also called automatically on resize). */
  resize() {
    this.render();
    return this;
  }

  /**
   * Subscribe to an event: 'render', 'hover', 'click', 'viewchange', 'toggle'.
   * @param {string} name
   * @param {(detail: object) => void} handler
   * @returns {() => void} unsubscribe function
   */
  on(name, handler) {
    if (!this._listeners.has(name)) this._listeners.set(name, new Set());
    this._listeners.get(name).add(handler);
    return () => this.off(name, handler);
  }

  off(name, handler) {
    this._listeners.get(name)?.delete(handler);
    return this;
  }

  /** The chart (in its current zoom state) as a standalone SVG document. */
  toSVG() {
    const scene = this.scene || this._buildScene();
    return `<?xml version="1.0" encoding="UTF-8"?>\n${renderSVG(scene, { id: `${this.id}-export` })}`;
  }

  /**
   * The chart drawn on a new canvas.
   * @param {number} [scale] output pixels per CSS pixel (2 = retina quality)
   */
  toCanvas(scale = 2) {
    const canvas = document.createElement('canvas');
    paintCanvas(this.scene || this._buildScene(), canvas, scale);
    return canvas;
  }

  /** @returns {Promise<Blob>} PNG image of the chart */
  toPNG(scale = 2) {
    return new Promise((resolve, reject) => {
      this.toCanvas(scale).toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
    });
  }

  /**
   * Save the chart as a file.
   * @param {'png'|'svg'} [format]
   * @param {string} [filename] without extension
   */
  async download(format = 'png', filename) {
    const base = filename || String(this.options.title || 'chart').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';
    const blob = format === 'svg' ? new Blob([this.toSVG()], { type: 'image/svg+xml' }) : await this.toPNG(2);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${base}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * The visible data as an HTML table - the accessible twin of the chart.
   * Series that share the same x values are shown side by side (wide format),
   * otherwise one row per point (long format). The full row count (before
   * `maxRows`) is available as `table.dataset.totalRows`.
   * @param {{ maxRows?: number }} [settings]
   * @returns {HTMLTableElement}
   */
  dataTable({ maxRows = Infinity } = {}) {
    const scene = this.scene || this._buildScene();
    const visible = this._series.filter((series) => !this._hidden.has(series.key));
    const xLabel = this.options.x.label || 'x';
    const yLabel = this.options.y.label || 'y';
    const table = document.createElement('table');
    table.className = 'zp-table';
    if (this.options.title) table.createCaption().textContent = String(this.options.title);

    const sameX = visible.length > 1 && visible.every((series) => series.length === visible[0].length
      && series.xs.every((value, index) => Object.is(value, visible[0].xs[index])));
    const header = sameX ? [xLabel, ...visible.map((series) => series.name)] : ['Series', xLabel, yLabel];
    const rows = [];
    const wide = sameX || visible.length === 1;
    const totalRows = wide ? visible[0]?.length ?? 0 : visible.reduce((sum, series) => sum + series.length, 0);
    if (wide) {
      const first = visible[0];
      for (let index = 0; index < first.length && rows.length < maxRows; index++) {
        rows.push([scene.format.x(first.xs[index]), ...visible.map((series) => scene.format.y(series.ys[index]))]);
      }
      if (!sameX) header.splice(0, header.length, xLabel, first.name);
    } else {
      for (const series of visible) {
        for (let index = 0; index < series.length && rows.length < maxRows; index++) {
          rows.push([series.name, scene.format.x(series.xs[index]), scene.format.y(series.ys[index])]);
        }
      }
    }

    const headRow = table.createTHead().insertRow();
    for (const text of header) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = text;
      headRow.appendChild(cell);
    }
    const body = table.createTBody();
    for (const values of rows) {
      const row = body.insertRow();
      for (const text of values) row.insertCell().textContent = text;
    }
    // Lets callers say "showing 400 of 10,000 rows" when maxRows cut the table.
    table.dataset.totalRows = String(totalRows);
    return table;
  }

  /** Remove the chart and every listener it installed. */
  destroy() {
    cancelAnimationFrame(this._frame);
    clearTimeout(this._hintTimer);
    this._resizeObserver?.disconnect();
    this._themeObserver?.disconnect();
    this._colorScheme?.removeEventListener('change', this._onThemeChange);
    this.root.remove();
    this._listeners.clear();
  }

  // ------------------------------------------------------------------ rendering

  /** Draw the chart now (normally you never need to call this). */
  render() {
    cancelAnimationFrame(this._frame);
    this._frame = 0;
    const { width, height } = this._measure();
    this.root.style.width = this.options.width != null ? `${width}px` : '';
    this.root.style.height = `${height}px`;

    this.scene = this._buildScene(width, height);
    this._pointIndex = null;
    this._xPositions = null;

    if (this.options.renderer === 'canvas') {
      paintCanvas(this.scene, this._canvas, this._pixelRatio());
      this._canvas.setAttribute('aria-label', `${this.scene.title}. ${this.scene.description}`);
    } else {
      this.mainLayer.innerHTML = renderSVG(this.scene, { id: this.id });
    }
    this.root.setAttribute('aria-label', `${this.scene.title} (interactive chart)`);

    // Re-evaluate hover against the new geometry (e.g. while zooming).
    if (this._hoverSource === 'pointer' && this._pointer && !this._drag) this._hoverAt(this._pointer.x, this._pointer.y, true);
    else this._setHover(null, null, true);

    this._emit('render', { scene: this.scene });
    return this;
  }

  _buildScene(width, height) {
    const size = width && height ? { width, height } : this._measure();
    return buildScene({
      options: this.options,
      series: this._series,
      theme: resolveTheme(this.options.theme),
      width: size.width,
      height: size.height,
      view: this._view,
      hidden: this._hidden,
    });
  }

  _requestRender() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = 0;
      this.render();
    });
  }

  _measure() {
    const width = this.options.width ?? (this.root.clientWidth || this.container.clientWidth || 600);
    const height = this.options.height ?? (this.container.clientHeight || 360);
    return { width: Math.max(120, Math.floor(width)), height: Math.max(100, Math.floor(height)) };
  }

  _pixelRatio() {
    return this.options.pixelRatio || (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1;
  }

  _setSeries(list = []) {
    this._series = list.map((series, index) => normalizeSeries(resolveSeriesOptions(series), index, this.options.type));
    this._hidden = new Set(this._series.filter((series) => series.options.visible === false).map((series) => series.key));
  }

  _seriesPosition(which) {
    if (typeof which === 'number') return which >= 0 && which < this._series.length ? which : -1;
    return this._series.findIndex((series) => series.key === which || series.name === which);
  }

  _createDOM() {
    this.root = document.createElement('div');
    this.root.className = 'zp-root';
    this.root.tabIndex = 0;
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-roledescription', 'chart');

    this.mainLayer = document.createElement('div');
    this.mainLayer.className = 'zp-layer zp-main';

    this.overlayLayer = document.createElement('div');
    this.overlayLayer.className = 'zp-layer zp-overlay';
    this.overlayLayer.setAttribute('aria-hidden', 'true');

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'zp-tooltip';
    this.tooltip.hidden = true;
    this.tooltip.setAttribute('aria-hidden', 'true');

    this.hint = document.createElement('div');
    this.hint.className = 'zp-hint';
    this.hint.setAttribute('aria-hidden', 'true');

    this.live = document.createElement('div');
    this.live.className = 'zp-sr-only';
    this.live.setAttribute('aria-live', 'polite');

    this.root.append(this.mainLayer, this.overlayLayer, this.tooltip, this.hint, this.live);
    this.container.appendChild(this.root);
    this._createSurfaces();
    this._configureTouch();
  }

  /** (Re)create the drawing surfaces for the active renderer. */
  _createSurfaces() {
    this.mainLayer.replaceChildren();
    this.overlayLayer.replaceChildren();
    this._canvas = null;
    this._overlayCanvas = null;
    if (this.options.renderer === 'canvas') {
      this._canvas = document.createElement('canvas');
      this._canvas.setAttribute('role', 'img');
      this._overlayCanvas = document.createElement('canvas');
      this.mainLayer.appendChild(this._canvas);
      this.overlayLayer.appendChild(this._overlayCanvas);
    }
  }

  /**
   * Touch behaviour: in cooperative mode ('ctrl' wheel) one finger scrolls
   * the page and two fingers pinch the chart; otherwise the chart owns all
   * touch gestures.
   */
  _configureTouch() {
    const { zoom, pan, wheel } = this.options.interaction;
    if (!zoom && !pan) this.root.style.touchAction = 'auto';
    else this.root.style.touchAction = wheel === 'always' ? 'none' : 'pan-x pan-y';
  }

  // ------------------------------------------------------------------ hover & tooltip

  _tooltipMode() {
    const mode = this.options.tooltip.mode;
    if (mode === 'x' || mode === 'nearest') return mode;
    return this.scene.series.some((series) => series.type === 'scatter') ? 'nearest' : 'x';
  }

  _insidePlot(x, y) {
    const area = this.scene.plotArea;
    return x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
  }

  /** Find what is under the pointer and show it. */
  _hoverAt(x, y, silent = false) {
    if (!this.scene || !this.options.tooltip.show || !this._insidePlot(x, y)) {
      this._setHover(null, null, silent);
      return;
    }
    let hover = null;
    if (this._tooltipMode() === 'x') {
      const found = nearestByX(this.scene.series, x);
      if (found) hover = { mode: 'x', x: found.x, y, items: found.items };
    } else {
      if (!this._pointIndex) this._pointIndex = new PointIndex(this.scene.series);
      const found = this._pointIndex.nearest(x, y, HOVER_RADIUS);
      if (found) {
        const series = this.scene.series[found.series];
        hover = { mode: 'nearest', x: series.xs[found.point], y: series.ys[found.point], items: [{ series: found.series, point: found.point }] };
      }
    }
    this._setHover(hover, 'pointer', silent);
  }

  /** Data behind the hovered items: series name, index, values and original datum. */
  _hoverDetails(hover = this._hover) {
    if (!hover) return [];
    return hover.items.map(({ series: position, point }) => {
      const hit = this.scene.series[position];
      const index = hit.indices[point];
      return {
        series: hit.name,
        seriesIndex: hit.index,
        index,
        x: hit.source.xs[index],
        y: hit.source.ys[index],
        datum: hit.source.datum(index),
        color: hit.color,
        hit,
        point,
      };
    });
  }

  _setHover(hover, source, silent = false) {
    const signature = (value) => (value ? `${value.mode}|${value.items.map((item) => `${item.series}:${item.point}`).join(',')}` : '');
    const changed = signature(hover) !== signature(this._hover);
    this._hover = hover;
    this._hoverSource = hover ? source : null;
    this._drawOverlay();
    this._updateTooltip();
    if (changed && !silent) {
      const points = this._hoverDetails().map(({ hit, point, ...detail }) => detail);
      this._emit('hover', { points });
    }
  }

  _overlayNodes() {
    const nodes = [];
    const { plotArea, theme } = this.scene;
    if (this._hover) {
      if (this._hover.mode === 'x' && this.options.crosshair) {
        const x = Math.round(this._hover.x) + 0.5;
        nodes.push({ type: 'line', x1: x, y1: plotArea.y, x2: x, y2: plotArea.y + plotArea.height, stroke: theme.textMuted, strokeWidth: 1 });
      }
      for (const { hit, point } of this._hoverDetails()) {
        const size = hit.markers ? Math.max(10, hit.sizes[point] + 4) : 9;
        nodes.push({
          type: 'markers', symbol: hit.markers ? hit.symbol : 'circle', xs: [hit.xs[point]], ys: [hit.ys[point]],
          size, sizes: null, fill: hit.color, fillOpacity: 1, ring: 2, ringColor: theme.background, individual: true,
        });
      }
    }
    if (this._box) {
      nodes.push({ type: 'rect', ...this._box, fill: theme.selection, stroke: theme.selectionBorder, strokeWidth: 1 });
    }
    return nodes;
  }

  _drawOverlay() {
    if (!this.scene) return;
    const nodes = this._overlayNodes();
    const overlay = { width: this.scene.width, height: this.scene.height, nodes, theme: this.scene.theme, title: '', description: '' };
    if (this._overlayCanvas) {
      paintCanvas(overlay, this._overlayCanvas, this._pixelRatio());
    } else {
      this.overlayLayer.innerHTML = nodes.length ? renderSVG(overlay, { id: `${this.id}-overlay` }) : '';
    }
  }

  _tooltipContent(details) {
    const custom = this.options.tooltip.content;
    if (typeof custom === 'function') {
      return custom(details.map(({ hit, point, ...detail }) => detail));
    }
    const { format } = this.scene;
    if (this._hover.mode === 'x') {
      return {
        title: format.x(details[0].x),
        rows: details.map((detail) => ({
          key: { color: detail.color, shape: detail.hit.showLine ? 'line' : 'dot' },
          value: format.y(detail.y),
          label: detail.series,
        })),
      };
    }
    const [detail] = details;
    return {
      title: detail.series,
      titleKey: { color: detail.color, shape: detail.hit.showLine && !detail.hit.markers ? 'line' : 'dot' },
      rows: [
        { value: format.x(detail.x), label: this.options.x.label || 'x' },
        { value: format.y(detail.y), label: this.options.y.label || 'y' },
      ],
    };
  }

  _updateTooltip() {
    if (!this._hover || this._drag?.moved || this._pinch) {
      this.tooltip.hidden = true;
      return;
    }
    const details = this._hoverDetails();
    const content = this._tooltipContent(details);
    if (content instanceof Node) {
      this.tooltip.replaceChildren(content);
    } else if (typeof content === 'string') {
      this.tooltip.textContent = content;
    } else if (content && typeof content === 'object') {
      fillTooltip(this.tooltip, content, this.scene.theme);
    } else {
      this.tooltip.hidden = true;
      return;
    }
    this.tooltip.hidden = false;
    const anchorY = this._hover.mode === 'x'
      ? (this._hoverSource === 'keyboard'
        ? details.reduce((sum, detail) => sum + detail.hit.ys[detail.point], 0) / details.length
        : this._hover.y)
      : this._hover.y;
    placeTooltip(this.tooltip, this._hover.x, anchorY, this.scene.width, this.scene.height);
  }

  // ------------------------------------------------------------------ zoom & pan

  /**
   * Zoom around a pixel position. factor < 1 zooms in, > 1 zooms out.
   * Works for every scale type because it only uses map/invert.
   */
  _zoomAt(px, py, factor) {
    const setting = this.options.interaction.zoom;
    const next = { ...this._view };
    const zoomDomain = (scale, center) => {
      const [r0, r1] = scale.range;
      return [scale.invert(center + (r0 - center) * factor), scale.invert(center + (r1 - center) * factor)];
    };
    if (zoomsAxis(setting, 'x')) next.x = zoomDomain(this.scene.scales.x, px);
    if (zoomsAxis(setting, 'y')) next.y = zoomDomain(this.scene.scales.y, py);
    this._applyView(next);
  }

  /** Shift the view by a number of pixels. */
  _panBy(dx, dy, scales = this.scene.scales) {
    const setting = this.options.interaction.zoom;
    const next = { ...this._view };
    const shift = (scale, delta) => {
      const [r0, r1] = scale.range;
      return [scale.invert(r0 - delta), scale.invert(r1 - delta)];
    };
    if (zoomsAxis(setting, 'x') && dx) next.x = shift(scales.x, dx);
    if (zoomsAxis(setting, 'y') && dy) next.y = shift(scales.y, dy);
    this._applyView(next);
  }

  /** Accept a new view if it is numerically sane, then redraw on the next frame. */
  _applyView(next) {
    const valid = (domain, type) => {
      if (!domain) return true;
      const [low, high] = domain;
      if (!Number.isFinite(low) || !Number.isFinite(high) || !(high > low)) return false;
      if (type === 'log' && !(low > 0)) return false;
      const magnitude = Math.max(Math.abs(low), Math.abs(high));
      // Stop before floating point precision runs out (or the view explodes).
      return (high - low) / Math.max(magnitude, Number.MIN_VALUE) > 1e-11 && high - low < 1e300;
    };
    if (!valid(next.x, this.scene.scales.x.type) || !valid(next.y, this.scene.scales.y.type)) return;
    this._view = next;
    this._requestRender();
    this._emitViewChange();
  }

  _emitViewChange() {
    clearTimeout(this._viewTimer);
    this._viewTimer = setTimeout(() => this._emit('viewchange', { view: this.view }), 60);
  }

  _showHint() {
    if (!this.options.interaction.zoom) return;
    this.hint.textContent = IS_MAC ? 'Hold ⌘ or Ctrl and scroll to zoom' : 'Hold Ctrl and scroll to zoom';
    this.hint.classList.add('zp-visible');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this.hint.classList.remove('zp-visible'), 1100);
  }

  // ------------------------------------------------------------------ events

  _emit(name, detail) {
    const handlers = this._listeners.get(name);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler({ type: name, plot: this, ...detail });
      } catch (error) {
        console.error(`ZeroPlot: "${name}" handler failed`, error);
      }
    }
  }

  _local(event) {
    const rect = this.root.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  _legendAt(x, y) {
    return this.scene?.legend.find((box) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) || null;
  }

  _bindEvents() {
    const root = this.root;
    root.addEventListener('pointerdown', (event) => this._onPointerDown(event));
    root.addEventListener('pointermove', (event) => this._onPointerMove(event));
    root.addEventListener('pointerup', (event) => this._onPointerUp(event));
    root.addEventListener('pointercancel', (event) => this._onPointerCancel(event));
    root.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse' && !this._drag) {
        this._pointer = null;
        this._setHover(null, null);
        root.style.cursor = '';
      }
    });
    root.addEventListener('wheel', (event) => this._onWheel(event), { passive: false });
    root.addEventListener('dblclick', (event) => {
      const { x, y } = this._local(event);
      if (this._insidePlot(x, y) && this.isZoomed) this.resetZoom();
    });
    root.addEventListener('keydown', (event) => this._onKeyDown(event));
    root.addEventListener('blur', () => {
      if (this._hoverSource === 'keyboard') this._setHover(null, null);
    });

    // Follow the container size when no fixed size is given.
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        if (!this.scene) return;
        const { width, height } = this._measure();
        if (width !== this.scene.width || height !== this.scene.height) this._requestRender();
      });
      this._resizeObserver.observe(this.root);
      if (this.options.height == null) this._resizeObserver.observe(this.container);
    }

    // 'auto' theme: follow the OS setting and a site's data-theme toggle.
    this._onThemeChange = () => {
      const theme = this.options.theme;
      const followsSystem = theme === 'auto' || (theme && typeof theme === 'object' && !theme.base);
      if (followsSystem) this._requestRender();
    };
    if (typeof matchMedia === 'function') {
      this._colorScheme = matchMedia('(prefers-color-scheme: dark)');
      this._colorScheme.addEventListener?.('change', this._onThemeChange);
    }
    if (typeof MutationObserver !== 'undefined') {
      this._themeObserver = new MutationObserver(this._onThemeChange);
      this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
  }

  _onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = this._local(event);
    this._pointers.set(event.pointerId, point);
    const { zoom, pan } = this.options.interaction;

    if (this._pointers.size === 2 && zoom) {
      // Second finger: switch from panning to pinch-zooming.
      const [a, b] = [...this._pointers.values()];
      this._pinch = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        scales: { x: this.scene.scales.x.copy(), y: this.scene.scales.y.copy() },
        view: { ...this._view },
      };
      this._drag = null;
      this._updateTooltip();
      return;
    }

    const inside = this._insidePlot(point.x, point.y);
    const boxMode = event.shiftKey && zoom;
    this._drag = {
      id: event.pointerId,
      start: point,
      mode: inside && (boxMode ? 'box' : pan && zoom ? 'pan' : 'none'),
      moved: false,
      pointerType: event.pointerType,
      scales: { x: this.scene.scales.x.copy(), y: this.scene.scales.y.copy() },
    };
    if (this._drag.mode && this._drag.mode !== 'none') {
      try {
        this.root.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic events (tests) cannot be captured; dragging still works.
      }
    }
    if (event.pointerType !== 'mouse') {
      this._pointer = point;
      this._hoverAt(point.x, point.y);
    }
  }

  _onPointerMove(event) {
    const point = this._local(event);
    if (this._pointers.has(event.pointerId)) this._pointers.set(event.pointerId, point);

    if (this._pinch && this._pointers.size >= 2) {
      this._onPinchMove();
      return;
    }

    const drag = this._drag;
    if (drag && drag.id === event.pointerId && (drag.mode === 'pan' || drag.mode === 'box')) {
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
      if (!drag.moved) {
        drag.moved = true;
        this._setHover(null, null);
      }
      if (drag.mode === 'pan') {
        this.root.style.cursor = 'grabbing';
        this._panBy(dx, dy, drag.scales);
      } else {
        this._box = this._selectionBox(drag.start, point);
        this._drawOverlay();
      }
      return;
    }

    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
      this._pointer = point;
      this._hoverAt(point.x, point.y);
      const overLegend = this._legendAt(point.x, point.y);
      this.root.style.cursor = overLegend ? 'pointer' : this._insidePlot(point.x, point.y) ? 'crosshair' : '';
    }
  }

  _onPointerUp(event) {
    const point = this._local(event);
    const drag = this._drag;
    this._pointers.delete(event.pointerId);
    if (this._pinch) {
      if (this._pointers.size < 2) this._pinch = null;
      this._drag = null;
      return;
    }
    if (!drag || drag.id !== event.pointerId) return;
    this._drag = null;
    this.root.style.cursor = this._insidePlot(point.x, point.y) ? 'crosshair' : '';

    if (drag.mode === 'box' && drag.moved) {
      this._applyBox(this._box);
      this._box = null;
      this._drawOverlay();
      return;
    }
    if (drag.moved) return;

    // A click (or tap) without movement.
    const legendBox = this._legendAt(point.x, point.y);
    if (legendBox) {
      this.toggleSeries(legendBox.index);
      return;
    }
    if (this._insidePlot(point.x, point.y)) {
      const scales = this.scene.scales;
      const points = this._hoverDetails().map(({ hit, point: position, ...detail }) => detail);
      this._emit('click', { x: scales.x.invert(point.x), y: scales.y.invert(point.y), points });
    }
  }

  _onPointerCancel(event) {
    this._pointers.delete(event.pointerId);
    if (this._pointers.size < 2) this._pinch = null;
    if (this._drag?.id === event.pointerId) {
      this._drag = null;
      this._box = null;
      this._drawOverlay();
    }
  }

  _onPinchMove() {
    const [a, b] = [...this._pointers.values()];
    const { distance, center, scales, view } = this._pinch;
    const magnification = Math.max(1e-3, Math.hypot(a.x - b.x, a.y - b.y) / distance);
    const now = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // The data point that was under the fingers' midpoint stays under it.
    const window = (scale, start, current) => {
      const [r0, r1] = scale.range;
      return [scale.invert(start + (r0 - current) / magnification), scale.invert(start + (r1 - current) / magnification)];
    };
    const setting = this.options.interaction.zoom;
    const next = { ...view };
    if (zoomsAxis(setting, 'x')) next.x = window(scales.x, center.x, now.x);
    if (zoomsAxis(setting, 'y')) next.y = window(scales.y, center.y, now.y);
    this._applyView(next);
  }

  _selectionBox(start, end) {
    const area = this.scene.plotArea;
    const clampX = (value) => Math.max(area.x, Math.min(area.x + area.width, value));
    const clampY = (value) => Math.max(area.y, Math.min(area.y + area.height, value));
    const setting = this.options.interaction.zoom;
    const x0 = zoomsAxis(setting, 'x') ? clampX(Math.min(start.x, end.x)) : area.x;
    const x1 = zoomsAxis(setting, 'x') ? clampX(Math.max(start.x, end.x)) : area.x + area.width;
    const y0 = zoomsAxis(setting, 'y') ? clampY(Math.min(start.y, end.y)) : area.y;
    const y1 = zoomsAxis(setting, 'y') ? clampY(Math.max(start.y, end.y)) : area.y + area.height;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  _applyBox(box) {
    if (!box) return;
    const { scales, plotArea } = this.scene;
    const next = { ...this._view };
    // A box that is thin in one direction zooms only along the other axis.
    if (box.width > 4 && box.width < plotArea.width - 1) next.x = [scales.x.invert(box.x), scales.x.invert(box.x + box.width)];
    if (box.height > 4 && box.height < plotArea.height - 1) next.y = [scales.y.invert(box.y + box.height), scales.y.invert(box.y)];
    if (next.x !== this._view.x || next.y !== this._view.y) this._applyView(next);
  }

  _onWheel(event) {
    const { wheel, zoom } = this.options.interaction;
    if (!wheel || !zoom || !this.scene) return;
    const point = this._local(event);
    if (!this._insidePlot(point.x, point.y)) return;
    if (wheel === 'ctrl' && !(event.ctrlKey || event.metaKey)) {
      this._showHint();
      return;
    }
    event.preventDefault();
    // Normalise line/page scrolling to pixels, then map to a gentle exponential zoom.
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const delta = Math.max(-400, Math.min(400, event.deltaY * unit));
    this._zoomAt(point.x, point.y, Math.exp(delta * 0.002));
  }

  _onKeyDown(event) {
    if (!this.options.interaction.keyboard || !this.scene) return;
    const { zoom, pan } = this.options.interaction;
    const area = this.scene.plotArea;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = arrows[event.key];

    if (direction && event.shiftKey && zoom && pan) {
      // Shift+Arrow pans; content moves opposite to the arrow (like scrolling).
      this._panBy(-direction[0] * area.width * KEY_PAN, -direction[1] * area.height * KEY_PAN);
    } else if (direction) {
      this._stepFocus(direction);
    } else if ((event.key === '+' || event.key === '=') && zoom) {
      this._zoomAt(area.x + area.width / 2, area.y + area.height / 2, 1 / KEY_ZOOM);
    } else if ((event.key === '-' || event.key === '_') && zoom) {
      this._zoomAt(area.x + area.width / 2, area.y + area.height / 2, KEY_ZOOM);
    } else if (event.key === '0') {
      this.resetZoom();
    } else if (event.key === 'Escape' && this._hover) {
      this._setHover(null, null);
    } else {
      return;
    }
    event.preventDefault();
  }

  /** Keyboard navigation: arrows move the tooltip from point to point. */
  _stepFocus([dx, dy]) {
    const list = this.scene.series;
    if (!list.some((series) => series.xs.length)) return;
    let hover = null;

    if (this._tooltipMode() === 'x') {
      if (!dx) return;
      if (!this._xPositions) this._xPositions = uniqueXPositions(list);
      const positions = this._xPositions;
      let current = -1;
      if (this._hover) {
        current = positions.findIndex((value) => Math.abs(value - this._hover.x) <= 1);
      }
      const next = current < 0 ? (dx > 0 ? 0 : positions.length - 1) : Math.max(0, Math.min(positions.length - 1, current + dx));
      const found = nearestByX(list, positions[next]);
      if (found) hover = { mode: 'x', x: found.x, y: this.scene.plotArea.y + this.scene.plotArea.height / 2, items: found.items };
    } else {
      let seriesPosition = this._hover ? this._hover.items[0].series : list.findIndex((series) => series.xs.length);
      let point = this._hover ? this._hover.items[0].point : -1;
      if (dx) {
        const count = list[seriesPosition].xs.length;
        point = point < 0 ? (dx > 0 ? 0 : count - 1) : Math.max(0, Math.min(count - 1, point + dx));
      } else {
        // Up/Down: jump to the neighbouring series, at the closest x.
        const currentX = point >= 0 ? list[seriesPosition].xs[point] : this.scene.plotArea.x;
        let candidate = seriesPosition;
        do {
          candidate = (candidate + dy + list.length) % list.length;
        } while (!list[candidate].xs.length && candidate !== seriesPosition);
        seriesPosition = candidate;
        const xs = list[seriesPosition].xs;
        point = 0;
        for (let index = 1; index < xs.length; index++) {
          if (Math.abs(xs[index] - currentX) < Math.abs(xs[point] - currentX)) point = index;
        }
      }
      const series = list[seriesPosition];
      hover = { mode: 'nearest', x: series.xs[point], y: series.ys[point], items: [{ series: seriesPosition, point }] };
    }

    this._setHover(hover, 'keyboard');
    const details = this._hoverDetails();
    if (details.length) {
      const { format } = this.scene;
      this.live.textContent = details
        .map((detail) => `${detail.series}: ${format.x(detail.x)}, ${format.y(detail.y)}`)
        .join('; ');
    }
  }
}
