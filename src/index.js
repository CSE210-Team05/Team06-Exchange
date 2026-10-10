/**
 * ZeroPlot - line and scatter plots from CSV data, with no dependencies.
 *
 *   import { Plot, parseCSV } from './src/index.js';
 *   const { points, xLabel, yLabel } = parseCSV('x,y\n0,1\n1,3\n2,2');
 *   new Plot(document.querySelector('#chart'), { points, xLabel, yLabel });
 */
export { Plot } from './plot.js';
export { parseCSV } from './csv.js';
export { buildScene, WIDTH, HEIGHT } from './scene.js';
export { renderSVG } from './render-svg.js';
export { renderCanvas } from './render-canvas.js';
