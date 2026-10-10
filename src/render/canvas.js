/**
 * Canvas renderer: scene -> Canvas 2D draw calls.
 *
 * Canvas draws pixels instead of keeping a DOM node per mark, so it stays
 * fast for tens of thousands of points. The canvas backing store is sized
 * by devicePixelRatio, so lines stay crisp on high-density screens.
 */
import { Path, traceOnCanvas } from '../core/path.js';
import { appendSymbol } from '../core/symbols.js';
import { baselineShift, fontString } from '../core/text.js';

const ALIGN = { start: 'left', middle: 'center', end: 'right' };

/**
 * Apply stroke settings shared by lines and paths.
 * @param {CanvasRenderingContext2D} ctx
 */
function applyStroke(ctx, node) {
  ctx.strokeStyle = node.stroke;
  ctx.lineWidth = node.strokeWidth ?? 1;
  ctx.lineJoin = node.lineJoin || 'miter';
  ctx.lineCap = node.lineCap || 'butt';
  ctx.setLineDash(Array.isArray(node.dash) ? node.dash : []);
}

/**
 * Draw a list of primitives.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object[]} nodes
 * @param {number} alpha opacity inherited from parent groups
 * @param {Path} scratch reusable path for markers
 */
function drawNodes(ctx, nodes, alpha, scratch) {
  for (const node of nodes) {
    switch (node.type) {
      case 'rect': {
        ctx.globalAlpha = alpha * (node.opacity ?? 1);
        ctx.beginPath();
        if (node.radius && ctx.roundRect) ctx.roundRect(node.x, node.y, node.width, node.height, node.radius);
        else ctx.rect(node.x, node.y, node.width, node.height);
        if (node.fill) {
          ctx.fillStyle = node.fill;
          ctx.fill();
        }
        if (node.stroke) {
          applyStroke(ctx, node);
          ctx.stroke();
        }
        break;
      }

      case 'line': {
        ctx.globalAlpha = alpha * (node.opacity ?? 1);
        applyStroke(ctx, node);
        ctx.beginPath();
        ctx.moveTo(node.x1, node.y1);
        ctx.lineTo(node.x2, node.y2);
        ctx.stroke();
        break;
      }

      case 'path': {
        if (!node.path || node.path.isEmpty) break;
        ctx.beginPath();
        traceOnCanvas(ctx, node.path);
        const fill = () => {
          if (!node.fill) return;
          ctx.globalAlpha = alpha * (node.fillOpacity ?? 1);
          ctx.fillStyle = node.fill;
          ctx.fill();
        };
        const stroke = () => {
          if (!node.stroke) return;
          ctx.globalAlpha = alpha * (node.strokeOpacity ?? 1);
          applyStroke(ctx, node);
          ctx.stroke();
        };
        if (node.paintOrder === 'stroke') {
          stroke();
          fill();
        } else {
          fill();
          stroke();
        }
        break;
      }

      case 'text': {
        ctx.globalAlpha = alpha * (node.opacity ?? 1);
        ctx.font = fontString(node.font);
        ctx.fillStyle = node.fill;
        ctx.textAlign = ALIGN[node.anchor] || 'left';
        ctx.textBaseline = 'alphabetic';
        const shift = baselineShift(node.baseline, node.font.size);
        const paint = (x, y) => {
          if (node.halo) {
            // Halo first, text on top (same as SVG paint-order: stroke).
            ctx.strokeStyle = node.halo;
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.setLineDash([]);
            ctx.strokeText(node.text, x, y);
          }
          ctx.fillText(node.text, x, y);
        };
        if (node.rotate) {
          ctx.save();
          ctx.translate(node.x, node.y);
          ctx.rotate((node.rotate * Math.PI) / 180);
          paint(0, shift);
          ctx.restore();
        } else {
          paint(node.x, node.y + shift);
        }
        break;
      }

      case 'markers': {
        const { xs, ys, sizes, symbol } = node;
        const fillAlpha = alpha * (node.fillOpacity ?? 1);
        ctx.fillStyle = node.fill;
        ctx.setLineDash([]);
        if (node.individual) {
          const ring = node.ring > 0 ? node.ring : 0;
          ctx.strokeStyle = node.ringColor;
          ctx.lineWidth = ring * 2;
          ctx.lineJoin = 'round';
          for (let index = 0; index < xs.length; index++) {
            const size = sizes ? sizes[index] : node.size;
            ctx.beginPath();
            if (symbol === 'circle') {
              ctx.arc(xs[index], ys[index], size / 2, 0, Math.PI * 2);
            } else {
              scratch.ops.length = 0;
              scratch.args.length = 0;
              traceOnCanvas(ctx, appendSymbol(scratch, symbol, xs[index], ys[index], size));
            }
            // Ring first, then the fill on top: the ring only shows outside the mark.
            if (ring) {
              ctx.globalAlpha = alpha;
              ctx.stroke();
            }
            ctx.globalAlpha = fillAlpha;
            ctx.fill();
          }
        } else {
          // Batch every marker into one path: one fill call for the whole series.
          ctx.beginPath();
          for (let index = 0; index < xs.length; index++) {
            const size = sizes ? sizes[index] : node.size;
            if (symbol === 'circle') {
              ctx.moveTo(xs[index] + size / 2, ys[index]);
              ctx.arc(xs[index], ys[index], size / 2, 0, Math.PI * 2);
            } else {
              scratch.ops.length = 0;
              scratch.args.length = 0;
              traceOnCanvas(ctx, appendSymbol(scratch, symbol, xs[index], ys[index], size));
            }
          }
          ctx.globalAlpha = fillAlpha;
          ctx.fill();
        }
        break;
      }

      case 'group': {
        ctx.save();
        if (node.clip) {
          ctx.beginPath();
          ctx.rect(node.clip.x, node.clip.y, node.clip.width, node.clip.height);
          ctx.clip();
        }
        drawNodes(ctx, node.children, alpha * (node.opacity ?? 1), scratch);
        ctx.restore();
        break;
      }

      default:
        break;
    }
  }
}

/**
 * Draw a scene onto a 2D context.
 * @param {import('../scene/build.js').Scene} scene
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} [settings]
 * @param {number} [settings.pixelRatio] device pixels per CSS pixel
 */
export function renderCanvas(scene, ctx, { pixelRatio = 1 } = {}) {
  ctx.save();
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, scene.width, scene.height);
  drawNodes(ctx, scene.nodes, 1, new Path());
  ctx.restore();
}

/**
 * Size a canvas element for crisp output and draw the scene on it.
 * @param {import('../scene/build.js').Scene} scene
 * @param {HTMLCanvasElement} canvas
 * @param {number} [pixelRatio]
 */
export function paintCanvas(scene, canvas, pixelRatio = 1) {
  const deviceWidth = Math.round(scene.width * pixelRatio);
  const deviceHeight = Math.round(scene.height * pixelRatio);
  if (canvas.width !== deviceWidth) canvas.width = deviceWidth;
  if (canvas.height !== deviceHeight) canvas.height = deviceHeight;
  canvas.style.width = `${scene.width}px`;
  canvas.style.height = `${scene.height}px`;
  const ctx = canvas.getContext('2d');
  renderCanvas(scene, ctx, { pixelRatio });
  return ctx;
}
