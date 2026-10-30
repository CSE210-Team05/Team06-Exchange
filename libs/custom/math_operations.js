// - - - - - - - - - - - - - - - - -
// Generic Math Functions
// - - - - - - - - - - - - - - - - -

/**
 * Generic math helpers shared by the axis and chart code: decimal counts for tick
 * labels, rounding, and linear mapping from a data range to a pixel range.
 *
 * @module libs/custom/math_operations
 */

/**
 * Returns the decimal count of a number
 * (i.e. 0 for 5 / 1 for 0.5 / 2 for 0.02)
 * 
 * This is used to scale the graph ticks of the plot axes
 * The scaling should always be done in steps of: 1, 2, 5 or powers of ten
 *
 * A graph step is the distance between two neighbouring ticks on an axis
 * (see tick_step). It is always 1, 2 or 5 times a power of ten, so the power
 * of ten alone decides the decimal count.
 * 
 * @param {number} decimal_number (distance between two neighbouring ticks, e.g. 0.5)
 * @returns {number} decimal count, 0 for steps of 1 or more
 */
export function compute_decimals(decimal_number) {
  if (!(decimal_number > 0) || !Number.isFinite(decimal_number)) return 0;
  // The tiny offset absorbs log10 rounding, e.g. -1.0000000001 instead of -1 for 0.1.
  return Math.max(0, -Math.floor(Math.log10(decimal_number) + 1e-9));
}

/**
 * Round to #digits decimals and turn -0 into 0 
 * (removes 0.30000000000000004 noise)
 * 
 * @param {number} input_value the number to round
 * @param {number} digits number of decimals to keep
 * @returns {number} the rounded number, never -0
 */
export function round_value(input_value, digits) {
  const rounded = Number(input_value.toFixed(Math.min(100, Math.max(0, digits))));
  return rounded === 0 ? 0 : rounded;
}

/**
 * Compute interpolation factor between two intervals
 * 
 * Application:
 * Compute a linear mapping factor between the data interval and the pixel interval.
 * 
 * @param {Array<number>} original_range `[low, high]` in data units
 * @param {Array<number>} target_range `[start, end]` in pixels
 * @returns {function(number): number} maps a data value to its pixel position;
 *   a zero-width data range maps every value to the start of the pixel range
 */
export function compute_interpolation_factor([d0, d1], [r0, r1]) {
  const factor = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (value) => r0 + (value - d0) * factor;
}