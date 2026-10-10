import { assert, describe, it } from '../harness.js';
import { Plot } from '../../src/index.js';

/** A temporary container that is removed after the test. */
function withContainer(body) {
  return () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    try {
      body(container);
    } finally {
      container.remove();
    }
  };
}

const points = [[0, 1], [1, 3], [2, 2]];

describe('Plot (browser)', () => {
  it.browser('renders an SVG chart of the fixed size', withContainer((container) => {
    new Plot(container, { points });
    const svg = container.querySelector('svg');
    assert.equal(svg.getAttribute('width'), '720');
    assert.equal(svg.getAttribute('height'), '440');
  }));

  it.browser('produces well-formed XML', withContainer((container) => {
    new Plot(container, { points, xLabel: 'A & B <test>' });
    const markup = container.querySelector('.zp-plot').innerHTML;
    const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
    assert.equal(parsed.querySelector('parsererror'), null);
  }));

  it.browser('switches between SVG and canvas', withContainer((container) => {
    const plot = new Plot(container, { points });
    plot.update({ renderer: 'canvas' });
    const canvas = container.querySelector('canvas');
    assert.ok(canvas);
    assert.equal(container.querySelector('svg'), null);
    assert.equal(canvas.width, Math.round(720 * (window.devicePixelRatio || 1)));
    plot.update({ renderer: 'svg' });
    assert.ok(container.querySelector('svg'));
  }));

  it.browser('switches between line and scatter', withContainer((container) => {
    const plot = new Plot(container, { points });
    assert.ok(container.querySelector('polyline'));
    plot.update({ type: 'scatter' });
    assert.equal(container.querySelectorAll('circle').length, points.length);
  }));

  it.browser('updates the axis titles', withContainer((container) => {
    const plot = new Plot(container, { points });
    plot.update({ xLabel: 'Distance (km)' });
    assert.ok(container.textContent.includes('Distance (km)'));
  }));

  it.browser('removes itself on destroy', withContainer((container) => {
    const plot = new Plot(container, { points });
    plot.destroy();
    assert.equal(container.children.length, 0);
  }));
});
