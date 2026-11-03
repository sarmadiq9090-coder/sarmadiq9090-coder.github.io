// InstaWords — Windows app downloads, the on-site "release notes & download" dialog (#download)
// and the "report a problem or suggestion" dialog (#support). Shared by every page.
//
// Download buttons ([data-windows-download]) always point straight at the installer file: the
// static href in the HTML is the FALLBACK release below, and once the latest release is known
// (GitHub API, cached in localStorage for an hour) every button is pointed at its installer.
// Remote text (release notes) is only ever put into the page as DOM text nodes, never as HTML.
import { copyText, flash } from "./app.js";

const REPO = "sarmadiq9090-coder/tafket";
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;
const RELEASE_PAGE_PREFIX = `https://github.com/${REPO}/releases/`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const ISSUES_NEW = `https://github.com/${REPO}/issues/new/choose`;
const CACHE_KEY = "instawords.release.v1";
const CACHE_TTL = 60 * 60 * 1000;
const TIMEOUT = 8000;
const SETUP_RE = /^InstaWords_[\d.]+_x64-setup\.exe$/;
const PORTABLE_RE = /^InstaWords_[\d.]+_x64-portable\.zip$/;

/**
 * Release used without JavaScript, offline, or when GitHub cannot be reached. Keep it in step with
 * the static hrefs of the download buttons in site/*.html (they must name this same file).
 */
const FALLBACK = {
  source: "fallback",
  version: "2.0.0",
  date: "2026-11-03T11:17:02Z",
  pageUrl: RELEASES_PAGE,
  notes: "",
  setup: {
    name: "InstaWords_2.0.0_x64-setup.exe",
    url: `${DOWNLOAD_PREFIX}v2.0.0/InstaWords_2.0.0_x64-setup.exe`,
    size: 2515272,
    sha256: "c93ef0e18cf52b684bdc5e19f52fa261e91067b845d9fc73cc988542698759b7",
  },
  portable: {
    name: "InstaWords_2.0.0_x64-portable.zip",
    url: `${DOWNLOAD_PREFIX}v2.0.0/InstaWords_2.0.0_x64-portable.zip`,
    size: 591396,
    sha256: "82c489cb9cb72576ef17801972c6cffbb0a3426a9e57e3aa22f5dbe191ee4864",
  },
};

/* ---------- Release data ---------- */

const str = (v) => (typeof v === "string" ? v : "");

function asset(list, re) {
  const a = list.find((x) => x && re.test(str(x.name)));
  if (!a) return null;
  const url = str(a.browser_download_url);
  // Only direct files of this repository's releases; anything else is ignored.
  if (!url.startsWith(DOWNLOAD_PREFIX) || /[\s"'<>]/.test(url)) return null;
  const digest = /^sha256:([0-9a-f]{64})$/i.exec(str(a.digest));
  return {
    name: a.name,
    url,
    size: Number.isFinite(a.size) && a.size > 0 ? a.size : 0,
    sha256: digest ? digest[1].toLowerCase() : "",
  };
}

/** GitHub release JSON → the fields the site uses, or null when it has no usable installer. */
function normalize(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.assets)) return null;
  const setup = asset(raw.assets, SETUP_RE);
  if (!setup) return null;
  const tag = str(raw.tag_name).replace(/^v/i, "");
  const version = /^\d+(\.\d+){0,3}$/.test(tag) ? tag : /_([\d.]+)_x64/.exec(setup.name)?.[1] ?? "";
  const page = str(raw.html_url);
  return {
    source: "api",
    version,
    date: str(raw.published_at),
    pageUrl: page.startsWith(RELEASE_PAGE_PREFIX) && !/[\s"'<>]/.test(page) ? page : RELEASES_PAGE,
    notes: str(raw.body).slice(0, 20000),
    setup,
    portable: asset(raw.assets, PORTABLE_RE),
  };
}

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    if (!c || typeof c.t !== "number" || Date.now() - c.t > CACHE_TTL || Date.now() < c.t) return null;
    return normalize(c.raw);
  } catch {
    return null;
  }
}

function writeCache(raw) {
  try {
    const slim = {
      tag_name: raw.tag_name,
      published_at: raw.published_at,
      html_url: raw.html_url,
      body: str(raw.body).slice(0, 20000),
      assets: raw.assets.map(({ name, size, digest, browser_download_url }) => ({ name, size, digest, browser_download_url })),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), raw: slim }));
  } catch {
    /* storage unavailable: the release is fetched again next time */
  }
}

async function fetchLatest() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    // Cross-origin: the service worker leaves this request alone (no offline copy is kept).
    const res = await fetch(API, {
      headers: { Accept: "application/vnd.github+json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const release = normalize(raw);
    if (!release) throw new Error("no installer in the latest release");
    writeCache(raw);
    return release;
  } finally {
    clearTimeout(timer);
  }
}

let release = null; // null while loading
const releaseReady = (async () => {
  const cached = readCache();
  if (cached) return cached;
  try {
    return await fetchLatest();
  } catch (err) {
    console.info("[InstaWords] تعذّر جلب آخر إصدار من GitHub، يُستخدم الإصدار المضمّن:", err?.message ?? err);
    return FALLBACK;
  }
})().then((r) => {
  release = r;
  applyToButtons(r);
  if (releaseDialog?.open) renderRelease();
  document.documentElement.dataset.release = r.source;
  return r;
});

function applyToButtons(r) {
  for (const a of document.querySelectorAll("a[data-windows-download]")) {
    a.href = r.setup.url;
    for (const v of a.querySelectorAll("[data-version]")) v.textContent = `v${r.version}`;
  }
}

/* ---------- Formatting ---------- */

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميغابايت`;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString("ar-u-nu-latn", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

/* ---------- DOM helpers (text only) ---------- */

/** h("p", {class: "x"}, "text", node…): attributes are set one by one, children become text nodes. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

const svg = (paths, filled = false) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  if (filled) s.setAttribute("fill", "currentColor");
  else {
    for (const [k, v] of Object.entries({ fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" })) s.setAttribute(k, v);
  }
  for (const d of paths) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    s.append(p);
  }
  return s;
};
const ICON_WINDOWS = () => svg(["M3 5.5 10.5 4.4v7.1H3V5.5Zm0 13 7.5 1.1v-7H3v5.9Zm8.4 1.2L21 21v-8.4h-9.6v7.1Zm0-15.4v7.2H21V3l-9.6 1.3Z"], true);
const ICON_DOWNLOAD = () => svg(["M12 3v12m0 0-5-5m5 5 5-5", "M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"]);
const ICON_CLOSE = () => svg(["M6 6l12 12M18 6 6 18"]);
const ICON_GITHUB = () => svg(["M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"], true);

/** An explicit, labelled link to GitHub (the only kind of link that may leave the site). */
const githubLink = (href, label, cls = "btn btn-ghost btn-sm") => h("a", { class: cls, href, "data-github": true }, ICON_GITHUB(), label);

/* ---------- Release notes: a tiny, safe markdown subset ---------- */

/** Inline **bold** and `code`; markdown links keep their text only (no link out of the site). */
function inline(text) {
  const out = [];
  const src = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  for (const part of src.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) out.push(h("strong", {}, inline(part.slice(2, -2))));
    else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) out.push(h("code", { dir: "ltr" }, part.slice(1, -1)));
    else out.push(part);
  }
  return out;
}

/** Markdown → DOM nodes: headings, bullet/numbered lists, paragraphs, bold, code. Never HTML. */
export function renderNotes(md) {
  const frag = document.createDocumentFragment();
  let para = null;
  let list = null;
  const endPara = () => {
    if (para) frag.append(h("p", { dir: "auto" }, inline(para.join(" "))));
    para = null;
  };
  const endList = () => {
    if (list) frag.append(list);
    list = null;
  };
  for (const rawLine of String(md).replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    // Lines that are nothing but an HTML tag (GitHub layout such as <div dir="rtl">) are dropped.
    if (!line || /^<\/?[a-z][a-z0-9-]*(\s[^<>]*)?\/?>$/i.test(line)) {
      endPara();
      endList();
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(line)) {
      endPara();
      endList();
      continue;
    }
    let m;
    if ((m = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line))) {
      endPara();
      endList();
      frag.append(h(m[1].length <= 2 ? "h3" : "h4", { dir: "auto" }, inline(m[2])));
    } else if ((m = /^(?:[-*+]|(\d+)[.)])\s+(.*)$/.exec(line))) {
      endPara();
      const tag = m[1] ? "ol" : "ul";
      if (list && list.tagName.toLowerCase() !== tag) endList();
      list ??= h(tag, { dir: "auto" });
      list.append(h("li", {}, inline(m[2])));
    } else {
      endList();
      (para ??= []).push(line);
    }
  }
  endPara();
  endList();
  return frag;
}

/* ---------- Dialogs ---------- */

let opener = null;

function makeDialog(id, title) {
  const titleId = `${id}-title`;
  const close = h("button", { type: "button", class: "dialog-close", "aria-label": "إغلاق", title: "إغلاق" }, ICON_CLOSE());
  const body = h("div", { class: "dialog-body" });
  const dlg = h(
    "dialog",
    { id: `${id}-dialog`, class: "dialog", "aria-labelledby": titleId, dir: "rtl", lang: "ar" },
    h("div", { class: "dialog-head" }, h("h2", { id: titleId }, title), close),
    body,
  );
  close.addEventListener("click", () => dlg.close());
  // A click on the backdrop (outside the panel) closes the dialog.
  dlg.addEventListener("click", (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dlg.close();
  });
  dlg.addEventListener("close", () => {
    if (location.hash === `#${id}`) history.replaceState(history.state, "", location.pathname + location.search);
    const back = opener;
    opener = null;
    if (back && back.isConnected) back.focus();
  });
  document.body.append(dlg);
  return { dlg, body };
}

function open(which, from) {
  const d = which === "support" ? supportDialog : releaseDialog;
  if (which === "support") renderSupport();
  else renderRelease();
  for (const other of [releaseDialog, supportDialog]) if (other !== d && other.open) other.close();
  if (d.open) return;
  opener = from ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
  if (location.hash !== `#${which}`) history.replaceState(history.state, "", `#${which}`);
  d.showModal();
  d.querySelector(".dialog-body").scrollTop = 0;
}

const { dlg: releaseDialog, body: releaseBody } = makeDialog("download", "InstaWords لويندوز: التنزيل وما الجديد");
const { dlg: supportDialog, body: supportBody } = makeDialog("support", "الإبلاغ عن مشكلة أو اقتراح");

function fact(label, ...value) {
  return [h("dt", {}, label), h("dd", {}, ...value)];
}

function renderRelease() {
  const body = releaseBody;
  if (!release) {
    body.replaceChildren(h("p", { class: "dialog-loading", role: "status" }, "جارٍ التحقق من آخر إصدار…"));
    return;
  }
  const r = release;
  const offline = r.source !== "api";
  const nodes = [];
  if (offline) {
    nodes.push(
      h(
        "p",
        { class: "note", role: "status", "data-release-offline": true },
        "تعذّر الوصول إلى GitHub الآن (لا اتصال بالإنترنت أو الخدمة غير متاحة)، فلا يمكن عرض آخر إصدار وملاحظاته. يمكنك تنزيل الإصدار ",
        h("bdi", { dir: "ltr" }, `v${r.version}`),
        " مباشرة، وقد يكون هناك إصدار أحدث.",
      ),
    );
  }
  const sha = h("code", { class: "sha", dir: "ltr", "data-sha256": true }, r.setup.sha256 || "غير متاح");
  const facts = h(
    "dl",
    { class: "facts" },
    fact("الإصدار", h("bdi", { dir: "ltr", "data-release-version": true }, `v${r.version}`), offline ? " (المضمّن في الموقع)" : ""),
    formatDate(r.date) ? fact("تاريخ النشر", formatDate(r.date)) : [],
    r.setup.size ? fact("حجم المثبّت", formatSize(r.setup.size)) : [],
  );
  const shaRow = h("div", { class: "sha-row" }, h("span", { class: "sha-label", id: "sha-label" }, "بصمة المثبّت SHA-256"), sha);
  if (r.setup.sha256) {
    const copy = h("button", { type: "button", class: "btn btn-ghost btn-sm", "aria-describedby": "sha-label" }, h("span", { "data-label": true }, "نسخ البصمة"));
    copy.addEventListener("click", async () => flash(copy, null, await copyText(r.setup.sha256)));
    shaRow.append(copy);
  }
  const primary = h(
    "a",
    { class: "btn btn-primary", href: r.setup.url, "data-windows-download": true, "data-dialog-download": true },
    ICON_WINDOWS(),
    "تنزيل المثبّت ",
    h("span", { class: "ver", dir: "ltr", "data-version": true }, `v${r.version}`),
  );
  const actions = h("div", { class: "actions" }, primary);
  if (r.portable) {
    actions.append(
      h("a", { class: "btn btn-ghost", href: r.portable.url, "data-portable-download": true }, ICON_DOWNLOAD(), "النسخة المحمولة (zip)", r.portable.size ? h("small", { class: "ver" }, formatSize(r.portable.size)) : null),
    );
  }
  nodes.push(
    facts,
    shaRow,
    actions,
    h(
      "ul",
      { class: "checks reqs", "aria-label": "المتطلبات" },
      h("li", {}, "ويندوز 10 أو 11 (64 بت)"),
      h("li", {}, "لا يحتاج صلاحيات المسؤول: يُثبَّت للمستخدم الحالي"),
      h("li", {}, "يعمل دون إنترنت بعد التثبيت، والنسخة المحمولة لا تحتاج تثبيتاً"),
    ),
    h("p", { class: "fine" }, "البرنامج غير موقّع رقمياً بعد، فإن ظهر تنبيه SmartScreen فاختر «مزيد من المعلومات» ثم «تشغيل على أي حال». وللتحقق من الملف قارن بصمته بالأمر ", h("code", { dir: "ltr" }, `Get-FileHash ${r.setup.name}`), " في PowerShell."),
  );
  if (!offline && r.notes.trim()) {
    nodes.push(h("section", { class: "notes", "aria-labelledby": "notes-title" }, h("h3", { id: "notes-title", class: "notes-title" }, "ما الجديد في هذا الإصدار"), h("div", { class: "notes-body", "data-release-notes-body": true }, renderNotes(r.notes))));
  }
  nodes.push(h("div", { class: "dialog-foot" }, githubLink(offline ? RELEASES_PAGE : r.pageUrl, offline ? "فتح صفحة الإصدارات على GitHub" : "كل الإصدارات على GitHub")));
  body.replaceChildren(...nodes);
}

function renderSupport() {
  if (supportBody.childElementCount) return;
  supportBody.append(
    h("p", {}, "ملاحظتك تجعل InstaWords أدق. لا يُرسَل شيء تلقائياً من أي مكان: أنت من يراجع البلاغ ويرسله."),
    h(
      "ol",
      { class: "support-list" },
      h("li", {}, h("strong", {}, "برنامج ويندوز: "), "اضغط زر «إبلاغ» أعلى نافذة البرنامج، أو اختر «الإبلاغ عن مشكلة أو اقتراح» من أيقونته بجانب الساعة. يجهّز البرنامج تقريراً فيه إصداره ونظامك دون أي مبلغ كتبته، فتنسخه أو تفتحه على GitHub."),
      h("li", {}, h("strong", {}, "Excel: "), "اذكر الصيغة كما كتبتها (مثل ", h("code", { dir: "ltr" }, '=TAFQIT(A1, "SAR")'), ") وقيمة الخلية والنص الذي ظهر والنص الذي توقعته، وإصدار Excel."),
      h("li", {}, h("strong", {}, "الموقع: "), "اذكر الرقم والعملة والخيارات، والنص الذي ظهر والنص الصحيح في رأيك. رابط الصفحة بعد التحويل يحفظ الرقم والعملة، فانسخه من شريط العنوان وأرفقه."),
    ),
    h("p", { class: "fine" }, "تُستقبل البلاغات والاقتراحات على GitHub، وتحتاج حساباً مجانياً هناك."),
    h("div", { class: "dialog-foot" }, githubLink(ISSUES_NEW, "فتح بلاغ جديد على GitHub", "btn btn-primary")),
  );
}

/* ---------- Wiring: links, deep links (#download, #support) ---------- */

document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const a = e.target instanceof Element ? e.target.closest("[data-release-notes], [data-support]") : null;
  if (!a) return;
  e.preventDefault();
  open(a.hasAttribute("data-support") ? "support" : "download", a);
});

const fromHash = () => {
  if (location.hash === "#download") open("download");
  else if (location.hash === "#support") open("support");
};
window.addEventListener("hashchange", fromHash);
fromHash();

export { releaseReady };
