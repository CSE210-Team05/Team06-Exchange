/**
 * Sample datasets for the plot builder. All data is simulated with a fixed
 * seed (see random.js), so it is reproducible and clearly not real
 * measurements. Each dataset brings a column mapping, chart options and
 * per-series styles that show off a different feature.
 */
import { mulberry32, normal, range } from './random.js';

const pad = (value) => String(value).padStart(2, '0');
const isoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fixed = (value, digits = 1) => Number(value.toFixed(digits));
const toCSV = (headers, rows) => [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

/**
 * @typedef {object} Dataset
 * @property {string} id
 * @property {string} label shown in the dataset picker
 * @property {() => string} csv generates the CSV text
 * @property {{ x: string, y: string[], group: string }} mapping
 * @property {object} options chart options (title, axes, type, renderer ...)
 * @property {Record<string, object>} styles per-series style overrides, keyed by series name
 */

/** @type {Dataset[]} */
export const DATASETS = [
  {
    id: 'temperature',
    label: 'Daily temperature',
    csv() {
      const random = mulberry32(2025);
      const noise = normal(random);
      const rows = range(365).map((day) => {
        const date = new Date(2025, 0, 1 + day);
        // Yearly sine cycle, coldest around late January; San Diego lags and swings less.
        const munich = 13.5 + 10.5 * Math.sin((2 * Math.PI * (day - 111)) / 365) + 2.6 * noise();
        const sanDiego = 22 + 3.5 * Math.sin((2 * Math.PI * (day - 126)) / 365) + 1.3 * noise();
        return [isoDate(date), fixed(munich), fixed(sanDiego)];
      });
      return toCSV(['date', 'Munich', 'San Diego'], rows);
    },
    mapping: { x: 'date', y: ['Munich', 'San Diego'], group: '' },
    options: {
      type: 'line',
      renderer: 'svg',
      title: 'Daily high temperature, 2025',
      subtitle: 'Simulated data for two cities',
      x: { label: '', scale: 'auto' },
      y: { label: 'Temperature (°C)', scale: 'auto', zero: false },
      legend: 'top',
    },
    styles: { Munich: { lineWidth: 1.5 }, 'San Diego': { lineWidth: 1.5 } },
  },
  {
    id: 'cars',
    label: 'Car weight and fuel use',
    csv() {
      const random = mulberry32(1997);
      const noise = normal(random);
      const classes = [
        ['Compact', 1220, 110, 0],
        ['Midsize', 1560, 120, 0.2],
        ['SUV', 2060, 180, 0.7],
      ];
      const rows = [];
      for (const [name, meanWeight, spread, offset] of classes) {
        for (let index = 0; index < 60; index++) {
          const weight = Math.round(meanWeight + spread * noise());
          const fuel = 1.4 + 0.0039 * weight + offset + 0.45 * noise();
          rows.push([weight, fixed(fuel), name]);
        }
      }
      return toCSV(['weight', 'fuel', 'class'], rows);
    },
    mapping: { x: 'weight', y: ['fuel'], group: 'class' },
    options: {
      type: 'scatter',
      renderer: 'svg',
      title: 'Heavier cars use more fuel',
      subtitle: 'Simulated measurements of 180 cars',
      x: { label: 'Weight (kg)', scale: 'auto' },
      y: { label: 'Fuel use (L/100 km)', scale: 'auto', zero: false },
      legend: 'top',
    },
    styles: {},
  },
  {
    id: 'spring',
    label: 'Spring measurements and model',
    csv() {
      const random = mulberry32(42);
      const noise = normal(random);
      const missing = new Set([23, 24, 51]);
      const rows = range(81).map((index) => {
        const time = fixed(index * 0.15, 2);
        const model = 4 * Math.exp(-0.22 * time) * Math.cos(1.9 * time);
        const measured = missing.has(index) ? '' : fixed(model + 0.25 * noise(), 2);
        return [time, measured, fixed(model, 3)];
      });
      return toCSV(['time', 'measured', 'model'], rows);
    },
    mapping: { x: 'time', y: ['measured', 'model'], group: '' },
    options: {
      type: 'line',
      renderer: 'svg',
      title: 'Damped spring',
      subtitle: 'Noisy position readings (three are missing) and the fitted model',
      x: { label: 'Time (s)', scale: 'auto' },
      y: { label: 'Displacement (cm)', scale: 'auto', zero: false },
      legend: 'top',
    },
    styles: {
      measured: { type: 'scatter' },
      model: { type: 'line', curve: 'monotone' },
    },
  },
  {
    id: 'growth',
    label: 'Bacterial growth (log scale)',
    csv() {
      const random = mulberry32(7);
      const noise = normal(random);
      const capacity = 2e9;
      const start = 1e4;
      // Logistic growth N(t) = K / (1 + (K - N0) / N0 * e^(-r t)) with 5 % measurement noise.
      const logistic = (hours, rate) => capacity / (1 + ((capacity - start) / start) * Math.exp(-rate * hours));
      const rows = range(25).map((hour) => [
        hour,
        ...[0.95, 0.75, 0.55].map((rate) => Number((logistic(hour, rate) * Math.exp(0.05 * noise())).toPrecision(3))),
      ]);
      return toCSV(['hour', 'Strain A', 'Strain B', 'Strain C'], rows);
    },
    mapping: { x: 'hour', y: ['Strain A', 'Strain B', 'Strain C'], group: '' },
    options: {
      type: 'line',
      renderer: 'svg',
      title: 'Bacterial growth',
      subtitle: 'Simulated cell counts for three strains; the log scale makes exponential growth a straight line',
      x: { label: 'Time (h)', scale: 'auto' },
      y: { label: 'Cells per mL', scale: 'log', zero: false },
      legend: 'top',
    },
    styles: {
      'Strain A': { markers: true },
      'Strain B': { markers: true },
      'Strain C': { markers: true },
    },
  },
  {
    id: 'walk',
    label: 'Random walks (30,000 points)',
    csv() {
      const random = mulberry32(31337);
      const noise = normal(random);
      const positions = [0, 0, 0];
      const rows = range(10000).map((step) => {
        for (let walk = 0; walk < 3; walk++) positions[walk] += noise();
        return [step, ...positions.map((value) => fixed(value, 2))];
      });
      return toCSV(['step', 'Walk 1', 'Walk 2', 'Walk 3'], rows);
    },
    mapping: { x: 'step', y: ['Walk 1', 'Walk 2', 'Walk 3'], group: '' },
    options: {
      type: 'line',
      renderer: 'canvas',
      title: 'Three random walks',
      subtitle: '10,000 normally distributed steps each, drawn on canvas',
      x: { label: 'Step', scale: 'auto' },
      y: { label: 'Position', scale: 'auto', zero: false },
      legend: 'top',
    },
    styles: {
      'Walk 1': { lineWidth: 1 },
      'Walk 2': { lineWidth: 1 },
      'Walk 3': { lineWidth: 1 },
    },
  },
];
