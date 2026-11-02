// Shared page code: engine loading, unit list, options panel, preferences, copy, service worker.
import { createTafqit, tryTafqit, units, findUnit } from "../lib/index.js";

const BUNDLED = { tryTafqit, units, findUnit };

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
    console.warn("[tafket] units.json غير متاح، تُستخدم الوحدات المضمّنة:", err);
    return { engine: BUNDLED, source: "bundled" };
  }
})();

/* ---------- Preferences (localStorage may be unavailable) ---------- */

const PREFS_KEY = "tafket.prefs.v1";
export const DEFAULT_PREFS = { unit: "SAR", hundredsForm: "مائة", decimals: "round", prefix: "", suffix: "" };

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

/**
 * Wire the shared options panel. Returns get()/set() for the current options.
 * `onChange(options)` runs after every user change; choices are remembered.
 */
export function bindOptions(root, engine, initial, onChange) {
  const unit = root.querySelector("#unit");
  const prefix = root.querySelector("#prefix");
  const suffix = root.querySelector("#suffix");
  const radios = (name) => [...root.querySelectorAll(`input[name="${name}"]`)];

  fillUnitSelect(unit, engine, initial.unit);

  const get = () => ({
    unit: unit.value,
    hundredsForm: radios("hundreds").find((r) => r.checked)?.value ?? "مائة",
    decimals: radios("decimals").find((r) => r.checked)?.value ?? "round",
    prefix: prefix.value,
    suffix: suffix.value,
  });
  const set = (o) => {
    if (o.unit !== undefined) {
      const u = engine.findUnit(o.unit);
      if (u) unit.value = u.id;
    }
    if (o.hundredsForm !== undefined) for (const r of radios("hundreds")) r.checked = r.value === o.hundredsForm;
    if (o.decimals !== undefined) for (const r of radios("decimals")) r.checked = r.value === o.decimals;
    if (o.prefix !== undefined) prefix.value = o.prefix;
    if (o.suffix !== undefined) suffix.value = o.suffix;
  };
  set(initial);

  const changed = () => {
    const o = get();
    savePrefs(o);
    onChange(o);
  };
  root.addEventListener("input", (e) => { if (e.target.closest("[data-option]")) changed(); });
  root.addEventListener("change", (e) => { if (e.target.closest("[data-option]")) changed(); });
  for (const btn of root.querySelectorAll("[data-preset]")) {
    btn.addEventListener("click", () => {
      const [p, s] = btn.dataset.preset === "none" ? ["", ""] : ["فقط", "لا غير"];
      set({ prefix: p, suffix: s });
      changed();
    });
  }
  return { get, set };
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
