// Single conversion page.
import { engineReady, bindOptions, loadPrefs, copyText, flash } from "./app.js";

const $ = (id) => document.getElementById(id);
const numberEl = $("number");
const resultEl = $("result");
const cleanedBox = $("cleaned-box");
const cleanedEl = $("cleaned");
const copyBtn = $("copy");
const copyStatus = $("copy-status");

const { engine } = await engineReady;

// Deep links: ?n=1250.75&unit=SAR (optional: h=مئة, decimals=error, prefix=…, suffix=…).
const params = new URLSearchParams(location.search);
const initial = loadPrefs();
if (params.has("unit") && engine.findUnit(params.get("unit"))) initial.unit = params.get("unit");
if (params.get("h") === "مئة" || params.get("h") === "مائة") initial.hundredsForm = params.get("h");
if (params.get("decimals") === "error" || params.get("decimals") === "round") initial.decimals = params.get("decimals");
if (params.has("prefix")) initial.prefix = params.get("prefix");
if (params.has("suffix")) initial.suffix = params.get("suffix");
if (params.has("n")) numberEl.value = params.get("n");

let current = "";

function render() {
  const raw = numberEl.value;
  copyStatus.textContent = "";
  if (raw.trim() === "") {
    current = "";
    resultEl.className = "result-text is-empty";
    resultEl.textContent = "سيظهر المبلغ مكتوباً هنا فور إدخال الرقم.";
    cleanedBox.hidden = true;
    copyBtn.disabled = true;
    return;
  }
  const r = engine.tryTafqit(raw, options.get());
  if (r.cleaned !== undefined) {
    cleanedEl.textContent = r.cleaned;
    cleanedBox.hidden = false;
  } else {
    cleanedBox.hidden = true;
  }
  if (r.ok) {
    current = r.result;
    resultEl.className = "result-text";
    resultEl.textContent = r.result;
    copyBtn.disabled = false;
  } else {
    current = "";
    resultEl.className = "result-text is-error";
    resultEl.textContent = r.error.message;
    copyBtn.disabled = true;
  }
}

const options = bindOptions($("options"), engine, initial, render);
numberEl.addEventListener("input", render);

copyBtn.addEventListener("click", async () => {
  if (!current) return;
  const ok = await copyText(current);
  flash(copyBtn, copyStatus, ok, ok ? "نُسخ النص إلى الحافظة." : "تعذّر النسخ، حدّد النص وانسخه يدوياً.");
});

render();
document.documentElement.dataset.ready = "1";
