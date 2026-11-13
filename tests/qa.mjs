// FastKiwi site QA (home, releases, Lemon, privacy policy, support, official downloads, 404, redirects, feeds) in a real browser.
// Run from the repo root: npm test   (or: node tests/qa.mjs [--no-shots])
// Screenshots and qa-report.json go to tests/output/ (or $QA_OUT). The site is served from this checkout on a free port.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FIX, mockApi } from './fixtures.mjs';
import { startServer } from './server.mjs';
import { loadPlaywright } from './lib/playwright.mjs';
import { buildFeed } from '../tools/releases.mjs';
const { chromium } = loadPlaywright();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.resolve(process.env.QA_OUT || path.join(HERE, 'output')) + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const { server, base: BASE } = await startServer(ROOT, +process.env.QA_PORT || 0);
const SHOTS = !process.argv.includes('--no-shots');
const PAGES = [['home-en', '/'], ['home-ar', '/ar/'], ['releases-en', '/releases/'], ['releases-ar', '/ar/releases/'], ['lemon-en', '/lemon/'], ['lemon-ar', '/ar/lemon/'], ['privacy-en', '/privacy/'], ['privacy-ar', '/ar/privacy/'], ['404', '/no-such-page/']];
PAGES.push(['support-en', '/support/'], ['support-ar', '/ar/support/']); // the Windows apps link to these exact paths
PAGES.push(['downloads-en', '/downloads/'], ['downloads-ar', '/ar/downloads/']); // TRADEMARKS.md in the app repos links here
/* the static download links (used until the API answers); InstaWords' version is kept in step by tools/sync-releases.mjs */
const GH = 'https://github.com/sarmadiq9090-coder/';
const IW_V = fs.readFileSync(path.join(ROOT, 'site.js'), 'utf8').match(/\/InstaWords\/releases\/download\/v([\d.]+)\/InstaWords_\1_x64-setup\.exe/)[1];
const STATIC_DL = { 'arabic-file-search': GH + 'arabic-file-search/releases/latest/download/bahth.exe', 'Remember-Me': GH + 'Remember-Me/releases/latest',
  'local-ai-chat': GH + 'local-ai-chat/releases/latest/download/local-ai-chat.exe', 'tafket': `${GH}InstaWords/releases/download/v${IW_V}/InstaWords_${IW_V}_x64-setup.exe` };
const FEED = { en: fs.existsSync(path.join(ROOT, 'releases.xml')), ar: fs.existsSync(path.join(ROOT, 'ar', 'releases.xml')) };
const WIDTHS = [1920, 1536, 1366, 1280, 1229, 1180, 1024, 820, 768, 414, 390, 360];
PAGES.push(['store-en', '/store/'], ['store-ar', '/ar/store/']); // draft Microsoft Store page (see section 9b)
const PROJECT_SITES = ['/arabic-file-search/', '/Remember-Me/']; // other repos' GitHub Pages, served on fastkiwi.app
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('  FAIL', msg); } };
const DIRECT = /^\/sarmadiq9090-coder\/[^/]+\/releases\/(latest\/)?download\//;

// github.com: release assets answer like GitHub does (an attachment, so the browser downloads and stays on the page); anything else is blocked
const blockGithubNav = ctx => ctx.route(/https:\/\/github\.com\/.*/, r => /\/releases\/(latest\/)?download\//.test(r.request().url())
  ? r.fulfill({ status: 200, headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="setup.exe"' }, body: 'MZ' })
  : r.abort());
const offline = ctx => ctx.route('https://api.github.com/**', r => r.abort());
async function scrollThrough(page) { // like a person: wheel down the page, then back to the top
  const hgt = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < hgt; y += 450) { await page.mouse.wheel(0, 450); await page.waitForTimeout(70); }
  await page.waitForTimeout(800);
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
}

/* ---------- link policy ---------- */
// The English InstaWords pages (instawords/en/) come from the tafket repo through the sync workflow, so a checkout made
// before that sync has none yet: links to them are then accepted (and reported) instead of failing the QA.
const IW_EN = fs.existsSync(path.join(ROOT, 'instawords', 'en', 'index.html'));
if (!IW_EN) console.log('  NOTE instawords/en/ is not synced from tafket yet: links to it are accepted without a target');
const pendingIwEn = p => !IW_EN && p.startsWith('/instawords/en/');
function exists(p) {
  let f = path.join(ROOT, decodeURIComponent(p));
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); return fs.existsSync(f); } catch { return false; }
}
async function checkLinks(page, name, scope = 'body') {
  const links = await page.$$eval(scope + ' a[href]', as => as.map(a => ({ href: a.href, raw: a.getAttribute('href'), text: a.textContent.replace(/\s+/g, ' ').trim(), gh: a.hasAttribute('data-github'), store: a.hasAttribute('data-store') && !!a.querySelector('img[alt*="Microsoft Store"]'), dl: a.getAttribute('data-dl'),
    feed: !!a.closest('[data-feed]'), shown: !a.closest('[hidden]') })));
  const ids = new Set(await page.$$eval('[id]', es => es.map(e => e.id)));
  const github = [];
  for (const l of links) {
    const u = new URL(l.href);
    if (u.origin === BASE) {
      if (l.feed) { ok(exists(u.pathname) === l.shown && /\/releases\.xml$/.test(u.pathname), `${name}: feed link ${u.pathname} shown only when the feed exists`); continue; }
      if (l.raw.startsWith('#')) { ok(l.raw !== '#' && (ids.has(l.raw.slice(1)) || /^#download-(instafind|remember-me|lemon|instawords)$/.test(l.raw)), `${name}: anchor ${l.raw} has no target`); continue; }
      ok(exists(u.pathname) || PROJECT_SITES.some(p => u.pathname.startsWith(p)) || pendingIwEn(u.pathname), `${name}: internal link ${u.pathname} does not exist`);
      if (u.hash && u.pathname.endsWith('/releases/')) ok(['#instafind', '#remember-me', '#lemon', '#instawords'].includes(u.hash), `${name}: releases deep link ${u.hash}`);
    } else if (u.hostname === 'github.com') {
      github.push(l);
      const download = DIRECT.test(u.pathname);
      const rmFallback = l.dl === 'Remember-Me' && /\/releases\/latest$/.test(u.pathname); // intercepted by site.js -> on-site dialog
      ok(download || rmFallback || (l.gh && /GitHub/.test(l.text)), `${name}: github link not an explicit GitHub button: ${l.text} -> ${l.href}`);
    } else if (u.hostname === 'apps.microsoft.com') { // Microsoft Store links: the one allowed exception to staying on the site, always the labelled badge
      ok(l.store && /^\/detail\/9[A-Z0-9]{11}$/.test(u.pathname) && /^\?referrer=appbadge&cid=[a-z-]+&mode=full$/.test(u.search), `${name}: Microsoft Store link is a badge link with a campaign ID: ${l.href}`);
    } else if (u.protocol === 'mailto:') {
      ok(u.pathname === 'support@fastkiwi.app' && !u.search, `${name}: mailto only to support@fastkiwi.app: ${l.href}`);
    } else ok(false, `${name}: off-site link ${l.href}`);
  }
  return github;
}

const browser = await chromium.launch();
const report = { pages: {}, github: {} };

/* ---------- 1. every page x width, scrolled like a person: layout, errors, images, links ---------- */
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'no-preference' });
  await offline(ctx);
  for (const [name, url] of PAGES) {
    const page = await ctx.newPage(), errs = [], bad = [];
    page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text()) && !(name === '404' && /404/.test(m.text()))) errs.push(m.text()); });
    page.on('pageerror', e => errs.push(e.message));
    page.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400 && !r.url().includes('/no-such-page/')) bad.push(r.status() + ' ' + r.url()); });
    page.on('requestfailed', r => { if (!r.url().includes('api.github.com')) bad.push('failed ' + r.url()); });
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await scrollThrough(page);
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      wide: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.marquee, .rp-switch ul, .md-table, .table-wrap, pre, .sr-only, .skip'); }).slice(0, 3).map(e => e.tagName + '.' + e.className),
      hiddenReveal: document.querySelectorAll('.reveal:not(.in)').length,
      badImgs: [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src),
      lang: document.documentElement.lang, dir: document.documentElement.dir,
      dl: [...document.querySelectorAll('a[data-dl]')].map(a => [a.dataset.dl, a.getAttribute('href')]),
      h1: document.querySelectorAll('h1').length, alts: [...document.images].filter(i => !i.hasAttribute('alt')).length,
      navOverflow: (() => { const n = document.querySelector('.site-header .wrap'); return n ? n.scrollWidth > n.clientWidth + 1 : false; })()
    }));
    ok(m.sw <= m.cw, `${name}@${w}: horizontal scroll ${m.sw} > ${m.cw}`);
    ok(!m.wide.length, `${name}@${w}: elements outside the viewport ${m.wide}`);
    ok(!m.navOverflow, `${name}@${w}: header overflows`);
    ok(m.hiddenReveal === 0, `${name}@${w}: ${m.hiddenReveal} sections never revealed after scrolling`);
    ok(!m.badImgs.length, `${name}@${w}: images not loaded ${m.badImgs}`);
    ok(!errs.length, `${name}@${w}: console errors ${errs}`);
    ok(!bad.length, `${name}@${w}: bad requests ${bad}`);
    ok(m.h1 === 1, `${name}@${w}: h1 count ${m.h1}`);
    ok(m.alts === 0, `${name}@${w}: images without alt`);
    ok(/ar/.test(name) ? m.lang === 'ar' && m.dir === 'rtl' : m.lang === 'en', `${name}: lang/dir ${m.lang}/${m.dir}`);
    if (name.startsWith('home')) {
      ok(m.dl.length === 8 && Object.keys(STATIC_DL).every(r => m.dl.filter(([x]) => x === r).length === 2), `${name}: ${m.dl.length} download buttons, two per app`);
      ok(m.dl.every(([r, h]) => h === STATIC_DL[r]), `${name}: static download links ${JSON.stringify(m.dl.filter(([r, h]) => h !== STATIC_DL[r]))}`);
    }
    if (name.startsWith('lemon')) ok(m.dl.length === 2 && m.dl.every(([r, h]) => r === 'local-ai-chat' && h === STATIC_DL[r]), `${name}: Lemon download buttons ${JSON.stringify(m.dl)}`);
    if (w === 1366) report.github[name] = (await checkLinks(page, name)).map(l => `${l.text} -> ${l.href}`);
    if (SHOTS) {
      await page.screenshot({ path: `${OUT}after-${name}-${w}.png`, fullPage: true, animations: 'disabled' });
    }
    report.pages[`${name}@${w}`] = { scrollWidth: m.sw, errors: errs.length };
    await page.close();
  }
  await ctx.close();
}

/* ---------- 2. home (owner's design, 2026-11): hero facts, marquee, the tiles' demos, light + dark ----------
   The hero's app count comes from data/apps.json; the InstaWords tile runs the real engine synced in instawords/lib/
   (compared here with the same engine in Node); the Lemon and Remember Me tiles are labelled examples. */
{
  const APPS_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'apps.json'), 'utf8'));
  const RELEASED = APPS_DATA.apps.filter(a => a.status === 'released').length;
  const IW_LIB = path.join(ROOT, 'instawords', 'lib', 'index.js');
  const iwEngine = fs.existsSync(IW_LIB) ? await import(pathToFileURL(IW_LIB).href) : null;
  if (!iwEngine) console.log('  NOTE instawords/lib/ is missing: the InstaWords tile must show its plain link instead of the demo');
  const lum = rgb => { const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(v => +v / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
  for (const lang of ['en', 'ar']) for (const [w, scheme] of [[1366, 'light'], [390, 'dark']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce', colorScheme: scheme, permissions: ['clipboard-read', 'clipboard-write'] });
    await offline(ctx);
    const page = await ctx.newPage(), errs = [], offsite = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
    let iwLoads = 0;
    page.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('https://api.github.com/')) offsite.push(r.url()); if (r.url().endsWith('/instawords/lib/index.js')) iwLoads++; });
    await page.goto(BASE + (lang === 'en' ? '/' : '/ar/'), { waitUntil: 'networkidle' });
    if (iwEngine) {
      /* the engine is lazy: on a phone its tile starts far below the screen, so nothing is loaded until it comes near */
      if (w === 390) ok(iwLoads === 0 && await page.evaluate(() => document.querySelector('.tile-instawords').getBoundingClientRect().top > innerHeight + 600),
        `home ${lang}@${w} ${scheme}: the InstaWords engine is not loaded while its tile is far below the screen (${iwLoads} loads)`);
      await page.locator('.tile-instawords').scrollIntoViewIfNeeded();
      await page.waitForSelector('[data-iw-demo][data-ready]', { timeout: 5000 }).catch(() => {});
    }
    const H = await page.evaluate(() => ({
      h1: document.querySelector('.hero h1').textContent, hl: document.querySelector('.hero h1 .hl')?.textContent,
      count: document.querySelector('[data-count="released-apps"]')?.textContent,
      marquee: document.querySelector('.marquee')?.getAttribute('aria-hidden'), anim: getComputedStyle(document.querySelector('.marquee-track')).animationName,
      tiles: [...document.querySelectorAll('#apps .tile')].length,
      examples: [...document.querySelectorAll('.tile-lemon .demo-tag, .tile-remember .demo-tag')].map(e => e.textContent.trim()),
      findTag: document.querySelector('.tile-instafind .demo-tag')?.textContent || '',
      font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color,
      fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/"/g, '')),
      iwShown: !document.querySelector('[data-iw-demo]').hidden, fbShown: !document.querySelector('[data-iw-fallback]').hidden,
      soon: document.querySelector('#soon')?.textContent.replace(/\s+/g, ' ') || '',
      openSource: /open[ -]?source|مفتوح|\bMIT\b/i.test(document.body.innerText)
    }));
    const tag = `home ${lang}@${w} ${scheme}`;
    ok(H.hl && H.h1.includes(H.hl), `${tag}: headline with the highlighted word (${H.h1})`);
    ok(+H.count === RELEASED, `${tag}: hero app count ${H.count} = released apps in data/apps.json (${RELEASED})`);
    ok(H.marquee === 'true' && H.anim === 'none', `${tag}: marquee is decorative (aria-hidden) and stands still with reduced motion (${H.anim})`);
    ok(H.tiles === 5, `${tag}: four app tiles and the in-development tile (${H.tiles})`);
    ok(H.examples.length === 2 && H.examples.every(t => t === (lang === 'en' ? 'Example' : 'مثال')) && (lang === 'en' ? /Demo/ : /تجربة/).test(H.findTag), `${tag}: Lemon and Remember Me labelled as examples, InstaFind as a demo (${H.examples} / ${H.findTag})`);
    ok(/^"?Rubik"?,/.test(H.font) && H.fonts.includes('Rubik'), `${tag}: self-hosted Rubik in use (${H.font}; loaded ${H.fonts})`);
    ok(scheme === 'dark' ? lum(H.bg) < .02 && lum(H.fg) > .8 : lum(H.bg) > .9 && lum(H.fg) < .02, `${tag}: ${scheme} theme colours (${H.bg} / ${H.fg})`);
    ok(!H.openSource, `${tag}: no open-source or MIT wording (D-051)`);
    ok(/InstaConvert/.test(H.soon) && /PDF Kit/.test(H.soon), `${tag}: in-development tile names InstaConvert and the live PDF Kit`);
    if (iwEngine) {
      ok(H.iwShown && !H.fbShown, `${tag}: InstaWords demo loaded the real engine`);
      for (const [input, unit] of [['1250.75', 'SAR'], ['12.345', 'KWD'], ['٣٠٠', 'IQD'], ['1,250.75', 'USD']]) {
        await page.selectOption('#iw-unit', unit); await page.fill('#iw-amount', input);
        const got = await page.evaluate(() => ({ t: document.getElementById('iw-out').textContent, s: document.getElementById('iw-out').dataset.state, copy: document.getElementById('iw-copy').disabled }));
        const want = iwEngine.tryTafqit(input, { unit, language: lang, decimals: 'error' });
        ok(want.ok && got.s === 'ok' && got.t === want.result && !got.copy, `${tag}: InstaWords ${input} ${unit} = the engine's "${want.result}" (${got.t})`);
      }
      for (const input of ['1.005', '12abc', '-5']) { /* never a silent result: extra decimals are an error, not rounded */
        await page.selectOption('#iw-unit', 'SAR'); await page.fill('#iw-amount', input);
        const got = await page.evaluate(() => ({ t: document.getElementById('iw-out').textContent, s: document.getElementById('iw-out').dataset.state, copy: document.getElementById('iw-copy').disabled }));
        ok(got.s === 'error' && got.t.length > 5 && got.copy, `${tag}: InstaWords "${input}" shows an error and nothing to copy (${got.t})`);
      }
      await page.selectOption('#iw-unit', 'USD'); await page.fill('#iw-amount', '100'); await page.click('#iw-only');
      const only = iwEngine.tryTafqit('100', { unit: 'USD', language: lang, decimals: 'error', prefix: lang === 'ar' ? 'فقط' : '', suffix: lang === 'ar' ? 'لا غير' : 'Only' }).result;
      ok(await page.textContent('#iw-out') === only, `${tag}: InstaWords "only" wording (${only})`);
      await page.click('#iw-copy'); await page.waitForTimeout(150);
      ok(await page.evaluate(() => navigator.clipboard.readText()) === only, `${tag}: InstaWords copies the result`);
    } else ok(!H.iwShown && H.fbShown, `${tag}: without the engine the InstaWords tile shows its link`);
    // InstaFind demo: forgiving Arabic search over the sample files
    const visible = () => page.evaluate(() => [...document.querySelectorAll('[data-find-list] li')].filter(li => !li.hidden).length);
    await page.fill('#find-input', 'أحمد'); const n1 = await visible();
    await page.fill('#find-input', 'فاتورة'); const n2 = await visible();
    await page.fill('#find-input', 'zzzz'); const n0 = await visible(), st0 = await page.textContent('[data-find-status]');
    await page.fill('#find-input', ''); const nAll = await visible();
    ok(n1 === 1 && n2 === 1 && n0 === 0 && st0.trim().length > 5 && nAll === 6, `${tag}: InstaFind demo: أحمد finds the احمد file, فاتورة the invoice, nonsense nothing (${n1}/${n2}/${n0}/${nAll})`);
    // Remember Me example: tick a reminder; Lemon example: a canned answer per chip
    await page.locator('.rem-done').first().click();
    ok(await page.evaluate(() => { const b = document.querySelector('.rem-done'); return b.getAttribute('aria-pressed') === 'true' && b.closest('li').classList.contains('done'); }), `${tag}: Remember Me example reminder can be ticked off`);
    await page.locator('[data-chat-chips] button').first().click();
    ok(await page.evaluate(() => document.querySelectorAll('[data-chat] .msg').length) === 4, `${tag}: Lemon example answers a chip`);
    ok(offsite.length === 0, `${tag}: no third-party requests (${offsite})`);
    ok(!errs.length, `${tag}: errors ${errs}`);
    if (SHOTS) await page.locator('#apps').screenshot({ path: `${OUT}after-apps-${lang}-${w}-${scheme}.png` });
    await ctx.close();
  }
  if (iwEngine) { // keyboard: tabbing into the InstaWords tile loads the engine and moves focus from the fallback link to the amount
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await offline(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.focus('[data-iw-fallback] a');
    const ready = await page.waitForSelector('[data-iw-demo][data-ready]', { timeout: 5000 }).then(() => true, () => false);
    const f = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    ok(ready && f === 'iw-amount', `home en@390: focus in the InstaWords tile loads the engine, and focus moves to the amount (${ready} ${f})`);
    await ctx.close();
  }
  { // the marquee moves when motion is allowed; without JavaScript the InstaWords tile is a plain link
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'no-preference', javaScriptEnabled: false });
    const page = await ctx.newPage();
    for (const [u, want] of [['/', 'instawords/'], ['/ar/', '../instawords/']]) {
      await page.goto(BASE + u, { waitUntil: 'load' });
      const m = await page.evaluate(() => ({ anim: getComputedStyle(document.querySelector('.marquee-track')).animationName, demo: !!document.querySelector('[data-iw-demo]').getClientRects().length,
        link: document.querySelector('[data-iw-fallback] a')?.getAttribute('href'), linkShown: !!document.querySelector('[data-iw-fallback]').getClientRects().length }));
      ok(m.anim === 'fk-tick' && !m.demo && m.linkShown && m.link === want, `home ${u} without JS: marquee runs, InstaWords tile links to ${want} ${JSON.stringify(m)}`);
    }
    await ctx.close();
  }
}

/* ---------- 3. comparison table: cards on phones, no clipping; table fits or shows a scroll hint ---------- */
for (const lang of ['en', 'ar']) for (const w of [360, 390, 414, 768, 820, 1024]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
  await offline(ctx);
  const page = await ctx.newPage();
  await page.goto(BASE + (lang === 'en' ? '/' : '/ar/'), { waitUntil: 'networkidle' });
  const t = await page.evaluate(() => {
    const wrap = document.querySelector('.table-wrap'), cells = [...wrap.querySelectorAll('tbody th, tbody td')];
    const clipped = cells.filter(c => { const r = c.getBoundingClientRect(), wr = wrap.getBoundingClientRect(); return r.right > wr.right + 1 || r.left < wr.left - 1 || c.scrollWidth > c.clientWidth + 1; }).length;
    return { clipped, over: wrap.scrollWidth > wrap.clientWidth + 1, hint: wrap.hasAttribute('data-more-end'), cards: getComputedStyle(wrap.querySelector('tbody tr')).display === 'grid',
      labels: [...wrap.querySelectorAll('td')].every(td => getComputedStyle(td, '::before').content.length > 2) };
  });
  if (w <= 720) ok(t.cards && t.clipped === 0 && !t.over && t.labels, `table ${lang}@${w}: per-feature cards, nothing clipped ${JSON.stringify(t)}`);
  else ok(!t.over || t.hint, `table ${lang}@${w}: fits, or shows the scroll hint ${JSON.stringify(t)}`);
  if (SHOTS && w <= 414) await page.locator('#compare').screenshot({ path: `${OUT}after-table-${lang}-${w}.png` });
  await ctx.close();
}

/* ---------- 4. live data (mocked from real release-note formats): home buttons, news bar, quick dialog ---------- */
for (const lang of ['en', 'ar']) {
  const url = lang === 'en' ? '/' : '/ar/';
  for (const w of [1366, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    await mockApi(ctx); await blockGithubNav(ctx);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({
      dl: [...document.querySelectorAll('a[data-dl]')].map(a => [a.dataset.dl, a.href, a.querySelector('[data-dl-ver]')?.textContent]),
      rel: [...document.querySelectorAll('.rel[data-repo]')].map(e => e.textContent),
      news: !document.querySelector('[data-news]').hidden, newsText: document.querySelector('[data-news] span').innerText.replace(/\s+/g, ' '),
      newsTextContent: document.querySelector('[data-news] span').textContent.replace(/\s+/g, ' '), newsHref: document.querySelector('[data-news-link]').href,
      relLinks: [...document.querySelectorAll('a[href*="releases/#"]')].map(a => new URL(a.href).pathname + new URL(a.href).hash),
      stats: [...document.querySelectorAll('[data-stat]')].map(e => [e.dataset.stat, e.hidden])
    }));
    if (w === 1366) {
      ok(s.dl.every(([, h, v]) => /\/releases\/download\/v[\d.]+\//.test(h) && /^v/.test(v)), `mock ${lang}: all 8 download buttons resolved to direct assets`);
      ok(s.dl.some(([r, h]) => r === 'Remember-Me' && h.endsWith('/v1.6.1/Remember-Me-Setup-1.6.1.exe')), `mock ${lang}: Remember Me direct installer (stable, not the beta)`);
      ok(s.rel.every(t => /v\d/.test(t)), `mock ${lang}: release lines filled`);
      const want = lang === 'en' ? /^New InstaFind v0\.9\.0 is out\.$/ : /^جديد صدر InstaFind v0\.9\.0\.$/;
      ok(s.news && want.test(s.newsTextContent.trim()) && want.test(s.newsText.trim()), `mock ${lang}: news bar reads with a real space: "${s.newsTextContent.trim()}"`);
      ok(new URL(s.newsHref).pathname === (lang === 'en' ? '/releases/' : '/ar/releases/') && new URL(s.newsHref).hash === '#instafind', `mock ${lang}: news link opens the releases page at InstaFind`);
      for (const slug of ['instafind', 'remember-me', 'lemon', 'instawords']) ok(s.relLinks.some(x => x.endsWith('releases/#' + slug)), `${lang}: release-notes link to releases/#${slug}`);
      ok(s.stats.find(x => x[0] === 'stars')[1] === false, `mock ${lang}: stars shown when the real number is big enough`);
    }
    // quick dialog by hash; Esc closes; focus returns; hash cleared
    await page.focus('a.lang'); await page.evaluate(() => { location.hash = '#download-instafind'; });
    await page.waitForSelector('dialog.dl[open] .dl-notes');
    const d = await page.evaluate(() => {
      const dl = document.querySelector('dialog.dl');
      return { modal: dl.matches(':modal'), main: dl.querySelector('.dl-main')?.href, sha: dl.querySelector('.dl-hash code')?.textContent,
        files: [...dl.querySelectorAll('.dl-files a')].map(a => a.href), all: dl.querySelector('.dl-foot a:not([data-github])')?.href,
        links: [...dl.querySelectorAll('a[href]')].map(a => ({ h: a.href, gh: a.hasAttribute('data-github'), t: a.textContent })) };
    });
    ok(d.modal && /\/releases\/download\/v0\.9\.0\/bahth\.exe$/.test(d.main || '') && /^[0-9a-f]{64}$/.test(d.sha || ''), `dialog ${lang}@${w}: opens by hash with direct download + SHA-256`);
    ok(d.files.length === 2 && d.files.every(h => /\/releases\/download\//.test(h)), `dialog ${lang}@${w}: other assets as direct links`);
    ok(new URL(d.all).pathname === (lang === 'en' ? '/releases/' : '/ar/releases/'), `dialog ${lang}@${w}: links to the releases page`);
    ok(d.links.every(l => l.h.startsWith(BASE) || /\/releases\/download\//.test(l.h) || (l.gh && /GitHub/.test(l.t))), `dialog ${lang}@${w}: only on-site, direct downloads or explicit GitHub links`);
    if (SHOTS) await page.screenshot({ path: `${OUT}after-dialog-${lang}-${w}-mockdata.png` });
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({ open: document.querySelector('dialog.dl').open, focus: document.activeElement.className, hash: location.hash }));
    ok(!after.open && after.focus === 'lang' && after.hash === '', `dialog ${lang}@${w}: Esc closes, focus returns, hash cleared (${JSON.stringify(after)})`);
    const dlEvt = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
    await page.locator('a[data-dl="Remember-Me"]').first().click();
    const got = await dlEvt;
    ok(got && /Remember-Me-Setup-1\.6\.1\.exe$/.test(got.url()) && page.url().startsWith(BASE), `download ${lang}@${w}: Remember Me button downloads the file and stays on site`);
    ok(!errs.length, `mock ${lang}@${w}: page errors ${errs}`);
    await ctx.close();
  }
  { // Remember Me clicked before the API answered: the dialog resolves it (never a silent jump to GitHub)
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    await mockApi(ctx, 1500); await blockGithubNav(ctx);
    const page = await ctx.newPage(); let navigated = false;
    page.on('framenavigated', f => { if (f === page.mainFrame() && !f.url().startsWith(BASE)) navigated = true; });
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await page.locator('#remember-me a[data-dl]').click();
    await page.waitForSelector('dialog.dl[open] .dl-loading', { timeout: 1000 });
    await page.waitForSelector('dialog.dl[open] .dl-main', { timeout: 5000 });
    ok(!navigated && /Remember-Me-Setup-1\.6\.1\.exe$/.test(await page.getAttribute('dialog.dl .dl-main', 'href')), `pending ${lang}: Remember Me resolves inside the dialog`);
    await ctx.close();
  }
  { // API unreachable
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    await offline(ctx); await blockGithubNav(ctx);
    const page = await ctx.newPage(); let navigated = false;
    page.on('framenavigated', f => { if (f === page.mainFrame() && !f.url().startsWith(BASE)) navigated = true; });
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    const btn = page.locator('#remember-me a[data-dl]');
    await btn.scrollIntoViewIfNeeded(); await btn.click();
    await page.waitForSelector('dialog.dl[open] .dl-msg');
    const f = await page.evaluate(() => { const dl = document.querySelector('dialog.dl'); return { gh: [...dl.querySelectorAll('a[data-github]')].map(a => [a.textContent, a.href]), main: dl.querySelector('.dl-main') }; });
    ok(!navigated && f.gh.length === 1 && /GitHub/.test(f.gh[0][0]) && /Remember-Me\/releases\/latest$/.test(f.gh[0][1]) && !f.main, `offline ${lang}: Remember Me opens dialog with a labelled GitHub fallback`);
    if (SHOTS) await page.screenshot({ path: `${OUT}after-dialog-${lang}-offline.png` });
    await page.keyboard.press('Escape');
    ok(await page.evaluate(() => document.activeElement.matches('a[data-dl="Remember-Me"]')), `offline ${lang}: focus back on the Remember Me button`);
    await ctx.close();
  }
}

/* ---------- 5. releases pages ---------- */
const expectInst = { instafind: /\/v0\.9\.0\/bahth\.exe$/, 'remember-me': /\/v1\.6\.1\/Remember-Me-Setup-1\.6\.1\.exe$/, lemon: /\/v2\.2\.0\/local-ai-chat\.exe$/, instawords: /\/v2\.0\.1\/InstaWords_2\.0\.1_x64-setup\.exe$/ };
for (const lang of ['en', 'ar']) {
  const url = lang === 'en' ? '/releases/' : '/ar/releases/';
  for (const w of [1366, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    await mockApi(ctx); await blockGithubNav(ctx);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + url + '#lemon', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    const deep = await page.evaluate(() => { const t = document.getElementById('lemon').getBoundingClientRect().top, sw = document.querySelector('.rp-switch').getBoundingClientRect(); return { t, below: t >= sw.bottom - 2 && t < 260 }; });
    ok(deep.below, `releases ${lang}@${w}: #lemon deep link lands below the sticky switcher (${deep.t})`);
    const r = await page.evaluate(() => [...document.querySelectorAll('[data-release]')].map(sec => ({
      id: sec.id, busy: sec.querySelector('[data-release-body]').hasAttribute('aria-busy'), skel: !!sec.querySelector('.skel'),
      ver: sec.querySelector('.dl-facts dd')?.textContent, sha: sec.querySelector('.dl-hash code')?.textContent, copy: !!sec.querySelector('.dl-copy'),
      main: sec.querySelector('.dl-main')?.href, files: [...sec.querySelectorAll('.rp-side .dl-files a')].map(a => a.href),
      older: sec.querySelectorAll('.rp-list > li').length, notesLinks: sec.querySelectorAll('.md a').length,
      danger: sec.querySelectorAll('script, iframe, img:not(.squircle), [onerror], [onclick], [href^="javascript"]').length,
      table: !!sec.querySelector('.md-table table td'), rtl: !!sec.querySelector('.md [dir="rtl"]'), gh: [...sec.querySelectorAll('a[data-github]')].map(a => a.textContent)
    })));
    for (const x of r) {
      ok(!x.busy && !x.skel, `releases ${lang}@${w} ${x.id}: skeleton replaced`);
      ok(expectInst[x.id].test(x.main || ''), `releases ${lang}@${w} ${x.id}: primary installer ${x.main}`);
      ok(/^[0-9a-f]{64}$/.test(x.sha || '') && x.copy, `releases ${lang}@${w} ${x.id}: SHA-256 + copy`);
      ok(x.files.every(h => /\/releases\/download\//.test(h) && !/\.(yml|blockmap|txt|sha256)$/.test(h)), `releases ${lang}@${w} ${x.id}: other assets are real files ${x.files}`);
      ok(x.notesLinks === 0 && x.danger === 0, `releases ${lang}@${w} ${x.id}: notes are text only`);
      ok(x.older === FIX[{ instafind: 'arabic-file-search', 'remember-me': 'Remember-Me', lemon: 'local-ai-chat', instawords: 'tafket' }[x.id]].length - 1, `releases ${lang}@${w} ${x.id}: previous releases listed (${x.older})`);
    }
    const side = await page.evaluate(() => {
      const before = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const box = document.querySelector('#instafind .rp-notes'); // an item whose direction differs from its list (live InstaFind/Remember Me notes)
      const md = window.FKmarkdown('- Get-FileHash .\\Remember-Me-Setup-1.6.1-x64.exe -Algorithm SHA256\n- البرامج بأسمائها العربية كما تكتبها، وحرف غلط واحد مقبول\n- English again');
      box.appendChild(md); const after = document.documentElement.scrollWidth - document.documentElement.clientWidth; md.remove();
      return [before, after];
    });
    ok(side[0] <= 0 && side[1] <= 0, `releases ${lang}@${w}: release notes never scroll the page sideways (${side})`);
    const iw = r.find(x => x.id === 'instawords');
    ok(iw.table && iw.rtl, `releases ${lang}: InstaWords notes keep the table and the RTL block`);
    ok(r.find(x => x.id === 'remember-me').ver === 'v1.6.1', `releases ${lang}: the pre-release is not shown as latest`);
    ok(await page.evaluate(() => window.__xss) === undefined, `releases ${lang}@${w}: no script ran from release notes`);
    // expand an older InstaFind release: its notes render on demand
    await page.locator('#instafind .rp-older > summary').click();
    await page.locator('#instafind .rp-list details > summary').first().click();
    await page.waitForSelector('#instafind .rp-list details[open] .md', { timeout: 2000 }).catch(() => {});
    ok(await page.evaluate(() => !!document.querySelector('#instafind .rp-list details[open] .md li')), `releases ${lang}@${w}: older release notes render when expanded`);
    // the chip of the section in view is marked
    await page.locator('#remember-me').scrollIntoViewIfNeeded(); await page.evaluate(() => document.getElementById('remember-me').scrollIntoView()); await page.waitForTimeout(400);
    ok(await page.evaluate(() => document.querySelector('.rp-switch a[aria-current]')?.getAttribute('href')) === '#remember-me', `releases ${lang}@${w}: switcher marks the app in view`);
    report.github[`releases-${lang}-live@${w}`] = (await checkLinks(page, `releases-${lang}-live@${w}`)).map(l => `${l.text} -> ${l.href}`);
    if (SHOTS) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${OUT}after-releases-${lang}-${w}-mockdata.png`, fullPage: true, animations: 'disabled' }); }
    ok(!errs.length, `releases ${lang}@${w}: page errors ${errs}`);
    await ctx.close();
  }
  { // API unreachable: clear message, static direct links, one explicit GitHub button per app
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    await offline(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE + url, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    const r = await page.evaluate(() => [...document.querySelectorAll('[data-release]')].map(sec => ({ id: sec.id, msg: !!sec.querySelector('.dl-msg'), main: sec.querySelector('.dl-main')?.href || null,
      gh: [...sec.querySelectorAll('a[data-github]')].map(a => [a.textContent, a.href]) })));
    const fb = { instafind: /\/arabic-file-search\/releases\/latest\/download\/bahth\.exe$/, lemon: /\/local-ai-chat\/releases\/latest\/download\/local-ai-chat\.exe$/, instawords: new RegExp(`/InstaWords/releases/download/v${IW_V.replace(/\./g, '\\.')}/InstaWords_${IW_V.replace(/\./g, '\\.')}_x64-setup\\.exe$`) };
    for (const x of r) {
      ok(x.msg && x.gh.length === 1 && /GitHub/.test(x.gh[0][0]), `releases offline ${lang} ${x.id}: message + one explicit GitHub button`);
      ok(x.id === 'remember-me' ? x.main === null : fb[x.id].test(x.main || ''), `releases offline ${lang} ${x.id}: static direct link ${x.main}`);
    }
    if (SHOTS) await page.screenshot({ path: `${OUT}after-releases-${lang}-offline.png`, fullPage: true, animations: 'disabled' });
    await ctx.close();
  }
}

/* ---------- 6. Lemon pages (mocked API): live download, release notes link, labelled GitHub buttons, screenshots ---------- */
for (const lang of ['en', 'ar']) {
  const url = lang === 'en' ? '/lemon/' : '/ar/lemon/', relPage = lang === 'en' ? '/releases/' : '/ar/releases/';
  for (const w of [1366, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    await mockApi(ctx); await blockGithubNav(ctx);
    const page = await ctx.newPage(), errs = [], apiRepos = new Set();
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('request', r => { const m = r.url().match(/^https:\/\/api\.github\.com\/repos\/[^/]+\/([^/?]+)/); if (m) apiRepos.add(m[1]); });
    await page.goto(BASE + url, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    await scrollThrough(page);
    const L = await page.evaluate(() => ({
      dl: [...document.querySelectorAll('a[data-dl]')].map(a => [a.dataset.dl, a.href, a.querySelector('[data-dl-ver]')?.textContent]),
      rel: document.querySelector('.rel[data-repo="local-ai-chat"]')?.textContent || '',
      relLinks: [...document.querySelectorAll('a[href*="releases/#lemon"]')].map(a => new URL(a.href).pathname + new URL(a.href).hash),
      gh: [...document.querySelectorAll('a[href*="github.com"]')].map(a => [a.textContent.trim(), a.href, a.hasAttribute('data-github'), a.hasAttribute('data-dl')]),
      hero: (() => { const i = document.querySelector('.ap-hero .screen img'); return { src: i.currentSrc, ok: i.complete && i.naturalWidth > 0, fp: i.getAttribute('fetchpriority') }; })(),
      imgs: [...document.querySelectorAll('main img')].filter(i => !i.complete || !i.naturalWidth).length,
      faq: document.querySelectorAll('.faq details').length,
      langLink: document.querySelector('a.lang').getAttribute('href'), canonical: document.querySelector('link[rel=canonical]').href,
      hreflang: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map(l => l.hreflang + ' ' + l.href).sort(),
      ld: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent),
      req: document.getElementById('requirements')?.textContent || '', title: document.title
    }));
    const tag = `lemon ${lang}@${w}`;
    ok(L.dl.length === 2 && L.dl.every(([r, h, v]) => r === 'local-ai-chat' && /\/local-ai-chat\/releases\/download\/v2\.2\.0\/local-ai-chat\.exe$/.test(h) && v === 'v2.2.0'), `${tag}: download buttons resolve to the latest installer ${JSON.stringify(L.dl)}`);
    ok(/^v2\.2\.0 · /.test(L.rel), `${tag}: release line "${L.rel}"`);
    ok(L.relLinks.length >= 3 && L.relLinks.every(x => x === relPage + '#lemon'), `${tag}: release notes links go to ${relPage}#lemon (${L.relLinks})`);
    ok(L.gh.some(([t, h, gh]) => gh && /GitHub/.test(t) && h === GH + 'local-ai-chat'), `${tag}: explicit "Source on GitHub" button`);
    ok(L.gh.every(([t, h, gh, dl]) => (gh && /GitHub/.test(t)) || (dl && /\/releases\/download\//.test(h))), `${tag}: GitHub links are labelled buttons or direct downloads ${JSON.stringify(L.gh)}`);
    ok(L.hero.ok && L.hero.fp === 'high' && new RegExp(`/img/lemon-${lang}${w < 720 ? '-640' : ''}\\.webp$`).test(L.hero.src), `${tag}: real ${lang} screenshot in the hero (${L.hero.src})`);
    ok(L.imgs === 0, `${tag}: ${L.imgs} images not loaded`);
    ok(L.faq >= 6, `${tag}: FAQ (${L.faq})`);
    ok(L.langLink === (lang === 'en' ? '../ar/lemon/' : '../../lemon/') && L.canonical === 'https://fastkiwi.app' + url, `${tag}: language switch + canonical`);
    ok(JSON.stringify(L.hreflang) === JSON.stringify(['ar https://fastkiwi.app/ar/lemon/', 'en https://fastkiwi.app/lemon/', 'x-default https://fastkiwi.app/lemon/']), `${tag}: hreflang ${L.hreflang}`);
    ok(L.ld.name === 'Lemon' && L.ld.url === 'https://fastkiwi.app' + url && /Ollama/.test(L.ld.softwareRequirements), `${tag}: JSON-LD`);
    ok(/Ollama/.test(L.req) && /WebView2/.test(L.req) && /(64-bit|64 بت)/.test(L.req), `${tag}: requirements name Ollama, WebView2 and 64-bit Windows`);
    ok(apiRepos.size === 1 && apiRepos.has('local-ai-chat'), `${tag}: only Lemon's releases asked from the API (${[...apiRepos]})`);
    const dlEvt = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
    await page.locator('a[data-dl]').first().click();
    const got = await dlEvt;
    ok(got && /\/v2\.2\.0\/local-ai-chat\.exe$/.test(got.url()) && page.url().startsWith(BASE), `${tag}: Download gets the file and stays on the site`);
    report.github[`lemon-${lang}-live@${w}`] = (await checkLinks(page, `lemon-${lang}-live@${w}`)).map(l => `${l.text} -> ${l.href}`);
    ok(!errs.length, `${tag}: errors ${errs}`);
    if (SHOTS) await page.screenshot({ path: `${OUT}after-lemon-${lang}-${w}-mockdata.png`, fullPage: true, animations: 'disabled' });
    await ctx.close();
  }
}

/* ---------- 7. the old /local-ai-chat/ address: on-site redirect by the visitor's language, never to GitHub ---------- */
for (const f of ['local-ai-chat', 'instafind', 'remember-me', 'tafqit', 'en']) {
  const html = fs.readFileSync(path.join(ROOT, f, 'index.html'), 'utf8');
  ok(!/github\.com/.test(html) && /<link rel="canonical" href="https:\/\/fastkiwi\.app\//.test(html), `stub /${f}/: absolute on-site canonical, no GitHub link`);
}
for (const [locale, want] of [['en-US', '/lemon/'], ['ar-IQ', '/ar/lemon/'], ['ar', '/ar/lemon/'], ['fr-FR', '/lemon/']]) {
  const ctx = await browser.newContext({ locale });
  await offline(ctx);
  const page = await ctx.newPage();
  await page.goto(BASE + '/local-ai-chat/#faq').catch(() => {});
  await page.waitForURL(u => u.pathname === want, { timeout: 5000 }).catch(() => {});
  const u = new URL(page.url());
  ok(u.origin === BASE && u.pathname === want && u.hash === '#faq', `redirect ${locale}: /local-ai-chat/#faq -> ${u.pathname}${u.hash}`);
  await ctx.close();
}
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(BASE + '/local-ai-chat/').catch(() => {});
  await page.waitForURL(u => u.pathname === '/lemon/', { timeout: 5000 }).catch(() => {});
  ok(new URL(page.url()).pathname === '/lemon/', `redirect without JavaScript: ${page.url()}`);
  await ctx.close();
}

/* ---------- 8. the real InstaFind captures stay on the site (the app section and its demo video use them) ---------- */
for (const lang of ['en', 'ar']) for (const f of [`img/instafind-${lang}.webp`, `img/instafind-${lang}-640.webp`, `img/instafind-${lang}.png`, `img/instafind-demo-${lang}.mp4`])
  ok(fs.existsSync(path.join(ROOT, f)), `${f} exists (the PNG stays as the demo video's poster)`);

/* ---------- 9. release feeds: links shown only with a feed; the generator's output parses as Atom ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await offline(ctx);
  const page = await ctx.newPage();
  for (const [lang, pages, feed] of [['en', ['/', '/releases/', '/lemon/', '/privacy/', '/downloads/'], '/releases.xml'], ['ar', ['/ar/', '/ar/releases/', '/ar/lemon/', '/ar/privacy/', '/ar/downloads/'], '/ar/releases.xml']]) {
    for (const u of pages) {
      await page.goto(BASE + u, { waitUntil: 'networkidle' });
      const f = await page.evaluate(() => ({ head: [...document.querySelectorAll('link[rel=alternate][type="application/atom+xml"]')].map(l => l.getAttribute('href')),
        links: [...document.querySelectorAll('[data-feed]')].map(e => ({ shown: !!e.getClientRects().length, href: (e.matches('a') ? e : e.querySelector('a')).pathname })) }));
      ok(f.links.length >= 1 && f.links.every(l => l.href === feed), `feed ${u}: links point to ${feed} (${JSON.stringify(f.links)})`);
      if (FEED[lang]) ok(JSON.stringify(f.head) === JSON.stringify([feed]) && f.links.every(l => l.shown), `feed ${u}: <link rel=alternate> + visible links`);
      else ok(f.head.length === 0 && f.links.every(l => !l.shown), `feed ${u}: no feed yet, so its links stay hidden`);
    }
    if (FEED[lang]) {
      const r = await page.request.get(BASE + feed);
      const p = await page.evaluate(x => { const d = new DOMParser().parseFromString(x, 'application/xml'), e = [...d.getElementsByTagName('entry')];
        return { err: !!d.getElementsByTagName('parsererror').length, ns: d.documentElement.namespaceURI, n: e.length,
          links: e.map(x => x.querySelector('link').getAttribute('href')), sums: e.map(x => x.querySelector('summary').textContent) }; }, await r.text());
      ok(r.status() === 200 && !p.err && p.ns === 'http://www.w3.org/2005/Atom' && p.n >= 1 && p.n <= 10, `feed ${feed}: valid Atom with ${p.n} entries`);
      ok(p.links.every(h => new RegExp(`^https://fastkiwi\\.app${feed.replace('releases.xml', 'releases/')}#(instafind|remember-me|lemon|instawords)$`).test(h)), `feed ${feed}: entries link to the on-site releases page`);
      ok(p.sums.every(s => s && !/<|https?:/.test(s)), `feed ${feed}: summaries are plain text`);
    }
    const xml = buildFeed(FIX, lang);
    const p = await page.evaluate(x => { const d = new DOMParser().parseFromString(x, 'application/xml'); return { err: !!d.getElementsByTagName('parsererror').length, ns: d.documentElement.namespaceURI, n: d.getElementsByTagName('entry').length,
      lang: d.documentElement.getAttribute('xml:lang'), sums: [...d.getElementsByTagName('summary')].map(s => s.textContent) }; }, xml);
    ok(!p.err && p.ns === 'http://www.w3.org/2005/Atom' && p.n === 10 && p.lang === lang && p.sums.every(s => s && !/<|https?:|\*\*/.test(s)), `feed generator (${lang}, fixtures): well-formed Atom, 10 plain-text entries`);
  }
  await ctx.close();
}

/* ---------- 9a. Store first (D-052): Remember Me is in the Store, so its Store badge is the first download on the home page ---------- */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const [lang, url] of [['en', '/'], ['ar', '/ar/']]) {
    await page.goto(BASE + url, { waitUntil: 'load' });
    const R = await page.evaluate(() => [...document.querySelectorAll('.dl-opts')].map(g => [...g.querySelectorAll('a.store-badge, a[data-dl]')].map(a => a.hasAttribute('data-store') ? 'store' : 'direct').join(',')));
    ok(R.length === 2 && R.every(r => r === 'store,direct'), `home-${lang}: Remember Me shows the Store badge first, then the direct installer (${R})`);
    const others = await page.evaluate(() => [...document.querySelectorAll('a[data-store]')].length);
    ok(others === 2, `home-${lang}: only Remember Me has a Store badge (${others})`);
  }
  await ctx.close();
}

/* ---------- 9b. Microsoft Store page (DRAFT): store/ and ar/store/ ----------
   STORE_DRAFT: until the first Store approval these pages are noindex, left out of sitemap.xml and not linked from any other page.
   This is a deliberate, documented exception to "every page is in the sitemap". On launch: remove the noindex meta, add both
   pages to sitemap.xml, link them, and set STORE_DRAFT = false so the checks below flip.
   ACCEPTED: the Store apps Microsoft has accepted. Only these show the badge, the Store link and the share helper; the others
   show a plain "Coming to Microsoft Store" line. The page's switch is data-accepted="yes|no" on each card (documented at the top
   of both page sources): when an app is accepted, flip it in store/ and ar/store/ and add the app's id here.
   Also checked: Lemon's direct download (the site's data-dl convention), InstaConvert "coming soon" without links, one winget line
   per app with a copy button (submissions pending), and no external scripts or third-party requests. */
{
  const STORE_DRAFT = false;
  const ACCEPTED = ['remember-me'];
  const IDS = { 'remember-me': '9NGB1F7T7JGN', instawords: '9P62P4WQSQNK', instafind: '9MTK4KMFQ657' };
  const ORDER = ['remember-me', 'instawords', 'instafind', 'lemon', 'instaconvert'];
  /* winget package IDs; every submission is still a pending PR in microsoft/winget-pkgs (RememberMe #461102, InstaFind #468100,
     Lemon #469478, InstaWords #469481). InstaConvert has no manifest, so no winget line. */
  const WINGET = { 'remember-me': 'Sarmad.RememberMe', instawords: 'Sarmad.InstaWords', instafind: 'Sarmad.InstaFind', lemon: 'Sarmad.Lemon' };
  const LEMON_DL = STATIC_DL['local-ai-chat']; // the asset local-ai-chat's release.yml publishes: local-ai-chat.exe
  /* official artwork from https://get.microsoft.com/images/en-us%20dark.svg and .../ar%20dark.svg, kept byte-for-byte (never altered) */
  const BADGES = { en: ['img/store/get-it-from-microsoft-en-us-dark.svg', '0e0cd666d0b351bc2680658faf8485a5d2d78d2ab14086d37fca7f0e8c12fa69'],
    ar: ['img/store/get-it-from-microsoft-ar-dark.svg', '0d15bd9f64ee490c8d451a27f3ab18d6727252062dfe2c5270c83b49fbb8780c'] };
  const TXT = { en: { soon: 'Coming to Microsoft Store.', soonDl: 'Direct download: coming soon.', wg: 'Submitted to winget, not accepted yet.', copied: 'Copied' },
    ar: { soon: 'قريباً في Microsoft Store.', soonDl: 'التنزيل المباشر: قريباً.', wg: 'أُرسل إلى winget ولم يُقبل بعد.', copied: 'تم النسخ' } };
  const { createHash } = await import('node:crypto');
  for (const [lang, [file, sha]] of Object.entries(BADGES)) {
    const buf = fs.readFileSync(path.join(ROOT, file));
    ok(createHash('sha256').update(buf).digest('hex') === sha && /^<svg width="161" height="44" viewBox="0 0 161 44"/.test(buf.toString()) && !/<script|https?:\/\/(?!www\.w3\.org)/.test(buf.toString()), `store: ${lang} badge is Microsoft's unaltered self-hosted SVG (${file})`);
  }
  /* the sources: the one script is the site's own site.js, no inline or external scripts, no tracker or analytics code */
  for (const f of ['store/index.html', 'ar/store/index.html']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8'), scripts = [...src.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
    ok(scripts.length === 1 && /^<script src="(\.\.\/)+site\.js" defer>$/.test(scripts[0]), `${f}: only the site's own site.js (${scripts})`);
    ok(!/googletagmanager|google-analytics|gtag\(|clarity\.ms|facebook\.net|fbq\(|plausible|matomo|hotjar|<iframe|https?:\/\/[^"'\s]*\.js\b/i.test(src), `${f}: no trackers, iframes or external scripts`);
    ok(/ACCEPT SWITCH/.test(src.split('<title>')[0]) && /data-accepted="no"/.test(src.split('<title>')[0]), `${f}: the accept switch is documented at the top of the source`);
  }
  for (const w of [1366, 390]) for (const [lang, url, other] of [['ar', '/ar/store/', '/store/'], ['en', '/store/', '/ar/store/']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    await offline(ctx);
    const page = await ctx.newPage(), offsite = [];
    page.on('request', r => { if (!r.url().startsWith(BASE)) offsite.push(r.url()); });
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    const S = await page.evaluate(() => {
      const shown = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      return {
        robots: [...document.querySelectorAll('meta[name=robots]')].map(m => m.content),
        draftNote: [...document.head.childNodes].some(n => n.nodeType === 8 && /remove this noindex/.test(n.textContent)),
        canonical: document.querySelector('link[rel=canonical]').href,
        lang: [...document.querySelectorAll('a.lang, a.lang-switch')].map(a => new URL(a.href).pathname),
        scripts: [...document.scripts].map(s => s.src),
        storeLinks: [...document.querySelectorAll('a[href^="https://apps.microsoft.com/"]')].filter(shown).map(a => a.closest('.st-app')?.id),
        focusable: [...document.querySelectorAll('.st-app[data-accepted="no"] a, .st-app[data-accepted="no"] button, .st-app[data-accepted="no"] summary')].filter(e => { e.focus(); return document.activeElement === e && e.closest('.st-in-store'); }).length,
        cards: [...document.querySelectorAll('.st-app')].map(c => { const b = c.querySelector('a.ms-badge'), i = b?.querySelector('img'), r = i?.getBoundingClientRect(), br = b?.getBoundingClientRect();
          return { id: c.id, sid: c.dataset.storeId, acc: c.dataset.accepted, href: b?.href, store: b?.hasAttribute('data-store'), img: i && new URL(i.src).pathname, alt: i?.alt, w: r?.width, h: r?.height, nat: i && i.naturalWidth / i.naturalHeight,
            pad: r && Math.min(r.top - br.top, br.bottom - r.bottom), badgeShown: shown(i), shareShown: shown(c.querySelector('.st-share')),
            soon: shown(c.querySelector('.st-soon')) ? c.querySelector('.st-soon').textContent.trim() : null, stid: c.querySelector('.st-id code')?.textContent,
            share: [...c.querySelectorAll('.st-share li')].map(li => li.querySelector('.st-url').textContent),
            copies: [...c.querySelectorAll('.st-share button[data-copy]')].map(x => x.dataset.copy),
            dl: [...c.querySelectorAll('a[data-dl]')].map(a => [a.dataset.dl, a.getAttribute('href'), !!a.querySelector('[data-dl-ver]'), shown(a)]),
            soonDl: c.querySelector('.st-soon-dl')?.textContent.trim(),
            winget: [...c.querySelectorAll('.st-winget')].map(x => ({ cmd: x.querySelector('code')?.textContent, copy: x.querySelector('button[data-copy]')?.dataset.copy, btn: shown(x.querySelector('button[data-copy]')), state: x.querySelector('.st-state')?.textContent })),
            links: [...c.querySelectorAll('a')].filter(shown).map(a => a.href) }; })
      };
    });
    const tag = `store ${lang}@${w}`, T = TXT[lang];
    ok(STORE_DRAFT ? JSON.stringify(S.robots) === '["noindex"]' && S.draftNote : S.robots.length === 0, `${tag}: draft is noindex with a "remove on launch" comment (${S.robots})`);
    ok(S.canonical === 'https://fastkiwi.app' + url && S.lang.length === 2 && S.lang.every(x => x === other), `${tag}: canonical and language switch`);
    ok(JSON.stringify(S.cards.map(c => c.id)) === JSON.stringify(ORDER), `${tag}: a card per app (${S.cards.map(c => c.id)})`);
    ok(JSON.stringify(S.cards.filter(c => c.sid).map(c => [c.id, c.sid])) === JSON.stringify(Object.entries(IDS)), `${tag}: the Store apps carry their Store IDs ${JSON.stringify(S.cards.map(c => c.sid))}`);
    ok(JSON.stringify([...new Set(S.storeLinks)]) === JSON.stringify(ACCEPTED), `${tag}: Store links shown only for accepted apps (${[...new Set(S.storeLinks)]})`);
    ok(S.focusable === 0, `${tag}: nothing of a not-yet-accepted app's Store block can take focus`);
    for (const c of S.cards) {
      if (c.sid) {
        const acc = ACCEPTED.includes(c.id), base = `https://apps.microsoft.com/detail/${IDS[c.id]}?referrer=appbadge&cid=`, tail = '&mode=full';
        ok(c.acc === (acc ? 'yes' : 'no'), `${tag} ${c.id}: data-accepted="${c.acc}" matches ACCEPTED`);
        ok(c.stid === IDS[c.id], `${tag} ${c.id}: Store ID ${c.stid} shown`);
        /* the markup is the same for every Store app, so flipping the switch is all it takes */
        ok(c.store && c.href === base + 'fastkiwi-site' + tail && c.img === '/' + BADGES[lang][0] && /Microsoft Store/.test(c.alt), `${tag} ${c.id}: badge markup links to ${base}fastkiwi-site${tail} with the self-hosted ${lang} badge (${c.href})`);
        const want = ['whatsapp', 'telegram', 'groups'].map(x => base + x + tail);
        ok(JSON.stringify(c.share) === JSON.stringify(want) && JSON.stringify(c.copies) === JSON.stringify(want), `${tag} ${c.id}: share links for WhatsApp, Telegram and groups with copy buttons`);
        if (acc) {
          ok(c.badgeShown && c.shareShown && c.soon === null, `${tag} ${c.id}: accepted: badge and share helper shown, no coming-soon line`);
          ok(c.h >= 32 && Math.abs(c.w / c.h - c.nat) < 0.02 && c.pad >= c.h / 4 - 0.5, `${tag} ${c.id}: badge ≥ 32 px tall, aspect ratio kept, quarter-height clear space (${c.w?.toFixed(1)}×${c.h?.toFixed(1)}, pad ${c.pad?.toFixed(1)})`);
        } else ok(!c.badgeShown && !c.shareShown && c.soon === T.soon && c.links.length === 0, `${tag} ${c.id}: not accepted yet: only "${T.soon}" (${c.soon}), no badge, Store link or share helper`);
      } else ok(c.acc === undefined && !c.href && c.share.length === 0, `${tag} ${c.id}: no Store ID, no Store block`);
      if (c.id === 'lemon') ok(c.dl.length === 1 && c.dl[0][0] === 'local-ai-chat' && c.dl[0][1] === LEMON_DL && DIRECT.test(new URL(LEMON_DL).pathname) && c.dl[0][2] && c.dl[0][3], `${tag} lemon: direct download ${LEMON_DL} with the site's data-dl convention ${JSON.stringify(c.dl)}`);
      else ok(c.dl.length === 0, `${tag} ${c.id}: no direct-download button`);
      if (c.id === 'instaconvert') ok(c.links.length === 0 && c.soonDl === T.soonDl && c.winget.length === 0, `${tag} instaconvert: "${T.soonDl}", no link and no winget line`);
      const wg = WINGET[c.id];
      if (wg) ok(c.winget.length === 1 && c.winget[0].cmd === `winget install --id ${wg} -e` && c.winget[0].copy === c.winget[0].cmd && c.winget[0].btn && c.winget[0].state.startsWith(T.wg), `${tag} ${c.id}: winget line "winget install --id ${wg} -e" with a copy button, marked as pending ${JSON.stringify(c.winget)}`);
    }
    /* open the share helper of an accepted app and copy a link; copy a winget command */
    const first = ACCEPTED[0];
    await page.click(`#${first} .st-share summary`);
    const btn = page.locator(`#${first} .st-share button[data-copy]`).nth(1);
    ok(await btn.isVisible(), `${tag}: copy button shown once the helper is open`);
    await btn.click(); await page.waitForTimeout(150);
    ok(await page.evaluate(() => navigator.clipboard.readText()) === `https://apps.microsoft.com/detail/${IDS[first]}?referrer=appbadge&cid=telegram&mode=full` && await btn.textContent() === T.copied, `${tag}: copy puts the Telegram link on the clipboard and says so`);
    const wbtn = page.locator('#instafind .st-winget button[data-copy]');
    await wbtn.click(); await page.waitForTimeout(150);
    ok(await page.evaluate(() => navigator.clipboard.readText()) === 'winget install --id Sarmad.InstaFind -e' && await wbtn.textContent() === T.copied, `${tag}: copy puts the winget command on the clipboard`);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(m.sw <= m.cw, `${tag}: no horizontal scroll with a share helper open`);
    ok(S.scripts.length === 1 && S.scripts[0] === BASE + '/site.js', `${tag}: no external scripts (${S.scripts})`);
    /* the only request off the site is site.js asking GitHub's API for Lemon's latest version (the site's download-button convention) */
    ok(offsite.every(u => /^https:\/\/api\.github\.com\/repos\/sarmadiq9090-coder\/local-ai-chat(\/releases(\?per_page=\d+)?)?$/.test(u)), `${tag}: no third-party requests, badges are self-hosted (${offsite})`);
    await checkLinks(page, tag);
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(150);
    if (SHOTS) await page.screenshot({ path: `${OUT}after-store-${lang}-${w}-share.png`, fullPage: true, animations: 'disabled' });
    await ctx.close();
  }
  /* with the API answering (mocked): Lemon's button resolves to the latest installer and downloads without leaving the page */
  for (const [lang, url] of [['ar', '/ar/store/'], ['en', '/store/']]) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    await mockApi(ctx); await blockGithubNav(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE + url, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    const a = page.locator('#lemon a[data-dl]');
    const [href, ver] = [await a.getAttribute('href'), await a.locator('[data-dl-ver]').textContent()];
    ok(/\/local-ai-chat\/releases\/download\/v2\.2\.0\/local-ai-chat\.exe$/.test(href) && ver === 'v2.2.0', `store ${lang}: Lemon's button resolves to the latest installer (${href} ${ver})`);
    const dlEvt = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
    await a.click();
    const got = await dlEvt;
    ok(got && /\/v2\.2\.0\/local-ai-chat\.exe$/.test(got.url()) && page.url().startsWith(BASE), `store ${lang}: Lemon's download gets the file and stays on the page`);
    await checkLinks(page, `store ${lang} live`);
    await ctx.close();
  }
  /* draft: not in the sitemap and not linked from anywhere else on the site */
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  ok(STORE_DRAFT === !/fastkiwi\.app\/(ar\/)?store\//.test(sm), `store: ${STORE_DRAFT ? 'draft left out of' : 'listed in'} sitemap.xml`);
  const linking = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name), rel = path.relative(ROOT, f);
      if (e.isDirectory()) { if (!/^(node_modules|tests|\.git|tools|\.sync)$/.test(rel) && rel !== path.join('store') && rel !== path.join('ar', 'store')) walk(f); }
      else if (/\.(html|xml|txt|js)$/.test(e.name) && /href="[^"]*\bstore\/"|fastkiwi\.app\/(ar\/)?store\//.test(fs.readFileSync(f, 'utf8'))) linking.push(rel);
    }
  })(ROOT);
  if (STORE_DRAFT) ok(linking.length === 0, `store: draft not linked from other pages (${linking})`);
}

/* ---------- 10. privacy policy: one section per app + the site, summary table, effective date, contact, SEO, footer links everywhere ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await offline(ctx);
  const page = await ctx.newPage();
  const APPS = ['instafind', 'remember-me', 'lemon', 'instawords', 'site'];
  const ISSUES = ['arabic-file-search', 'Remember-Me', 'local-ai-chat', 'InstaWords'].map(r => GH + r + '/issues/new');
  let offsite = [];
  page.on('request', r => { if (!r.url().startsWith(BASE)) offsite.push(r.url()); });
  for (const [lang, url, other] of [['en', '/privacy/', '/ar/privacy/'], ['ar', '/ar/privacy/', '/privacy/']]) {
    offsite = [];
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    const P = await page.evaluate(() => ({
      canonical: document.querySelector('link[rel=canonical]').href,
      hreflang: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map(l => l.hreflang + ' ' + l.href).sort(),
      lang: [...document.querySelectorAll('a.lang, a.lang-switch')].map(a => new URL(a.href).pathname),
      date: document.querySelector('time[datetime]')?.getAttribute('datetime'),
      sections: [...document.querySelectorAll('section.pv-app[id]')].map(s => s.id),
      sectionText: Object.fromEntries([...document.querySelectorAll('section.pv-app[id]')].map(s => [s.id, s.textContent])),
      rows: [...document.querySelectorAll('#summary + .table-wrap tbody tr')].map(r => ({ to: r.querySelector('th a')?.getAttribute('href'), cells: r.querySelectorAll('td').length })),
      contact: [...document.querySelectorAll('#contact ~ .pv-contact a')].map(a => [a.href, a.hasAttribute('data-github'), /GitHub/.test(a.textContent)]),
      support: !!document.querySelector('a[href="../#support"]'),
      store: (() => { const h = document.getElementById('store'), b = h?.nextElementSibling; return h && b?.matches('.pv-store') ? { title: h.textContent, text: b.textContent, apps: [...b.querySelectorAll('li strong')].map(s => s.textContent),
        afterSummary: !!(document.getElementById('summary').compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING), beforeApps: !!(h.compareDocumentPosition(document.getElementById('apps')) & Node.DOCUMENT_POSITION_FOLLOWING) } : null; })(),
      scripts: document.scripts.length
    }));
    const tag = `privacy ${lang}`;
    ok(P.canonical === 'https://fastkiwi.app' + url, `${tag}: canonical ${P.canonical}`);
    ok(JSON.stringify(P.hreflang) === JSON.stringify(['ar https://fastkiwi.app/ar/privacy/', 'en https://fastkiwi.app/privacy/', 'x-default https://fastkiwi.app/privacy/']), `${tag}: hreflang ${P.hreflang}`);
    ok(P.lang.length === 2 && P.lang.every(x => x === other), `${tag}: language switches go to ${other} (${P.lang})`);
    ok(P.date === '2026-11-06', `${tag}: effective date ${P.date}`);
    ok(JSON.stringify(P.sections) === JSON.stringify(APPS), `${tag}: one section per app and the site (${P.sections})`);
    ok(P.rows.length === 5 && P.rows.every((r, i) => r.to === '#' + APPS[i] && r.cells === 2), `${tag}: summary table, a row per app linking to its section ${JSON.stringify(P.rows)}`);
    ok(/open\.er-api\.com/.test(P.sectionText.instafind) && /BahthSari/.test(P.sectionText.instafind), `${tag}: InstaFind names the exchange-rate host and its data folder`);
    ok(/Google Drive/.test(P.sectionText['remember-me']) && /Remember Me/.test(P.sectionText['remember-me']), `${tag}: Remember Me covers Google Drive backups`);
    /* Lemon's crash.txt (merged in local-ai-chat main, not released yet) goes back on the page, and into this check, in the week Lemon ships it. */
    ok(/127\.0\.0\.1/.test(P.sectionText.lemon) && !/crash\.txt/.test(P.sectionText.lemon), `${tag}: Lemon covers local Ollama (crash.txt not until the release that has it)`);
    ok(/crash\.log/.test(P.sectionText.instawords) && /FastKiwi\\InstaWords/.test(P.sectionText.instawords), `${tag}: InstaWords covers its data folder and crash.log`);
    ok(/GitHub Pages/.test(P.sectionText.site), `${tag}: the site section names its host`);
    ok(P.contact.length === 4 && P.contact.every(([h, gh, t], i) => h === ISSUES[i] && gh && t), `${tag}: contact = each app's labelled GitHub issues link ${JSON.stringify(P.contact)}`);
    ok(P.support, `${tag}: links to the on-site Support section`);
    /* Microsoft Store copies: one block, Store updates (no own update check), package folder removed on uninstall, Microsoft's own data collection */
    const S = P.store;
    ok(S && /Microsoft Store/.test(S.title) && (lang === 'en' ? /copies/.test(S.title) : /النسخ المنزّلة/.test(S.title)) && S.afterSummary && S.beforeApps, `${tag}: "Microsoft Store copies" section between the summary and the apps (${S && S.title})`);
    ok(S && S.apps.length === 3 && ['InstaWords', lang === 'en' ? 'Remember Me' : 'ذكرني', 'InstaFind'].every((a, i) => S.apps[i].startsWith(a)), `${tag}: Store section covers InstaWords, Remember Me and InstaFind (${S && S.apps})`);
    ok(S && S.text.includes('%LOCALAPPDATA%\\Packages\\<package family>\\') && S.text.includes('%APPDATA%') && S.text.includes('FastKiwi.InstaWords_sm1xjmj6v76yc') && S.text.includes('FastKiwi.RememberMeReminders_sm1xjmj6v76yc'), `${tag}: Store section names the package data folders`);
    ok(S && (lang === 'en' ? /does not run the app’s own update check/.test(S.text) && /uninstall/.test(S.text) && /Microsoft Store itself may collect data/.test(S.text) && /in preparation/.test(S.text)
      : /لا تشغّل فحص التحديثات/.test(S.text) && /عند إزالة البرنامج/.test(S.text) && /قد يجمع Microsoft Store نفسه بيانات/.test(S.text) && /قيد التحضير/.test(S.text)), `${tag}: Store section: Store updates, removed on uninstall, InstaFind not yet released, Microsoft's own data collection`);
    ok(P.scripts === 0 && offsite.length === 0, `${tag}: no scripts and no third-party requests (${offsite})`);
    await checkLinks(page, tag);
  }
  /* every full page links to the privacy page of its language from the footer */
  for (const [u, want] of [['/', '/privacy/'], ['/ar/', '/ar/privacy/'], ['/releases/', '/privacy/'], ['/ar/releases/', '/ar/privacy/'], ['/lemon/', '/privacy/'], ['/ar/lemon/', '/ar/privacy/'], ['/instawords/', '/ar/privacy/']]) {
    await page.goto(BASE + u, { waitUntil: 'domcontentloaded' });
    const f = await page.evaluate(() => [...document.querySelectorAll('footer a')].map(a => new URL(a.href)).filter(x => /\/privacy\/$/.test(x.pathname)).map(x => [x.hostname, x.pathname]));
    ok(f.length >= 1 && f.every(([h, p]) => p === want && (h === 'fastkiwi.app' || h === new URL(BASE).hostname)), `footer ${u}: privacy link to ${want} (${JSON.stringify(f)})`);
  }
  await ctx.close();
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  for (const u of ['https://fastkiwi.app/privacy/', 'https://fastkiwi.app/ar/privacy/']) {
    const entry = sm.split('<url>').find(e => e.includes(`<loc>${u}</loc>`)) || '';
    ok(/<lastmod>2026-11-06<\/lastmod>/.test(entry) && entry.includes('hreflang="en" href="https://fastkiwi.app/privacy/"') && entry.includes('hreflang="ar" href="https://fastkiwi.app/ar/privacy/"'), `sitemap: ${u} with lastmod and hreflang`);
  }
}

/* ---------- 11. support pages: reach us without GitHub (one config spot in site.js), what to include, per-app GitHub issue links, privacy link ---------- */
{
  const SITE_JS = fs.readFileSync(path.join(ROOT, 'site.js'), 'utf8');
  const cfg = SITE_JS.match(/var SUPPORT_CONTACT = \{ email: '([^']*)', telegram: '([^']*)' \};/);
  ok(cfg && (SITE_JS.match(/SUPPORT_CONTACT = /g) || []).length === 1, 'support: site.js has exactly one SUPPORT_CONTACT = { email, telegram } config');
  const ISSUES = { InstaFind: 'arabic-file-search', 'Remember Me': 'Remember-Me', 'ذكرني': 'Remember-Me', Lemon: 'local-ai-chat', InstaWords: 'InstaWords' };
  const read = page => page.evaluate(() => {
    const vis = e => !!e && !e.closest('[hidden]') && !!e.getClientRects().length;
    return {
      canonical: document.querySelector('link[rel=canonical]').href,
      hreflang: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map(l => l.hreflang + ' ' + l.href).sort(),
      lang: [...document.querySelectorAll('a.lang, a.lang-switch')].map(a => new URL(a.href).pathname),
      ids: ['contact', 'include', 'github', 'privacy'].filter(id => document.getElementById(id)),
      soon: vis(document.querySelector('[data-support-soon]')),
      contact: [...document.querySelectorAll('[data-support-contact] a[data-contact]')].filter(vis).map(a => [a.dataset.contact, a.getAttribute('href'), a.textContent.trim()]),
      steps: [...document.querySelectorAll('#include ~ .card .steps li')].map(li => li.textContent),
      never: document.querySelector('.sp-never')?.textContent || '',
      issues: [...document.querySelectorAll('#github ~ .sp-apps .card')].map(c => ({ app: c.querySelector('h3').textContent.replace('™', ''), href: c.querySelector('a[data-github]')?.href, text: c.querySelector('a[data-github]')?.textContent })),
      privacy: [...document.querySelectorAll('#privacy ~ p a')].map(a => a.getAttribute('href')),
      footer: [...document.querySelectorAll('footer a')].map(a => new URL(a.href).pathname)
    };
  });
  for (const js of [true, false]) for (const w of [1366, 390]) for (const [lang, url, other] of [['en', '/support/', '/ar/support/'], ['ar', '/ar/support/', '/support/']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce', javaScriptEnabled: js });
    await offline(ctx);
    const page = await ctx.newPage(); let offsite = [];
    page.on('request', r => { if (!r.url().startsWith(BASE)) offsite.push(r.url()); });
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    const S = await read(page), tag = `support ${lang}@${w}${js ? '' : ' (no JS)'}`;
    ok(S.canonical === 'https://fastkiwi.app' + url, `${tag}: canonical ${S.canonical}`);
    ok(JSON.stringify(S.hreflang) === JSON.stringify(['ar https://fastkiwi.app/ar/support/', 'en https://fastkiwi.app/support/', 'x-default https://fastkiwi.app/support/']), `${tag}: hreflang ${S.hreflang}`);
    ok(S.lang.length === 2 && S.lang.every(x => x === other), `${tag}: language switches go to ${other} (${S.lang})`);
    ok(S.ids.length === 4, `${tag}: contact, what-to-include, GitHub and privacy sections (${S.ids})`);
    /* support@fastkiwi.app is live: the email card is in the HTML (shown with or without JavaScript), and it matches site.js */
    ok(!S.soon && S.contact.length === 1 && S.contact[0][0] === 'email' && S.contact[0][1] === 'mailto:support@fastkiwi.app' && S.contact[0][1] === 'mailto:' + (cfg && cfg[1]), `${tag}: the support email (mailto:support@fastkiwi.app, same as SUPPORT_CONTACT) shows, no "coming soon" note ${JSON.stringify(S.contact)}`);
    ok(S.steps.length === 4 && [/InstaWords/, lang === 'en' ? /version/ : /إصدار البرنامج/, /winver/, lang === 'en' ? /step by step/ : /خطوة بخطوة/].every((re, i) => re.test(S.steps[i])), `${tag}: what to include: app, version, Windows version, steps`);
    ok(lang === 'en' ? /Amounts/.test(S.never) && /personal/.test(S.never) : /المبالغ/.test(S.never) && /شخصية/.test(S.never), `${tag}: "never include" names amounts and personal data`);
    ok(S.issues.length === 4 && S.issues.every(x => x.href === `${GH}${ISSUES[x.app]}/issues/new` && (lang === 'en' ? x.text === 'Open a GitHub issue (needs a GitHub account)' : /GitHub/.test(x.text) && /يحتاج حساباً على GitHub/.test(x.text))), `${tag}: a labelled "needs a GitHub account" issue link per app ${JSON.stringify(S.issues)}`);
    ok(S.privacy.includes('../privacy/'), `${tag}: links to the privacy policy (${S.privacy})`);
    ok(S.footer.includes(url) && S.footer.includes(url.replace('support', 'privacy')), `${tag}: footer links Support and Privacy`);
    ok(offsite.length === 0, `${tag}: no third-party requests (${offsite})`);
    if (js) await checkLinks(page, tag);
    if (SHOTS && js) await page.screenshot({ path: `${OUT}after-support-${lang}-${w}.png`, fullPage: true, animations: 'disabled' });
    await ctx.close();
  }
  /* the same pages once a Telegram link is filled in too (site.js served with the config set) */
  for (const [lang, url] of [['en', '/support/'], ['ar', '/ar/support/']]) for (const w of [1366, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    await offline(ctx);
    await ctx.route(/\/site\.js$/, r => r.fulfill({ contentType: 'text/javascript', body: SITE_JS.replace(/var SUPPORT_CONTACT = \{[^}]*\};/, "var SUPPORT_CONTACT = { email: 'help@example.org', telegram: 'https://t.me/example_support' };") }));
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    const S = await read(page), tag = `support ${lang}@${w} (configured)`;
    ok(!S.soon && JSON.stringify(S.contact.map(c => c.slice(0, 2))) === JSON.stringify([['email', 'mailto:support@fastkiwi.app'], ['telegram', 'https://t.me/example_support']]) && /Telegram/.test(S.contact[1][2]), `${tag}: the page's email card stays (no duplicate) and a labelled Telegram card is added once configured ${JSON.stringify(S.contact)}`);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(m.sw <= m.cw && !errs.length, `${tag}: no horizontal scroll, no errors ${errs}`);
    if (SHOTS) await page.locator('#contact + [data-support-contact]').screenshot({ path: `${OUT}after-support-${lang}-${w}-configured.png` });
    await ctx.close();
  }
  /* reached from the home Support section, the home footer and the other pages' footers */
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await offline(ctx);
  const page = await ctx.newPage();
  for (const [u, want] of [['/', '/support/'], ['/ar/', '/ar/support/'], ['/releases/', '/support/'], ['/ar/releases/', '/ar/support/'], ['/lemon/', '/support/'], ['/ar/lemon/', '/ar/support/'], ['/privacy/', '/support/'], ['/ar/privacy/', '/ar/support/']]) {
    await page.goto(BASE + u, { waitUntil: 'domcontentloaded' });
    const f = await page.evaluate(() => ({ foot: [...document.querySelectorAll('footer a')].map(a => new URL(a.href).pathname).filter(p => /\/support\/$/.test(p)),
      section: [...document.querySelectorAll('#support a')].map(a => new URL(a.href).pathname).filter(p => /\/support\/$/.test(p)), home: !!document.getElementById('support') }));
    ok(f.foot.length === 1 && f.foot[0] === want, `footer ${u}: Support link to ${want} (${f.foot})`);
    if (f.home) ok(f.section.length >= 2 && f.section.every(p => p === want), `home ${u}: #support section links to ${want} (${f.section})`);
  }
  await ctx.close();
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  for (const u of ['https://fastkiwi.app/support/', 'https://fastkiwi.app/ar/support/']) {
    const entry = sm.split('<url>').find(e => e.includes(`<loc>${u}</loc>`)) || '';
    ok(/<lastmod>\d{4}-\d\d-\d\d<\/lastmod>/.test(entry) && entry.includes('hreflang="en" href="https://fastkiwi.app/support/"') && entry.includes('hreflang="ar" href="https://fastkiwi.app/ar/support/"'), `sitemap: ${u} with lastmod and hreflang`);
  }
}

/* ---------- 11b. official downloads: per app its fastkiwi.app page, labelled GitHub releases link, checksum, Store / winget / Scoop status; verify, warning, trademarks ---------- */
{
  const SRC = { // what each app really has (checked against its repo and release assets): checksum file, Store ID, winget ID, Scoop
    instawords: { repo: 'InstaWords', site: { en: '/instawords/', ar: '/instawords/' }, sha: 'SHA256SUMS.txt', store: '9P62P4WQSQNK', winget: 'Sarmad.InstaWords', scoop: false },
    instafind: { repo: 'arabic-file-search', site: { en: '/arabic-file-search/en/', ar: '/arabic-file-search/' }, sha: 'SHA256SUMS.txt', store: '9MTK4KMFQ657', winget: 'Sarmad.InstaFind', scoop: true },
    'remember-me': { repo: 'Remember-Me', site: { en: '/Remember-Me/', ar: '/Remember-Me/ar/' }, sha: 'SHA256SUMS.txt', store: '9NGB1F7T7JGN', winget: 'Sarmad.RememberMe', scoop: false },
    lemon: { repo: 'local-ai-chat', site: { en: '/lemon/', ar: '/ar/lemon/' }, sha: 'local-ai-chat.exe.sha256', store: null, winget: 'Sarmad.Lemon', scoop: false }
  };
  const STORE_LIVE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'apps.json'), 'utf8')).apps.filter(a => a.store?.live).map(a => a.id);
  const TM_EN = 'InstaWords™, InstaFind™, Remember Me™, Lemon™, InstaConvert™ and FastKiwi™ are trademarks of FastKiwi (Sarmad). The licences grant no trademark rights.';
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await offline(ctx);
  const page = await ctx.newPage();
  let offsite = [];
  page.on('request', r => { if (!r.url().startsWith(BASE)) offsite.push(r.url()); });
  for (const [lang, url, other] of [['en', '/downloads/', '/ar/downloads/'], ['ar', '/ar/downloads/', '/downloads/']]) {
    offsite = [];
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    const D = await page.evaluate(() => ({
      canonical: document.querySelector('link[rel=canonical]').href,
      hreflang: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map(l => l.hreflang + ' ' + l.href).sort(),
      lang: [...document.querySelectorAll('a.lang, a.lang-switch')].map(a => new URL(a.href).pathname),
      apps: [...document.querySelectorAll('.od-app[id]')].map(s => ({ id: s.id, title: s.querySelector('h3').textContent,
        rows: Object.fromEntries([...s.querySelectorAll('.od-src > div[data-src]')].map(d => [d.dataset.src, { text: d.querySelector('dd').textContent, links: [...d.querySelectorAll('a')].map(a => ({ href: a.href, gh: a.hasAttribute('data-github'), store: a.hasAttribute('data-store'), text: a.textContent })) }])),
        order: [...s.querySelectorAll('.od-src > div[data-src]')].map(d => d.dataset.src),
        links: s.querySelectorAll('a').length })),
      verify: document.querySelector('#verify + .card')?.textContent || '',
      warn: document.querySelector('#warning + .od-warn')?.textContent || '',
      tm: [...document.querySelectorAll('#trademarks ~ p')].map(p => p.textContent),
      tmLink: [...document.querySelectorAll('#trademarks ~ p a[data-github]')].map(a => [a.href, a.textContent]),
      footer: [...document.querySelectorAll('footer a')].map(a => new URL(a.href).pathname),
      scripts: document.scripts.length
    }));
    const tag = `downloads ${lang}`;
    ok(D.canonical === 'https://fastkiwi.app' + url, `${tag}: canonical ${D.canonical}`);
    ok(JSON.stringify(D.hreflang) === JSON.stringify(['ar https://fastkiwi.app/ar/downloads/', 'en https://fastkiwi.app/downloads/', 'x-default https://fastkiwi.app/downloads/']), `${tag}: hreflang ${D.hreflang}`);
    ok(D.lang.length === 2 && D.lang.every(x => x === other), `${tag}: language switches go to ${other} (${D.lang})`);
    ok(JSON.stringify(D.apps.map(a => a.id)) === JSON.stringify(['instawords', 'instafind', 'remember-me', 'lemon', 'instaconvert']), `${tag}: a card per app, InstaConvert last (${D.apps.map(a => a.id)})`);
    for (const a of D.apps) {
      ok(/™/.test(a.title), `${tag} ${a.id}: ™ in the heading (${a.title})`);
      const want = SRC[a.id];
      if (!want) { ok(a.links === 0 && Object.keys(a.rows).length === 0 && (lang === 'en' ? /coming soon/i : /قريباً/).test(a.title), `${tag} instaconvert: "coming soon", no links`); continue; }
      const R = a.rows, site = R.site?.links || [];
      const live = STORE_LIVE.includes(a.id);  /* owner's store-first rule: a live Store listing is the first source */
      ok(live ? a.order[0] === 'store' : a.order[0] === 'site', `${tag} ${a.id}: ${live ? 'Microsoft Store first (live in the Store)' : 'this site first'} (${a.order})`);
      ok(site.length === 2 && new URL(site[0].href).origin === BASE && new URL(site[0].href).pathname === want.site[lang] && new URL(site[1].href).pathname + new URL(site[1].href).hash === (lang === 'en' ? '/releases/#' : '/ar/releases/#') + a.id, `${tag} ${a.id}: its fastkiwi.app page and release notes ${JSON.stringify(site.map(l => l.href))}`);
      ok(R.github?.links.length === 1 && R.github.links[0].href === `${GH}${want.repo}/releases` && R.github.links[0].gh && /GitHub/.test(R.github.links[0].text), `${tag} ${a.id}: labelled GitHub releases link ${JSON.stringify(R.github)}`);
      if (want.sha) ok(R.sha256?.links.length === 1 && R.sha256.links[0].href === `${GH}${want.repo}/releases/latest/download/${want.sha}` && R.sha256.links[0].text === want.sha, `${tag} ${a.id}: direct link to the release's ${want.sha}`);
      else ok(R.sha256 && !R.sha256.links.some(l => /\/releases\/(latest\/)?download\//.test(l.href)) && R.sha256.links.some(l => new URL(l.href).hash === '#' + a.id), `${tag} ${a.id}: no checksum file, points to the SHA-256 shown on the site`);
      if (want.store && a.id === 'remember-me') ok(R.store && R.store.links.length === 1 && R.store.links[0].href === `https://apps.microsoft.com/detail/${want.store}?referrer=appbadge&cid=fastkiwi-site&mode=full` && R.store.links[0].store && R.store.text.includes(want.store), `${tag} ${a.id}: live in Microsoft Store, the official badge links to its Store page`);
      else if (want.store) ok(R.store && R.store.links.length === 0 && R.store.text.includes(want.store) && (lang === 'en' ? /Coming to Microsoft Store/ : /قريباً في Microsoft Store/).test(R.store.text), `${tag} ${a.id}: "coming to Microsoft Store" with its Store ID, no link or badge yet`);
      else ok(!R.store, `${tag} ${a.id}: no Store row`);
      ok(R.winget && R.winget.text.includes(`winget install ${want.winget}`) && (lang === 'en' ? /not accepted yet/ : /لم يُقبل بعد/).test(R.winget.text), `${tag} ${a.id}: winget ID ${want.winget}, marked as submitted, not accepted yet`);
      ok(!!R.scoop === want.scoop && (!want.scoop || (R.scoop.text.includes('scoop bucket add instafind https://github.com/sarmadiq9090-coder/arabic-file-search') && R.scoop.text.includes('scoop install instafind/instafind'))), `${tag} ${a.id}: Scoop only where a bucket exists`);
    }
    ok(D.verify.includes('Get-FileHash .\\file.exe -Algorithm SHA256') && (lang === 'en' ? /Compare/.test(D.verify) : /قارن/.test(D.verify)), `${tag}: how to verify with Get-FileHash`);
    ok(lang === 'en' ? ['other sites', 'cracked', 'pro', 'not ours', 'may be harmful', 'free', 'never ask for payment or personal data'].every(x => D.warn.includes(x))
      : ['مواقع أخرى', 'المكرَكة', 'pro', 'ليست منا', 'ضارة', 'مجانية', 'لا نطلب أبداً أي مبلغ أو بيانات شخصية'].every(x => D.warn.includes(x)), `${tag}: warning about other copies, cracked/pro versions, free, no payment or personal data`);
    ok(lang === 'en' ? D.tm[0] === TM_EN : /علامات تجارية لـ FastKiwi \(Sarmad\)/.test(D.tm[0]) && ['InstaWords™', 'InstaFind™', 'Remember Me™', 'Lemon™', 'InstaConvert™', 'FastKiwi™'].every(x => D.tm[0].includes(x)) && /لا تمنح أي حق في العلامات التجارية/.test(D.tm[0]), `${tag}: trademark note (${D.tm[0]})`);
    ok(D.tmLink.length === 1 && D.tmLink[0][0] === GH + 'InstaWords/blob/HEAD/TRADEMARKS.md' && /GitHub/.test(D.tmLink[0][1]), `${tag}: labelled link to InstaWords' TRADEMARKS.md ${JSON.stringify(D.tmLink)}`);
    ok(D.footer.includes(url) && D.footer.includes(url.replace('downloads', 'support')) && D.footer.includes(url.replace('downloads', 'privacy')), `${tag}: footer links Official downloads, Support and Privacy`);
    ok(D.scripts === 0 && offsite.length === 0, `${tag}: no scripts and no third-party requests (${offsite})`);
    await checkLinks(page, tag);
    for (const w of [1366, 390]) if (SHOTS) { await page.setViewportSize({ width: w, height: 900 }); await page.screenshot({ path: `${OUT}after-downloads-${lang}-${w}.png`, fullPage: true, animations: 'disabled' }); }
    await page.setViewportSize({ width: 1366, height: 900 });
  }
  /* every full page links to the official downloads page of its language from the footer */
  for (const [u, want] of [['/', '/downloads/'], ['/ar/', '/ar/downloads/'], ['/releases/', '/downloads/'], ['/ar/releases/', '/ar/downloads/'], ['/lemon/', '/downloads/'], ['/ar/lemon/', '/ar/downloads/'], ['/privacy/', '/downloads/'], ['/ar/privacy/', '/ar/downloads/'], ['/support/', '/downloads/'], ['/ar/support/', '/ar/downloads/']]) {
    await page.goto(BASE + u, { waitUntil: 'domcontentloaded' });
    const f = await page.evaluate(() => [...document.querySelectorAll('footer a')].map(a => new URL(a.href).pathname).filter(p => /\/downloads\/$/.test(p)));
    ok(f.length === 1 && f[0] === want, `footer ${u}: Official downloads link to ${want} (${f})`);
  }
  /* ™ after the app names in headings only: never in JSON-LD names */
  for (const [f, sel] of [['index.html', /<h3>(InstaFind|Remember Me|Lemon|InstaWords)™ <span class="sub">/g], ['ar/index.html', /<h3><bdi>(InstaFind|Lemon|InstaWords)™<\/bdi> <span class="sub">|<span class="sub" lang="en"><bdi>Remember Me™<\/bdi><\/span>/g], ['releases/index.html', /-title">(InstaFind|Remember Me|Lemon|InstaWords)™ </g], ['ar/releases/index.html', /-title"><bdi>(InstaFind|Lemon|InstaWords)™<\/bdi> |<span class="sub"><bdi>Remember Me™<\/bdi><\/span>/g]]) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok((html.match(sel) || []).length === 4, `${f}: ™ after the four app names in their headings`);
    ok(![...html.matchAll(/"(?:name|alternateName)":\s*"([^"]*)"/g)].some(m => m[1].includes('™')), `${f}: JSON-LD names without ™`);
  }
  await ctx.close();
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  for (const u of ['https://fastkiwi.app/downloads/', 'https://fastkiwi.app/ar/downloads/']) {
    const entry = sm.split('<url>').find(e => e.includes(`<loc>${u}</loc>`)) || '';
    ok(/<lastmod>\d{4}-\d\d-\d\d<\/lastmod>/.test(entry) && entry.includes('hreflang="en" href="https://fastkiwi.app/downloads/"') && entry.includes('hreflang="ar" href="https://fastkiwi.app/ar/downloads/"') && entry.includes('hreflang="x-default" href="https://fastkiwi.app/downloads/"'), `sitemap: ${u} with lastmod and hreflang`);
  }
}

/* ---------- 12. InstaWords: both homes link to instawords/ (one page with a language choice) until InstaWords publishes
   English pages (instawords/en/); then restore the en/ links, the sitemap alternates and these checks. ---------- */
{
  const html = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const iwLinks = f => [...html(f).matchAll(/<a\b[^>]*href="((?:\.\.\/)?instawords\/[^"#]*)"/g)].map(m => m[1]);
  const en = iwLinks('index.html'), ar = iwLinks('ar/index.html');
  ok(en.length >= 4 && en.every(h => h === 'instawords/'), `home-en: InstaWords links open instawords/ (${en})`);
  ok(ar.length >= 4 && ar.every(h => h === '../instawords/'), `home-ar: InstaWords links open the Arabic pages (${ar})`);
  ok(html('index.html').includes('"url": "https://fastkiwi.app/instawords/"') && html('ar/index.html').includes('"url": "https://fastkiwi.app/instawords/"'), 'home JSON-LD: InstaWords URL');
  const sm = html('sitemap.xml'), B = 'https://fastkiwi.app/instawords/';
  for (const page of ['', 'bulk.html', 'excel.html']) ok(sm.includes(`<loc>${B}${page}</loc>`), `sitemap: ${B}${page}`);
  ok(!sm.includes(`${B}en/`), 'sitemap: no instawords/en/ URL while those pages do not exist');
  if (IW_EN) for (const f of ['index.html', 'bulk.html', 'excel.html']) {
    const p = path.join(ROOT, 'instawords', 'en', f);
    if (fs.existsSync(p)) ok(/<html lang="en" dir="ltr">/.test(fs.readFileSync(p, 'utf8')), `instawords/en/${f}: English page synced from tafket`);
  }
}

await browser.close();
server.close();
fs.writeFileSync(OUT + 'qa-report.json', JSON.stringify(report, null, 2));
console.log('GitHub links per page:'); for (const [k, v] of Object.entries(report.github)) console.log(' ', k, v.length);
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
