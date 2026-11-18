// Schema check for data/apps.json, the one "More from FastKiwi" list the apps copy at build time
// (docs/apps-data.md). Run: node --test tests/apps-data.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data', 'apps.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const apps = data.apps;

const APP_KEYS = ['id', 'status', 'name', 'tagline', 'description', 'url', 'store', 'winget', 'icon'];
const STATUS = ['released', 'coming-soon'];
const ARABIC = /[؀-ۿ]/;
const sameKeys = (obj, keys, where) => assert.deepEqual(Object.keys(obj).sort(), [...keys].sort(), `${where}: keys`);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Like tests/qa.mjs: instawords/en/ is synced from tafket, so a checkout may not have it yet.
// /arabic-file-search/ and /Remember-Me/ are those repos' own GitHub Pages, served on fastkiwi.app.
const IW_EN = fs.existsSync(path.join(ROOT, 'instawords', 'en', 'index.html'));
const PROJECT_SITES = ['/arabic-file-search/', '/Remember-Me/'];
function sitePathExists(p) {
  if (!IW_EN && p.startsWith('/instawords/en/')) return true;
  if (PROJECT_SITES.some(s => p.startsWith(s))) return true;
  let f = path.join(ROOT, decodeURIComponent(p));
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); return fs.existsSync(f); } catch { return false; }
}

test('top level: schema 1 and a non-empty apps list, nothing else', () => {
  sameKeys(data, ['schema', 'apps'], 'apps.json');
  assert.equal(data.schema, 1, 'schema version (bump it only for a breaking change, and tell every app)');
  assert.ok(Array.isArray(apps) && apps.length > 0, 'apps is a non-empty array');
});

test('every app has exactly the documented fields, with valid values', () => {
  const ids = new Set();
  for (const a of apps) {
    assert.ok(isObj(a), 'each app is an object');
    const where = a.id || JSON.stringify(a).slice(0, 40);
    sameKeys(a, APP_KEYS, where);
    assert.match(a.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${where}: id is lower-case kebab-case`);
    assert.ok(!ids.has(a.id), `${where}: id is unique`);
    ids.add(a.id);
    assert.ok(STATUS.includes(a.status), `${where}: status is one of ${STATUS}`);

    for (const field of ['name', 'tagline', 'description']) {
      assert.ok(isObj(a[field]), `${where}.${field} is an object`);
      sameKeys(a[field], ['ar', 'en'], `${where}.${field}`);
      for (const lang of ['ar', 'en']) {
        const s = a[field][lang];
        assert.equal(typeof s, 'string', `${where}.${field}.${lang} is a string`);
        assert.equal(s, s.trim(), `${where}.${field}.${lang}: no leading/trailing spaces`);
        assert.ok(s.length > 0, `${where}.${field}.${lang} is not empty`);
        assert.doesNotMatch(s, /[\n\r\t<>]|https?:/, `${where}.${field}.${lang}: one plain line, no markup or links`);
      }
      assert.doesNotMatch(a[field].en, ARABIC, `${where}.${field}.en has no Arabic`);
    }
    for (const field of ['tagline', 'description']) assert.match(a[field].ar, ARABIC, `${where}.${field}.ar is Arabic`);
    assert.ok(a.name.en.length <= 30 && a.tagline.ar.length <= 40 && a.tagline.en.length <= 40, `${where}: short name and tagline`);
    for (const lang of ['ar', 'en']) assert.ok(a.description[lang].length <= 160, `${where}.description.${lang}: one line (<= 160 characters)`);

    assert.ok(isObj(a.url), `${where}.url is an object`);
    sameKeys(a.url, ['ar', 'en'], `${where}.url`);
    for (const lang of ['ar', 'en']) {
      const u = new URL(a.url[lang]);
      assert.equal(u.origin, 'https://fastkiwi.app', `${where}.url.${lang} is on fastkiwi.app`);
      assert.ok(sitePathExists(u.pathname), `${where}.url.${lang}: ${u.pathname} exists in this repo`);
    }

    for (const [field, id] of [['store', /^9[A-Z0-9]{11}$/], ['winget', /^[A-Za-z0-9-]+\.[A-Za-z0-9.-]+$/]]) {
      const v = a[field];
      if (v === null) continue;
      assert.ok(isObj(v), `${where}.${field} is null or an object`);
      sameKeys(v, ['id', 'live'], `${where}.${field}`);
      assert.match(v.id, id, `${where}.${field}.id format`);
      assert.equal(typeof v.live, 'boolean', `${where}.${field}.live is true or false`);
      if (a.status !== 'released') assert.equal(v.live, false, `${where}: not released, so not live in ${field}`);
    }

    assert.match(a.icon, /^img\/[a-z0-9-]+\.(svg|png|webp)$/, `${where}.icon is a file in img/`);
    assert.ok(fs.statSync(path.join(ROOT, a.icon)).size > 0, `${where}.icon: ${a.icon} exists`);
  }
});

test('Store IDs and winget ids match the official downloads page', () => {
  const page = fs.readFileSync(path.join(ROOT, 'downloads', 'index.html'), 'utf8');
  for (const a of apps) {
    const card = page.match(new RegExp(`<section[^>]*id="${a.id}"[\\s\\S]*?</section>`));
    assert.ok(card, `${a.id}: has a card on downloads/`);
    if (a.store) assert.ok(card[0].includes(`<code>${a.store.id}</code>`), `${a.id}: Store ID ${a.store.id} on downloads/`);
    else assert.doesNotMatch(card[0], /data-src="store"/, `${a.id}: no Store ID in apps.json, none on downloads/`);
    if (a.winget) assert.ok(card[0].includes(`winget install ${a.winget.id}<`), `${a.id}: winget id ${a.winget.id} on downloads/`);
    else assert.doesNotMatch(card[0], /data-src="winget"/, `${a.id}: no winget id in apps.json, none on downloads/`);
  }
});

test('icons follow the owner decisions', () => {
  const byId = Object.fromEntries(apps.map(a => [a.id, a]));
  const bytes = f => fs.readFileSync(path.join(ROOT, f));
  const brandFiles = dir => fs.readdirSync(path.join(ROOT, dir), { recursive: true })
    .map(f => path.join(dir, f)).filter(f => fs.statSync(path.join(ROOT, f)).isFile());
  // Lemon and InstaFind keep their legacy icons (2026-11-06): never a brand v2 master.
  for (const id of ['lemon', 'instafind']) {
    const icon = bytes(byId[id].icon);
    for (const f of brandFiles(`brand/icons/${id}`)) assert.ok(!icon.equals(bytes(f)), `${id}: legacy icon, not the brand v2 file ${f}`);
  }
  // InstaWords uses its brand icon (the pen nib): the site copy is the brand master.
  assert.ok(bytes(byId.instawords.icon).equals(bytes('brand/icons/instawords/instawords.svg')), 'instawords: icon is brand/icons/instawords/instawords.svg');
});
