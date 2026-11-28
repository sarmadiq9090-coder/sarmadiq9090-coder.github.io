#!/usr/bin/env node
// Turns the public CSV of the game-localization requests (a Google Form owned by FastKiwi, answers published as CSV)
// into data/game-requests.json, which games/requests/ and ar/games/requests/ render. Node >= 22, no dependencies.
// Usage: node tools/sync-game-requests.mjs [--root <site dir>] [--file <responses.csv>] [--url <csv url>]
//   --file reads a local CSV instead of fetching (tests, offline use). GAME_REQUESTS_CSV_URL overrides the default URL.
// Nothing is written when the fetch fails, and the file is only rewritten when its content changes (the output has no
// "now" timestamp: `updated` is the date of the newest request, so identical input gives byte-identical output).
// Requests are public: URLs, e-mail addresses and control characters are stripped, lengths are capped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vStIvpzSsT1eM_XmjHX3x8kuOlU8V1LLD0bT3YDIohEZt8tXBsS8yUFO_SRrMlSoy_WsAng5dA1Z3lR/pub?gid=119119638&single=true&output=csv';
export const MAX_NAME = 80, MAX_NOTE = 300, MAX_NOTES = 5, MAX_GAMES = 300;

/** RFC 4180 CSV: quoted fields, "" escapes, newlines inside quotes, CRLF or LF, BOM. Returns an array of rows (arrays of strings). */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], field = '', quoted = false, i = 0, started = false;
  const endRow = () => { row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; started = false; };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; started = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; started = true; i++; continue; }
    if (c === '\r') { i++; if (text[i] === '\n') i++; endRow(); continue; }
    if (c === '\n') { i++; endRow(); continue; }
    field += c; started = true; i++;
  }
  if (started || field !== '' || row.length) endRow();
  return rows;
}

const URL_RE = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S*/gi;
const EMAIL_RE = /\S+@\S+\.\S+/g;
const DOMAIN_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|gg|tv|me|ly|app|dev|xyz|ru|cn|info|biz|co|ws|to|cc|link|click|shop|store|site|online|top|vip)\b(?:\/\S*)?/gi;
// control characters and invisible/bidi formatting characters (kept out of public text)
const INVISIBLE_RE = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;

/** Removes links, e-mail addresses and bare domains. */
export function stripUrls(s) { return String(s ?? '').replace(URL_RE, ' ').replace(EMAIL_RE, ' ').replace(DOMAIN_RE, ' '); }

/** Plain public text: no URLs, no control or invisible characters, one-line spaces, trimmed, capped at `max` characters (not UTF-16 units). */
export function cleanText(s, max) {
  let t = String(s ?? '').replace(/[\r\n\t\u2028\u2029]+/g, ' ');
  t = stripUrls(t).replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  return (chars.length > max ? chars.slice(0, max).join('').trim() : t);
}

/** The key two spellings of the same game share: case, spaces, punctuation, diacritics, tatweel, hamza-alef forms and digit shapes folded. */
export function normaliseName(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')                 // Arabic diacritics, tatweel
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه') // alef with hamza/madda/wasla, alef maqsura, ta marbuta
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0))
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** "11/28/2026 14:03:22" (US order, Google's default), "28/11/2026 ..." when the first number can't be a month, or ISO. Returns ms (UTC) or null. */
export function parseTimestamp(s) {
  s = String(s ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s), y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s))) {
    y = +m[3]; mo = +m[1]; d = +m[2];
    if (mo > 12 && d <= 12) [mo, d] = [d, mo];
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return Number.isNaN(t) || new Date(t).getUTCMonth() !== mo - 1 ? null : t;
}

/** CSV text -> clean rows [{ts, name, note}]. The header row, rows without a readable timestamp and rows without a real game name are dropped. */
export function toRequests(csvText) {
  const out = [];
  for (const r of parseCsv(csvText)) {
    const ts = parseTimestamp(r[0]); if (ts === null) continue;
    const name = cleanText(r[1], MAX_NAME);
    if ([...name].length < 2 || !/\p{L}/u.test(name)) continue; // empty, one character, or no letters at all (punctuation, digits only)
    out.push({ ts, name, note: cleanText(r[2], MAX_NOTE) });
  }
  return out;
}

const isoDay = ts => new Date(ts).toISOString().slice(0, 10);

/** Groups rows by normaliseName; sorted by count, then newest, then key. Display name = the most used spelling (newest wins a tie). */
export function groupRequests(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = normaliseName(r.name); if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, items: [] });
    groups.get(key).items.push(r);
  }
  const list = [];
  for (const g of groups.values()) {
    const spell = new Map();
    for (const it of g.items) { const e = spell.get(it.name) || { n: 0, ts: 0 }; e.n++; e.ts = Math.max(e.ts, it.ts); spell.set(it.name, e); }
    const name = [...spell.entries()].sort((a, b) => b[1].n - a[1].n || b[1].ts - a[1].ts || (a[0] < b[0] ? -1 : 1))[0][0];
    const latest = Math.max(...g.items.map(i => i.ts));
    const seen = new Set(), notes = [];
    for (const it of [...g.items].sort((a, b) => b.ts - a.ts || (a.note < b.note ? -1 : 1))) {
      const nk = normaliseName(it.note); if (!nk || seen.has(nk)) continue;
      seen.add(nk); if (notes.length < MAX_NOTES) notes.push(it.note);
    }
    list.push({ key: g.key, ts: latest, entry: { name, count: g.items.length, latest: isoDay(latest), notes } });
  }
  list.sort((a, b) => b.entry.count - a.entry.count || b.ts - a.ts || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return list.slice(0, MAX_GAMES).map(x => x.entry);
}

/** The whole file as text (2-space JSON + trailing newline), identical for identical input. */
export function buildJson(csvText) {
  const rows = toRequests(csvText);
  const updated = rows.length ? isoDay(Math.max(...rows.map(r => r.ts))) : null;
  return JSON.stringify({ updated, requests: groupRequests(rows) }, null, 2) + '\n';
}

async function main() {
  const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const root = path.resolve(opt('--root') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  let csv;
  if (opt('--file')) csv = fs.readFileSync(opt('--file'), 'utf8');
  else {
    const url = opt('--url') || process.env.GAME_REQUESTS_CSV_URL || CSV_URL;
    const res = await fetch(url, { headers: { 'user-agent': 'fastkiwi-site-sync' }, signal: AbortSignal.timeout(30000), redirect: 'follow' });
    if (!res.ok) { console.error(`sync-game-requests: ${res.status} from the responses sheet; nothing written`); process.exit(1); }
    csv = await res.text();
  }
  if (/^\s*<(!doctype|html)/i.test(csv)) { console.error('sync-game-requests: got a web page instead of CSV (is the sheet still published?); nothing written'); process.exit(1); }
  const out = buildJson(csv), file = path.join(root, 'data', 'game-requests.json');
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  if (old === out) { console.log('sync-game-requests: nothing changed'); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  console.log(`sync-game-requests: updated data/game-requests.json (${JSON.parse(out).requests.length} games)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
