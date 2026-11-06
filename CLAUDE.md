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
- **Weekly release train.**
  - All improvements, additions and changes to a published app ship to users ONCE a week, together.
    This covers new versions and tags, website (fastkiwi.app) updates, and package-manager
    (winget/Scoop/Chocolatey) manifest updates.
  - Release day is Friday 09:00 (Asia/Baghdad). The weekly health check in the owner's manager
    session runs just before it and prepares the train; the owner approves it.
  - A release goes out only after CI is green on Linux and Windows.
  - During the week, work goes to `claude/*` branches or PRs, or is merged to the default branch
    WITHOUT bumping the version or pushing a tag.
  - arabic-file-search's build.yml publishes a release automatically when the Cargo.toml version
    changes on main, so bump the version only on release day.
  - github.io deploys on every push to main, so merge site PRs only on release day.
  - Exceptions: mawared-desktop, and new apps that have never been published. These may release
    whenever needed.
  - A critical security fix may go out early, only with the owner's explicit approval.
- Things only the owner can do: repo settings, deleting branches or repos, money decisions, secrets,
  merging. Ask, and give exact click-by-click steps in Arabic.
- Don't enable features that write to third-party systems, or anything security-sensitive, without
  the owner's explicit approval.
- Commit only your own files (`git add <paths>`).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## What this is

The FastKiwi home site, https://fastkiwi.app/, a static site (plain HTML/CSS/JS, no build step)
served by GitHub Pages straight from `main` of this repo. Every project repo with Pages turned on
also appears at `https://fastkiwi.app/<repo>/` (e.g. `/arabic-file-search/`, `/Remember-Me/`).
Pages here: home (`index.html`, `ar/`, `en/`), `lemon/`, `releases/` (What's new + Atom feeds),
`privacy/`, `instawords/` (synced from tafket). Details: [README.md](README.md).

Site rule (README): visitors stay on fastkiwi.app for every action. The only links to github.com
are explicit, labelled GitHub buttons (`data-github`, text containing "GitHub") and direct
release-asset downloads.

## Build and test

No build. Node >= 22, npm; Playwright 1.63.0 (devDependency).

```sh
npm ci && npx playwright install chromium
npm test              # tools unit tests + browser QA of every page (screenshots in tests/output/)
npm run test:quick    # the same without screenshots
npm run test:tools    # feed generator and InstaWords fallback updater only
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
  release feeds (`tools/sync-releases.mjs`), runs the QA and **pushes to main** if anything changed.

## Release

There are no versions or tags: every push to `main` is live. So merge site PRs only on release day.
`sync.yml` is the one automatic pusher to main; it reflects what the app repos already published
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
