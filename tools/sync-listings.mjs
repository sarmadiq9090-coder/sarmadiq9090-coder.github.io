// Checks every app-store listing in data/listings.json and shows or hides its button on the site.
// A listing counts as live only when its page answers 200 and names our package id (a same-named app by someone else stays hidden).
// A page that cannot be checked (network error, bot wall such as 403/429/503) keeps its previous state.
// Usage: node tools/sync-listings.mjs [--offline]   (--offline: only re-apply data/listings.json to the pages, no network)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data', 'listings.json');
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const offline = process.argv.includes('--offline');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

async function probe(l) {
  try {
    const r = await fetch(l.url, { headers: { 'user-agent': UA, 'accept-language': 'en' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (r.status === 404 || r.status === 410) return false;
    if (r.status !== 200) return null;
    const body = await r.text();
    return body.includes(l.pkg);
  } catch { return null; }
}

export function apply(html, listings) {
  // each button: <a class="store-chip" data-listing="ID" href="URL"[ hidden]>…</a>
  return html.replace(/<a class="store-chip" data-listing="([a-z0-9-]+)" href="([^"]*)"( hidden)?>/g, (m, id) => {
    const l = listings.find(x => x.id === id);
    if (!l) throw new Error(`unknown listing ${id}`);
    return `<a class="store-chip" data-listing="${id}" href="${l.url}"${l.live ? '' : ' hidden'}>`;
  });
}

function htmlFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, out); else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

if (!offline) {
  for (const l of data.listings) {
    const live = await probe(l);
    console.log(`${l.id}: ${live === null ? 'unchecked, kept ' + l.live : live ? 'live' : 'not live'}`);
    if (live !== null) l.live = live;
  }
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2).replace(/\{\n\s+("id"[^}]*?)\n\s+\}/g, (m, inner) => '{ ' + inner.replace(/,\n\s+/g, ', ') + ' }') + '\n');
}
let changed = 0;
for (const f of htmlFiles(ROOT)) {
  const s = fs.readFileSync(f, 'utf8');
  if (!s.includes('data-listing=')) continue;
  const t = apply(s, data.listings);
  if (t !== s) { fs.writeFileSync(f, t); changed++; }
}
console.log(`pages updated: ${changed}`);
