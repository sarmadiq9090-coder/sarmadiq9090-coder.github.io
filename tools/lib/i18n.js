/* FastKiwi Toolbox: tiny string loader shared by the tools.
   Each tool keeps one JSON file per language in <tool>/i18n/<lang>.json; keys missing there fall back to en.json.
   Adding a language to a tool:
     1. add <tool>/i18n/<lang>.json (copy en.json and translate the values);
     2. add the page shell <tool>/<lang>/index.html: copy the English page and change lang/dir, <title>, the meta description,
        the H1, the canonical and the manifest link, then add the hreflang pair to every language's page and to /sitemap.xml.
   Markup hooks: data-i18n (text), data-i18n-aria-label, data-i18n-title, data-i18n-placeholder, data-i18n-href (attribute values). */

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`i18n: ${r.status} ${url}`);
  return r.json();
}

export async function loadI18n(baseUrl, lang) {
  const en = await getJson(new URL('en.json', baseUrl));
  const own = lang === 'en' ? {} : await getJson(new URL(lang + '.json', baseUrl)).catch(e => { console.warn(e.message); return {}; });
  const S = { ...en, ...own };
  const plural = new Intl.PluralRules(lang);
  const nf = new Intl.NumberFormat(lang);

  /* t('key', { n: 3, name: 'a.pdf' }): {var} placeholders; numbers are formatted for the language */
  function t(key, vars) {
    let s = key in S ? S[key] : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? (typeof vars[k] === 'number' ? nf.format(vars[k]) : String(vars[k])) : m));
    return s;
  }
  /* tn('pages', 3): picks pages_one / pages_two / pages_few / ... by the language's plural rules, falling back to pages_other */
  function tn(key, n, vars) {
    const k = `${key}_${plural.select(n)}`;
    return t(k in S ? k : `${key}_other`, { n, ...vars });
  }
  function apply(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const a of ['aria-label', 'title', 'placeholder', 'href']) {
      const ds = 'i18n' + a.replace(/(^|-)(\w)/g, (m, d, c) => c.toUpperCase());
      for (const el of root.querySelectorAll(`[data-i18n-${a}]`)) el.setAttribute(a, t(el.dataset[ds]));
    }
  }
  return { t, tn, apply, lang, nf, has: k => k in S };
}
