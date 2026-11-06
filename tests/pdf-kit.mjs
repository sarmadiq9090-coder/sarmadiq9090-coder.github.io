// FastKiwi Toolbox + PDF Kit (tools/) in a real browser: merge (with drag-to-reorder), split/extract, images -> PDF, PDF -> images,
// no request to any other host, no console errors on the en/ar pages, RTL, offline (service worker), and the static wiring
// (strings, sitemap, robots, vendored file hashes). Fixtures are generated here; nothing binary is committed.
// Run from the repo root: npm run test:pdf   (node tests/pdf-kit.mjs [--no-shots]); screenshots go to tests/output/ (or $QA_OUT).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from './server.mjs';
import { loadPlaywright } from './lib/playwright.mjs';

const { chromium } = loadPlaywright();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.resolve(process.env.QA_OUT || path.join(HERE, 'output')) + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const SHOTS = !process.argv.includes('--no-shots');
const L = await import(pathToFileURL(path.join(ROOT, 'tools/vendor/pdf-lib-1.17.1/pdf-lib.esm.min.js')).href);
const EN = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/pdf/i18n/en.json'), 'utf8'));
const AR = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/pdf/i18n/ar.json'), 'utf8'));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('  FAIL', msg); } };
const section = s => console.log('-', s);

/* ---------- fixtures ---------- */
async function makePdf(sizes, label) {
  const d = await L.PDFDocument.create();
  const font = await d.embedFont(L.StandardFonts.Helvetica);
  sizes.forEach(([w, h], i) => d.addPage([w, h]).drawText(`${label} ${i + 1}`, { x: 12, y: h - 30, size: 16, font }));
  return Buffer.from(await d.save());
}
const pdfA = await makePdf([[300, 400], [300, 400]], 'A');            // 2 pages
const pdfB = await makePdf([[500, 500], [500, 500], [500, 500]], 'B'); // 3 pages
const pdf5 = await makePdf([210, 220, 230, 240, 250].map(w => [w, 300]), 'P'); // page n is 200 + 10n wide
const pdfFile = (name, buffer) => ({ name, mimeType: 'application/pdf', buffer });
const sizesOf = async buf => { const d = await L.PDFDocument.load(buf); return d.getPages().map(p => { const { width, height } = p.getSize(); return [Math.round(width * 100) / 100, Math.round(height * 100) / 100]; }); };

/* JPEG APP1/EXIF segment with only the orientation tag (big-endian TIFF) */
function exifOrientation(o) {
  const tiff = Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const len = Buffer.alloc(2); len.writeUInt16BE(body.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xe1]), len, body]);
}

const { server, base: BASE } = await startServer(ROOT, 0);
const browser = await chromium.launch();
const foreign = new Set();
async function newContext(opts = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'allow', acceptDownloads: true, ...opts });
  await ctx.route(u => !u.href.startsWith(BASE), r => { foreign.add(r.request().url()); return r.abort(); });
  ctx.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !/^(blob|data):/.test(u)) foreign.add(u); });
  return ctx;
}
function watch(page, tag) {
  const errs = [], bad = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(e.message));
  page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  return () => { ok(!errs.length, `${tag}: console errors: ${errs.slice(0, 3).join(' | ')}`); ok(!bad.length, `${tag}: failed requests: ${bad.slice(0, 3).join(' | ')}`); };
}
async function blobBytes(page, href) {
  const b64 = await page.evaluate(async h => {
    const buf = new Uint8Array(await (await fetch(h)).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, href);
  return Buffer.from(b64, 'base64');
}
const panel = (page, id) => page.locator(`#panel-${id}`);
async function results(page, id) {
  const p = panel(page, id);
  await p.locator('.pk-result:not([hidden])').waitFor({ timeout: 30000 });
  return p.locator('.pk-result a[data-result]').evaluateAll(as => as.map(a => ({ href: a.href, name: a.getAttribute('download') })));
}
async function run(page, id) { // clicks the tool's main button and waits for a new result (or an error)
  const p = panel(page, id);
  await p.evaluate(el => { const r = el.querySelector('.pk-result'); r.hidden = true; r.replaceChildren(); });
  await p.locator('.pk-go').click();
  await p.locator('.pk-result:not([hidden]), .pk-error:not(:empty)').first().waitFor({ timeout: 30000 });
  const err = await p.locator('.pk-error').textContent();
  ok(!err, `${id}: unexpected error: ${err}`);
  return results(page, id);
}

/* ---------- 1. pages: load cleanly in en and ar, desktop and phone ---------- */
section('pages');
const PAGES = [['pdf-en', '/tools/pdf/', 'en'], ['pdf-ar', '/tools/pdf/ar/', 'ar'], ['tools-en', '/tools/', 'en'], ['tools-ar', '/tools/ar/', 'ar']];
for (const [w, hgt, dev] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
  const ctx = await newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: dev === 'mobile' ? 2 : 1, isMobile: dev === 'mobile', hasTouch: dev === 'mobile' });
  for (const [name, url, lang] of PAGES) {
    const page = await ctx.newPage(), done = watch(page, `${name}@${w}`);
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    if (name.startsWith('pdf')) await page.locator('.pk-tab').first().waitFor();
    const d = await page.evaluate(() => ({
      lang: document.documentElement.lang, dir: document.documentElement.dir, h1: document.querySelectorAll('h1').length,
      canonical: document.querySelector('link[rel=canonical]')?.href, alt: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map(l => l.hreflang + ' ' + l.href).sort(),
      empty: [...document.querySelectorAll('[data-i18n]')].filter(e => !e.textContent.trim()).map(e => e.dataset.i18n),
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      links: [...document.querySelectorAll('a[href]')].map(a => a.href), mailto: [...document.querySelectorAll('a[href^="mailto:"]')].map(a => a.textContent.trim())
    }));
    const tag = `${name}@${w}`;
    ok(d.lang === lang && d.dir === (lang === 'ar' ? 'rtl' : 'ltr'), `${tag}: lang/dir ${d.lang}/${d.dir}`);
    ok(d.h1 === 1, `${tag}: one server-rendered H1`);
    ok(d.canonical === 'https://fastkiwi.app' + url, `${tag}: canonical ${d.canonical}`);
    const pair = url.replace('/ar/', '/');
    ok(JSON.stringify(d.alt) === JSON.stringify([`ar https://fastkiwi.app${pair}ar/`, `en https://fastkiwi.app${pair}`, `x-default https://fastkiwi.app${pair}`]), `${tag}: hreflang ${d.alt}`);
    ok(!d.empty.length, `${tag}: strings not filled: ${d.empty.join(', ')}`);
    ok(d.sw <= d.cw, `${tag}: page scrolls sideways (${d.sw} > ${d.cw})`);
    ok(d.mailto.length === 1 && d.mailto[0] === (lang === 'ar' ? 'اطلب أداة' : 'Request a tool'), `${tag}: "Request a tool" mailto link: ${d.mailto}`);
    for (const l of d.links) {
      const u = new URL(l);
      if (u.protocol === 'mailto:') continue;
      if (u.origin === BASE) { let f = path.join(ROOT, decodeURIComponent(u.pathname)); if (f.endsWith(path.sep)) f = path.join(f, 'index.html'); ok(fs.existsSync(f), `${tag}: link to missing page ${u.pathname}`); }
      else ok(false, `${tag}: off-site link ${l}`);
    }
    if (name.startsWith('pdf')) {
      const trust = await page.locator('.tb-trust-main').textContent();
      ok(trust.trim() === (lang === 'ar' ? AR : EN).trust_local, `${tag}: "files never leave your device" shown: ${trust}`);
      ok(await page.locator('.tb-trust-main').isVisible(), `${tag}: privacy promise visible`);
    }
    if (SHOTS && ['pdf-en', 'pdf-ar', 'tools-en', 'tools-ar'].includes(name)) await page.screenshot({ path: `${OUT}pdfkit-${name}-${dev}.png`, fullPage: true });
    done();
    await page.close();
  }
  await ctx.close();
}

/* ---------- 2. RTL on the Arabic page ---------- */
section('rtl');
{
  const ctx = await newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage(), done = watch(page, 'rtl');
  await page.goto(BASE + '/tools/pdf/ar/#split', { waitUntil: 'networkidle' });
  await page.locator('.pk-tab').first().waitFor();
  const r = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.pk-tab')].map(t => t.getBoundingClientRect());
    return { appDir: getComputedStyle(document.getElementById('app')).direction, font: getComputedStyle(document.body).fontFamily,
      first: document.querySelector('.pk-tab strong').textContent, selected: document.querySelector('.pk-tab[aria-selected=true]').id,
      rightToLeft: tabs[0].left > tabs[1].left, lead: document.querySelector('.lead').textContent,
      rangeDir: getComputedStyle(document.querySelector('#panel-split .pk-range')).direction, h1: document.querySelector('h1').textContent };
  });
  ok(r.appDir === 'rtl', `rtl: #app direction ${r.appDir}`);
  ok(/Plex Arabic/.test(r.font), `rtl: IBM Plex Arabic font (${r.font})`);
  ok(r.first === AR.tab_merge && r.lead === AR.lead, `rtl: Arabic strings loaded (${r.first})`);
  ok(r.rightToLeft, 'rtl: tabs run right to left');
  ok(r.selected === 'tab-split', `rtl: #split deep link opens the split tool (${r.selected})`);
  ok(r.rangeDir === 'ltr', 'rtl: the page-range field stays LTR');
  ok(/[؀-ۿ]/.test(r.h1), 'rtl: Arabic H1 is server-rendered');
  // keyboard: ArrowLeft moves to the NEXT tab in RTL
  await page.locator('#tab-split').focus(); await page.keyboard.press('ArrowLeft');
  ok(await page.evaluate(() => document.activeElement.id) === 'tab-img2pdf', 'rtl: ArrowLeft goes to the next tab');
  done(); await ctx.close();
}

/* ---------- 3. the four tools (English page) ---------- */
section('tools');
const ctx = await newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(), done = watch(page, 'tools');
await page.goto(BASE + '/tools/pdf/', { waitUntil: 'networkidle' });
await page.locator('.pk-tab').first().waitFor();

// merge: two generated PDFs, reorder with the buttons and by dragging, check the page count and order
{
  const p = panel(page, 'merge');
  ok(await p.locator('.pk-go').isDisabled(), 'merge: button disabled with no files');
  await p.locator('input[type=file]').setInputFiles([pdfFile('a.pdf', pdfA), pdfFile('b.pdf', pdfB)]);
  await p.locator('.pk-item').nth(1).locator('.pk-meta', { hasText: '3 pages' }).waitFor();
  const names = () => p.locator('.pk-item .pk-name').allTextContents();
  ok(JSON.stringify(await names()) === '["a.pdf","b.pdf"]', 'merge: files listed in the order added');
  await p.getByRole('button', { name: 'Move b.pdf up' }).click();
  ok(JSON.stringify(await names()) === '["b.pdf","a.pdf"]', 'merge: "move up" reorders');
  await p.getByRole('button', { name: 'Move a.pdf up' }).click();
  ok(JSON.stringify(await names()) === '["a.pdf","b.pdf"]', 'merge: "move up" again');
  // drag b.pdf (by its row) above a.pdf
  const from = await p.locator('.pk-item').nth(1).locator('.pk-info').boundingBox(), to = await p.locator('.pk-item').nth(0).boundingBox();
  await page.mouse.move(from.x + 20, from.y + from.height / 2); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + 20, from.y + from.height / 2 - ((from.y - to.y + 10) * i) / 8);
  await page.mouse.up();
  ok(JSON.stringify(await names()) === '["b.pdf","a.pdf"]', `merge: drag to reorder (${await names()})`);
  ok((await p.locator('.pk-go').textContent()).includes('Merge 2 files'), 'merge: button names the file count');
  const res = await run(page, 'merge');
  ok(res.length === 1 && res[0].name === 'merged.pdf', 'merge: one merged.pdf');
  const s = await sizesOf(await blobBytes(page, res[0].href));
  ok(s.length === 5, `merge: 2 + 3 pages = ${s.length}`);
  ok(JSON.stringify(s) === JSON.stringify([[500, 500], [500, 500], [500, 500], [300, 400], [300, 400]]), `merge: pages follow the dragged order ${JSON.stringify(s)}`);
  ok((await p.locator('.pk-done-title').textContent()).includes('5 pages'), 'merge: result says 5 pages');
  // a file that isn't a PDF inside: marked, and merging is refused with a clear message
  await p.locator('input[type=file]').setInputFiles([pdfFile('broken.pdf', Buffer.from('this is not a pdf'))]);
  await p.locator('.pk-item.bad').waitFor();
  await p.locator('.pk-go').click();
  ok((await p.locator('.pk-error').textContent()) === EN.err_remove_bad, 'merge: a broken file blocks merging with a message');
  await p.getByRole('button', { name: 'Remove broken.pdf' }).click();
  ok(await p.locator('.pk-item').count() === 2, 'merge: remove button');
}

// split / extract: "1-3,5"
{
  await page.locator('#tab-split').click();
  ok(page.url().endsWith('#split'), 'split: the tab sets #split');
  const p = panel(page, 'split');
  await p.locator('input[type=file]').setInputFiles([pdfFile('five.pdf', pdf5)]);
  await p.locator('.pk-single:not([hidden])').waitFor();
  ok((await p.locator('.pk-single .pk-meta').textContent()).startsWith('5 pages'), 'split: page count shown');
  ok(await p.locator('.pk-page').count() === 5, 'split: page grid');
  await p.locator('.pk-range').fill('1-3,5');
  ok(await p.locator('.pk-page[aria-pressed=true]').count() === 4, 'split: range highlights 4 pages');
  let res = await run(page, 'split');
  ok(res.length === 1 && res[0].name === 'five-pages-1-3_5.pdf', `split: one extracted file (${res.map(r => r.name)})`);
  let s = await sizesOf(await blobBytes(page, res[0].href));
  ok(JSON.stringify(s.map(x => x[0])) === '[210,220,230,250]', `split: extract 1-3,5 -> pages ${JSON.stringify(s.map(x => x[0]))}`);
  // one file per range
  await p.locator('input[value=ranges]').check();
  res = await run(page, 'split');
  ok(res.length === 2, `split: one PDF per range -> ${res.length} files`);
  const parts = await Promise.all(res.map(async r => (await sizesOf(await blobBytes(page, r.href))).map(x => x[0])));
  ok(JSON.stringify(parts) === '[[210,220,230],[250]]', `split: ranges ${JSON.stringify(parts)}`);
  // every page
  await p.locator('input[value=each]').check();
  await p.locator('.pk-range').fill('');
  res = await run(page, 'split');
  ok(res.length === 5 && res[4].name === 'five-page-5.pdf', `split: every page -> ${res.length} files`);
  // ZIP of all parts
  const [dl] = await Promise.all([page.waitForEvent('download'), p.locator('button[data-zip]').click()]);
  const zip = fs.readFileSync(await dl.path());
  ok(dl.suggestedFilename() === 'five-split.zip' && zip.readUInt32LE(0) === 0x04034b50, 'split: ZIP download');
  ok(zip.toString('latin1').split('PK\x01\x02').length - 1 === 5, 'split: ZIP holds 5 files');
  // clicking a page thumbnail edits the range; Arabic digits and "8-" style ranges are understood; bad ranges are explained
  await p.locator('input[value=extract]').check();
  await p.locator('.pk-range').fill('1-3,5');
  await p.locator('.pk-page[data-page="4"]').click();
  ok(await p.locator('.pk-range').inputValue() === '1-5', 'split: clicking page 4 gives 1-5');
  await p.locator('.pk-range').fill('٢-٣');
  ok(await p.locator('.pk-page[aria-pressed=true]').count() === 2 && !(await p.locator('.pk-go').isDisabled()), 'split: Arabic digits ٢-٣');
  await p.locator('.pk-range').fill('4-');
  ok((await p.locator('.pk-sel').textContent()) === 'Selected: 2 pages', 'split: "4-" runs to the end');
  await p.locator('.pk-range').fill('2,9');
  ok(await p.locator('.pk-go').isDisabled() && (await p.locator('.pk-field-err').textContent()).includes('5 pages'), 'split: out-of-range page explained, button off');
  await p.locator('.pk-range').fill('1-3;x');
  ok((await p.locator('.pk-field-err').textContent()).includes('“x”'), 'split: syntax error names the bad part');
  // a broken file
  await p.locator('input[type=file]').setInputFiles([pdfFile('broken.pdf', Buffer.from('%PDF-1.7 garbage'))]);
  await p.locator('.pk-error:not(:empty)').waitFor();
  ok((await p.locator('.pk-error').textContent()).includes('broken.pdf'), 'split: unreadable PDF explained');
}

// images -> PDF: a PNG, a JPEG and a JPEG whose EXIF says "rotated 90°" (as phone photos do)
{
  await page.locator('#tab-img2pdf').click();
  const p = panel(page, 'img2pdf');
  const img = await page.evaluate(async () => {
    const make = async (w, h, type) => {
      const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
      g.fillStyle = '#3f8a1c'; g.fillRect(0, 0, w, h); g.fillStyle = '#f59e0b'; g.fillRect(0, 0, w / 2, h / 4);
      const b = new Uint8Array(await (await c.convertToBlob({ type, quality: .9 })).arrayBuffer());
      let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s);
    };
    return { png: await make(40, 30, 'image/png'), jpg: await make(60, 80, 'image/jpeg') };
  });
  const png = Buffer.from(img.png, 'base64'), jpg = Buffer.from(img.jpg, 'base64');
  const rotated = Buffer.concat([jpg.subarray(0, 2), exifOrientation(6), jpg.subarray(2)]);
  await p.locator('input[type=file]').setInputFiles([
    { name: 'wide.png', mimeType: 'image/png', buffer: png }, { name: 'tall.jpg', mimeType: 'image/jpeg', buffer: jpg },
    { name: 'phone.jpg', mimeType: 'image/jpeg', buffer: rotated }, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
  ok(await p.locator('.pk-item').count() === 3, 'img2pdf: three images listed');
  ok((await p.locator('.pk-error').textContent()).includes('notes.txt'), 'img2pdf: non-image skipped with a message');
  let res = await run(page, 'img2pdf');
  let s = await sizesOf(await blobBytes(page, res[0].href));
  ok(JSON.stringify(s) === '[[30,22.5],[45,60],[60,45]]', `img2pdf: "same as image" pages (96 dpi), EXIF rotation applied: ${JSON.stringify(s)}`);
  await p.locator('select').first().selectOption('a4');
  res = await run(page, 'img2pdf');
  s = await sizesOf(await blobBytes(page, res[0].href));
  ok(JSON.stringify(s) === '[[841.89,595.28],[595.28,841.89],[841.89,595.28]]', `img2pdf: A4, automatic orientation: ${JSON.stringify(s)}`);
  ok(res[0].name === 'images.pdf', 'img2pdf: file name');
}

// PDF -> images: PNG at 72 dpi has the page's size in pixels; JPG for one page
{
  await page.locator('#tab-pdf2img').click();
  const p = panel(page, 'pdf2img');
  await p.locator('input[type=file]').setInputFiles([pdfFile('mixed.pdf', Buffer.concat([await makePdf([[300, 400], [500, 500]], 'M')]))]);
  await p.locator('.pk-single:not([hidden])').waitFor();
  await p.locator('select').nth(0).selectOption('png');
  await p.locator('select').nth(1).selectOption('72');
  let res = await run(page, 'pdf2img');
  ok(res.length === 2 && res[0].name === 'mixed-page-1.png', `pdf2img: two PNGs (${res.map(r => r.name)})`);
  const a = await blobBytes(page, res[0].href), b = await blobBytes(page, res[1].href);
  ok(a.subarray(1, 4).toString() === 'PNG' && a.readUInt32BE(16) === 300 && a.readUInt32BE(20) === 400, `pdf2img: page 1 is a 300x400 PNG (${a.readUInt32BE(16)}x${a.readUInt32BE(20)})`);
  ok(b.readUInt32BE(16) === 500 && b.readUInt32BE(20) === 500, 'pdf2img: page 2 is 500x500');
  const px = await page.evaluate(async h => { // the page was really drawn: white paper, dark text
    const bmp = await createImageBitmap(await (await fetch(h)).blob()), c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
    g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, bmp.width, bmp.height).data; let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 100 && d[i + 1] < 100 && d[i + 2] < 100) dark++;
    return { corner: [...g.getImageData(bmp.width - 2, bmp.height - 2, 1, 1).data], dark };
  }, res[0].href);
  ok(px.corner.join() === '255,255,255,255' && px.dark > 20, `pdf2img: page rendered (white page, ${px.dark} text pixels)`);
  await p.locator('select').nth(0).selectOption('jpg');
  await p.locator('select').nth(1).selectOption('150');
  await p.locator('.pk-range').fill('2');
  res = await run(page, 'pdf2img');
  const j = await blobBytes(page, res[0].href);
  ok(res.length === 1 && res[0].name === 'mixed-page-2.jpg' && j[0] === 0xff && j[1] === 0xd8, 'pdf2img: one JPG for page 2');
}
done();

/* ---------- 4. offline: the service worker serves the tool with the network off ---------- */
section('offline');
{
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  const cached = await page.evaluate(async () => { const k = (await caches.keys()).find(x => x.startsWith('fk-tools-')); return k ? (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname) : []; });
  const sw = read('tools/sw.js'), pre = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  ok(pre.every(p => cached.includes(p)), `offline: everything precached (${pre.filter(p => !cached.includes(p)).join(' ')})`);
  ok(cached.every(p => p.startsWith('/tools/') || p.startsWith('/fonts/') || ['/style.css', '/img/logo.svg', '/favicon.ico'].includes(p) || /^\/img\/fastkiwi-(latin|arabic)(-dark)?\.svg$/.test(p)), 'offline: caches only the tool’s files');
  await ctx.setOffline(true);
  const off = await ctx.newPage(), offDone = watch(off, 'offline');
  await off.goto(BASE + '/tools/pdf/ar/#merge', { waitUntil: 'load' });
  await off.locator('.pk-tab').first().waitFor();
  const p = panel(off, 'merge');
  await p.locator('input[type=file]').setInputFiles([pdfFile('a.pdf', pdfA), pdfFile('b.pdf', pdfB)]);
  await p.locator('.pk-item .pk-meta', { hasText: 'صفحات' }).first().waitFor();
  const res = await run(off, 'merge');
  ok((await sizesOf(await blobBytes(off, res[0].href))).length === 5, 'offline: merging works with the network off');
  offDone();
  await ctx.setOffline(false);
}
await ctx.close();
ok(!foreign.size, `no request left this site: ${[...foreign].slice(0, 5).join(' ')}`);

/* ---------- 5. static wiring ---------- */
section('static');
{
  const used = new Set();
  for (const f of ['tools/pdf/app.js', 'tools/lib/pwa.js']) for (const m of read(f).matchAll(/\bt\('([a-z0-9_]+)'/g)) used.add(m[1]);
  for (const f of ['tools/pdf/index.html', 'tools/pdf/ar/index.html']) for (const m of read(f).matchAll(/data-i18n(?:-[a-z-]+)?="([a-z0-9_]+)"/g)) used.add(m[1]);
  for (const m of read('tools/pdf/app.js').matchAll(/\btn\('([a-z]+)'/g)) used.add(m[1] + '_other');
  for (const m of read('tools/pdf/app.js').matchAll(/'(tab_|err_|range_err_|split_mode_|img_|out_)[a-z0-9_]*'/g)) used.add(m[0].slice(1, -1));
  const missing = [...used].filter(k => !k.endsWith('_') && !(k in EN) && !/^tab_$|^err_$/.test(k));
  ok(!missing.length, `strings: keys missing from en.json: ${missing.join(', ')}`);
  ok(Object.keys(EN).every(k => k in AR), `strings: keys missing from ar.json: ${Object.keys(EN).filter(k => !(k in AR)).join(', ')}`);
  for (const id of ['merge', 'split', 'img2pdf', 'pdf2img']) for (const s of ['', '_sub', '_title']) ok(`tab_${id}${s}` in EN, `strings: tab_${id}${s}`);

  const sm = read('sitemap.xml');
  for (const [u, en, ar] of [['/tools/', '/tools/', '/tools/ar/'], ['/tools/ar/', '/tools/', '/tools/ar/'], ['/tools/pdf/', '/tools/pdf/', '/tools/pdf/ar/'], ['/tools/pdf/ar/', '/tools/pdf/', '/tools/pdf/ar/']]) {
    const entry = sm.match(new RegExp(`<url><loc>https://fastkiwi\\.app${u.replace(/\//g, '\\/')}</loc>.*?</url>`))?.[0] || '';
    ok(entry.includes(`hreflang="en" href="https://fastkiwi.app${en}"`) && entry.includes(`hreflang="ar" href="https://fastkiwi.app${ar}"`), `sitemap: ${u} with hreflang pair`);
  }
  const robots = read('robots.txt').split('\n').filter(l => /^Disallow:/i.test(l)).map(l => l.split(':')[1].trim());
  ok(!robots.some(d => d && ['/tools/', '/tools/pdf/', '/tools/ar/'].some(p => p.startsWith(d))), `robots.txt lets search engines see the tool pages (${robots})`);

  const versions = read('tools/vendor/VERSIONS.md');
  const listed = [...versions.matchAll(/`([0-9a-f]{64})`\s*\|\s*`([^`]+)`/g)];
  const files = []; (function walk(d) { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : e.name !== 'VERSIONS.md' && files.push(path.join(d, e.name).split(path.sep).join('/')); })('tools/vendor');
  ok(listed.length === files.length, `vendor: VERSIONS.md lists ${listed.length} of ${files.length} files`);
  for (const [, sha, f] of listed) {
    const p = path.join(ROOT, 'tools/vendor', f);
    ok(fs.existsSync(p) && crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') === sha, `vendor: sha256 of ${f}`);
  }
  for (const m of read('tools/pdf/core.js').matchAll(/'((?:pdf-lib|pdfjs-dist)-[\d.]+\/[^']*)'/g)) ok(fs.existsSync(path.join(ROOT, 'tools/vendor', m[1])), `vendor: core.js loads ${m[1]}`);
  for (const p of JSON.parse(read('tools/sw.js').match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'))) { let f = path.join(ROOT, p); if (p.endsWith('/')) f = path.join(f, 'index.html'); ok(fs.existsSync(f), `sw: precached file exists ${p}`); }
  for (const m of ['tools/pdf/manifest.webmanifest', 'tools/pdf/ar/manifest.webmanifest']) {
    const j = JSON.parse(read(m));
    ok(j.icons.every(i => fs.existsSync(path.join(ROOT, i.src))) && j.start_url.startsWith('/tools/pdf/') && j.display === 'standalone', `manifest ${m}`);
  }
}

await browser.close();
server.close();
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
