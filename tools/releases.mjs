// Shared release helpers for the FastKiwi site tools (no dependencies, Node 22+).
//   - fetchReleases(): the four apps' releases from the GitHub API (GITHUB_TOKEN used when set)
//   - buildFeed():     the Atom feed of the latest releases, in English or Arabic, as plain text
//   - applyInstaWordsFallback(): the static InstaWords installer link used when the API is unreachable
//   - setFeedVisibility(): shows the feed links (and <link rel="alternate">) only once the feed exists
import fs from 'node:fs';
import path from 'node:path';

export const OWNER = 'sarmadiq9090-coder';
export const SITE = 'https://fastkiwi.app';
/* repo -> on-site anchor on the releases page and display names (same as site.js) */
export const APPS = {
  'arabic-file-search': { slug: 'instafind', en: 'InstaFind', ar: 'InstaFind · بحث سريع' },
  'Remember-Me': { slug: 'remember-me', en: 'Remember Me', ar: 'ذكرني · Remember Me' },
  'local-ai-chat': { slug: 'lemon', en: 'Lemon', ar: 'Lemon · الذكاء الاصطناعي المحلي' },
  'tafket': { slug: 'instawords', en: 'InstaWords', ar: 'InstaWords · تفقيط' }
};
export const REPOS = Object.keys(APPS);
export const INSTAWORDS_SETUP = /^InstaWords_[\d.]+_x64-setup\.exe$/;

/* ---------- GitHub API ---------- */
export async function fetchReleases(repo, { token = process.env.GITHUB_TOKEN, fetchImpl = fetch } = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'fastkiwi-site-sync' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetchImpl(`https://api.github.com/repos/${OWNER}/${repo}/releases?per_page=100`, { headers });
  if (!r.ok) throw new Error(`${repo}: GitHub API answered ${r.status}`);
  const rels = await r.json();
  if (!Array.isArray(rels)) throw new Error(`${repo}: unexpected API answer`);
  return rels;
}
export const published = rels => rels.filter(r => r && !r.draft && !r.prerelease && r.published_at);

/* ---------- release notes -> a short plain-text summary ---------- */
const LABEL = {
  en: /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:english|in english)\s*(?::\s*(?:\*\*|__)?|(?:\*\*|__)\s*:?|$)\s*(.*)$/i,
  ar: /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:العربية|بالعربية|عربي)\s*(?::\s*(?:\*\*|__)?|(?:\*\*|__)\s*:?|$)\s*(.*)$/
};
const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
function inlineText(line) {
  return line
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+by @[\w-]+(?:\[bot\])? in https?:\/\/\S+/g, '')
    .replace(/<?https?:\/\/\S+>?/g, '')
    .replace(/\s*\[#\d+\]/g, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (_, e) => ENTITIES[e])
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
/** First lines of a release body as plain text (no HTML, no markdown), preferring the feed's language section. */
export function plainSummary(body, lang = 'en', { max = 280, lines: want = 4, title = '' } = {}) {
  let text = String(body || '').replace(/\r/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/^\s*(```|~~~)[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '');
  const whole = text.split('\n'), other = lang === 'ar' ? 'en' : 'ar', label = (l, w) => l.match(LABEL[w]);
  let all = whole;
  const start = whole.findIndex(l => label(l, lang));
  if (start >= 0) {
    const tail = whole.slice(start + 1), stop = tail.findIndex(l => label(l, other));
    all = [label(whole[start], lang)[1], ...(stop >= 0 ? tail.slice(0, stop) : tail)];
  } else {
    const stop = whole.findIndex(l => label(l, other));
    if (stop > 0) all = whole.slice(0, stop);
  }
  return firstLines(all, { max, want, title }) || (all !== whole ? firstLines(whole, { max, want, title }) : '');
}
function firstLines(all, { max, want, title }) {
  const out = [];
  for (const raw of all) {
    if (/^\s*#{1,6}\s/.test(raw)) { if (/new contributors/i.test(raw)) break; continue; } // headings are structure
    if (/^\s*(\*\*|__)[^*_]+(\*\*|__)\s*:?\s*$/.test(raw)) continue;                      // bold-only sub-labels
    if (/^\s*\*\*full changelog\*\*/i.test(raw) || /^\s*\|/.test(raw)) continue;          // compare links, tables
    const t = inlineText(raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '').replace(/^\s*>\s?/, ''));
    if (!t || (title && t === inlineText(title))) continue;
    out.push(t);
    if (out.length >= want) break;
  }
  let s = '';
  for (const t of out) s += !s ? t : (/[.!?؟:…]$/.test(s) ? ' ' : ' · ') + t;
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return s;
}

/* ---------- Atom feed ---------- */
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const verTag = t => (/^v/i.test(t) ? t : 'v' + t);
/** releasesByRepo: { repo: [GitHub release objects] } -> Atom XML (the newest `limit` stable releases across the apps). */
export function buildFeed(releasesByRepo, lang = 'en', { limit = 10 } = {}) {
  const ar = lang === 'ar', base = `${SITE}/${ar ? 'ar/' : ''}`;
  const entries = [];
  for (const [repo, rels] of Object.entries(releasesByRepo)) {
    const app = APPS[repo]; if (!app || !rels) continue;
    for (const r of published(rels)) entries.push({ repo, app, r, t: Date.parse(r.published_at) });
  }
  entries.sort((a, b) => b.t - a.t || a.repo.localeCompare(b.repo));
  const top = entries.slice(0, limit);
  const updated = top.length ? new Date(top[0].t).toISOString() : '2026-01-01T00:00:00.000Z';
  const self = `${base}releases.xml`;
  const head = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang}">`,
    `  <title>${xml(ar ? 'FastKiwi · ما الجديد' : 'FastKiwi · What’s new')}</title>`,
    `  <subtitle>${xml(ar ? 'آخر إصدارات برامج FastKiwi: InstaFind وذكرني وLemon وInstaWords.' : 'The latest releases of the FastKiwi apps: InstaFind, Remember Me, Lemon and InstaWords.')}</subtitle>`,
    `  <id>${self}</id>`,
    `  <link rel="self" type="application/atom+xml" href="${self}"/>`,
    `  <link rel="alternate" type="text/html" hreflang="${lang}" href="${base}releases/"/>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>FastKiwi</name><uri>${SITE}/</uri></author>`,
    `  <icon>${SITE}/img/icon-192.png</icon>`,
    `  <rights>${xml(ar ? 'برامج ويندوز مجانية' : 'Free Windows apps')}</rights>`
  ];
  const body = top.map(({ repo, app, r }) => {
    const tag = verTag(r.tag_name), when = new Date(Date.parse(r.published_at)).toISOString();
    const summary = plainSummary(r.body, lang, { title: r.name || '' }) || (ar ? `صدر ${app.en} ${tag}.` : `${app.en} ${tag} is out.`);
    return [
      '  <entry>',
      `    <id>tag:fastkiwi.app,2026:${repo}/${xml(r.tag_name)}</id>`,
      `    <title>${xml(`${app[lang]} ${tag}`)}</title>`,
      `    <link rel="alternate" type="text/html" href="${base}releases/#${app.slug}"/>`,
      `    <published>${when}</published>`,
      `    <updated>${when}</updated>`,
      `    <category term="${app.slug}" label="${xml(app.en)}"/>`,
      `    <summary type="text">${xml(summary)}</summary>`,
      '  </entry>'
    ].join('\n');
  });
  return [...head, ...body, '</feed>', ''].join('\n');
}

/* ---------- InstaWords static fallback (used by the site when the API can't be reached) ---------- */
export const FALLBACK_FILES = ['index.html', 'ar/index.html', 'releases/index.html', 'ar/releases/index.html', 'site.js'];
export function latestInstaWords(rels) {
  for (const r of published(rels)) {
    const a = (r.assets || []).find(x => INSTAWORDS_SETUP.test(x.name));
    if (a) return { tag: r.tag_name, version: a.name.match(/^InstaWords_([\d.]+)_/)[1], name: a.name };
  }
  return null;
}
/** Rewrites every static InstaWords installer link, version label and JSON-LD version to `latest`. Returns the changed files. */
export function applyInstaWordsFallback(root, latest) {
  if (!latest || !/^[\w.-]+$/.test(latest.tag) || !INSTAWORDS_SETUP.test(latest.name)) throw new Error('bad InstaWords release');
  const url = `https://github.com/${OWNER}/tafket/releases/download/${latest.tag}/${latest.name}`;
  const changed = [];
  for (const f of FALLBACK_FILES) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const before = fs.readFileSync(p, 'utf8');
    const after = before
      .replace(/https:\/\/github\.com\/sarmadiq9090-coder\/tafket\/releases\/download\/[\w.-]+\/InstaWords_[\d.]+_x64-setup\.exe/g, url)
      .replace(/'https:\/\/github\.com\/' \+ OWNER \+ '\/tafket\/releases\/download\/[\w.-]+\/InstaWords_[\d.]+_x64-setup\.exe'/g,
        `'https://github.com/' + OWNER + '/tafket/releases/download/${latest.tag}/${latest.name}'`)
      .replace(/(data-dl="tafket">[^<]*(?:<[^>]+>[^<]*)*?<span class="dl-ver" data-dl-ver>)[^<]*(<\/span>)/g, `$1${verTag(latest.version)}$2`)
      .replace(/("softwareVersion": ")[\d.]+(", "downloadUrl": "https:\/\/github\.com\/sarmadiq9090-coder\/tafket\/)/g, `$1${latest.version}$2`)
      .replace(/>InstaWords_[\d.]+_x64-setup\.exe</g, `>${latest.name}<`);
    if (after !== before) { fs.writeFileSync(p, after); changed.push(f); }
  }
  return changed;
}

/* ---------- feed links: visible only when the feed file exists ---------- */
export const FEED_PAGES = { 'index.html': '/releases.xml', 'releases/index.html': '/releases.xml', 'lemon/index.html': '/releases.xml',
  'ar/index.html': '/ar/releases.xml', 'ar/releases/index.html': '/ar/releases.xml', 'ar/lemon/index.html': '/ar/releases.xml' };
export function setFeedVisibility(root) {
  const changed = [];
  for (const [f, feed] of Object.entries(FEED_PAGES)) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const present = fs.existsSync(path.join(root, feed));
    const ar = feed.startsWith('/ar/');
    const before = fs.readFileSync(p, 'utf8');
    let s = before.replace(/(<[a-z]+\b[^>]*\bdata-feed)( hidden)?(?=[\s>])/g, (_, a) => present ? a : a + ' hidden');
    const link = `<link rel="alternate" type="application/atom+xml" title="${ar ? 'FastKiwi · ما الجديد' : 'FastKiwi · What’s new'}" href="${feed}">`;
    s = s.replace(/<link rel="alternate" type="application\/atom\+xml"[^>]*>\n?/g, '');
    if (present) s = s.replace(/(<meta name="theme-color")/, `${link}\n$1`);
    if (s !== before) { fs.writeFileSync(p, s); changed.push(f); }
  }
  return changed;
}
