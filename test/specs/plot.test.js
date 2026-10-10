import { assert, describe, it } from '../harness.js';
import { Plot, line, scatter } from '../../src/index.js';
import { columnTypes, parseCSV, toObjects } from '../../site/csv.js';

/** A visible, fixed-size container that is removed after the test. */
function withContainer(body) {
  return async () => {
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-10000px;top:0;width:600px';
    document.body.appendChild(container);
    try {
      await body(container);
    } finally {
      container.remove();
    }
  };
}

const sample = [
  { name: 'a', data: [[0, 1], [1, 3], [2, 2]] },
  { name: 'b', data: [[0, 2], [1, 1], [2, 4]] },
];

describe('Plot (browser)', () => {
  it.browser('renders SVG into its container at the container width', withContainer((container) => {
    const plot = new Plot(container, { series: sample, height: 300 });
    const svg = container.querySelector('svg');
    assert.ok(svg);
    assert.equal(svg.getAttribute('width'), '600');
    assert.equal(svg.getAttribute('height'), '300');
    plot.destroy();
  }));

  it.browser('produces well-formed XML', withContainer((container) => {
    const plot = scatter(container, sample, { title: 'A & B <test>' });
    const parsed = new DOMParser().parseFromString(plot.toSVG(), 'image/svg+xml');
    assert.equal(parsed.querySelector('parsererror'), null);
    plot.destroy();
  }));

  it.browser('switches between SVG and canvas', withContainer((container) => {
    const plot = line(container, sample);
    plot.setRenderer('canvas');
    assert.ok(container.querySelector('canvas'));
    assert.equal(container.querySelector('.zp-main svg'), null);
    plot.setRenderer('svg');
    assert.ok(container.querySelector('.zp-main svg'));
    plot.destroy();
  }));

  it.browser('toggles series and reports it', withContainer((container) => {
    const plot = line(container, sample);
    const events = [];
    plot.on('toggle', (event) => events.push(event));
    assert.equal(plot.toggleSeries('b'), false);
    assert.equal(plot.isSeriesVisible('b'), false);
    assert.deepEqual(plot.scene.series.map((series) => series.name), ['a']);
    assert.equal(events[0].series, 'b');
    plot.toggleSeries(1, true);
    assert.equal(plot.scene.series.length, 2);
    plot.destroy();
  }));

  it.browser('zooms with setView and resets', withContainer((container) => {
    const plot = line(container, sample);
    plot.setView({ x: [0.5, 1.5] });
    assert.ok(plot.isZoomed);
    assert.deepEqual(plot.scene.scales.x.domain, [0.5, 1.5]);
    plot.resetZoom();
    assert.ok(!plot.isZoomed);
    plot.destroy();
  }));

  it.browser('replaces one series with setData', withContainer((container) => {
    const plot = line(container, sample);
    plot.setData('a', [[0, 10], [1, 20]]);
    plot.render();
    assert.equal(plot.scene.series[0].xs.length, 2);
    assert.ok(plot.scene.scales.y.domain[1] >= 20);
    plot.destroy();
  }));

  it.browser('shows a tooltip with every series at the hovered x', withContainer((container) => {
    const plot = line(container, sample);
    const { plotArea, scales } = plot.scene;
    const rect = plot.root.getBoundingClientRect();
    plot.root.dispatchEvent(new PointerEvent('pointermove', {
      clientX: rect.left + scales.x.map(1) + 3,
      clientY: rect.top + plotArea.y + plotArea.height / 2,
      pointerType: 'mouse',
      bubbles: true,
    }));
    assert.equal(plot.tooltip.hidden, false);
    assert.match(plot.tooltip.textContent, /a/);
    assert.match(plot.tooltip.textContent, /b/);
    plot.destroy();
  }));

  it.browser('builds an accessible data table', withContainer((container) => {
    const plot = line(container, sample, { x: 'Time' });
    const table = plot.dataTable();
    assert.equal(table.tHead.rows[0].cells[0].textContent, 'Time');
    assert.equal(table.tBodies[0].rows.length, 3);
    plot.destroy();
  }));

  it.browser('exports a PNG', withContainer(async (container) => {
    const plot = scatter(container, sample);
    const blob = await plot.toPNG(1);
    assert.equal(blob.type, 'image/png');
    assert.ok(blob.size > 1000);
    plot.destroy();
  }));

  it.browser('removes everything on destroy', withContainer((container) => {
    const plot = line(container, sample);
    plot.destroy();
    assert.equal(container.children.length, 0);
  }));
});

describe('site CSV parser', () => {
  it('handles quotes, escaped quotes and CRLF', () => {
    const { headers, rows } = parseCSV('name,value\r\n"Smith, Jane",1\r\n"say ""hi""",2\r\n');
    assert.deepEqual(headers, ['name', 'value']);
    assert.deepEqual(rows, [['Smith, Jane', '1'], ['say "hi"', '2']]);
  });

  it('detects semicolon and tab delimiters', () => {
    assert.equal(parseCSV('a;b\n1;2').delimiter, ';');
    assert.equal(parseCSV('a\tb\n1\t2').delimiter, '\t');
  });

  it('classifies columns and converts numbers', () => {
    const { headers, rows } = parseCSV('date,value,label\n2026-01-01,1.5,x\n2026-01-02,,y');
    const types = columnTypes(headers, rows);
    assert.deepEqual(types, { date: 'date', value: 'number', label: 'text' });
    const objects = toObjects(headers, rows, types);
    assert.equal(objects[0].value, 1.5);
    assert.equal(objects[1].value, null);
  });

  it('makes duplicate headers unique', () => {
    assert.deepEqual(parseCSV('x,y,y\n1,2,3').headers, ['x', 'y', 'y (2)']);
  });
});
