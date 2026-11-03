// GitHub API fixtures built from the apps' real release-note formats (test data only; the note texts are copies in fixtures/notes/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const NOTES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'notes');
const note = f => fs.readFileSync(path.join(NOTES, f), 'utf8');
const days = d => new Date(Date.now() - d * 864e5).toISOString();
const sha = s => 'sha256:' + Array.from({ length: 64 }, (_, i) => '0123456789abcdef'[(s.charCodeAt(i % s.length) * 7 + i * 13) % 16]).join('');
const A = (n, s, d) => ({ name: n, size: s, download_count: d, digest: sha(n) });
const rel = (tag, d, name, body, assets, pre = false) => ({ tag_name: tag, name, published_at: days(d), body, assets, prerelease: pre });

// InstaFind: releases/<tag>-notes.md (first line "# title", rest is the body)
const ifNotes = t => { const f = note(`instafind-${t}.md`).split('\n'); return [f[0].replace(/^#\s*/, ''), f.slice(1).join('\n').trim()]; };
const ifAssets = v => [A('bahth.exe', 6.9e6 + v, 900), A('bahth-x86.exe', 6.1e6, 40), A('bahth-arm64.exe', 6.4e6, 55)];
const instafind = ['v0.9.0', 'v0.8.2', 'v0.8.1', 'v0.8.0'].map((t, i) => { const [n, b] = ifNotes(t); return rel(t, 4 + i * 6, n, b, ifAssets(i)); });

// Remember Me: `gh release create --generate-notes` (GitHub's generated format) + CHANGELOG sections
const section = (txt, from, to) => { const a = txt.indexOf(from), b = txt.indexOf(to, a + from.length); return txt.slice(txt.indexOf('\n', a) + 1, b > 0 ? b : undefined).trim(); };
const generated = `## What's Changed
* Snooze choices before 01:00 can be used again by @sarmadiq9090-coder in https://github.com/sarmadiq9090-coder/Remember-Me/pull/67
* Hindi: clearer wording by @abhi478jeetur-rgb in https://github.com/sarmadiq9090-coder/Remember-Me/pull/70
* Bump electron to 45.1.0 by @dependabot[bot] in https://github.com/sarmadiq9090-coder/Remember-Me/pull/72

## New Contributors
* @abhi478jeetur-rgb made their first contribution in https://github.com/sarmadiq9090-coder/Remember-Me/pull/70

**Full Changelog**: https://github.com/sarmadiq9090-coder/Remember-Me/compare/v1.6.0...v1.6.1`;
const rmAssets = v => [A(`Remember-Me-Setup-${v}.exe`, 86e6, 300), A(`Remember-Me-Setup-${v}.exe.blockmap`, 9e4, 0), A('latest.yml', 420, 0), A('SHA256SUMS.txt', 180, 0)];
const remember = [rel('v1.6.1', 2, 'ذكرني | Remember Me v1.6.1', generated, rmAssets('1.6.1')),
  rel('v1.6.0', 5, 'ذكرني | Remember Me v1.6.0', section(note('remember-me-v1.6.0.md'), '## v1.6.0', '\n## v'), rmAssets('1.6.0')),
  rel('v1.7.0-beta.1', 1, 'ذكرني | Remember Me v1.7.0-beta.1', '- Beta: a calendar view.', rmAssets('1.7.0-beta.1'), true)];
// the newest entry from the API is listed first; a pre-release must never become "latest"
remember.unshift(remember.pop());

// Lemon: annotated tag message = CHANGELOG section (Arabic + English, emoji)
const lCl = note('lemon-CHANGELOG.md');
const lemonAssets = v => [A('local-ai-chat.exe', 14.2e6 + v, 200), A('local-ai-chat.exe.sha256', 84, 0)];
const lemon = [rel('v2.2.0', 4, 'v2.2.0', section(lCl, '## [2.2.0]', '\n## ['), lemonAssets(0)), rel('v2.1.1', 4.2, 'v2.1.1', section(lCl, '## [2.1.1]', '\n## ['), lemonAssets(1))];

// InstaWords: the release body from tafket's windows.yml (with <div dir="rtl">), plus a table, images and hostile HTML
const bodyTpl = note('instawords-release-body.md');
const iwBody = v => bodyTpl.replace(/\$\{\{ needs\.build\.outputs\.version \}\}/g, v) + `

| العملة / Currency | مثال / Example |
|---|:---:|
| ريال سعودي SAR | ألف ومئتان وخمسون ريالاً |
| US dollar | One thousand two hundred fifty dollars |

![InstaWords screenshot](https://raw.githubusercontent.com/sarmadiq9090-coder/tafket/main/docs/shot.png)
<img src="x" onerror="window.__xss=1"> <script>window.__xss=2</script><a href="javascript:window.__xss=3">click</a>
<details><summary>Checksums</summary>

\`\`\`
2f1c...  InstaWords_${v}_x64-setup.exe
\`\`\`
</details>`;
const iwAssets = v => [A(`InstaWords_${v}_x64-setup.exe`, 2.6e6, 150), A(`InstaWords_${v}_x64-portable.zip`, 3.1e6, 60)];
const tafket = [rel('v2.0.1', 9, 'InstaWords — تفقيط v2.0.1', iwBody('2.0.1'), iwAssets('2.0.1')), rel('v2.0.0', 12, 'InstaWords — تفقيط v2.0.0', iwBody('2.0.0'), iwAssets('2.0.0'))];

export const FIX = { 'arabic-file-search': instafind, 'Remember-Me': remember, 'local-ai-chat': lemon, 'tafket': tafket };
export async function mockApi(ctx, delay = 0) {
  await ctx.route('https://api.github.com/**', async r => {
    const u = new URL(r.request().url()), m = u.pathname.match(/^\/repos\/[^/]+\/([^/]+)(\/releases)?$/);
    if (delay) await new Promise(res => setTimeout(res, delay));
    if (!m || !FIX[m[1]]) return r.fulfill({ status: 404, body: '{}' });
    const rels = FIX[m[1]].map(x => ({ ...x, draft: false, html_url: 'https://github.com/x/' + m[1] + '/releases/tag/' + x.tag_name, assets: x.assets.map(a => ({ ...a })) }));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(m[2] ? rels : { stargazers_count: 120 }) });
  });
}
