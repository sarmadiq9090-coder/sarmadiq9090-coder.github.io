/* FastKiwi PDF Kit: merge, split/extract, images -> PDF, PDF -> images.
   Everything happens in this browser tab: files are read from the device and the results are saved back to it. Nothing is uploaded
   (the page's Content-Security-Policy only allows this site, and tests/pdf-kit.mjs checks that no other host is contacted).
   UI strings: i18n/<lang>.json (loader: ../lib/i18n.js). PDF work: ./core.js. Offline/install: ../lib/pwa.js + ../sw.js. */
import { loadI18n } from '../lib/i18n.js';
import { initPwa } from '../lib/pwa.js';
import { makeZip } from '../lib/zip.js';
import * as K from './core.js';

const lang = document.documentElement.lang || 'en';
const rtl = document.documentElement.dir === 'rtl';
const app = document.getElementById('app');
let I18N;
try { I18N = await loadI18n(new URL('./i18n/', import.meta.url), lang); }
catch (e) { app.textContent = 'PDF Kit could not start. Please reload the page.'; throw e; }
const { t, tn } = I18N;
I18N.apply();
const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'].map(unit => new Intl.NumberFormat(lang, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }));
const fmtSize = n => { let i = 0; while (n >= 1000 && i < 3) { n /= 1000; i++; } return units[i].format(i ? n : Math.round(n)); };

/* ---------- tiny DOM helpers ---------- */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c);
  return el;
}
const P = {
  merge: '<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M9 12h6m-3-3 3 3-3 3"/>',
  split: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  toimg: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><circle cx="10" cy="12.5" r="1.5"/><path d="m19 17-3-3-6 6"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M12 4v12m-5-5 5 5 5-5M4 20h16"/>', check: '<path d="M20 6 9 17l-5-5"/>', lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'
};
function icon(name, cls = 'i') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', name === 'grip' ? 'currentColor' : 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', cls);
  s.innerHTML = P[name];
  return s;
}
const iconBtn = (name, label, onclick) => h('button', { type: 'button', class: 'pk-icon-btn', 'aria-label': label, title: label, onclick }, icon(name));
const baseName = name => name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'file';
const pad = (n, max) => String(n).padStart(String(max).length, '0');
const isPdfFile = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImageFile = f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name);
const hasPdfHeader = b => { const head = new TextDecoder('latin1').decode(b.subarray(0, 1024)); return head.includes('%PDF-'); };

/* one thumbnail at a time keeps memory low on phones */
let chain = Promise.resolve();
function queue(fn) { const p = chain.then(fn); chain = p.catch(() => {}); return p; }

/* polite announcements for screen readers (reordering, results) */
const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
const announce = msg => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };

function errorText(e, name = '', row = false) {
  const code = e?.code || (e?.name === 'PasswordException' ? 'encrypted' : e?.name === 'InvalidPDFException' ? 'unreadable' : null);
  const key = (row ? 'err_row_' : 'err_') + code;
  if (code && I18N.has(key)) return t(key, { name });
  console.error(e);
  return t('err_generic', { msg: e?.message || String(e) });
}

/* ---------- shared building blocks ---------- */
function dropZone({ multiple, accept, title, sub, onFiles }) {
  const input = h('input', { type: 'file', class: 'sr-only', accept, multiple, onchange: () => { if (input.files.length) onFiles([...input.files]); input.value = ''; } });
  const zone = h('label', { class: 'pk-drop' }, input,
    h('span', { class: 'pk-drop-ico' }, icon('upload')),
    h('span', { class: 'pk-drop-title', text: title }),
    h('span', { class: 'pk-drop-or', text: t('drop_or') }),
    h('span', { class: 'btn btn-primary pk-drop-btn', text: multiple ? t('choose_files') : t('choose_file') }),
    h('span', { class: 'pk-drop-sub' }, icon('lock'), h('span', { text: sub || t('drop_private') })));
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('over'); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); });
  return { el: zone, input };
}

function feedback() {
  const bar = h('progress', { class: 'pk-progress', max: '1', hidden: true });
  const status = h('p', { class: 'pk-status', role: 'status' });
  const error = h('p', { class: 'pk-error', role: 'alert' });
  const result = h('div', { class: 'pk-result', hidden: true, tabindex: '-1' });
  let urls = [];
  const fb = {
    el: h('div', { class: 'pk-feedback' }, bar, status, error, result),
    busy(msg, frac) { bar.hidden = false; if (frac == null) bar.removeAttribute('value'); else bar.value = frac; status.textContent = msg; },
    idle() { bar.hidden = true; status.textContent = ''; },
    fail(msg = '') { error.textContent = msg; },
    clear() { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; result.replaceChildren(); result.hidden = true; error.textContent = ''; },
    /* files: [{ name, blob, preview? }] */
    show(files, { title, zipName }) {
      fb.clear();
      const url = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };
      const total = files.reduce((s, f) => s + f.blob.size, 0);
      const head = h('div', { class: 'pk-done' }, h('span', { class: 'pk-done-ico' }, icon('check')),
        h('div', {}, h('p', { class: 'pk-done-title', text: title }), h('p', { class: 'pk-done-sub', text: t('done_sub') })));
      result.append(head);
      if (files.length === 1) {
        const f = files[0];
        result.append(h('a', { class: 'btn btn-primary pk-save', href: url(f.blob), download: f.name, dataset: { result: '' } }, icon('download'),
          h('span', { text: t('save_file') }), h('span', { class: 'pk-save-meta', dir: 'auto', text: `${f.name} · ${fmtSize(f.blob.size)}` })));
      } else {
        const zipBtn = h('button', { type: 'button', class: 'btn btn-primary pk-save', dataset: { zip: zipName } }, icon('download'),
          h('span', { text: t('save_zip') }), h('span', { class: 'pk-save-meta', text: `${tn('files', files.length)} · ${fmtSize(total)}` }));
        zipBtn.addEventListener('click', async () => {
          zipBtn.disabled = true;
          try {
            const parts = await Promise.all(files.map(async f => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) })));
            const a = h('a', { href: url(makeZip(parts)), download: zipName });
            document.body.append(a); a.click(); a.remove();
          } catch (e) { fb.fail(errorText(e)); }
          zipBtn.disabled = false;
        });
        result.append(zipBtn, h('p', { class: 'pk-or-each', text: t('or_each') }),
          h('ul', { class: 'pk-outs' }, files.map(f => {
            const href = url(f.blob);
            return h('li', {}, f.preview ? h('img', { src: href, alt: '', loading: 'lazy' }) : h('span', { class: 'pk-out-ico' }, icon('file')),
              h('a', { href, download: f.name, dir: 'auto', dataset: { result: '' } }, f.name), h('span', { class: 'pk-out-size', text: fmtSize(f.blob.size) }));
          })));
      }
      result.hidden = false;
      announce(title);
      result.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  };
  return fb;
}

/* Reorderable file list: drag a row (mouse) or its handle (touch/pen), or use the up/down buttons. */
function fileList({ onChange, thumb }) {
  const ol = h('ol', { class: 'pk-list' });
  const items = new Map();
  let seq = 0;
  const order = () => [...ol.children].map(li => items.get(li.dataset.id));
  function refresh() {
    const all = order();
    all.forEach((it, i) => { it.up.disabled = i === 0; it.down.disabled = i === all.length - 1; });
    onChange();
  }
  function move(it, d, btn) {
    const sib = d < 0 ? it.li.previousElementSibling : it.li.nextElementSibling;
    if (!sib) return;
    if (d < 0) sib.before(it.li); else sib.after(it.li);
    refresh();
    (btn.disabled ? (d < 0 ? it.down : it.up) : btn).focus();
    const all = order();
    announce(t('moved', { name: it.file.name, pos: all.indexOf(it) + 1, total: all.length }));
  }
  function remove(it) {
    if (it.url) URL.revokeObjectURL(it.url);
    it.li.remove(); items.delete(it.id);
    refresh();
  }
  function add(file) {
    const it = { id: 'i' + ++seq, file };
    const name = file.name;
    if (thumb === 'img') { it.url = URL.createObjectURL(file); it.thumb = h('img', { src: it.url, alt: '' }); }
    else it.thumb = h('canvas', { width: '48', height: '64' });
    it.meta = h('span', { class: 'pk-meta', text: fmtSize(file.size) });
    it.err = h('span', { class: 'pk-item-err', hidden: true });
    it.up = iconBtn('up', t('move_up', { name }), () => move(it, -1, it.up));
    it.down = iconBtn('down', t('move_down', { name }), () => move(it, 1, it.down));
    it.li = h('li', { class: 'pk-item', dataset: { id: it.id } },
      h('span', { class: 'pk-grip', title: t('drag_hint') }, icon('grip')),
      h('span', { class: 'pk-thumb' }, it.thumb),
      h('span', { class: 'pk-info' }, h('span', { class: 'pk-name', dir: 'auto', title: name, text: name }), it.meta, it.err),
      h('span', { class: 'pk-acts' }, it.up, it.down, iconBtn('x', t('remove_file', { name }), () => remove(it))));
    items.set(it.id, it);
    ol.append(it.li);
    refresh();
    return it;
  }
  const mid = el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
  ol.addEventListener('pointerdown', e => {
    const li = e.target.closest('.pk-item');
    if (!li || e.button !== 0 || e.target.closest('button') || ol.children.length < 2) return;
    if (e.pointerType !== 'mouse' && !e.target.closest('.pk-grip')) return; // touch scrolls the page unless the handle is used
    e.preventDefault();
    const startY = e.clientY, grab = e.clientY - li.getBoundingClientRect().top;
    let dragging = false;
    li.setPointerCapture(e.pointerId);
    const onMove = ev => {
      if (!dragging) { if (Math.abs(ev.clientY - startY) < 4) return; dragging = true; li.classList.add('dragging'); ol.classList.add('sorting'); }
      let prev = li.previousElementSibling, next = li.nextElementSibling;
      while (prev && ev.clientY < mid(prev)) { prev.before(li); prev = li.previousElementSibling; }
      while (next && ev.clientY > mid(next)) { next.after(li); next = li.nextElementSibling; }
      li.style.transform = '';
      li.style.transform = `translateY(${ev.clientY - grab - li.getBoundingClientRect().top}px)`;
    };
    const onUp = () => {
      li.removeEventListener('pointermove', onMove); li.removeEventListener('pointerup', onUp); li.removeEventListener('pointercancel', onUp);
      li.style.transform = ''; li.classList.remove('dragging'); ol.classList.remove('sorting');
      if (dragging) { refresh(); const all = order(), it = items.get(li.dataset.id); announce(t('moved', { name: it.file.name, pos: all.indexOf(it) + 1, total: all.length })); }
    };
    li.addEventListener('pointermove', onMove); li.addEventListener('pointerup', onUp); li.addEventListener('pointercancel', onUp);
  });
  return {
    el: ol, add, order, remove,
    clear() { for (const it of order()) remove(it); },
    setMeta(it, text) { it.meta.textContent = text; },
    setError(it, text) { it.err.textContent = text; it.err.hidden = !text; it.li.classList.toggle('bad', !!text); }
  };
}

/* One PDF with a page grid and a page-range field (split, PDF -> images). */
function singlePdf({ fb, onChange }) {
  const S = { file: null, bytes: null, doc: null, count: 0 };
  const zone = dropZone({ multiple: false, accept: 'application/pdf,.pdf', title: t('drop_pdf'), onFiles: files => load(files[0]) });
  const thumb = h('canvas', { width: '48', height: '64' });
  const name = h('span', { class: 'pk-name', dir: 'auto' }), meta = h('span', { class: 'pk-meta' });
  const summary = h('div', { class: 'pk-item pk-single', hidden: true }, h('span', { class: 'pk-thumb' }, thumb), h('span', { class: 'pk-info' }, name, meta),
    h('span', { class: 'pk-acts' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: t('change_file'), onclick: () => zone.input.click() }),
      iconBtn('x', t('remove_pdf'), reset)));
  const rid = 'r' + Math.random().toString(36).slice(2, 8);
  const range = h('input', { type: 'text', id: rid, class: 'pk-range', dir: 'ltr', autocomplete: 'off', spellcheck: 'false', placeholder: t('range_placeholder'), 'aria-describedby': rid + '-help ' + rid + '-err' });
  const help = h('p', { class: 'pk-help', id: rid + '-help', text: t('range_help') });
  const rerr = h('p', { class: 'pk-field-err', id: rid + '-err' });
  const selInfo = h('p', { class: 'pk-sel', 'aria-live': 'polite' });
  const grid = h('div', { class: 'pk-pages', role: 'group', 'aria-label': t('pages_grid') });
  const rangeBox = h('div', { class: 'pk-range-box', hidden: true },
    h('label', { class: 'pk-label', for: rid, text: t('range_label') }), range, help, rerr, selInfo, grid);
  let io;

  function reset() {
    K.closePdf(S.doc); Object.assign(S, { file: null, bytes: null, doc: null, count: 0 });
    io?.disconnect(); grid.replaceChildren(); range.value = ''; rerr.textContent = '';
    summary.hidden = rangeBox.hidden = true; zone.el.hidden = false; fb.clear(); onChange();
  }
  async function load(file) {
    if (!file) return;
    fb.clear();
    if (!isPdfFile(file)) { fb.fail(t('err_not_pdf', { names: file.name })); return; }
    reset(); fb.busy(t('opening', { name: file.name }));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!hasPdfHeader(bytes)) throw new K.PdfError('unreadable');
      const doc = await K.openPdf(bytes);
      Object.assign(S, { file, bytes, doc, count: doc.numPages });
    } catch (e) { fb.idle(); fb.fail(errorText(e, file.name)); return; }
    fb.idle();
    name.textContent = name.title = file.name;
    meta.textContent = `${tn('pages', S.count)} · ${fmtSize(file.size)}`;
    summary.hidden = rangeBox.hidden = false; zone.el.hidden = true;
    const doc = S.doc;
    queue(() => S.doc === doc && K.renderThumb(doc, 1, thumb, 48)).catch(() => {});
    io = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) {
        io.unobserve(en.target);
        const n = +en.target.dataset.page, c = en.target.querySelector('canvas');
        queue(() => S.doc === doc && K.renderThumb(doc, n, c, 96)).catch(() => {});
      }
    }, { rootMargin: '300px' });
    for (let n = 1; n <= S.count; n++) {
      const b = h('button', { type: 'button', class: 'pk-page', 'aria-pressed': 'false', dataset: { page: n }, 'aria-label': t('page_n', { n }) },
        h('canvas', { width: '96', height: '128' }), h('span', { class: 'pk-page-n', text: String(n) }));
      grid.append(b); io.observe(b);
    }
    sync();
    onChange();
  }
  /* -> { groups, pages, all } or null (and shows why) */
  function selection(show = true) {
    if (!S.doc) return null;
    try { const sel = K.parseRange(range.value, S.count); rerr.textContent = ''; range.removeAttribute('aria-invalid'); return sel; }
    catch (e) {
      if (show) {
        const msgs = { syntax: 'range_err_syntax', zero: 'range_err_zero', outOfRange: 'range_err_out', reversed: 'range_err_reversed' };
        rerr.textContent = t(msgs[e.code] || 'range_err_syntax', { part: e.part, pages: tn('pages', S.count) });
        range.setAttribute('aria-invalid', 'true');
      }
      return null;
    }
  }
  function sync() {
    const sel = selection();
    const on = new Set(sel && !sel.all ? sel.pages : []);
    for (const b of grid.children) b.setAttribute('aria-pressed', on.has(+b.dataset.page) ? 'true' : 'false');
    selInfo.textContent = !sel ? '' : sel.all ? t('sel_all', { pages: tn('pages', S.count) }) : t('sel_some', { pages: tn('pages', new Set(sel.pages).size) });
  }
  range.addEventListener('input', () => { sync(); onChange(); });
  grid.addEventListener('click', e => {
    const b = e.target.closest('.pk-page');
    if (!b) return;
    const sel = selection(false), n = +b.dataset.page;
    const set = new Set(sel && !sel.all ? sel.pages : []);
    if (set.has(n)) set.delete(n); else set.add(n);
    range.value = K.formatRange([...set].sort((a, c) => a - c));
    sync(); onChange();
  });
  return { S, els: [zone.el, summary, rangeBox], selection, load, reset, rangeInput: range };
}

const fieldSelect = (labelKey, options, value) => {
  const id = 's' + Math.random().toString(36).slice(2, 8);
  const sel = h('select', { id, class: 'pk-select' }, options.map(([v, k]) => h('option', { value: v, selected: v === value, text: t(k) })));
  return { el: h('div', { class: 'pk-field' }, h('label', { class: 'pk-label', for: id, text: t(labelKey) }), sel), sel };
};
const goButton = (iconName, onclick) => h('button', { type: 'button', class: 'btn btn-primary pk-go', disabled: true, onclick }, icon(iconName), h('span'));
const setGo = (btn, text, enabled) => { btn.lastChild.textContent = text; btn.disabled = !enabled; };

/* ---------- 1. merge ---------- */
function mergeTool() {
  const fb = feedback();
  let busy = false;
  const list = fileList({ thumb: 'canvas', onChange: update });
  const zone = dropZone({ multiple: true, accept: 'application/pdf,.pdf', title: t('drop_pdfs'), onFiles: add });
  const hint = h('p', { class: 'pk-help pk-list-hint', text: t('drag_hint') });
  const go = goButton('merge', run);
  function update() {
    const items = list.order(), n = items.length;
    hint.hidden = n < 2;
    zone.el.classList.toggle('compact', n > 0);
    setGo(go, n >= 2 ? t('merge_go_n', { files: tn('files', n) }) : t('merge_go'), n >= 2 && !busy);
  }
  async function describe(it) {
    try {
      it.bytes = new Uint8Array(await it.file.arrayBuffer());
      if (!hasPdfHeader(it.bytes)) throw new K.PdfError('unreadable');
      const doc = await K.openPdf(it.bytes);
      it.pages = doc.numPages;
      list.setMeta(it, `${tn('pages', doc.numPages)} · ${fmtSize(it.file.size)}`);
      await queue(() => K.renderThumb(doc, 1, it.thumb, 48)).catch(() => {});
      K.closePdf(doc);
    } catch (e) { it.bad = true; list.setError(it, errorText(e, it.file.name, true)); }
  }
  function add(files) {
    fb.clear();
    const skipped = files.filter(f => !isPdfFile(f)).map(f => f.name);
    for (const f of files.filter(isPdfFile)) describe(list.add(f));
    if (skipped.length) fb.fail(t('err_not_pdf', { names: skipped.join(t('list_sep')) }));
  }
  async function run() {
    const items = list.order();
    fb.clear();
    if (items.some(it => it.bad)) { fb.fail(t('err_remove_bad')); return; }
    busy = true; update();
    try {
      fb.busy(t('working'));
      const bytes = await Promise.all(items.map(async it => it.bytes || new Uint8Array(await it.file.arrayBuffer())));
      let pages = 0;
      const out = await K.mergePdfs(bytes, (i, n, total) => { pages = total; fb.busy(t('merging', { i, n }), i / n); });
      fb.idle();
      fb.show([{ name: 'merged.pdf', blob: new Blob([out], { type: 'application/pdf' }) }], { title: t('merge_done', { pages: tn('pages', pages) }) });
    } catch (e) { fb.idle(); fb.fail(errorText(e, items[e.index]?.file.name)); }
    busy = false; update();
  }
  update();
  return h('div', { class: 'pk-body' }, zone.el, list.el, hint, h('div', { class: 'pk-actions' }, go), fb.el);
}

/* ---------- 2. split / extract ---------- */
function splitTool() {
  const fb = feedback();
  let busy = false;
  const pick = singlePdf({ fb, onChange: update });
  const modes = [['extract', 'split_mode_extract', 'split_mode_extract_sub'], ['ranges', 'split_mode_ranges', 'split_mode_ranges_sub'], ['each', 'split_mode_each', 'split_mode_each_sub']];
  const name = 'm' + Math.random().toString(36).slice(2, 8);
  const radios = modes.map(([v, k, sub], i) => h('label', { class: 'pk-choice' },
    h('input', { type: 'radio', name, value: v, checked: i === 0, onchange: update }), h('span', {}, h('strong', { text: t(k) }), h('small', { text: t(sub) }))));
  const modeBox = h('fieldset', { class: 'pk-choices', hidden: true }, h('legend', { class: 'pk-label', text: t('split_mode') }), radios);
  const go = goButton('split', run);
  const mode = () => modeBox.querySelector('input:checked').value;
  function update() {
    modeBox.hidden = !pick.S.doc;
    const sel = pick.S.doc && pick.selection(false);
    setGo(go, mode() === 'extract' ? t('split_go_extract') : t('split_go_split'), !!sel && !busy);
  }
  async function run() {
    const sel = pick.selection();
    if (!sel) { pick.rangeInput.focus(); return; }
    const m = mode(), base = baseName(pick.S.file.name);
    const groups = m === 'extract' ? [sel.pages] : m === 'ranges' ? sel.groups : sel.pages.map(p => [p]);
    const label = g => K.formatRange(g).replace(/,/g, '_');
    const names = groups.map(g => m === 'each' ? `${base}-page-${pad(g[0], pick.S.count)}.pdf` : `${base}-pages-${label(g)}.pdf`);
    busy = true; update(); fb.clear();
    try {
      fb.busy(t('working'));
      const outs = await K.extractGroups(pick.S.bytes, groups, (i, n) => fb.busy(t('making_file', { i, n }), i / n));
      fb.idle();
      const files = outs.map((o, i) => ({ name: names[i], blob: new Blob([o], { type: 'application/pdf' }) }));
      fb.show(files, { title: files.length === 1 ? t('split_done_one', { pages: tn('pages', groups[0].length) }) : t('split_done_many', { files: tn('files', files.length) }), zipName: `${base}-split.zip` });
    } catch (e) { fb.idle(); fb.fail(errorText(e, pick.S.file.name)); }
    busy = false; update();
  }
  update();
  return h('div', { class: 'pk-body' }, ...pick.els, modeBox, h('div', { class: 'pk-actions' }, go), fb.el);
}

/* ---------- 3. images -> PDF ---------- */
function imagesTool() {
  const fb = feedback();
  let busy = false;
  const list = fileList({ thumb: 'img', onChange: update });
  const zone = dropZone({ multiple: true, accept: 'image/jpeg,image/png,.jpg,.jpeg,.png,image/*', title: t('drop_images'), onFiles: add });
  const hint = h('p', { class: 'pk-help pk-list-hint', text: t('drag_hint') });
  const size = fieldSelect('img_size', [['fit', 'img_size_fit'], ['a4', 'img_size_a4'], ['letter', 'img_size_letter']], 'fit');
  const orient = fieldSelect('img_orient', [['auto', 'img_orient_auto'], ['portrait', 'img_orient_portrait'], ['landscape', 'img_orient_landscape']], 'auto');
  const margin = fieldSelect('img_margin', [['0', 'img_margin_none'], ['28.35', 'img_margin_small'], ['56.7', 'img_margin_big']], '0');
  const opts = h('div', { class: 'pk-options', hidden: true }, size.el, orient.el, margin.el);
  size.sel.addEventListener('change', update);
  const go = goButton('image', run);
  function update() {
    const n = list.order().length;
    hint.hidden = n < 2; opts.hidden = n === 0;
    zone.el.classList.toggle('compact', n > 0);
    orient.sel.disabled = size.sel.value === 'fit';
    setGo(go, n ? t('img_go_n', { images: tn('images', n) }) : t('img_go'), n > 0 && !busy);
  }
  function add(files) {
    fb.clear();
    const skipped = files.filter(f => !isImageFile(f)).map(f => f.name);
    for (const f of files.filter(isImageFile)) list.add(f);
    if (skipped.length) fb.fail(t('err_not_image', { names: skipped.join(t('list_sep')) }));
  }
  async function run() {
    const items = list.order();
    busy = true; update(); fb.clear();
    try {
      const imgs = [];
      for (let i = 0; i < items.length; i++) {
        fb.busy(t('reading_image', { i: i + 1, n: items.length }), i / items.length / 2);
        try { imgs.push(await K.prepareImage(items[i].file)); } catch (e) { e.index = i; throw e; }
      }
      const out = await K.imagesToPdf(imgs, { size: size.sel.value, orientation: orient.sel.value, margin: +margin.sel.value },
        (k, n) => fb.busy(t('adding_image', { i: k, n }), .5 + k / n / 2));
      fb.idle();
      const name = items.length === 1 ? baseName(items[0].file.name) + '.pdf' : 'images.pdf';
      fb.show([{ name, blob: new Blob([out], { type: 'application/pdf' }) }], { title: t('img_done', { pages: tn('pages', items.length) }) });
    } catch (e) { fb.idle(); fb.fail(errorText(e, items[e.index]?.file.name)); }
    busy = false; update();
  }
  update();
  return h('div', { class: 'pk-body' }, zone.el, list.el, hint, opts, h('div', { class: 'pk-actions' }, go), fb.el);
}

/* ---------- 4. PDF -> images ---------- */
function toImagesTool() {
  const fb = feedback();
  let busy = false;
  const pick = singlePdf({ fb, onChange: update });
  const format = fieldSelect('out_format', [['jpg', 'out_format_jpg'], ['png', 'out_format_png']], 'jpg');
  const dpi = fieldSelect('out_quality', [['72', 'out_quality_72'], ['150', 'out_quality_150'], ['300', 'out_quality_300']], '150');
  const opts = h('div', { class: 'pk-options', hidden: true }, format.el, dpi.el);
  const go = goButton('toimg', run);
  function update() {
    opts.hidden = !pick.S.doc;
    const sel = pick.S.doc && pick.selection(false);
    setGo(go, sel ? t('out_go_n', { images: tn('images', new Set(sel.pages).size) }) : t('out_go'), !!sel && !busy);
  }
  async function run() {
    const sel = pick.selection();
    if (!sel) { pick.rangeInput.focus(); return; }
    const pages = [...new Set(sel.pages)], png = format.sel.value === 'png', base = baseName(pick.S.file.name);
    busy = true; update(); fb.clear();
    try {
      const files = [];
      for (let i = 0; i < pages.length; i++) {
        fb.busy(t('rendering', { i: i + 1, n: pages.length }), i / pages.length);
        const r = await K.renderPage(pick.S.doc, pages[i], { dpi: +dpi.sel.value, type: png ? 'image/png' : 'image/jpeg' });
        files.push({ name: `${base}-page-${pad(pages[i], pick.S.count)}.${png ? 'png' : 'jpg'}`, blob: r.blob, preview: true });
      }
      fb.idle();
      fb.show(files, { title: t('out_done', { images: tn('images', files.length) }), zipName: `${base}-images.zip` });
    } catch (e) { fb.idle(); fb.fail(errorText(e, pick.S.file.name)); }
    busy = false; update();
  }
  update();
  return h('div', { class: 'pk-body' }, ...pick.els, opts, h('div', { class: 'pk-actions' }, go), fb.el);
}

/* ---------- tabs ---------- */
const TOOLS = [
  { id: 'merge', hash: 'merge', icon: 'merge', build: mergeTool },
  { id: 'split', hash: 'split', icon: 'split', build: splitTool },
  { id: 'img2pdf', hash: 'jpg-to-pdf', icon: 'image', build: imagesTool },
  { id: 'pdf2img', hash: 'pdf-to-jpg', icon: 'toimg', build: toImagesTool }
];
const tablist = h('div', { class: 'pk-tabs', role: 'tablist', 'aria-label': t('tools_title') });
const panels = [];
for (const tool of TOOLS) {
  tool.tab = h('button', { type: 'button', role: 'tab', id: 'tab-' + tool.id, class: 'pk-tab', 'aria-controls': 'panel-' + tool.id, dataset: { tool: tool.id } },
    h('span', { class: 'pk-tab-ico' }, icon(tool.icon)), h('span', { class: 'pk-tab-text' }, h('strong', { text: t('tab_' + tool.id) }), h('small', { text: t('tab_' + tool.id + '_sub') })));
  tool.panel = h('section', { role: 'tabpanel', id: 'panel-' + tool.id, class: 'pk-panel', 'aria-labelledby': 'tab-' + tool.id, hidden: true },
    h('h3', { class: 'pk-panel-title', text: t('tab_' + tool.id + '_title') }), tool.build());
  tablist.append(tool.tab); panels.push(tool.panel);
}
let current;
function select(tool, { focus = false, hash = true } = {}) {
  current = tool;
  for (const x of TOOLS) {
    const on = x === tool;
    x.tab.setAttribute('aria-selected', on ? 'true' : 'false'); x.tab.tabIndex = on ? 0 : -1; x.panel.hidden = !on;
  }
  if (focus) tool.tab.focus();
  if (hash) history.replaceState(null, '', '#' + tool.hash);
}
tablist.addEventListener('click', e => { const b = e.target.closest('.pk-tab'); if (b) select(TOOLS.find(x => x.id === b.dataset.tool)); });
tablist.addEventListener('keydown', e => {
  const i = TOOLS.indexOf(current), n = TOOLS.length;
  const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
  const to = step ? TOOLS[(i + step + n) % n] : e.key === 'Home' ? TOOLS[0] : e.key === 'End' ? TOOLS[n - 1] : null;
  if (to) { e.preventDefault(); select(to, { focus: true }); }
});
app.replaceChildren(tablist, ...panels, live);
const fromHash = () => TOOLS.find(x => '#' + x.hash === location.hash);
select(fromHash() || TOOLS[0], { hash: !!fromHash() });
addEventListener('hashchange', () => { const x = fromHash(); if (x) select(x, { hash: false }); });

/* files dropped anywhere on the page go to the open tool instead of making the browser open them */
addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
addEventListener('drop', e => {
  if (!e.dataTransfer?.files.length) return;
  e.preventDefault();
  const input = current.panel.querySelector('.pk-drop input[type=file]');
  if (!input) return;
  const dt = new DataTransfer();
  for (const f of e.dataTransfer.files) dt.items.add(f);
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
});

initPwa(document.getElementById('install'), t);
document.documentElement.classList.add('pk-ready');
