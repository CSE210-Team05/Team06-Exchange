import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { draw_canvas, render_canvas } from '../app_main/features/plot_handling/canvas_rendering.js';
import { THEMES, build_chart } from '../app_main/features/plot_handling/chart_rendering.js';

function recording_context() {
  const calls = [];
  return new Proxy({ calls }, {
    get: (target, property) => {
      if (property in target) return target[property];
      return (...args) => {
        calls.push([property, ...args]);
        if (property === 'measureText') return { width: String(args[0]).length * 7 };
        return undefined;
      };
    },
    set: (target, property, value) => {
      target[property] = value;
      calls.push([`set:${String(property)}`, value]);
      return true;
    },
  });
}

describe('Canvas rendering backend', () => {
  it('draws the same scene at the requested device pixel ratio', () => {
    const chart = build_chart({ points: [[1, 2], [2, 4], [3, 3]], type: 'scatter', x_label: 'Time', y_label: 'Value' });
    const context = recording_context();

    draw_canvas(chart.scene, context, 2);

    assert.ok(context.calls.some((call) => call[0] === 'setTransform' && call[1] === 2 && call[4] === 2));
    assert.equal(context.calls.filter(([name]) => name === 'arc').length, 3);
    assert.ok(context.calls.some(([name]) => name === 'clip'));
    const labels = context.calls.filter(([name]) => name === 'fillText').map(([, value]) => value);
    assert.ok(labels.includes('Time'));
    assert.ok(labels.includes('Value'));
  });

  it('uses theme colours and exposes an accessible Canvas element', () => {
    const chart = build_chart({ points: [[0, 0], [1, 1]], theme: 'dark', x_label: 'x', y_label: 'y' });
    const context = recording_context();
    const attributes = new Map();
    const canvas = {
      width: 0,
      height: 0,
      style: {},
      setAttribute: (name, value) => attributes.set(name, value),
      getContext: () => context,
    };

    render_canvas(chart, canvas, 2);

    assert.equal(canvas.width, chart.width * 2);
    assert.equal(canvas.height, chart.height * 2);
    assert.equal(canvas.style.width, `${chart.width}px`);
    assert.equal(attributes.get('role'), 'img');
    assert.match(attributes.get('aria-label'), /Line plot/);
    assert.ok(context.calls.some(([name, value]) => name === 'set:fillStyle' && value === THEMES.dark.background));
  });
});
