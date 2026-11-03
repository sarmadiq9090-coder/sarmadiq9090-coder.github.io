// Bulk conversion page. Designed to stay responsive with tens of thousands of lines:
// conversion is cheap, so all rows are converted at once, and the table is rendered in chunks.
import { csvColumnValues, toCsv } from "../lib/csv.js";
import { engineReady, bindOptions, loadPrefs, applyParams, copyText, flash, escapeHtml, debounce, formatCount, languageInfo } from "./app.js";

const $ = (id) => document.getElementById(id);
const numbersEl = $("numbers");
const rowsEl = $("rows");
const copyBtn = $("copy-all");
const exportBtn = $("export");
const copyStatus = $("copy-status");
const importStatus = $("import-status");
const renderNote = $("render-note");

const FIRST_CHUNK = 300;
const CHUNK = 1500;

const SAMPLE = ["1250.75", "٣٠٠٠", "15,000", "0.5", "2000000", "101", "abc"].join("\n");

const { engine } = await engineReady;

/** @type {{input: string, r: import("../lib/index.js").TafqitResult}[]} */
let results = [];
/** Attributes for result cells in the current output language (e.g. ` dir="ltr" lang="en"`). */
let textAttrs = "";
let renderToken = 0;

function rowHtml(i, item) {
  const { input, r } = item;
  const cleaned = r.cleaned ?? "";
  const text = r.ok ? escapeHtml(r.result) : escapeHtml(r.error.message);
  return `<tr${r.ok ? "" : ' class="is-error"'}><td class="c-idx">${i + 1}</td><td class="c-in"><span dir="ltr">${escapeHtml(input)}</span></td><td class="c-clean"><span dir="ltr">${escapeHtml(cleaned)}</span></td><td class="c-text"${r.ok ? textAttrs : ""}>${text}</td></tr>`;
}

function renderRows() {
  const token = ++renderToken;
  if (!results.length) {
    rowsEl.innerHTML = '<tr class="empty-row"><td colspan="4">أدخل أرقاماً في المربع أعلاه، أو استورد ملف CSV، لتظهر النتائج هنا.</td></tr>';
    renderNote.textContent = "";
    return;
  }
  let pos = 0;
  const step = (size) => {
    if (token !== renderToken) return; // input changed meanwhile: abandon this render
    const end = Math.min(results.length, pos + size);
    let html = "";
    for (let i = pos; i < end; i++) html += rowHtml(i, results[i]);
    if (pos === 0) rowsEl.innerHTML = html;
    else rowsEl.insertAdjacentHTML("beforeend", html);
    pos = end;
    if (pos < results.length) {
      renderNote.textContent = `جارٍ عرض الصفوف… ${formatCount(pos)} من ${formatCount(results.length)}`;
      setTimeout(() => step(CHUNK), 0);
    } else {
      renderNote.textContent = "";
      rowsEl.dataset.rendered = String(results.length);
    }
  };
  delete rowsEl.dataset.rendered;
  step(FIRST_CHUNK);
}

function convertAll() {
  const opts = options.get();
  const lang = languageInfo(opts.language);
  textAttrs = lang.id === "ar" ? "" : ` dir="${escapeHtml(lang.dir ?? "ltr")}" lang="${escapeHtml(lang.id)}"`;
  const lines = numbersEl.value.split(/\r\n|\r|\n/);
  const out = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    out.push({ input: line.trim(), r: engine.tryTafqit(line, opts) });
  }
  results = out;
  const ok = out.reduce((n, x) => n + (x.r.ok ? 1 : 0), 0);
  $("line-count").textContent = formatCount(out.length);
  $("count-all").textContent = formatCount(out.length);
  $("count-ok").textContent = formatCount(ok);
  $("count-err").textContent = formatCount(out.length - ok);
  copyBtn.disabled = ok === 0;
  exportBtn.disabled = out.length === 0;
  copyStatus.textContent = "";
  renderRows();
}

// Short delay for small lists, longer for big pastes so typing stays smooth.
const schedule = debounce(convertAll, () => (numbersEl.value.length > 50000 ? 400 : 120));

const options = bindOptions($("options"), engine, applyParams(loadPrefs(), engine, new URLSearchParams(location.search)), () => schedule.now());
numbersEl.addEventListener("input", () => schedule());

$("sample").addEventListener("click", () => {
  numbersEl.value = SAMPLE;
  schedule.now();
});
$("clear").addEventListener("click", () => {
  numbersEl.value = "";
  importStatus.textContent = "";
  schedule.now();
  numbersEl.focus();
});

$("csv-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const values = csvColumnValues(await file.text());
    numbersEl.value = values.join("\n");
    importStatus.textContent = `استُورد ${formatCount(values.length)} رقماً من الملف «${file.name}».`;
  } catch {
    importStatus.textContent = "تعذّرت قراءة الملف. تأكد أنه ملف CSV أو نصي بترميز UTF-8.";
  }
  e.target.value = "";
  schedule.now();
});

copyBtn.addEventListener("click", async () => {
  // One line per input row; rows with an error are left empty so lines stay aligned.
  const text = results.map((x) => (x.r.ok ? x.r.result : "")).join("\n");
  const ok = await copyText(text);
  const errs = results.length - results.filter((x) => x.r.ok).length;
  const msg = ok
    ? `نُسخ ${formatCount(results.length)} سطراً${errs ? `، وتُركت أسطر الأخطاء (${formatCount(errs)}) فارغة` : ""}.`
    : "تعذّر النسخ.";
  flash(copyBtn, copyStatus, ok, msg);
});

// A leading = + @ would make a spreadsheet treat the cell as a formula.
const safeCell = (v) => (/^[=+@\t\r]/.test(v) ? `'${v}` : v);

exportBtn.addEventListener("click", () => {
  const rows = [["الرقم", "الرقم بعد التنقية", "التفقيط", "الخطأ"]];
  for (const { input, r } of results) {
    rows.push([safeCell(input), r.cleaned ?? "", r.ok ? r.result : "", r.ok ? "" : r.error.message]);
  }
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tafqit.csv";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  copyStatus.classList.add("is-ok");
  copyStatus.textContent = `صُدّر ${formatCount(results.length)} صفاً إلى tafqit.csv.`;
});

convertAll();
document.documentElement.dataset.ready = "1";
