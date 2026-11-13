# CLAUDE.md — FastKiwi website (fastkiwi.app)

## Owner & workflow (shared rules, same in every repo)

Owner: Sarmad (`sarmadiq9090-coder`). Writes Arabic, is not technical in English, and works only
through Claude sessions, with no fixed computer.

- Reply to the owner in Arabic. Keep code, identifiers, commit messages and PR titles in English,
  and give PR bodies an Arabic summary first.
- Never push to the default branch. Work on `claude/<topic>`, open a PR, and let the owner merge
  unless they explicitly say "ادمج" (merge).
- One Claude session per repository at a time. Before starting, check open PRs and recently pushed
  `claude/*` branches. If another session is active, coordinate through it instead of editing the
  same files.
- The owner has no fixed computer: never ask them to keep files, keys or tools on a PC. Use GitHub
  (Environments/secrets, Codespaces) or their password manager.
- **Daily release train (D-035, D-047).** Each app ships once a week on its day at 09:00 Asia/Baghdad:
  Sat InstaFind, Sun Remember Me, Mon Lemon, Tue InstaWords, Wed InstaConvert (only when complete),
  Thu QA, Fri rest. ALL of an app's finished, green features merge together on its day (D-032/D-034);
  nothing is merged on other days. An app not ready on its day rolls to the same day next week; its
  Store update ships the same day as the release. The site (fastkiwi.app) is exempt: it publishes
  when green (D-046). A critical security fix may go early with the owner's explicit approval.
- **One GitHub writer (D-040, core/GITHUB-SAFETY.md in the brain).** Only the manager session pushes,
  opens PRs, comments, merges or dispatches workflows; other sessions work locally and report to the
  manager. Serial writes >=2 s apart, <=15 per hour, <=150 per day, <=3 new PRs per repo per day, <=2
  workflow_dispatch per repo per day, 1 rerun max. On any 403/429/abuse/CAPTCHA signal: stop all
  writes and tell the owner.
- **Closed source (D-051, 2026-11-09).** FastKiwi apps are proprietary (free to use; pricing
  undecided). Don't add "open source"/MIT wording; keep third-party notices. Code published before
  2026-11-09 stays under its MIT licence.
- **Mirror.** `.github/workflows/mirror.yml` pushes main, tags and claude/* daily to GitLab
  (`fastkiwi1/fastkiwi-site`), no force, no prune; it skips until the owner adds the `GITLAB_DEPLOY_KEY` secret.
- Things only the owner can do: repo settings, deleting branches or repos, money decisions, secrets,
  merging. Ask, and give exact click-by-click steps in Arabic.
- Don't enable features that write to third-party systems, or anything security-sensitive, without
  the owner's explicit approval.
- Commit only your own files (`git add <paths>`).
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  and `Claude-Session: https://claude.ai/code/session_01H59LCK6b45r38j6yGz7oef`.

## What this is

The FastKiwi home site, https://fastkiwi.app/, a static site (plain HTML/CSS/JS, no build step)
served by GitHub Pages straight from `main` of this repo. Every project repo with Pages turned on
also appears at `https://fastkiwi.app/<repo>/` (e.g. `/arabic-file-search/`, `/Remember-Me/`).
Pages here: home (`index.html`, `ar/`, `en/`), `lemon/`, `releases/` (What's new + Atom feeds),
`privacy/`, `downloads/`, `store/` (Store, direct download and winget per app), `instawords/` (synced
from tafket). Details: [README.md](README.md).

Site rule (README): visitors stay on fastkiwi.app for every action. The only links to github.com
are explicit, labelled GitHub buttons (`data-github`, text containing "GitHub") and direct
release-asset downloads. The one other off-site link is the official Microsoft Store badge
(`data-store`) for an app that `data/apps.json` marks live in the Store.

## Build and test

No build. Node >= 22, npm; Playwright 1.63.0 (devDependency).

```sh
npm ci && npx playwright install chromium
npm test              # tools unit tests + browser QA of every page (screenshots in tests/output/)
npm run test:quick    # the same without screenshots
npm run test:tools    # feed generator, InstaWords fallback updater, data/apps.json schema
npm run test:live     # checks the live site with the real GitHub API
npm run serve         # local server on port 8765
```

No lint script.

## CI (.github/workflows), all ubuntu-latest

- `site-qa.yml` (every push and PR): `npm run test:tools` + `node tests/qa.mjs`.
- `live-check.yml` (Mondays 04:17 UTC, manual): checks https://fastkiwi.app; on failure opens or
  updates the issue "Live site check failed", and closes it when a later run passes.
- `sync.yml` (daily 03:43 UTC, manual, and on main pushes touching `tools/**`): rebuilds
  `instawords/` from tafket's default branch, refreshes the InstaWords download link and the
  release feeds (`tools/sync-releases.mjs`), runs the QA and, if anything changed, pushes a `sync/<date>-<run>` branch and **opens a PR**
  (never a direct push to main; at most one open sync PR).

## Release

There are no versions or tags: every push to `main` is live. The site publishes when green (D-046), so merge site PRs once CI passes.
`sync.yml` opens the one automatic PR; it reflects what the app repos already published
(and tafket's default branch), so the app repos must follow the train for it to stay on schedule.

## Do not move or rename

- `CNAME` (custom domain fastkiwi.app) and `.nojekyll` (serve files as-is).
- `965c86191a799732a28a31772e96c023.txt` at the root (IndexNow key; its content is its own name).
- `tafqit/` redirect stubs (`index.html`, `bulk.html`, `excel.html` → `../instawords/`) and
  `tafqit/Tafqit.bas`; also the redirect stubs `instafind/`, `remember-me/`, `local-ai-chat/`.
- `img/` and `fonts/`: used by every page and linked from other repos (e.g. tafket's site links
  `https://fastkiwi.app/img/...`).
- `instawords/`, `releases.xml`, `ar/releases.xml`: written by `sync.yml`; don't hand-edit them.
- `robots.txt`, `sitemap.xml`, `llms.txt`, `site.webmanifest`, `404.html`.
- `data/arabic-numbers.json` and its schema: other apps copy them from this URL at build time. Regenerate the
  JSON with InstaWords' `scripts/export-dictionary.mjs`; never hand-edit it (data/README.md).

## Pending for the owner

- From tafket's docs/ROADMAP.md: turn on "Enforce HTTPS" (Settings → Pages).
