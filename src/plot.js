/**
 * Plot: draws one line or scatter plot into a container.
 *
 *   const plot = new Plot(document.querySelector('#chart'), {
 *     points: [[0, 1], [1, 3], [2, 2]],
 *     type: 'scatter',      // 'line' (default) or 'scatter'
 *     renderer: 'canvas',   // 'svg' (default) or 'canvas'
 *     xLabel: 'Time (s)',
 *     yLabel: 'Height (m)',
 *   });
 *   plot.update({ type: 'line' });
 *
 * The chart is always 720 x 440 px (see scene.js).
 */
import { HEIGHT, WIDTH, buildScene } from './scene.js';
import { renderSVG } from './render-svg.js';
import { renderCanvas } from './render-canvas.js';

const DEFAULTS = { points: [], type: 'line', renderer: 'svg', xLabel: 'x', yLabel: 'y' };

export class Plot {
  /**
   * @param {HTMLElement} container
   * @param {Partial<typeof DEFAULTS>} [options]
   */
  constructor(container, options = {}) {
    if (!container) throw new Error('Plot needs a container element.');
    this.options = { ...DEFAULTS };
    this.element = document.createElement('div');
    this.element.className = 'zp-plot';
    container.appendChild(this.element);
    this.update(options);
  }

  /**
   * Change one or more options and redraw.
   * @param {Partial<typeof DEFAULTS>} changes
   * @returns {this}
   */
  update(changes = {}) {
    Object.assign(this.options, changes);
    this.render();
    return this;
  }

  /** Draw the chart with the current options. */
  render() {
    const { points, type, renderer, xLabel, yLabel } = this.options;
    this.scene = buildScene({ points, type, xLabel, yLabel, width: WIDTH, height: HEIGHT });

    if (renderer === 'canvas') {
      const pixelRatio = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(WIDTH * pixelRatio);
      canvas.height = Math.round(HEIGHT * pixelRatio);
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${this.scene.title}. ${this.scene.description}`);
      renderCanvas(this.scene, canvas.getContext('2d'), pixelRatio);
      this.element.replaceChildren(canvas);
    } else {
      this.element.innerHTML = renderSVG(this.scene);
    }
    return this;
  }

  /** Remove the chart from the page. */
  destroy() {
    this.element.remove();
  }
}
