/**
 * Lirune Reader — pdf.js loader (ES module)
 *
 * pdf.js is distributed as ES modules only. This tiny module is the single
 * place where it enters the application; everything else talks to
 * `window.pdfjsLib`, which keeps the PDF engine out of the classic script
 * pipeline and makes its licence boundary explicit (Apache-2.0).
 */

import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

window.pdfjsLib = pdfjsLib;
window.dispatchEvent(new Event('lirune:pdfjs-ready'));
