/**
 * Saving the plot as a file: the chart's SVG as it is, or drawn onto a canvas
 * and saved as a PNG image.
 *
 * The download action, image, and canvas need a browser. Blob construction is
 * kept separate so its exact contents can be tested in Node.
 */
import { HEIGHT, WIDTH } from './chart_rendering.js';

/** PNG pixels per chart pixel, so the image stays sharp on dense screens and in documents. */
const PNG_SCALE = 2;
export const CSV_FILE_NAME = 'zeroplot-data.csv';

/**
 * Save a blob as a file: a temporary link to it, clicked once.
 * @param {string} file_name
 * @param {Blob} blob
 */
export function download_blob(file_name, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file_name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Preserve the data field exactly as entered in a CSV download. */
export function csv_blob(csv) {
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

export function download_csv(csv) {
  download_blob(CSV_FILE_NAME, csv_blob(csv));
}

/**
 * The chart as an SVG file.
 * @param {string} svg a standalone SVG document, as returned by build_chart()
 * @returns {Blob}
 */
export function svg_blob(svg) {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

/**
 * The chart as a PNG image, PNG_SCALE times the size of the chart.
 * Rejects with a user-facing message when the browser cannot draw it.
 * @param {string} svg a standalone SVG document, as returned by build_chart()
 * @returns {Promise<Blob>}
 */
export function svg_to_png(svg) {
  return new Promise((resolve, reject) => {
    const failed = () => reject(new Error('The PNG could not be created in this browser. Download the SVG instead.'));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH * PNG_SCALE;
      canvas.height = HEIGHT * PNG_SCALE;
      const context = canvas.getContext('2d');
      if (!context) {
        failed();
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : failed()), 'image/png');
    };
    image.onerror = failed;
    // A data URL, unlike a blob URL, never taints the canvas.
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
