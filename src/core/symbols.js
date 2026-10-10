/**
 * Marker shapes for scatter plots and line markers.
 *
 * `size` is the diameter of a circle with the same area, so every shape
 * carries the same visual weight: a size-8 square is not "bigger" than a
 * size-8 circle. All shapes are closed polygons (or a circle) that are filled
 * with the series colour.
 */
import { Path } from './path.js';

export const SYMBOLS = ['circle', 'square', 'triangle', 'diamond', 'cross', 'plus', 'star', 'triangle-down'];

/**
 * Vertices of each polygon scaled to an area of 1 (unit area), centred on
 * the origin. Scaling by sqrt(targetArea) then gives the requested area.
 */
const UNIT_SHAPES = (() => {
  const shapes = {};

  // Square of side 1.
  shapes.square = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

  // Diamond: a square rotated by 45 degrees (half diagonal sqrt(1/2)).
  const halfDiagonal = Math.sqrt(0.5);
  shapes.diamond = [[0, -halfDiagonal], [halfDiagonal, 0], [0, halfDiagonal], [-halfDiagonal, 0]];

  // Equilateral triangle centred on its centroid: area = (sqrt(3) / 4) * side^2.
  const side = Math.sqrt(4 / Math.sqrt(3));
  const height = (Math.sqrt(3) / 2) * side;
  shapes.triangle = [[0, (-2 * height) / 3], [side / 2, height / 3], [-side / 2, height / 3]];
  shapes['triangle-down'] = shapes.triangle.map(([x, y]) => [x, -y]);

  // Plus made of five unit squares of side u: area = 5u^2.
  const arm = Math.sqrt(1 / 5);
  const half = arm / 2;
  const reach = 1.5 * arm;
  shapes.plus = [
    [-half, -reach], [half, -reach], [half, -half], [reach, -half], [reach, half], [half, half],
    [half, reach], [-half, reach], [-half, half], [-reach, half], [-reach, -half], [-half, -half],
  ];

  // Cross: the plus rotated by 45 degrees.
  const cos45 = Math.SQRT1_2;
  shapes.cross = shapes.plus.map(([x, y]) => [(x - y) * cos45, (x + y) * cos45]);

  // Five-pointed star with the "golden" inner radius ratio 0.382.
  // Area = 5 * outer * inner * sin(36 deg) for a regular star polygon.
  const innerRatio = 0.382;
  const outer = Math.sqrt(1 / (5 * innerRatio * Math.sin(Math.PI / 5)));
  const star = [];
  for (let point = 0; point < 10; point++) {
    const radius = point % 2 === 0 ? outer : outer * innerRatio;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    star.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  shapes.star = star;
  return shapes;
})();

/**
 * Append one marker to `path`.
 * @param {Path} path
 * @param {string} symbol one of SYMBOLS
 * @param {number} cx
 * @param {number} cy
 * @param {number} size diameter of the equal-area circle, in pixels
 */
export function appendSymbol(path, symbol, cx, cy, size) {
  const radius = size / 2;
  const vertices = UNIT_SHAPES[symbol];
  if (!vertices) {
    path.circle(cx, cy, radius);
    return path;
  }
  const scale = Math.sqrt(Math.PI) * radius; // sqrt(area of the equal-area circle)
  path.moveTo(cx + vertices[0][0] * scale, cy + vertices[0][1] * scale);
  for (let index = 1; index < vertices.length; index++) {
    path.lineTo(cx + vertices[index][0] * scale, cy + vertices[index][1] * scale);
  }
  path.closePath();
  return path;
}

/**
 * A standalone path for one marker (used for legend keys and highlights).
 * @param {string} symbol
 * @param {number} cx
 * @param {number} cy
 * @param {number} size
 */
export function symbolPath(symbol, cx, cy, size) {
  return appendSymbol(new Path(), symbol, cx, cy, size);
}
