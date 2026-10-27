/**
 * Canvas rendering backend for the renderer-independent scene produced by
 * build_chart(). The SVG and Canvas backends therefore share layout, scales,
 * reduction, clipping, colours and accessibility text.
 */

const ALIGN = { start: 'left', middle: 'center', end: 'right' };
const BASELINE_SHIFT = { top: 0.8, middle: 0.35 };

function draw_nodes(context, nodes, inherited_alpha = 1, line_through = false) {
  for (const node of nodes) {
    const alpha = inherited_alpha * (node.opacity ?? 1);
    switch (node.type) {
      case 'rect':
        context.globalAlpha = alpha;
        context.fillStyle = node.fill;
        context.fillRect(node.x, node.y, node.width, node.height);
        break;

      case 'line':
        context.globalAlpha = alpha;
        context.strokeStyle = node.stroke;
        context.lineWidth = node.width ?? 1;
        context.lineJoin = node.line_join ?? 'miter';
        context.lineCap = node.line_cap ?? 'butt';
        context.setLineDash(node.dash ?? []);
        context.beginPath();
        context.moveTo(node.x1, node.y1);
        context.lineTo(node.x2, node.y2);
        context.stroke();
        break;

      case 'polyline':
        if (!node.points.length) break;
        context.globalAlpha = alpha;
        context.strokeStyle = node.stroke;
        context.lineWidth = node.width ?? 1;
        context.lineJoin = node.line_join ?? 'miter';
        context.lineCap = node.line_cap ?? 'butt';
        context.setLineDash(node.dash ?? []);
        context.beginPath();
        context.moveTo(...node.points[0]);
        for (const point of node.points.slice(1)) context.lineTo(...point);
        context.stroke();
        break;

      case 'circles':
        context.fillStyle = node.fill;
        context.strokeStyle = node.stroke ?? 'transparent';
        context.lineWidth = node.stroke_width ?? 0;
        context.setLineDash([]);
        for (const [x, y] of node.points) {
          context.beginPath();
          context.arc(x, y, node.radius, 0, Math.PI * 2);
          if (node.stroke_width) {
            context.globalAlpha = alpha;
            context.stroke();
          }
          context.globalAlpha = alpha;
          context.fill();
        }
        break;

      case 'text': {
        context.globalAlpha = alpha;
        context.font = `${node.weight ?? 400} ${node.size}px ${node.font_family}`;
        context.fillStyle = node.fill;
        context.textAlign = ALIGN[node.anchor] ?? 'left';
        context.textBaseline = 'alphabetic';
        const shift = (BASELINE_SHIFT[node.baseline] ?? 0) * node.size;
        const paint = (x, y) => {
          context.fillText(node.content, x, y);
          if (line_through) {
            const width = context.measureText(node.content).width;
            const start = node.anchor === 'middle' ? x - width / 2 : node.anchor === 'end' ? x - width : x;
            context.strokeStyle = node.fill;
            context.lineWidth = 1;
            context.setLineDash([]);
            context.beginPath();
            context.moveTo(start, y - node.size * 0.3);
            context.lineTo(start + width, y - node.size * 0.3);
            context.stroke();
          }
        };
        if (node.rotate) {
          context.save();
          context.translate(node.x, node.y);
          context.rotate((node.rotate * Math.PI) / 180);
          paint(0, shift);
          context.restore();
        } else {
          paint(node.x, node.y + shift);
        }
        break;
      }

      case 'group':
        context.save();
        if (node.clip) {
          context.beginPath();
          context.rect(node.clip.x, node.clip.y, node.clip.width, node.clip.height);
          context.clip();
        }
        draw_nodes(context, node.nodes, alpha, line_through || node.line_through);
        context.restore();
        break;

      default:
        break;
    }
  }
}

/**
 * Draw a scene on a 2D context. Exposed separately so it can be tested without
 * a browser DOM.
 * @param {import('./chart_rendering.js').Chart['scene']} scene
 * @param {CanvasRenderingContext2D} context
 * @param {number} [pixel_ratio]
 */
export function draw_canvas(scene, context, pixel_ratio = 1) {
  context.save();
  context.setTransform(pixel_ratio, 0, 0, pixel_ratio, 0, 0);
  context.clearRect(0, 0, scene.width, scene.height);
  const add_font = (items) => items.map((node) => node.type === 'group'
    ? { ...node, nodes: add_font(node.nodes) }
    : node.type === 'text' ? { ...node, font_family: scene.font_family } : node);
  draw_nodes(context, add_font(scene.nodes));
  context.restore();
}

/**
 * Size and paint a Canvas element for a chart returned by build_chart().
 * @param {import('./chart_rendering.js').Chart} chart
 * @param {HTMLCanvasElement} canvas
 * @param {number} [pixel_ratio]
 */
export function render_canvas(chart, canvas, pixel_ratio = globalThis.devicePixelRatio || 1) {
  const { scene } = chart;
  canvas.width = Math.round(scene.width * pixel_ratio);
  canvas.height = Math.round(scene.height * pixel_ratio);
  canvas.style.width = `${scene.width}px`;
  canvas.style.height = `${scene.height}px`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${scene.title}. ${scene.description}`);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is not supported in this browser.');
  draw_canvas(scene, context, pixel_ratio);
  return canvas;
}
