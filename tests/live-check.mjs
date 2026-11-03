// Weekly check of the live site (https://fastkiwi.app) with the real GitHub API.
//   - every page in the sitemap (and the main redirects) answers 200, an unknown page 404
//   - this repo's pages: internal links, images, styles and scripts resolve; no console errors at 1366 px and 390 px;
//     GitHub links are only labelled GitHub buttons or direct release downloads
//   - every download button resolves to a real asset of the app's latest release, and that file answers 200/302
//   - the releases pages show each app's real latest version; the feeds (once published) parse as Atom
// Usage: node tests/live-check.mjs [--base https://fastkiwi.app] [--report report.md]
// GITHUB_TOKEN (optional, set in CI) is used for the API, also for the pages' own API calls, so shared runners don't hit the rate limit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/playwright.mjs';
import { REPOS, APPS, fetchReleases, published } from '../tools/releases.mjs';

const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const BASE = (opt('--base') || 'https://fastkiwi.app').replace(/\/$/, '');
const REPORT = opt('--report');
const OUT = path.resolve(process.env.QA_OUT || path.join(path.dirname(fileURLToPath(import.meta.url)), 'output')) + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const TOKEN = process.env.GITHUB_TOKEN;
const OWN = ['/', '/ar/', '/releases/', '/ar/releases/', '/lemon/', '/ar/lemon/', '/privacy/', '/ar/privacy/', '/instawords/', '/instawords/bulk.html', '/instawords/excel.html',
  '/instawords/en/', '/instawords/en/bulk.html', '/instawords/en/excel.html'];
const REDIRECTS = ['/local-ai-chat/', '/instafind/', '/remember-me/', '/tafqit/', '/en/'];
const INSTALLER = { 'arabic-file-search': /^bahth\.exe$/, 'Remember-Me': /^Remember-Me-Setup-.*\.exe$/i, 'local-ai-chat': /^local-ai-chat\.exe$/, 'tafket': /^InstaWords_[\d.]+_x64-setup\.exe$/ };
const problems = [];
let checks = 0;
const ok = (c, msg) => { checks++; if (!c) { problems.push(msg); console.log('  FAIL', msg); } };

/* ---------- HTTP helpers (cached) ---------- */
const statusCache = new Map();
async function status(url, method = 'HEAD') {
  if (statusCache.has(url)) return statusCache.get(url);
  const p = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, { method, redirect: 'manual', headers: { 'User-Agent': 'fastkiwi-live-check' } });
        if (r.status === 405 && method === 'HEAD') return status(url, 'GET');
        if (r.status < 500) return r.status;
      } catch {}
      await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
    }
    return 0;
  })();
  statusCache.set(url, p);
  return p;
}
async function finalStatus(url) { // follows redirects (for pages)
  try { const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'fastkiwi-live-check' } }); return r.status; } catch { return 0; }
}

/* ---------- 1. the real releases ---------- */
const data = {};
for (const repo of REPOS) {
  try { data[repo] = await fetchReleases(repo); } catch (e) { ok(false, `GitHub API: ${e.message}`); }
}
const latest = {};
for (const repo of REPOS) {
  const rel = data[repo] && published(data[repo])[0];
  ok(!!rel, `${APPS[repo].en}: has a published release`);
  if (!rel) continue;
  const inst = rel.assets.find(a => INSTALLER[repo].test(a.name));
  ok(!!inst, `${APPS[repo].en} ${rel.tag_name}: release has its installer asset`);
  latest[repo] = { tag: rel.tag_name, assets: new Set(rel.assets.map(a => a.name)), installer: inst && inst.name };
}
console.log('latest:', Object.entries(latest).map(([r, x]) => `${r} ${x.tag}`).join(', '));

/* ---------- 2. every page answers ---------- */
const sitemap = await fetch(BASE + '/sitemap.xml').then(r => r.text()).catch(() => '');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace('https://fastkiwi.app', BASE));
ok(sitemapUrls.length >= 10, `sitemap.xml lists ${sitemapUrls.length} pages`);
for (const u of new Set([...sitemapUrls, ...OWN.map(p => BASE + p), ...REDIRECTS.map(p => BASE + p), BASE + '/robots.txt', BASE + '/llms.txt', BASE + '/site.webmanifest']))
  ok(await finalStatus(u) === 200, `page ${u} answers 200`);
ok(await finalStatus(BASE + '/no-such-page-' + Date.now() + '/') === 404, 'an unknown page answers 404');

/* ---------- 3. this repo's pages in a browser ---------- */
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const isDirect = u => /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/(latest\/)?download\//.test(u);
const checkedRes = new Set();
async function resolves(u, what, where) {
  const key = u.split('#')[0];
  if (checkedRes.has(key)) return; checkedRes.add(key);
  const s = await status(key);
  ok(s === 200 || s === 301 || s === 302, `${where}: ${what} ${key} answers ${s}`);
}
for (const w of [1366, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce', acceptDownloads: false });
  if (TOKEN) await ctx.route('https://api.github.com/**', async r => { // the pages' own API calls, authenticated so the runner isn't rate-limited
    try {
      const res = await fetch(r.request().url(), { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'fastkiwi-live-check' } });
      await r.fulfill({ status: res.status, contentType: res.headers.get('content-type') || 'application/json', headers: { 'access-control-allow-origin': '*' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch { await r.abort(); }
  });
  for (const p of OWN) {
    const page = await ctx.newPage(), errs = [], bad = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(e.message));
    page.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
    const where = `${p}@${w}`;
    try { await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 45000 }); } catch (e) { ok(false, `${where}: did not load (${e.message.split('\n')[0]})`); await page.close(); continue; }
    await page.waitForTimeout(1500);
    for (let y = 0, h = await page.evaluate(() => document.documentElement.scrollHeight); y < h; y += 700) { await page.mouse.wheel(0, 700); await page.waitForTimeout(60); }
    await page.waitForTimeout(800);
    const d = await page.evaluate(() => ({
      links: [...document.querySelectorAll('a[href]')].map(a => ({ href: a.href, text: a.textContent.replace(/\s+/g, ' ').trim(), gh: a.hasAttribute('data-github'), dl: a.getAttribute('data-dl'), hidden: !!a.closest('[hidden]') })),
      res: [...document.querySelectorAll('img[src], source[src], video[poster], link[rel~="icon"], link[rel="stylesheet"], link[rel="manifest"], link[rel="preload"], script[src]')]
        .flatMap(e => [e.src || e.href || e.poster, ...(e.srcset ? e.srcset.split(',').map(x => new URL(x.trim().split(/\s+/)[0], document.baseURI).href) : [])]).filter(Boolean),
      badImgs: [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.currentSrc || i.src),
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      dlButtons: [...document.querySelectorAll('a[data-dl]')].map(a => ({ repo: a.dataset.dl, href: a.href, ver: a.querySelector('[data-dl-ver]')?.textContent || '' })),
      releases: [...document.querySelectorAll('[data-release]')].map(s => ({ repo: s.dataset.release, ver: s.querySelector('.dl-facts dd')?.textContent || '', main: s.querySelector('.dl-main')?.href || '',
        files: [...s.querySelectorAll('.rp-side .dl-files a, .rp-dl')].map(a => a.href), msg: !!s.querySelector('.dl-msg') }))
    }));
    ok(!errs.length, `${where}: console errors: ${errs.slice(0, 3).join(' | ')}`);
    ok(!bad.length, `${where}: failed requests: ${bad.slice(0, 3).join(' | ')}`);
    ok(!d.badImgs.length, `${where}: images not shown: ${d.badImgs.slice(0, 3).join(' ')}`);
    ok(d.sw <= d.cw, `${where}: page scrolls sideways (${d.sw} > ${d.cw})`);
    if (w === 1366) {
      for (const u of d.res) if (u.startsWith(BASE)) await resolves(u, 'resource', where);
      for (const l of d.links) {
        const u = new URL(l.href);
        if (u.origin === BASE) { if (!l.hidden) await resolves(l.href, 'link', where); }
        else if (u.hostname === 'github.com') ok(isDirect(l.href) || (l.gh && /GitHub/.test(l.text)) || (l.dl === 'Remember-Me' && /\/releases\/latest$/.test(u.pathname)), `${where}: GitHub link that is neither a labelled GitHub button nor a download: "${l.text}" ${l.href}`);
        else if (!/^(mailto|tel):/.test(l.href)) ok(false, `${where}: off-site link "${l.text}" ${l.href}`);
      }
    }
    for (const b of d.dlButtons) {
      const want = latest[b.repo];
      if (!want) continue;
      const m = b.href.match(/\/releases\/download\/([^/]+)\/([^/?#]+)$/);
      ok(m && decodeURIComponent(m[1]) === want.tag && decodeURIComponent(m[2]) === want.installer, `${where}: ${APPS[b.repo].en} download button points at ${b.href} (latest is ${want.tag}/${want.installer})`);
      ok(!b.ver || b.ver === (/^v/i.test(want.tag) ? want.tag : 'v' + want.tag), `${where}: ${APPS[b.repo].en} button shows ${b.ver}, latest is ${want.tag}`);
      if (w === 1366) { const s = await status(b.href); ok(s === 302 || s === 200, `${where}: ${b.href} answers ${s}`); }
    }
    for (const r of d.releases) {
      const want = latest[r.repo];
      if (!want) continue;
      ok(!r.msg && r.ver === (/^v/i.test(want.tag) ? want.tag : 'v' + want.tag), `${where}: releases page shows ${APPS[r.repo].en} "${r.ver}", latest is ${want.tag}`);
      if (w === 1366) for (const f of [r.main, ...r.files].filter(Boolean)) {
        ok(isDirect(f), `${where}: ${APPS[r.repo].en} file link is not a direct download: ${f}`);
        const s = await status(f); ok(s === 302 || s === 200, `${where}: ${f} answers ${s}`);
      }
    }
    if (problems.length && w === 1366) await page.screenshot({ path: `${OUT}live-${p.replace(/\W+/g, '_')}-${w}.png`, fullPage: true }).catch(() => {});
    await page.close();
  }
  await ctx.close();
}

/* ---------- 4. feeds (once the sync workflow has published them) ---------- */
{
  const page = await browser.newPage();
  for (const [feed, rel] of [['/releases.xml', '/releases/'], ['/ar/releases.xml', '/ar/releases/']]) {
    const s = await finalStatus(BASE + feed);
    if (s === 404) { console.log(`  note: ${feed} not published yet`); continue; }
    const xml = await fetch(BASE + feed).then(r => r.text()).catch(() => '');
    const p = await page.evaluate(x => { const d = new DOMParser().parseFromString(x, 'application/xml'), e = [...d.getElementsByTagName('entry')];
      return { err: !!d.getElementsByTagName('parsererror').length, n: e.length, links: e.map(x => x.querySelector('link')?.getAttribute('href')), titles: e.map(x => x.querySelector('title')?.textContent) }; }, xml);
    ok(s === 200 && !p.err && p.n >= 1, `feed ${feed}: valid Atom (${p.n} entries)`);
    ok(p.links.every(h => h && h.startsWith('https://fastkiwi.app' + rel + '#')), `feed ${feed}: entries link to ${rel}`);
    const tagOf = t => (/^v/i.test(t) ? t : 'v' + t);
    const newest = Object.entries(latest).map(([repo, x]) => ({ repo, x, t: Date.parse(published(data[repo])[0].published_at) })).sort((a, b) => b.t - a.t)[0];
    if (newest && Date.now() - newest.t > 2 * 864e5) ok(p.titles[0] && p.titles[0].endsWith(' ' + tagOf(newest.x.tag)), `feed ${feed}: newest entry is ${APPS[newest.repo].en} ${newest.x.tag} (feed has "${p.titles[0]}"; is the daily sync workflow failing?)`);
  }
  await page.close();
}
await browser.close();

const report = problems.length
  ? `## Live site check failed\n\n${problems.length} of ${checks} checks failed on ${BASE} (${new Date().toISOString()}).\n\n` +
    problems.map(p => `- ${p.replace(/\n/g, ' ')}`).join('\n') +
    `\n\nLatest releases seen: ${Object.entries(latest).map(([r, x]) => `${APPS[r].en} ${x.tag}`).join(', ')}.\n`
  : `## Live site check passed\n\nAll ${checks} checks passed on ${BASE} (${new Date().toISOString()}).\n`;
if (REPORT) fs.writeFileSync(REPORT, report);
console.log(`\n${checks - problems.length} passed, ${problems.length} failed`);
process.exit(problems.length ? 1 : 0);
