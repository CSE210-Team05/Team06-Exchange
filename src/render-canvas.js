/**
 * Canvas renderer: scene -> Canvas 2D draw calls.
 *
 * Canvas paints pixels instead of keeping one element per point, so it stays
 * fast for large datasets. The backing store is scaled by the device pixel
 * ratio so lines and text stay sharp on high-density screens.
 */
import { FONT_FAMILY } from './scene.js';
import { baselineShift } from './text.js';

const ALIGN = { start: 'left', middle: 'center', end: 'right' };

/**
 * Draw a scene on a 2D context.
 * @param {ReturnType<import('./scene.js').buildScene>} scene
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} [pixelRatio] device pixels per CSS pixel
 */
export function renderCanvas(scene, ctx, pixelRatio = 1) {
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, scene.width, scene.height);

  for (const node of scene.nodes) {
    switch (node.type) {
      case 'rect':
        ctx.fillStyle = node.fill;
        ctx.fillRect(node.x, node.y, node.width, node.height);
        break;

      case 'line':
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(node.x1, node.y1);
        ctx.lineTo(node.x2, node.y2);
        ctx.stroke();
        break;

      case 'polyline':
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.width;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(node.points[0], node.points[1]);
        for (let index = 2; index < node.points.length; index += 2) ctx.lineTo(node.points[index], node.points[index + 1]);
        ctx.stroke();
        break;

      case 'circles':
        ctx.fillStyle = node.fill;
        ctx.strokeStyle = node.ringColor;
        ctx.lineWidth = node.ring * 2;
        for (let index = 0; index < node.xs.length; index++) {
          ctx.beginPath();
          ctx.arc(node.xs[index], node.ys[index], node.r, 0, Math.PI * 2);
          ctx.stroke(); // ring first, then the dot on top (same as SVG paint-order)
          ctx.fill();
        }
        break;

      case 'text': {
        ctx.font = `${node.weight} ${node.size}px ${FONT_FAMILY}`;
        ctx.fillStyle = node.fill;
        ctx.textAlign = ALIGN[node.anchor] || 'left';
        ctx.textBaseline = 'alphabetic';
        const shift = baselineShift(node.baseline, node.size);
        if (node.rotate) {
          ctx.save();
          ctx.translate(node.x, node.y);
          ctx.rotate((node.rotate * Math.PI) / 180);
          ctx.fillText(node.text, 0, shift);
          ctx.restore();
        } else {
          ctx.fillText(node.text, node.x, node.y + shift);
        }
        break;
      }

      default:
        break;
    }
  }
}
