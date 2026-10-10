/**
 * Examples gallery. Each example's code panel is generated from the very
 * function that draws the plot (Function.prototype.toString), so the code
 * on the page can never drift from what actually runs.
 */
import { Plot, line, scatter } from '../src/index.js';
import { mulberry32, normal, range } from './random.js';
import { setupThemeToggle } from './theme.js';

// Small helpers the examples use. Seeded, so every visit shows the same data.
const random = mulberry32(20261010);
const gaussian = normal(random);

const EXAMPLES = [
  {
    title: 'Scatter plot',
    text: 'Points given as [x, y] pairs. Hover near a point to read it.',
    run(element) {
      const points = range(200).map(() => [gaussian(), 0.6 * gaussian()]);
      return scatter(element, points, { x: 'x', y: 'y', height: 280 });
    },
  },
  {
    title: 'Line from plain numbers',
    text: 'A list of numbers is plotted against its index.',
    run(element) {
      const values = range(80).map((i) => Math.sin(i / 6) * Math.exp(-i / 60));
      return line(element, values, { x: 'Sample', y: 'Value', height: 280 });
    },
  },
  {
    title: 'Several series with markers and dashes',
    text: 'Each series can mix lines, markers and dash patterns. The legend toggles series.',
    run(element) {
      const months = range(12).map((m) => m + 1);
      return new Plot(element, {
        height: 280,
        x: { label: 'Month', nice: false },
        y: { label: 'Orders (thousands)' },
        series: [
          { name: 'Online', markers: true, data: months.map((m) => [m, 20 + m * 2.1 + 3 * Math.sin(m)]) },
          { name: 'In store', markers: true, data: months.map((m) => [m, 30 - m * 0.8 + 2 * Math.cos(m)]) },
          { name: 'Target', dash: [6, 4], data: [[1, 26], [12, 40]] },
        ],
      });
    },
  },
  {
    title: 'Dates on the x axis',
    text: 'Date objects or ISO strings switch the axis to calendar ticks: hours, then days.',
    run(element) {
      const start = new Date(2026, 9, 1);
      const hourly = range(72).map((h) => ({
        time: new Date(start.getTime() + h * 3600e3),
        load: 40 + 25 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + 4 * gaussian(),
      }));
      return line(element, [{ name: 'Server load', data: hourly, x: 'time', y: 'load' }], {
        height: 280,
        y: { label: 'CPU load', suffix: '%' },
      });
    },
  },
  {
    title: 'Logarithmic axes',
    text: 'On log-log axes, power laws become straight lines with slope equal to the exponent.',
    run(element) {
      const xs = range(40).map((i) => 10 ** (i / 13));
      return line(element, [1, 2, 3].map((k) => ({ name: `x^${k}`, data: xs.map((x) => [x, x ** k]) })), {
        height: 280,
        x: { scale: 'log', label: 'x' },
        y: { scale: 'log', label: 'y' },
      });
    },
  },
  {
    title: 'Curve interpolation',
    text: 'The same seven points drawn straight, smooth (monotone, never overshoots) and as steps.',
    run(element) {
      const points = [[0, 1], [1, 3], [2, 2.5], [3, 6], [4, 6.2], [5, 2], [6, 4]];
      const shifted = (dy) => points.map(([x, y]) => [x, y + dy]);
      return line(element, [
        { name: 'linear', data: shifted(10), markers: true },
        { name: 'monotone', data: shifted(5), curve: 'monotone', markers: true },
        { name: 'step-after', data: points, curve: 'step-after', markers: true },
      ], { height: 280, y: { grid: false } });
    },
  },
  {
    title: 'Filled areas',
    text: 'area: true fills down to zero with a light wash of the series colour.',
    run(element) {
      const days = range(60);
      return line(element, [
        { name: 'Visitors', area: true, curve: 'monotone', data: days.map((d) => [d, 900 + 300 * Math.sin(d / 7) + 120 * gaussian()]) },
        { name: 'Sign-ups', area: true, curve: 'monotone', data: days.map((d) => [d, 260 + 80 * Math.sin(d / 7 + 1) + 40 * gaussian()]) },
      ], { height: 280, x: 'Day', y: 'People' });
    },
  },
  {
    title: 'Bubble chart',
    text: 'marker.size can be a function of each data point.',
    run(element) {
      const countries = range(24).map(() => ({
        income: 5 + 60 * random(),
        lifespan: 62 + 20 * random(),
        population: 2 + 120 * random() ** 2,
      }));
      return scatter(element, [{
        name: 'Countries',
        data: countries,
        x: 'income',
        y: 'lifespan',
        marker: { size: (d) => 6 + Math.sqrt(d.population) * 3 },
      }], { height: 280, x: { label: 'Income per person', prefix: '$', suffix: 'K' }, y: 'Life expectancy (years)' });
    },
  },
  {
    title: 'Reference lines',
    text: 'Annotations mark thresholds or events without being part of the data.',
    run(element) {
      const readings = range(50).map((i) => [i, 70 + 12 * Math.sin(i / 5) + 3 * gaussian()]);
      return line(element, readings, {
        height: 280,
        x: 'Minute',
        y: { label: 'Heart rate', suffix: ' bpm' },
        annotations: [
          { type: 'hline', value: 80, label: 'Upper limit', color: '#e34948' },
          { type: 'vline', value: 31, label: 'Medication' },
        ],
      });
    },
  },
  {
    title: 'Percent axis',
    text: "format: 'percent' turns 0.25 into 25% on ticks and in tooltips.",
    run(element) {
      const years = range(11).map((i) => 2015 + i);
      return line(element, [
        { name: 'Renewables', markers: true, data: years.map((y, i) => [y, 0.12 + 0.021 * i]) },
        { name: 'Coal', markers: true, data: years.map((y, i) => [y, 0.38 - 0.018 * i]) },
      ], { height: 280, x: { label: 'Year', nice: false }, y: { format: 'percent', zero: true } });
    },
  },
  {
    title: 'Missing values leave gaps',
    text: 'null, NaN or empty cells break the line instead of inventing values.',
    run(element) {
      const values = range(40).map((i) => ([12, 13, 14, 26, 27].includes(i) ? null : 5 + Math.sin(i / 4) * 3));
      return line(element, values, { height: 280, x: 'Hour', y: 'Water level (m)' });
    },
  },
  {
    title: 'Shapes for many groups',
    text: 'With more than three scatter series, each one also gets its own marker shape.',
    run(element) {
      const groups = ['North', 'East', 'South', 'West', 'Centre'];
      return scatter(element, groups.map((name, g) => ({
        name,
        data: range(25).map(() => [g * 2 + gaussian(), g + gaussian()]),
      })), { height: 280 });
    },
  },
  {
    title: '200,000 points on canvas',
    text: 'Lines are reduced to at most four points per pixel column (M4) before drawing.',
    run(element) {
      let position = 0;
      const walk = range(200000).map((i) => [i, (position += gaussian())]);
      return line(element, [{ name: 'Random walk', data: walk, lineWidth: 1 }], {
        height: 280,
        renderer: 'canvas',
        x: 'Step',
        y: 'Position',
      });
    },
  },
  {
    title: '30,000 scatter points on canvas',
    text: 'Dense scatter plots fade their markers automatically, so overlaps show density.',
    run(element) {
      const points = range(30000).map(() => {
        const r = gaussian();
        return [r + 0.4 * gaussian(), r * r + 0.5 * gaussian()];
      });
      return scatter(element, [{ name: 'Samples', data: points, marker: { size: 5 } }], {
        height: 280,
        renderer: 'canvas',
        x: 'u',
        y: 'v',
      });
    },
  },
  {
    title: 'Live data',
    text: 'setData() replaces one series; here a new sample arrives every 400 ms.',
    run(element) {
      const samples = range(60).map((i) => [i, 50 + 10 * gaussian()]);
      const plot = line(element, [{ name: 'Sensor', data: samples, curve: 'monotone' }], {
        height: 280,
        x: { label: 'Sample' },
        y: { label: 'Reading', min: 0, max: 100 },
      });
      let next = samples.length;
      setInterval(() => {
        if (document.hidden) return;
        const last = samples[samples.length - 1][1];
        samples.push([next++, Math.min(95, Math.max(5, last + 6 * gaussian()))]);
        samples.shift();
        plot.setData('Sensor', samples);
      }, 400);
      return plot;
    },
  },
  {
    title: 'Click to add points',
    text: "The 'click' event reports the clicked position in data coordinates.",
    run(element) {
      const points = [[2, 3], [5, 6], [7, 4]];
      const plot = scatter(element, [{ name: 'Your points', data: points }], {
        height: 280,
        subtitle: 'Click inside the plot',
        x: { min: 0, max: 10 },
        y: { min: 0, max: 10 },
      });
      plot.on('click', ({ x, y }) => {
        points.push([x, y]);
        plot.setData('Your points', points);
      });
      return plot;
    },
  },
  {
    title: 'Fixed dark theme',
    text: "theme: 'dark' keeps a chart dark regardless of the page; the default 'auto' follows the page.",
    run(element) {
      const xs = range(100).map((i) => i / 10);
      return line(element, [
        { name: 'damped', data: xs.map((x) => [x, Math.exp(-x / 4) * Math.cos(2 * x)]) },
        { name: 'envelope', dash: [4, 4], data: xs.map((x) => [x, Math.exp(-x / 4)]) },
      ], { height: 280, theme: 'dark', x: 't', y: 'amplitude' });
    },
  },
];

/**
 * Turn an example's run() method into readable code:
 * strip the method wrapper, remove the shared indentation and show the
 * returned plot as a variable.
 */
function sourceOf(run) {
  const lines = run.toString().split('\n').slice(1, -1);
  const indent = Math.min(...lines.filter((text) => text.trim()).map((text) => text.match(/^ */)[0].length));
  return lines
    .map((text) => text.slice(indent))
    .join('\n')
    .replace(/^return plot;\n?/m, '')
    .replace(/^return (.*)$/m, 'const plot = $1')
    .trim();
}

function renderGallery() {
  const gallery = document.getElementById('gallery');
  for (const example of EXAMPLES) {
    const card = document.createElement('article');
    card.className = 'panel example';

    const head = document.createElement('div');
    head.className = 'example-head';
    const title = document.createElement('h2');
    title.textContent = example.title;
    const text = document.createElement('p');
    text.textContent = example.text;
    head.append(title, text);

    const chart = document.createElement('div');
    chart.className = 'example-chart';

    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Show code';
    const code = document.createElement('pre');
    code.className = 'code';
    code.textContent = sourceOf(example.run);
    details.append(summary, code);

    card.append(head, chart, details);
    gallery.appendChild(card);

    try {
      example.run(chart);
    } catch (error) {
      chart.textContent = `This example failed: ${error.message}`;
      console.error(error);
    }
  }
}

setupThemeToggle(document.getElementById('theme-toggle'));
renderGallery();
