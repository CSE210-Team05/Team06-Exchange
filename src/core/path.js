/**
 * A renderer-independent vector path.
 *
 * The method names mirror the Canvas 2D API (moveTo, lineTo, ...), so the
 * canvas renderer can replay a path directly, while the SVG renderer
 * serialises the very same commands into a `d` attribute. Coordinates are
 * stored in one flat number array to keep large paths cheap.
 */
export class Path {
  constructor() {
    /** @type {string[]} one letter per command: M L C Z O(circle) */
    this.ops = [];
    /** @type {number[]} all command arguments, in order */
    this.args = [];
  }

  moveTo(x, y) {
    this.ops.push('M');
    this.args.push(x, y);
    return this;
  }

  lineTo(x, y) {
    this.ops.push('L');
    this.args.push(x, y);
    return this;
  }

  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    this.ops.push('C');
    this.args.push(c1x, c1y, c2x, c2y, x, y);
    return this;
  }

  /** A full circle as its own closed sub-path. */
  circle(cx, cy, r) {
    this.ops.push('O');
    this.args.push(cx, cy, r);
    return this;
  }

  closePath() {
    this.ops.push('Z');
    return this;
  }

  get isEmpty() {
    return this.ops.length === 0;
  }
}

/** Number of arguments consumed by each command letter. */
export const ARG_COUNT = { M: 2, L: 2, C: 6, O: 3, Z: 0 };

/**
 * Round to two decimals; plenty for screen pixels and keeps SVG markup small.
 * @param {number} value
 */
const short = (value) => Math.round(value * 100) / 100;

/**
 * Serialise a Path to SVG path data.
 * @param {Path} path
 * @returns {string}
 */
export function toSVGPathData(path) {
  const { ops, args } = path;
  const parts = [];
  let cursor = 0;
  for (const op of ops) {
    switch (op) {
      case 'M':
      case 'L':
        parts.push(`${op}${short(args[cursor])},${short(args[cursor + 1])}`);
        break;
      case 'C':
        parts.push(
          `C${short(args[cursor])},${short(args[cursor + 1])},${short(args[cursor + 2])},${short(args[cursor + 3])},${short(args[cursor + 4])},${short(args[cursor + 5])}`,
        );
        break;
      case 'O': {
        // Two half-circle arcs; SVG cannot draw a full circle with one arc.
        const [cx, cy, r] = [args[cursor], args[cursor + 1], args[cursor + 2]];
        parts.push(`M${short(cx - r)},${short(cy)}a${short(r)},${short(r)} 0 1,0 ${short(2 * r)},0a${short(r)},${short(r)} 0 1,0 ${short(-2 * r)},0Z`);
        break;
      }
      case 'Z':
        parts.push('Z');
        break;
      default:
        break;
    }
    cursor += ARG_COUNT[op];
  }
  return parts.join('');
}

/**
 * Replay a Path on a CanvasRenderingContext2D (between beginPath and fill/stroke).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Path} path
 */
export function traceOnCanvas(ctx, path) {
  const { ops, args } = path;
  let cursor = 0;
  for (const op of ops) {
    switch (op) {
      case 'M': ctx.moveTo(args[cursor], args[cursor + 1]); break;
      case 'L': ctx.lineTo(args[cursor], args[cursor + 1]); break;
      case 'C':
        ctx.bezierCurveTo(args[cursor], args[cursor + 1], args[cursor + 2], args[cursor + 3], args[cursor + 4], args[cursor + 5]);
        break;
      case 'O':
        ctx.moveTo(args[cursor] + args[cursor + 2], args[cursor + 1]);
        ctx.arc(args[cursor], args[cursor + 1], args[cursor + 2], 0, Math.PI * 2);
        break;
      case 'Z': ctx.closePath(); break;
      default: break;
    }
    cursor += ARG_COUNT[op];
  }
}
