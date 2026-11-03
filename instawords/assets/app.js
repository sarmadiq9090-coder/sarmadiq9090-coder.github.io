// InstaWords (تفقيط) — shared page code: engine loading, unit list, options panel (language,
// unit, hundreds, decimals, prefix, suffix), preferences, copy, keyboard shortcuts, service worker.
// A namespace import keeps the page working with cores that do not export LANGUAGES yet.
import * as core from "../lib/index.js";

const { createTafqit, tryTafqit, units, findUnit } = core;
const BUNDLED = { tryTafqit, units, findUnit };

/** Output languages offered by the core ({id, label, dir, supportsHundredsForm}); Arabic only if absent. */
const ARABIC = { id: "ar", label: "العربية", dir: "rtl", supportsHundredsForm: true };
export const LANGUAGES = Array.isArray(core.LANGUAGES) && core.LANGUAGES.some((l) => l && l.id === "ar")
  ? core.LANGUAGES.filter((l) => l && typeof l.id === "string")
  : [ARABIC];
export const languageInfo = (id) => LANGUAGES.find((l) => l.id === id) ?? LANGUAGES.find((l) => l.id === "ar") ?? ARABIC;

/** Ready-made prefix/suffix per language: [prefix, suffix, button label]. */
const PRESETS = {
  ar: ["فقط", "لا غير", "فقط … لا غير"],
  en: ["", "Only", "… Only"],
  fr: ["Arrêtée la présente facture à la somme de", "", "Arrêtée la présente facture à la somme de …"],
};
const presetFor = (lang) => PRESETS[lang] ?? PRESETS.ar;

/** Arabic names of the unit categories, in display order. */
export const CATEGORY_LABELS = {
  none: "بدون وحدة",
  "currency-arab": "عملات عربية",
  "currency-world": "عملات عالمية",
  crypto: "عملات رقمية",
  "generic-currency": "عملات بلا تحديد بلد",
  weight: "الأوزان",
  volume: "الأحجام والسعات",
  length: "الأطوال",
  area: "المساحات",
  time: "الزمن",
  count: "المعدودات",
  data: "سعة البيانات",
  speed: "السرعة",
};
const OTHER_LABEL = "وحدات أخرى";

/**
 * The engine is built from units.json at runtime, so editing that one file changes the site.
 * If it cannot be fetched or fails validation, the catalog bundled in lib/ is used instead.
 */
export const engineReady = (async () => {
  try {
    const res = await fetch(new URL("../units.json", import.meta.url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const engine = createTafqit(await res.json());
    if (!engine.units.length) throw new Error("units.json has no units");
    return { engine, source: "units.json" };
  } catch (err) {
    console.warn("[InstaWords] units.json غير متاح، تُستخدم الوحدات المضمّنة:", err);
    return { engine: BUNDLED, source: "bundled" };
  }
})();

/* ---------- Preferences (localStorage may be unavailable) ---------- */

const PREFS_KEY = "tafket.prefs.v1";
export const DEFAULT_PREFS = { language: "ar", unit: "SAR", hundredsForm: "مائة", decimals: "round", prefix: "", suffix: "" };

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_PREFS, ...(p && typeof p === "object" ? p : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode or storage disabled: preferences just are not remembered */
  }
}

/* ---------- Options panel (unit, hundreds, decimals, prefix, suffix) ---------- */

export function fillUnitSelect(select, engine, selectedId) {
  const groups = new Map();
  for (const u of engine.units) {
    const key = CATEGORY_LABELS[u.category] ? u.category : "__other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  }
  const order = [...Object.keys(CATEGORY_LABELS), "__other"];
  const frag = document.createDocumentFragment();
  for (const key of order) {
    const list = groups.get(key);
    if (!list) continue;
    const og = document.createElement("optgroup");
    og.label = CATEGORY_LABELS[key] ?? OTHER_LABEL;
    for (const u of list) {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = u.code ? `${u.label} (${u.code})` : u.label;
      og.append(opt);
    }
    frag.append(og);
  }
  select.replaceChildren(frag);
  const wanted = engine.findUnit(selectedId ?? "") ?? engine.findUnit(DEFAULT_PREFS.unit) ?? engine.units[0];
  if (wanted) select.value = wanted.id;
}

/** Build the language radios inside `container`; the surrounding fieldset stays hidden with one language. */
function fillLanguages(root) {
  const field = root.querySelector("[data-language-field]");
  const box = root.querySelector("[data-language-options]");
  if (!field || !box) return;
  box.replaceChildren(
    ...LANGUAGES.map((l) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "language";
      input.value = l.id;
      const span = document.createElement("span");
      span.textContent = l.label ?? l.id;
      span.lang = l.id;
      if (l.dir) span.dir = l.dir;
      label.append(input, span);
      return label;
    }),
  );
  field.hidden = LANGUAGES.length < 2;
}

/**
 * Wire the shared options panel. Returns get()/set() for the current options.
 * `onChange(options)` runs after every user change; choices are remembered.
 */
export function bindOptions(root, engine, initial, onChange) {
  const unit = root.querySelector("#unit");
  const prefix = root.querySelector("#prefix");
  const suffix = root.querySelector("#suffix");
  const hundredsField = root.querySelector("[data-hundreds-field]");
  const presetBtn = root.querySelector('[data-preset="only"]');
  const radios = (name) => [...root.querySelectorAll(`input[name="${name}"]`)];
  const checked = (name, fallback) => radios(name).find((r) => r.checked)?.value ?? fallback;

  fillUnitSelect(unit, engine, initial.unit);
  fillLanguages(root);

  const get = () => {
    const lang = languageInfo(checked("language", "ar"));
    const o = {
      language: lang.id,
      unit: unit.value,
      decimals: checked("decimals", "round"),
      prefix: prefix.value,
      suffix: suffix.value,
    };
    // رسم المئة applies to Arabic output only.
    if (lang.supportsHundredsForm) o.hundredsForm = checked("hundreds", "مائة");
    return o;
  };

  // Show the controls that make sense for the chosen language.
  const syncLanguage = () => {
    const lang = languageInfo(checked("language", "ar"));
    if (hundredsField) {
      hundredsField.hidden = !lang.supportsHundredsForm;
      hundredsField.disabled = !lang.supportsHundredsForm;
    }
    if (presetBtn) {
      const [, , label] = presetFor(lang.id);
      presetBtn.textContent = label;
      presetBtn.title = label;
      presetBtn.lang = lang.id;
      presetBtn.dir = lang.dir ?? "rtl";
    }
    document.documentElement.dataset.outputLang = lang.id;
  };

  const set = (o) => {
    if (o.language !== undefined) {
      const id = languageInfo(o.language).id;
      for (const r of radios("language")) r.checked = r.value === id;
    }
    if (o.unit !== undefined) {
      const u = engine.findUnit(o.unit);
      if (u) unit.value = u.id;
    }
    if (o.hundredsForm !== undefined) for (const r of radios("hundreds")) r.checked = r.value === o.hundredsForm;
    if (o.decimals !== undefined) for (const r of radios("decimals")) r.checked = r.value === o.decimals;
    if (o.prefix !== undefined) prefix.value = o.prefix;
    if (o.suffix !== undefined) suffix.value = o.suffix;
    syncLanguage();
  };
  set({ hundredsForm: "مائة", ...initial, language: initial.language ?? "ar" });

  // Everything is remembered, including رسم المئة while another language is shown.
  const remember = () => savePrefs({ ...get(), hundredsForm: checked("hundreds", "مائة") });
  const changed = () => {
    remember();
    onChange(get());
  };

  let previousLang = languageInfo(checked("language", "ar")).id;
  root.addEventListener("change", (e) => {
    if (e.target.name === "language") {
      // Swap a ready-made prefix/suffix for the same preset in the new language.
      const [op, os] = presetFor(previousLang);
      if (prefix.value.trim() === op && suffix.value.trim() === os && (op || os)) {
        const [np, ns] = presetFor(e.target.value);
        prefix.value = np;
        suffix.value = ns;
      }
      previousLang = e.target.value;
      syncLanguage();
    }
  });
  root.addEventListener("input", (e) => { if (e.target.closest("[data-option]")) changed(); });
  root.addEventListener("change", (e) => { if (e.target.closest("[data-option]")) changed(); });
  for (const btn of root.querySelectorAll("[data-preset]")) {
    btn.addEventListener("click", () => {
      const [p, s] = btn.dataset.preset === "none" ? ["", ""] : presetFor(get().language);
      set({ prefix: p, suffix: s });
      changed();
    });
  }
  return { get, set, language: () => languageInfo(get().language) };
}

/** Deep-link overrides shared by the pages: unit, lang, h, decimals, prefix, suffix. */
export function applyParams(initial, engine, params) {
  if (params.has("unit") && engine.findUnit(params.get("unit"))) initial.unit = params.get("unit");
  if (params.has("lang") && LANGUAGES.some((l) => l.id === params.get("lang"))) initial.language = params.get("lang");
  if (params.get("h") === "مئة" || params.get("h") === "مائة") initial.hundredsForm = params.get("h");
  if (params.get("decimals") === "error" || params.get("decimals") === "round") initial.decimals = params.get("decimals");
  if (params.has("prefix")) initial.prefix = params.get("prefix");
  if (params.has("suffix")) initial.suffix = params.get("suffix");
  return initial;
}

/** "1234567.5" → "1,234,567.5" (string based, so any length works). */
export function groupThousands(cleaned) {
  const [int, frac] = String(cleaned).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac !== undefined ? `${grouped}.${frac}` : grouped;
}

/* ---------- Clipboard ---------- */

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea method */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.append(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** Briefly show feedback on a button and in an aria-live status element. */
export function flash(button, status, ok, message) {
  const label = button.querySelector("[data-label]") ?? button;
  const original = button.dataset.original ?? label.textContent;
  button.dataset.original = original;
  label.textContent = ok ? "تم النسخ" : "تعذّر النسخ";
  button.classList.toggle("is-done", ok);
  if (status) {
    status.textContent = message;
    status.classList.toggle("is-ok", ok);
  }
  clearTimeout(button._t);
  button._t = setTimeout(() => {
    label.textContent = original;
    button.classList.remove("is-done");
  }, 1800);
}

/* ---------- Code blocks with a copy button (Excel / developer page) ---------- */

for (const btn of document.querySelectorAll("[data-copy-from]")) {
  btn.addEventListener("click", async () => {
    const src = document.getElementById(btn.dataset.copyFrom);
    const ok = await copyText(src ? src.textContent.trim() : "");
    flash(btn, null, ok);
  });
}

/* ---------- Keyboard shortcuts: "/" focuses the input, Ctrl/⌘+Enter copies the result ---------- */

document.addEventListener("keydown", (e) => {
  const t = e.target;
  const typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const field = document.querySelector("[data-shortcut-focus]");
    if (field) {
      e.preventDefault();
      field.focus();
      field.select?.();
    }
  } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    const btn = document.querySelector("[data-shortcut-copy]");
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  }
});

/* ---------- Service worker (offline). Ignored on file:// and unsupported browsers. ---------- */

const badge = document.querySelector("[data-offline-badge]");
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register(new URL("../sw.js", import.meta.url).href).catch(() => {});
  navigator.serviceWorker.ready
    .then(() => {
      if (badge) {
        badge.textContent = "جاهز للعمل دون اتصال";
        badge.classList.add("is-ready");
      }
    })
    .catch(() => {});
}

/* ---------- Small helpers ---------- */

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), typeof ms === "function" ? ms() : ms);
  };
  d.now = (...a) => {
    clearTimeout(t);
    fn(...a);
  };
  return d;
}

export const formatCount = (n) => n.toLocaleString("ar-u-nu-latn");
