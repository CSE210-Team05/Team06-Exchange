// - - - - - - - - - - - - - - - - -
// Generic Math Functions
// - - - - - - - - - - - - - - - - -

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
 * @param {number} input_value
 * @param {number} digits
 */
export function round_value(input_value, digits) {
  const rounded = Number(input_value.toFixed(Math.min(100, Math.max(0, digits))));
  return rounded === 0 ? 0 : rounded;
}

/**
 * Compute iterpolation factor between two intervals
 * 
 * Application:
 * Compute a linear mapping factor between the data interval and the pixel interval.
 * 
 * @param {[number, number]} original_range (data range)
 * @param {[number, number]} target_range (pixel range)
 * @returns {(value: number) => number}
 */
export function compute_interpolation_factor([d0, d1], [r0, r1]) {
  const factor = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (value) => r0 + (value - d0) * factor;
}