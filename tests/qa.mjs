// FastKiwi site QA (home, releases, Lemon, privacy policy, 404, redirects, feeds) in a real browser.
// Run from the repo root: npm test   (or: node tests/qa.mjs [--no-shots])
// Screenshots and qa-report.json go to tests/output/ (or $QA_OUT). The site is served from this checkout on a free port.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
/* the static download links (used until the API answers); InstaWords' version is kept in step by tools/sync-releases.mjs */
const GH = 'https://github.com/sarmadiq9090-coder/';
const IW_V = fs.readFileSync(path.join(ROOT, 'site.js'), 'utf8').match(/\/tafket\/releases\/download\/v([\d.]+)\/InstaWords_\1_x64-setup\.exe/)[1];
const STATIC_DL = { 'arabic-file-search': GH + 'arabic-file-search/releases/latest/download/bahth.exe', 'Remember-Me': GH + 'Remember-Me/releases/latest',
  'local-ai-chat': GH + 'local-ai-chat/releases/latest/download/local-ai-chat.exe', 'tafket': `${GH}tafket/releases/download/v${IW_V}/InstaWords_${IW_V}_x64-setup.exe` };
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
      ok(exists(u.pathname) || PROJECT_SITES.some(p => u.pathname.startsWith(p)), `${name}: internal link ${u.pathname} does not exist`);
      if (u.hash && u.pathname.endsWith('/releases/')) ok(['#instafind', '#remember-me', '#lemon', '#instawords'].includes(u.hash), `${name}: releases deep link ${u.hash}`);
    } else if (u.hostname === 'github.com') {
      github.push(l);
      const download = DIRECT.test(u.pathname);
      const rmFallback = l.dl === 'Remember-Me' && /\/releases\/latest$/.test(u.pathname); // intercepted by site.js -> on-site dialog
      ok(download || rmFallback || (l.gh && /GitHub/.test(l.text)), `${name}: github link not an explicit GitHub button: ${l.text} -> ${l.href}`);
    } else if (u.hostname === 'apps.microsoft.com') { // Microsoft Store links: the one allowed exception to staying on the site, always the labelled badge
      ok(l.store && /^\/detail\/9[A-Z0-9]{11}$/.test(u.pathname) && /^\?referrer=appbadge&cid=[a-z-]+&mode=full$/.test(u.search), `${name}: Microsoft Store link is a badge link with a campaign ID: ${l.href}`);
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
      wide: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.stage, .rp-switch ul, .md-table, .table-wrap, pre, .sr-only, .skip'); }).slice(0, 3).map(e => e.tagName + '.' + e.className),
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
      if (name.startsWith('home') && w >= 720) { await page.evaluate(() => document.querySelector('.stage-wrap').dispatchEvent(new MouseEvent('mouseenter'))); await page.waitForTimeout(900); } // hold the rotation still for the picture
      await page.screenshot({ path: `${OUT}after-${name}-${w}.png`, fullPage: true, animations: 'disabled' });
    }
    report.pages[`${name}@${w}`] = { scrollWidth: m.sw, errors: errs.length };
    await page.close();
  }
  await ctx.close();
}

/* ---------- 2. hero stage geometry (desktop deck + phone carousel), incl. Windows zoom 125%/150% ---------- */
for (const lang of ['en', 'ar']) {
  for (const w of [1920, 1536, 1366, 1280, 1229, 1180, 1024, 820, 768, 414, 390, 360]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    await offline(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE + (lang === 'en' ? '/' : '/ar/'), { waitUntil: 'networkidle' });
    const geo = async () => page.evaluate(() => {
      const r = e => e.getBoundingClientRect(), s = r(document.querySelector('.stage')), tl = r(document.querySelector('.tablist')), tb = r(document.querySelector('.tabs'));
      const wins = [...document.querySelectorAll('.stage .win')].map(e => r(e));
      const copy = r(document.querySelector('.hero-copy')), wrap = r(document.querySelector('.stage-wrap'));
      return { s: { l: s.left, r: s.right, t: s.top, b: s.bottom, h: s.height }, wins: wins.map(x => ({ l: x.left, r: x.right, t: x.top, b: x.bottom })), tl: { l: tl.left, r: tl.right }, tabs: { l: tb.left, r: tb.right },
        overlap: !(copy.right <= wrap.left || wrap.right <= copy.left || copy.bottom <= wrap.top || wrap.bottom <= copy.top), vw: innerWidth };
    });
    if (w >= 720) {
      const heights = new Set();
      for (let i = 0; i < 4; i++) {
        await page.click(`.tablist [role=tab] >> nth=${i}`); await page.waitForTimeout(80);
        const g = await geo(); heights.add(Math.round(g.s.h));
        const pads = g.wins.map(x => Math.min(x.l - g.s.l, g.s.r - x.r, x.t - g.s.t, g.s.b - x.b));
        ok(Math.min(...pads) >= 10, `hero ${lang}@${w} tab ${i}: deck inside its backdrop (min gap ${Math.min(...pads).toFixed(1)})`);
        const front = g.wins[i];
        const gaps = [front.l - g.s.l, g.s.r - front.r, front.b > 0 ? g.s.b - front.b : 0];
        ok(Math.abs(gaps[0] - gaps[1]) < 2 && Math.abs(gaps[0] - gaps[2]) < 3, `hero ${lang}@${w}: even padding around the front window ${gaps.map(x => x.toFixed(1))}`);
        ok(Math.abs(g.wins.reduce((a, x) => Math.min(a, x.t), 1e9) - g.s.t - gaps[0]) < 3, `hero ${lang}@${w}: top padding matches`);
        ok(Math.abs((g.tl.l + g.tl.r) / 2 - (g.s.l + g.s.r) / 2) < 30 && g.tabs.l >= g.s.l - 1 && g.tabs.r <= g.s.r + 1, `hero ${lang}@${w}: tab bar centred under the stage`);
        ok(!g.overlap, `hero ${lang}@${w}: stage does not overlap the text`);
        if (SHOTS && (w === 1366 || w === 1024)) await page.screenshot({ path: `${OUT}after-hero-${lang}-${w}-${i + 1}.png`, clip: { x: 0, y: 0, width: w, height: 900 } });
      }
      ok(heights.size === 1, `hero ${lang}@${w}: no layout shift between tabs (${[...heights]})`);
    } else {
      const g = await geo(), first = g.wins[0];
      const left = first.l - g.s.l, right = g.s.r - first.r;
      ok(Math.abs(left - right) < 2, `carousel ${lang}@${w}: first window centred (${left.toFixed(1)} / ${right.toFixed(1)})`);
      ok(Math.abs((g.tl.l + g.tl.r) / 2 - w / 2) < 2, `carousel ${lang}@${w}: tabs centred`);
      const peek = await page.evaluate(() => { const s = document.querySelector('.stage').getBoundingClientRect(), n = document.querySelector('#win-remember').getBoundingClientRect(); return document.documentElement.dir === 'rtl' ? n.right - s.left : s.right - n.left; });
      ok(peek > 8 && peek < 50, `carousel ${lang}@${w}: deliberate small peek of the next window (${peek.toFixed(1)}px)`);
      // tap the 3rd tab: that window is centred, the page does not jump
      const y0 = await page.evaluate(() => scrollY);
      await page.locator('#tab-lemon').dispatchEvent('click'); await page.waitForTimeout(700);
      const g2 = await geo(), lw = g2.wins[2];
      ok(Math.abs((lw.l - g2.s.l) - (g2.s.r - lw.r)) < 3 && await page.evaluate(() => scrollY) === y0, `carousel ${lang}@${w}: tab centres its window without page jump`);
      await page.evaluate(() => document.querySelector('.stage').scrollBy({ left: document.documentElement.dir === 'rtl' ? 400 : -400 })); await page.waitForTimeout(500);
      ok(await page.evaluate(() => document.querySelector('#tab-remember').getAttribute('aria-selected')) === 'true', `carousel ${lang}@${w}: tabs follow a swipe`);
      if (SHOTS) { const st = page.locator('.stage-wrap'); await page.evaluate(() => document.querySelector('.stage').scrollTo({ left: 0 })); await page.waitForTimeout(400); await st.screenshot({ path: `${OUT}after-carousel-${lang}-${w}.png` }); }
    }
    await ctx.close();
  }
}
{ // keyboard + rotation behaviour
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await offline(ctx);
  const page = await ctx.newPage();
  await page.goto(BASE + '/ar/', { waitUntil: 'networkidle' });
  await page.mouse.move(5, 890);
  const front = () => page.evaluate(() => document.querySelector('.stage .win[data-pos="0"]').id);
  ok(await front() === 'win-instafind', 'rotation: starts on InstaFind');
  await page.waitForTimeout(5600);
  ok(await front() === 'win-remember', 'rotation: advanced after ~5 s');
  await page.hover('.stage'); await page.waitForTimeout(5600);
  ok(await front() === 'win-remember', 'rotation: paused on hover');
  await page.mouse.move(5, 890); await page.click('.playpause'); await page.mouse.move(5, 890); await page.waitForTimeout(5600);
  ok(await front() === 'win-remember', 'rotation: pause button stops it');
  await page.focus('#tab-remember'); await page.keyboard.press('ArrowLeft');
  ok(await page.evaluate(() => document.activeElement.id) === 'tab-lemon', 'hero ar: ArrowLeft moves forward in RTL');
  await page.keyboard.press('End'); ok(await front() === 'win-instawords', 'hero: End key');
  await page.keyboard.press('Home'); ok(await front() === 'win-instafind', 'hero: Home key');
  await ctx.close();
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
    const fb = { instafind: /\/arabic-file-search\/releases\/latest\/download\/bahth\.exe$/, lemon: /\/local-ai-chat\/releases\/latest\/download\/local-ai-chat\.exe$/, instawords: new RegExp(`/tafket/releases/download/v${IW_V.replace(/\./g, '\\.')}/InstaWords_${IW_V.replace(/\./g, '\\.')}_x64-setup\\.exe$`) };
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

/* ---------- 8. hero InstaFind window: the richer real capture, whole (nothing cropped) and sharp ---------- */
for (const lang of ['en', 'ar']) for (const w of [1366, 1024, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
  await offline(ctx);
  const page = await ctx.newPage();
  await page.goto(BASE + (lang === 'en' ? '/' : '/ar/'), { waitUntil: 'networkidle' });
  const s = await page.evaluate(() => {
    const i = document.querySelector('#win-instafind .screen img'), b = i.parentElement.getBoundingClientRect(), r = i.getBoundingClientRect();
    return { src: i.currentSrc, nw: i.naturalWidth, nh: i.naturalHeight, ok: i.complete, box: [b.left, b.top, b.width, b.height], img: [r.left, r.top, r.width, r.height], fp: i.getAttribute('fetchpriority'), lazy: i.loading };
  });
  const tag = `hero InstaFind ${lang}@${w}`;
  ok(s.ok && new RegExp(`/img/instafind-${lang}(-640)?\\.webp$`).test(s.src) && Math.abs(s.nw / s.nh - 960 / 571) < 0.01, `${tag}: new capture ${s.src} ${s.nw}x${s.nh}`);
  ok(s.img.every((v, k) => Math.abs(v - s.box[k]) < 1.5), `${tag}: whole capture visible (img ${s.img.map(Math.round)} in ${s.box.map(Math.round)})`);
  ok(s.nw >= s.box[2] * 0.98, `${tag}: sharp (${s.nw}px source for ${Math.round(s.box[2])}px)`);
  ok(s.fp === 'high' && s.lazy !== 'lazy', `${tag}: hero image loads first`);
  if (SHOTS && w !== 1024) await page.locator('.stage-wrap').screenshot({ path: `${OUT}after-hero-instafind-${lang}-${w}.png` });
  await ctx.close();
}
for (const lang of ['en', 'ar']) for (const f of [`img/instafind-${lang}.webp`, `img/instafind-${lang}-640.webp`, `img/instafind-${lang}.png`, `img/instafind-demo-${lang}.mp4`])
  ok(fs.existsSync(path.join(ROOT, f)), `${f} exists (the PNG stays as the demo video's poster)`);

/* ---------- 9. release feeds: links shown only with a feed; the generator's output parses as Atom ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await offline(ctx);
  const page = await ctx.newPage();
  for (const [lang, pages, feed] of [['en', ['/', '/releases/', '/lemon/', '/privacy/'], '/releases.xml'], ['ar', ['/ar/', '/ar/releases/', '/ar/lemon/', '/ar/privacy/'], '/ar/releases.xml']]) {
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

/* ---------- 9b. Microsoft Store page (DRAFT): store/ and ar/store/ ----------
   STORE_DRAFT: until the first Store approval these pages are noindex, left out of sitemap.xml and not linked from any other page.
   This is a deliberate, documented exception to "every page is in the sitemap". On launch: remove the noindex meta, add both
   pages to sitemap.xml, link them, and set STORE_DRAFT = false so the checks below flip. */
{
  const STORE_DRAFT = true;
  const IDS = { instawords: '9P62P4WQSQNK', 'remember-me': '9NGB1F7T7JGN', instafind: '9MTK4KMFQ657' };
  /* official artwork from https://get.microsoft.com/images/en-us%20dark.svg and .../ar%20dark.svg, kept byte-for-byte (never altered) */
  const BADGES = { en: ['img/store/get-it-from-microsoft-en-us-dark.svg', '0e0cd666d0b351bc2680658faf8485a5d2d78d2ab14086d37fca7f0e8c12fa69'],
    ar: ['img/store/get-it-from-microsoft-ar-dark.svg', '0d15bd9f64ee490c8d451a27f3ab18d6727252062dfe2c5270c83b49fbb8780c'] };
  const { createHash } = await import('node:crypto');
  for (const [lang, [file, sha]] of Object.entries(BADGES)) {
    const buf = fs.readFileSync(path.join(ROOT, file));
    ok(createHash('sha256').update(buf).digest('hex') === sha && /^<svg width="161" height="44" viewBox="0 0 161 44"/.test(buf.toString()) && !/<script|https?:\/\/(?!www\.w3\.org)/.test(buf.toString()), `store: ${lang} badge is Microsoft's unaltered self-hosted SVG (${file})`);
  }
  for (const w of [1366, 390]) for (const [lang, url, other] of [['en', '/store/', '/ar/store/'], ['ar', '/ar/store/', '/store/']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    await offline(ctx);
    const page = await ctx.newPage(), offsite = [];
    page.on('request', r => { if (!r.url().startsWith(BASE)) offsite.push(r.url()); });
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    const S = await page.evaluate(() => ({
      robots: [...document.querySelectorAll('meta[name=robots]')].map(m => m.content),
      draftNote: [...document.head.childNodes].some(n => n.nodeType === 8 && /remove this noindex/.test(n.textContent)),
      canonical: document.querySelector('link[rel=canonical]').href,
      lang: [...document.querySelectorAll('a.lang, a.lang-switch')].map(a => new URL(a.href).pathname),
      cards: [...document.querySelectorAll('.st-app')].map(c => { const b = c.querySelector('a.ms-badge'), i = b?.querySelector('img'), r = i?.getBoundingClientRect(), br = b?.getBoundingClientRect();
        return { id: c.id, sid: c.dataset.storeId, href: b?.href, store: b?.hasAttribute('data-store'), img: i && new URL(i.src).pathname, alt: i?.alt, w: r?.width, h: r?.height, nat: i && i.naturalWidth / i.naturalHeight,
          pad: r && Math.min(r.top - br.top, br.bottom - r.bottom), share: [...c.querySelectorAll('.st-share li')].map(li => li.querySelector('.st-url').textContent),
          copies: [...c.querySelectorAll('.st-share button[data-copy]')].map(x => x.dataset.copy) }; })
    }));
    const tag = `store ${lang}@${w}`;
    ok(STORE_DRAFT ? JSON.stringify(S.robots) === '["noindex"]' && S.draftNote : S.robots.length === 0, `${tag}: draft is noindex with a "remove on launch" comment (${S.robots})`);
    ok(S.canonical === 'https://fastkiwi.app' + url && S.lang.length === 2 && S.lang.every(x => x === other), `${tag}: canonical and language switch`);
    ok(JSON.stringify(S.cards.map(c => [c.id, c.sid])) === JSON.stringify(Object.entries(IDS)), `${tag}: one card per app with its Store ID ${JSON.stringify(S.cards.map(c => c.sid))}`);
    for (const c of S.cards) {
      const base = `https://apps.microsoft.com/detail/${IDS[c.id]}?referrer=appbadge&cid=`, tail = '&mode=full';
      ok(c.store && c.href === base + 'fastkiwi-site' + tail, `${tag} ${c.id}: badge links to ${base}fastkiwi-site${tail} (${c.href})`);
      ok(c.img === '/' + BADGES[lang][0] && /Microsoft Store/.test(c.alt), `${tag} ${c.id}: the self-hosted ${lang} badge with alt text (${c.img})`);
      ok(c.h >= 32 && Math.abs(c.w / c.h - c.nat) < 0.02 && c.pad >= c.h / 4 - 0.5, `${tag} ${c.id}: badge ≥ 32 px tall, aspect ratio kept, quarter-height clear space (${c.w?.toFixed(1)}×${c.h?.toFixed(1)}, pad ${c.pad?.toFixed(1)})`);
      const want = ['whatsapp', 'telegram', 'groups'].map(x => base + x + tail);
      ok(JSON.stringify(c.share) === JSON.stringify(want) && JSON.stringify(c.copies) === JSON.stringify(want), `${tag} ${c.id}: share links for WhatsApp, Telegram and groups with copy buttons`);
    }
    /* open one share helper and copy a link */
    await page.click('#remember-me .st-share summary');
    const btn = page.locator('#remember-me .st-share button[data-copy]').nth(1);
    ok(await btn.isVisible(), `${tag}: copy button shown once the helper is open`);
    await btn.click(); await page.waitForTimeout(150);
    ok(await page.evaluate(() => navigator.clipboard.readText()) === 'https://apps.microsoft.com/detail/9NGB1F7T7JGN?referrer=appbadge&cid=telegram&mode=full' && await btn.textContent() === (lang === 'en' ? 'Copied' : 'تم النسخ'), `${tag}: copy puts the Telegram link on the clipboard and says so`);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(m.sw <= m.cw, `${tag}: no horizontal scroll with a share helper open`);
    ok(offsite.length === 0, `${tag}: no third-party requests, badges are self-hosted (${offsite})`);
    await checkLinks(page, tag);
    if (SHOTS) await page.screenshot({ path: `${OUT}after-store-${lang}-${w}-share.png`, fullPage: true, animations: 'disabled' });
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
  const ISSUES = ['arabic-file-search', 'Remember-Me', 'local-ai-chat', 'tafket'].map(r => GH + r + '/issues/new');
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
      scripts: document.scripts.length
    }));
    const tag = `privacy ${lang}`;
    ok(P.canonical === 'https://fastkiwi.app' + url, `${tag}: canonical ${P.canonical}`);
    ok(JSON.stringify(P.hreflang) === JSON.stringify(['ar https://fastkiwi.app/ar/privacy/', 'en https://fastkiwi.app/privacy/', 'x-default https://fastkiwi.app/privacy/']), `${tag}: hreflang ${P.hreflang}`);
    ok(P.lang.length === 2 && P.lang.every(x => x === other), `${tag}: language switches go to ${other} (${P.lang})`);
    ok(P.date === '2026-11-03', `${tag}: effective date ${P.date}`);
    ok(JSON.stringify(P.sections) === JSON.stringify(APPS), `${tag}: one section per app and the site (${P.sections})`);
    ok(P.rows.length === 5 && P.rows.every((r, i) => r.to === '#' + APPS[i] && r.cells === 2), `${tag}: summary table, a row per app linking to its section ${JSON.stringify(P.rows)}`);
    ok(/open\.er-api\.com/.test(P.sectionText.instafind) && /BahthSari/.test(P.sectionText.instafind), `${tag}: InstaFind names the exchange-rate host and its data folder`);
    ok(/Google Drive/.test(P.sectionText['remember-me']) && /Remember Me/.test(P.sectionText['remember-me']), `${tag}: Remember Me covers Google Drive backups`);
    ok(/127\.0\.0\.1/.test(P.sectionText.lemon) && /crash\.txt/.test(P.sectionText.lemon), `${tag}: Lemon covers local Ollama and crash.txt`);
    ok(/crash\.log/.test(P.sectionText.instawords) && /FastKiwi\\InstaWords/.test(P.sectionText.instawords), `${tag}: InstaWords covers its data folder and crash.log`);
    ok(/GitHub Pages/.test(P.sectionText.site), `${tag}: the site section names its host`);
    ok(P.contact.length === 4 && P.contact.every(([h, gh, t], i) => h === ISSUES[i] && gh && t), `${tag}: contact = each app's labelled GitHub issues link ${JSON.stringify(P.contact)}`);
    ok(P.support, `${tag}: links to the on-site Support section`);
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
    ok(/<lastmod>2026-11-03<\/lastmod>/.test(entry) && entry.includes('hreflang="en" href="https://fastkiwi.app/privacy/"') && entry.includes('hreflang="ar" href="https://fastkiwi.app/ar/privacy/"'), `sitemap: ${u} with lastmod and hreflang`);
  }
}

await browser.close();
server.close();
fs.writeFileSync(OUT + 'qa-report.json', JSON.stringify(report, null, 2));
console.log('GitHub links per page:'); for (const [k, v] of Object.entries(report.github)) console.log(' ', k, v.length);
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
