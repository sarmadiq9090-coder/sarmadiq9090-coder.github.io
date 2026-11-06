/* PDF Kit core: page ranges and the PDF operations, without any UI. Everything runs in the browser.
   pdf-lib (writing) and pdf.js (reading/rendering) are vendored in ../vendor/ (see VERSIONS.md) and loaded on first use. */

const VENDOR = new URL('../vendor/', import.meta.url);
const PDFLIB = new URL('pdf-lib-1.17.1/pdf-lib.esm.min.js', VENDOR).href;
const PDFJS = new URL('pdfjs-dist-6.4.299/', VENDOR).href;

let pdfLibP, pdfjsP, worker;
export const pdfLib = () => (pdfLibP ??= import(PDFLIB));
export const pdfjs = () => (pdfjsP ??= import(PDFJS + 'pdf.min.mjs').then(m => {
  m.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
  return m;
}));

/* Opens a PDF with pdf.js (for page counts, thumbnails and PDF -> image). The bytes are copied: pdf.js takes ownership of its buffer. */
export async function openPdf(bytes) {
  const m = await pdfjs();
  worker ??= new m.PDFWorker();
  return m.getDocument({
    data: bytes.slice(), worker, isEvalSupported: false, enableXfa: false,
    standardFontDataUrl: PDFJS + 'standard_fonts/', wasmUrl: PDFJS + 'wasm/', iccUrl: PDFJS + 'iccs/'
  }).promise;
}

/* frees a document opened with openPdf (the shared worker stays) */
export const closePdf = doc => { if (doc) doc.loadingTask.destroy().catch(() => {}); };

/* ---------- page ranges: "1-3,5", "8-" (to the end), "-4" (from the start). Arabic digits, "،" and dashes are accepted. ---------- */
export class RangeInputError extends Error {
  constructor(code, part) { super(code); this.code = code; this.part = part; }
}
export function normalizeRange(text) {
  return String(text)
    .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x660)
    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x6f0)
    .replace(/[‐-―−ـ~]/g, '-')
    .replace(/[،؛;]/g, ',')
    .replace(/\s*-\s*/g, '-')
    .trim();
}
/* -> { groups: [[1,2,3],[5]], pages: [1,2,3,5] }; empty text = all pages. Throws RangeInputError (code: syntax | zero | outOfRange | reversed). */
export function parseRange(text, count) {
  const s = normalizeRange(text);
  if (!s) { const all = Array.from({ length: count }, (_, i) => i + 1); return { groups: [all], pages: all, all: true }; }
  const groups = [];
  for (const part of s.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)?(-)?(\d+)?$/);
    if (!m || (!m[1] && !m[3]) || (!m[2] && m[3])) throw new RangeInputError('syntax', part);
    const a = m[1] ? +m[1] : 1, b = m[2] ? (m[3] ? +m[3] : count) : a;
    if (a === 0 || b === 0) throw new RangeInputError('zero', part);
    if (a > count || b > count) throw new RangeInputError('outOfRange', part);
    if (a > b) throw new RangeInputError('reversed', part);
    groups.push(Array.from({ length: b - a + 1 }, (_, i) => a + i));
  }
  return { groups, pages: groups.flat(), all: false };
}
/* [1,2,3,5,7,8] -> "1-3,5,7-8" */
export function formatRange(pages) {
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    out.push(j > i ? `${pages[i]}-${pages[j]}` : `${pages[i]}`);
    i = j;
  }
  return out.join(',');
}

/* ---------- PDF operations (pdf-lib). Inputs are Uint8Arrays; outputs Uint8Arrays. ---------- */
export class PdfError extends Error {
  constructor(code, index, cause) { super(code); this.code = code; this.index = index; this.cause = cause; }
}
async function load(bytes, index) {
  const { PDFDocument } = await pdfLib();
  try { return await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (e) { throw new PdfError(/encrypt/i.test(e.message) ? 'encrypted' : 'unreadable', index, e); }
}
async function create() {
  const { PDFDocument } = await pdfLib();
  const doc = await PDFDocument.create();
  doc.setCreator('FastKiwi PDF Kit (fastkiwi.app/tools/pdf/)');
  return doc;
}

export async function mergePdfs(list, onStep = () => {}) {
  const out = await create();
  for (let i = 0; i < list.length; i++) {
    const src = await load(list[i], i);
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
    onStep(i + 1, list.length, out.getPageCount());
  }
  return out.save();
}

/* groups of 1-based page numbers -> one PDF per group */
export async function extractGroups(bytes, groups, onStep = () => {}) {
  const src = await load(bytes, 0), outs = [];
  for (let i = 0; i < groups.length; i++) {
    const out = await create();
    for (const p of await out.copyPages(src, groups[i].map(n => n - 1))) out.addPage(p);
    outs.push(await out.save());
    onStep(i + 1, groups.length);
  }
  return outs;
}

export const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
const MAX_PT = 14400; // the largest page PDF readers accept (200 inches)

/* images: [{ bytes, kind: 'jpg' | 'png' }]; opts: { size: 'fit' | 'a4' | 'letter', orientation: 'auto' | 'portrait' | 'landscape', margin: points } */
export async function imagesToPdf(images, opts = {}, onStep = () => {}) {
  const { size = 'fit', orientation = 'auto', margin = 0 } = opts;
  const out = await create();
  for (let i = 0; i < images.length; i++) {
    let img;
    try { img = images[i].kind === 'png' ? await out.embedPng(images[i].bytes) : await out.embedJpg(images[i].bytes); }
    catch (e) { throw new PdfError('badImage', i, e); }
    let pw, ph;
    if (size === 'fit') {
      const k = Math.min(1, (MAX_PT - 2 * margin) / Math.max(img.width * .75, img.height * .75)); // 96 dpi, capped
      pw = img.width * .75 * k + 2 * margin; ph = img.height * .75 * k + 2 * margin;
    } else {
      [pw, ph] = PAGE_SIZES[size];
      const land = orientation === 'landscape' || (orientation === 'auto' && img.width > img.height);
      if (land) [pw, ph] = [ph, pw];
    }
    const page = out.addPage([pw, ph]);
    const k = Math.min((pw - 2 * margin) / img.width, (ph - 2 * margin) / img.height);
    const w = img.width * k, h = img.height * k;
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    onStep(i + 1, images.length);
  }
  return out.save();
}

/* ---------- PDF -> images (pdf.js) ---------- */
const MAX_AREA = 16e6, MAX_SIDE = 8192; // keeps canvases within what phones can draw
export async function renderPage(doc, n, { dpi = 150, type = 'image/jpeg', quality = .92 } = {}) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  let scale = dpi / 72;
  scale = Math.min(scale, Math.sqrt(MAX_AREA / (base.width * base.height)), MAX_SIDE / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(vp.width)); canvas.height = Math.max(1, Math.floor(vp.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise;
  const blob = await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), type, quality));
  const size = { width: canvas.width, height: canvas.height };
  canvas.width = canvas.height = 0;
  page.cleanup();
  return { blob, ...size };
}

/* small preview of one page into a canvas (thumbnails) */
export async function renderThumb(doc, n, canvas, cssWidth = 120) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const vp = page.getViewport({ scale: (cssWidth * ratio) / base.width });
  canvas.width = Math.max(1, Math.floor(vp.width)); canvas.height = Math.max(1, Math.floor(vp.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise;
  page.cleanup();
}

/* ---------- images -> what pdf-lib can embed ---------- */
export function sniff(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
  return null;
}
/* EXIF orientation of a JPEG (1 = upright; 2-8 = rotated/mirrored, as phone photos often are) */
export function jpegOrientation(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return 1;
    const marker = b[i + 1], len = v.getUint16(i + 2);
    if (marker === 0xe1 && v.getUint32(i + 4) === 0x45786966) { // "Exif"
      const t = i + 10, le = v.getUint16(t) === 0x4949;
      const ifd = t + v.getUint32(t + 4, le), n = v.getUint16(ifd, le);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (e + 10 > b.length) return 1;
        if (v.getUint16(e, le) === 0x0112) return v.getUint16(e + 8, le) || 1;
      }
      return 1;
    }
    if (marker === 0xda) return 1; // image data starts: no EXIF
    i += 2 + len;
  }
  return 1;
}
/* -> { bytes, kind } ready for imagesToPdf; re-encodes rotated JPEGs and formats other than JPG/PNG (WebP, GIF, BMP...) */
export async function prepareImage(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (kind === 'png') return { bytes, kind };
  if (kind === 'jpg') {
    let o = 1;
    try { o = jpegOrientation(bytes); } catch {}
    if (o === 1) return { bytes, kind };
  }
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { throw new PdfError('badImage', 0, e); }
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d');
  if (kind === 'jpg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const type = kind === 'jpg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise(r => c.toBlob(r, type, .92));
  c.width = c.height = 0;
  if (!blob) throw new PdfError('badImage', 0);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: kind === 'jpg' ? 'jpg' : 'png' };
}
