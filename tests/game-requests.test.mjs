// Unit tests for tools/sync-game-requests.mjs (CSV parser, name normaliser, grouping, URL stripping), with fixture CSV text; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv, normaliseName, stripUrls, cleanText, parseTimestamp, toRequests, groupRequests, buildJson, MAX_NAME, MAX_NOTE } from '../tools/sync-game-requests.mjs';

const FIXTURE = fs.readFileSync(fileURLToPath(new URL('./fixtures/game-requests.csv', import.meta.url)), 'utf8');

test('parseCsv: quotes, escaped quotes, newlines inside quotes, CRLF, BOM, trailing newline', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,2,3\n'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(parseCsv('﻿a,"b,1","c ""q"""\r\n"x\ny",,z'), [['a', 'b,1', 'c "q"'], ['x\ny', '', 'z']]);
  assert.deepEqual(parseCsv('a,b\r\n\r\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,,'), [['a', '', '']]);
});

test('normaliseName: case, spaces, punctuation, Arabic hamza-alef and digit folding', () => {
  assert.equal(normaliseName('Hades  II'), normaliseName('hades ii'));
  assert.equal(normaliseName('Half-Life 2'), 'halflife2');
  assert.equal(normaliseName('أحمد'), normaliseName('احمد'));
  assert.equal(normaliseName('إسلام آباد'), normaliseName('اسلام اباد'));
  assert.equal(normaliseName('لُعْبَة'), normaliseName('لعبه'));
  assert.equal(normaliseName('GTA ٥'), normaliseName('gta 5'));
  assert.notEqual(normaliseName('Hades'), normaliseName('Hades II'));
  assert.equal(normaliseName('!!!'), '');
});

test('stripUrls / cleanText: links, e-mail, bare domains, control and bidi characters, length caps', () => {
  assert.equal(cleanText('see https://evil.example/x?y=1 now', 50), 'see now');
  assert.equal(cleanText('go to www.spam.com/buy or spam.ru', 50), 'go to or');
  assert.equal(cleanText('mail a@b.co please', 50), 'mail please');
  assert.equal(stripUrls('ftp://x.y/z'), ' ');
  assert.equal(cleanText('a\u0000b‏c‮d\ne\tf', 50), 'abcd e f');
  assert.equal(cleanText('x'.repeat(500), MAX_NAME).length, MAX_NAME);
  assert.equal([...cleanText('😀'.repeat(400), MAX_NOTE)].length, MAX_NOTE);
  assert.equal(cleanText('<script>alert(1)</script>', 50), '<script>alert(1)</script>'); // kept as text; the page never renders HTML
});

test('parseTimestamp: US order, day-first when unambiguous, ISO, junk', () => {
  assert.equal(new Date(parseTimestamp('11/28/2026 14:03:22')).toISOString(), '2026-11-28T14:03:22.000Z');
  assert.equal(new Date(parseTimestamp('28/11/2026 1:02:03')).toISOString(), '2026-11-28T01:02:03.000Z');
  assert.equal(new Date(parseTimestamp('2026-11-28 14:03')).toISOString(), '2026-11-28T14:03:00.000Z');
  assert.equal(parseTimestamp('Timestamp'), null);
  assert.equal(parseTimestamp('13/45/2026'), null);
  assert.equal(parseTimestamp(''), null);
});

test('toRequests: drops the header, bad dates, empty and punctuation-only names', () => {
  const rows = toRequests(FIXTURE);
  assert.deepEqual(rows.map(r => r.name), ['Hades II', 'hades ii', 'الأسطورة', 'الاسطوره', '"Quoted" Game', 'Celeste']);
  assert.equal(rows[1].note, 'Steam, please with a second line');
  assert.equal(rows[3].note, 'see and now');
  assert.equal(rows[4].note, 'mail me');
});

test('groupRequests: merged by normalised name, sorted by count then newest, notes unique and newest first', () => {
  const g = groupRequests(toRequests(FIXTURE));
  assert.deepEqual(g.map(x => [x.name, x.count, x.latest]), [
    ['الاسطوره', 2, '2026-11-23'], ['hades ii', 2, '2026-11-21'], ['Celeste', 1, '2026-11-27'], ['"Quoted" Game', 1, '2026-11-24']]);
  assert.deepEqual(g[1].notes, ['Steam, please with a second line', 'Steam']); // newest first
});

test('groupRequests: ties on count go to the newest, the display name is the most used spelling, notes capped at 5', () => {
  const t = Date.UTC(2026, 10, 1);
  const rows = [['Doom', 1], ['DOOM', 3], ['doom', 2], ['Doom', 4], ['Zed', 9], ['Alpha', 9]].map(([name, d]) => ({ ts: t + d * 864e5, name, note: 'n' + d }));
  const g = groupRequests(rows);
  assert.deepEqual(g.map(x => [x.name, x.count]), [['Doom', 4], ['Alpha', 1], ['Zed', 1]]); // Zed and Alpha tie on count and day: sorted by key
  assert.equal(g[0].name, 'Doom');
  assert.deepEqual(g[0].notes, ['n4', 'n3', 'n2', 'n1']);
  const many = Array.from({ length: 9 }, (_, i) => ({ ts: t + i, name: 'Same', note: 'note ' + i }));
  assert.equal(groupRequests(many)[0].notes.length, 5);
});

test('buildJson: deterministic, empty list for a header-only CSV, updated = newest request date', () => {
  assert.equal(buildJson(FIXTURE), buildJson(FIXTURE));
  assert.equal(JSON.parse(buildJson(FIXTURE)).updated, '2026-11-27');
  assert.deepEqual(JSON.parse(buildJson('Timestamp,Game,Note\n')), { updated: null, requests: [] });
  assert.ok(buildJson(FIXTURE).endsWith('\n'));
});
