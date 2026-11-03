// InstaWords — single conversion page.
import { engineReady, bindOptions, loadPrefs, applyParams, copyText, flash, groupThousands, languageInfo } from "./app.js";

const $ = (id) => document.getElementById(id);
const numberEl = $("number");
const clearBtn = $("clear-number");
const panel = $("cheque");
const resultEl = $("result");
const emptyEl = $("result-empty");
const cleanedBox = $("cleaned-box");
const cleanedEl = $("cleaned");
const copyBtn = $("copy");
const copyStatus = $("copy-status");

const { engine } = await engineReady;

// Deep links: ?n=1250.75&unit=SAR (optional: lang=en|fr, h=مئة, decimals=error, prefix=…, suffix=…).
const params = new URLSearchParams(location.search);
const initial = applyParams(loadPrefs(), engine, params);
if (params.has("n")) numberEl.value = params.get("n");

let current = "";
let lastState = "";

/** Restart the fade-in when the kind of result changes (not on every keystroke). */
function reveal(state, force) {
  if (state === lastState && !force) return;
  lastState = state;
  panel.classList.remove("is-revealed");
  void panel.offsetWidth; // restart the CSS animation
  panel.classList.add("is-revealed");
}

function render(force = false) {
  const raw = numberEl.value;
  copyStatus.textContent = "";
  copyStatus.classList.remove("is-ok");
  clearBtn.hidden = raw === "";
  const opts = options.get();
  const lang = languageInfo(opts.language);

  if (raw.trim() === "") {
    current = "";
    panel.dataset.state = "empty";
    resultEl.className = "result-text is-empty";
    resultEl.dir = "rtl";
    resultEl.lang = "ar";
    resultEl.textContent = "اكتب مبلغاً في الحقل أعلاه، فيظهر هنا مكتوباً بالحروف.";
    emptyEl.hidden = false;
    cleanedBox.hidden = true;
    copyBtn.disabled = true;
    reveal("empty", force);
    return;
  }

  const r = engine.tryTafqit(raw, opts);
  emptyEl.hidden = true;
  if (r.cleaned !== undefined) {
    cleanedEl.textContent = groupThousands(r.cleaned);
    cleanedEl.dataset.raw = r.cleaned;
    cleanedBox.hidden = false;
  } else {
    cleanedBox.hidden = true;
  }
  if (r.ok) {
    current = r.result;
    panel.dataset.state = "ok";
    resultEl.className = "result-text";
    resultEl.dir = lang.dir ?? "rtl";
    resultEl.lang = lang.id;
    resultEl.textContent = r.result;
    copyBtn.disabled = false;
    reveal(`ok:${lang.id}`, force);
  } else {
    current = "";
    panel.dataset.state = "error";
    resultEl.className = "result-text is-error";
    resultEl.dir = "rtl";
    resultEl.lang = "ar";
    resultEl.textContent = r.error.message;
    copyBtn.disabled = true;
    reveal("error", force);
  }
}

const options = bindOptions($("main"), engine, initial, () => render(true));
numberEl.addEventListener("input", () => render());

clearBtn.addEventListener("click", () => {
  numberEl.value = "";
  render();
  numberEl.focus();
});

for (const btn of document.querySelectorAll("[data-sample]")) {
  btn.addEventListener("click", () => {
    numberEl.value = btn.dataset.sample;
    render();
    numberEl.focus();
  });
}

copyBtn.addEventListener("click", async () => {
  if (!current) return;
  const ok = await copyText(current);
  flash(copyBtn, copyStatus, ok, ok ? "نُسخ النص إلى الحافظة." : "تعذّر النسخ، حدّد النص وانسخه يدوياً.");
});

render();
document.documentElement.dataset.ready = "1";
