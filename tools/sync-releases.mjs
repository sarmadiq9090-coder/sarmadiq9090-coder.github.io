#!/usr/bin/env node
// Refreshes the parts of the site that follow the apps' GitHub releases:
//   1. the static InstaWords installer link (+ version label, JSON-LD) used when the API can't be reached,
//   2. releases.xml (English) and ar/releases.xml (Arabic): Atom feeds of the latest ~10 releases,
//   3. the feed links, shown only once the feeds exist.
// Usage: node tools/sync-releases.mjs [--root <site dir>] [--fixture <releases.json>] [--limit 10]
//   GITHUB_TOKEN (optional) raises the API rate limit. --fixture reads {repo: [releases]} instead of the API (tests).
// Nothing is written unless every app's releases were read, so a GitHub outage never publishes a partial feed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPOS, fetchReleases, buildFeed, latestInstaWords, applyInstaWordsFallback, setFeedVisibility } from './releases.mjs';

const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const root = path.resolve(opt('--root') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const limit = +(opt('--limit') || 10);

let data = {};
if (opt('--fixture')) data = JSON.parse(fs.readFileSync(opt('--fixture'), 'utf8'));
else for (const repo of REPOS) data[repo] = await fetchReleases(repo);
const missing = REPOS.filter(r => !Array.isArray(data[r]));
if (missing.length) { console.error('sync-releases: no release data for', missing.join(', ')); process.exit(1); }

const changed = [];
const iw = latestInstaWords(data.tafket);
if (iw) changed.push(...applyInstaWordsFallback(root, iw).map(f => `${f} (InstaWords ${iw.version})`));
else console.warn('sync-releases: no stable InstaWords release with an x64 installer; fallback left as is');

for (const [lang, file] of [['en', 'releases.xml'], ['ar', 'ar/releases.xml']]) {
  const p = path.join(root, file), xml = buildFeed(data, lang, { limit });
  if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== xml) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, xml); changed.push(file); }
}
changed.push(...setFeedVisibility(root).map(f => `${f} (feed links)`));
console.log(changed.length ? 'sync-releases: updated\n  ' + changed.join('\n  ') : 'sync-releases: nothing changed');
