# FastKiwi

Home page for all FastKiwi apps, served at https://fastkiwi.app/ by GitHub Pages.
Every project repo with GitHub Pages turned on appears automatically at `https://fastkiwi.app/<repo>/`.

Rule for every page: visitors stay on fastkiwi.app for every action. The only links to github.com are
explicit, labelled GitHub buttons (`data-github`, text containing "GitHub") and direct release-asset downloads.
The one other off-site link is Microsoft's official Store badge (`data-store`, self-hosted `img/store/get-it-from-microsoft-en-us-dark.svg` / `-ar.svg`,
copied unchanged from get.microsoft.com) to `https://apps.microsoft.com/detail/<id>`, only for an app that `data/apps.json` marks
`store.live`, with only the badge's own parameters and a campaign ID (`?referrer=appbadge&cid=fastkiwi-site&mode=full`), nothing that tracks visitors. `store/` and `ar/store/` list each app's Store, direct-download and winget status.
The one third-party request a page makes is the visitor's own submit on `games/requests/` and `ar/games/requests/`: a single POST to FastKiwi's Google Form, only when Send is pressed (nothing is loaded from Google on page load, and the page links nowhere off-site).

## Shared data (`data/`)

- `data/arabic-numbers.json` («قاموس عربي موحّد»): the Arabic number words, digits, separators and the digit rule
  (123 by default, ١٢٣ as an option) that every FastKiwi app copies at build time from
  https://fastkiwi.app/data/arabic-numbers.json. Generated from InstaWords (`scripts/export-dictionary.mjs`), never
  hand-edited; schema `data/arabic-numbers.schema.json`; details in [data/README.md](data/README.md).

## Tests

```sh
npm ci && npx playwright install chromium   # or use a globally installed Playwright
npm test                                    # tools tests + the browser QA (screenshots in tests/output/)
npm run test:quick                          # the same without screenshots
npm run test:live                           # checks the live site, with the real GitHub API
```

- `tests/qa.mjs`: every page at 12 widths, the hero, dialogs, releases and Lemon pages, redirects and feeds,
  with the GitHub API mocked from the apps' real release-note formats (`tests/fixtures/`), and `data/arabic-numbers.json`
  against its schema (`tests/lib/json-schema.mjs`).
- `tests/tools.test.mjs`: the feed generator and the InstaWords fallback updater.
- `tests/apps-data.test.mjs`: the schema of `data/apps.json`, the "More from FastKiwi" list the apps copy at build time
  ([docs/apps-data.md](docs/apps-data.md)).
- `tests/pdf-kit.mjs`: the FastKiwi Toolbox (`tools/`): PDF Kit's merge, split, images→PDF and PDF→images in a real browser,
  no request to other hosts, en/ar + RTL, offline via the service worker, strings, sitemap and the vendored files' sha256 (`npm run test:pdf`).
- `tests/live-check.mjs`: pages, links, images, download assets and versions on https://fastkiwi.app.

## Automation (`.github/workflows/`)

- `site-qa.yml`: the QA suite on every push and pull request.
- `live-check.yml`: weekly live check; opens (or updates) the issue "Live site check failed".
- `game-requests.yml`: every 6 hours; `tools/sync-game-requests.mjs` reads the public CSV of the game-localization requests (a Google Form owned by FastKiwi) and, only if it changed, the bot commits `data/game-requests.json` to main (no secrets). Requests are public; to remove one, delete its row in the responses sheet.
- `sync.yml`: daily; rebuilds `instawords/` from the InstaWords repo (formerly tafket), updates the static InstaWords download link,
  regenerates `releases.xml` and `ar/releases.xml` (`tools/sync-releases.mjs`), runs the QA and pushes if anything changed.
