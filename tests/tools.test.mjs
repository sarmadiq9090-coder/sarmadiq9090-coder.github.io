// Tests for tools/ (release feed, InstaWords fallback, feed-link visibility), on a temporary copy of the site.
// Run: node --test tests/tools.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FIX } from './fixtures.mjs';
import { plainSummary, buildFeed, latestInstaWords, setFeedVisibility, FEED_PAGES, FALLBACK_FILES } from '../tools/releases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SYNC = path.join(ROOT, 'tools', 'sync-releases.mjs');
function siteCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-site-'));
  for (const f of new Set([...FALLBACK_FILES, ...Object.keys(FEED_PAGES)])) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); }
  fs.writeFileSync(path.join(dir, 'fix.json'), JSON.stringify(FIX));
  return dir;
}
const run = (dir, ...extra) => execFileSync(process.execPath, [SYNC, '--root', dir, '--fixture', path.join(dir, 'fix.json'), ...extra]).toString();
const entries = x => [...x.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => ({
  title: m[1].match(/<title>([^<]*)<\/title>/)[1], link: m[1].match(/<link rel="alternate" type="text\/html" href="([^"]+)"\/>/)[1],
  updated: m[1].match(/<updated>([^<]+)<\/updated>/)[1], summary: m[1].match(/<summary type="text">([^<]*)<\/summary>/)[1] }));
const unescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test('the committed site has no feed yet, or a feed with visible links', () => {
  for (const [f, feed] of Object.entries(FEED_PAGES)) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8'), present = fs.existsSync(path.join(ROOT, feed));
    assert.equal(/data-feed hidden/.test(html), !present, `${f}: feed links ${present ? 'shown' : 'hidden'}`);
    assert.equal((html.match(/<link rel="alternate" type="application\/atom\+xml"/g) || []).length, present ? 1 : 0, `${f}: <link rel=alternate> only with a feed`);
  }
});

test('plain-text summaries: no HTML or markdown, the feed language preferred', () => {
  const iw = FIX.tafket[0].body, lemon = FIX['local-ai-chat'][0].body, rm = FIX['Remember-Me'][1].body, inst = FIX['arabic-file-search'][0].body;
  for (const [body, lang] of [[iw, 'en'], [iw, 'ar'], [lemon, 'en'], [lemon, 'ar'], [rm, 'en'], [inst, 'en'], [inst, 'ar']]) {
    const s = plainSummary(body, lang);
    assert.ok(s.length > 20 && s.length <= 281, `length ${s.length}`);
    assert.doesNotMatch(s, /<|>|\*\*|__|`|\]\(|https?:|@\w|^#|window\.__xss/, s);
  }
  assert.match(plainSummary(iw, 'en'), /^A native Windows app/);
  assert.match(plainSummary(iw, 'ar'), /^برنامج Windows أصلي/);
  assert.match(plainSummary(lemon, 'en'), /New name: Lemon/);
  assert.match(plainSummary(lemon, 'ar'), /الاسم الجديد: Lemon/);
  assert.match(plainSummary(inst, 'en'), /^Apps by their Arabic spelling/);
  assert.match(plainSummary(inst, 'ar'), /^البرامج بأسمائها العربية/);
  assert.equal(plainSummary(FIX['Remember-Me'][1].body, 'en').includes('New Contributors'), false);
  assert.equal(plainSummary('', 'en'), '');
  assert.equal(plainSummary('## Only a heading', 'en'), '');
});

test('feeds: newest 10 stable releases, on-site links, valid escaping', () => {
  for (const lang of ['en', 'ar']) {
    const x = buildFeed(FIX, lang), e = entries(x);
    assert.match(x, /^<\?xml version="1\.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/);
    assert.match(x, new RegExp(`<link rel="self" type="application/atom\\+xml" href="https://fastkiwi\\.app/${lang === 'ar' ? 'ar/' : ''}releases\\.xml"/>`));
    assert.equal(e.length, 10);
    assert.ok(e.every((y, i) => !i || y.updated <= e[i - 1].updated), 'sorted newest first');
    assert.ok(e.every(y => new RegExp(`^https://fastkiwi\\.app/${lang === 'ar' ? 'ar/' : ''}releases/#(instafind|remember-me|lemon|instawords)$`).test(y.link)), 'links stay on fastkiwi.app');
    assert.ok(!e.some(y => /beta/.test(y.title)), 'no pre-releases');
    assert.ok(e.every(y => y.summary && !/<|https?:/.test(unescape(y.summary))), 'summaries are plain text');
    assert.equal(x.match(/<updated>[^<]+<\/updated>/)[0], `<updated>${e[0].updated}</updated>`, 'feed date = newest entry (no churn)');
    assert.doesNotMatch(x.replace(/&(amp|lt|gt|quot);/g, ''), /&/, 'every & escaped');
  }
  assert.match(buildFeed(FIX, 'ar'), /<title>Lemon · الذكاء الاصطناعي المحلي v2\.2\.0<\/title>/);
});

test('sync tool: updates the InstaWords fallback, writes the feeds, shows the links; idempotent', () => {
  const dir = siteCopy();
  assert.deepEqual(latestInstaWords(FIX.tafket), { tag: 'v2.0.1', version: '2.0.1', name: 'InstaWords_2.0.1_x64-setup.exe' });
  const out = run(dir);
  assert.match(out, /releases\.xml/);
  for (const f of ['index.html', 'ar/index.html']) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.equal((s.match(/tafket\/releases\/download\/v2\.0\.1\/InstaWords_2\.0\.1_x64-setup\.exe" data-dl="tafket"/g) || []).length, 2, f);
    assert.equal((s.match(/data-dl-ver>v2\.0\.1</g) || []).length, 2, f);
    assert.match(s, /"softwareVersion": "2\.0\.1", "downloadUrl": "https:\/\/github\.com\/sarmadiq9090-coder\/tafket\/releases\/download\/v2\.0\.1\/InstaWords_2\.0\.1_x64-setup\.exe"/);
    assert.doesNotMatch(s, /InstaWords_2\.0\.0/);
  }
  assert.match(fs.readFileSync(path.join(dir, 'site.js'), 'utf8'), /'\/tafket\/releases\/download\/v2\.0\.1\/InstaWords_2\.0\.1_x64-setup\.exe'/);
  for (const f of ['releases/index.html', 'ar/releases/index.html']) assert.match(fs.readFileSync(path.join(dir, f), 'utf8'), /download\/v2\.0\.1\/InstaWords_2\.0\.1_x64-setup\.exe">InstaWords_2\.0\.1_x64-setup\.exe</);
  for (const [f, feed] of Object.entries(FEED_PAGES)) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(s, /data-feed hidden/, f);
    assert.equal(s.split(`type="application/atom+xml" title=`).length - 1, 1, f);
    assert.match(s, new RegExp(`<link rel="alternate" type="application/atom\\+xml" title="[^"]+" href="${feed.replace(/\./g, '\\.')}">`), f);
  }
  assert.match(run(dir), /nothing changed/);
  // feed removed again: links hide, <link rel=alternate> goes
  fs.rmSync(path.join(dir, 'releases.xml')); fs.rmSync(path.join(dir, 'ar/releases.xml'));
  setFeedVisibility(dir);
  for (const f of Object.keys(FEED_PAGES)) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.match(s, /data-feed hidden/); assert.doesNotMatch(s, /application\/atom\+xml" title=/);
  }
  fs.rmSync(dir, { recursive: true });
});

test('sync tool: refuses to write anything when an app has no data', () => {
  const dir = siteCopy();
  // Works whether or not the repo already holds feeds (e.g. when run inside the sync job
  // after the tool has updated the real site): start from a copy without feeds.
  for (const f of ['releases.xml', 'ar/releases.xml']) fs.rmSync(path.join(dir, f), { force: true });
  setFeedVisibility(dir);
  const pages = ['index.html', 'ar/index.html', 'site.js', ...Object.keys(FEED_PAGES)];
  const before = Object.fromEntries(pages.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
  const partial = { ...FIX }; delete partial['local-ai-chat'];
  fs.writeFileSync(path.join(dir, 'fix.json'), JSON.stringify(partial));
  assert.throws(() => run(dir));
  assert.ok(!fs.existsSync(path.join(dir, 'releases.xml')));
  assert.ok(!fs.existsSync(path.join(dir, 'ar/releases.xml')));
  for (const f of pages) assert.equal(fs.readFileSync(path.join(dir, f), 'utf8'), before[f], f);
  assert.match(before['index.html'], /data-feed hidden/);
  fs.rmSync(dir, { recursive: true });
});
