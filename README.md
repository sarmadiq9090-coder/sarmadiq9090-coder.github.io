# FastKiwi

Home page for all FastKiwi apps, served at https://fastkiwi.app/ by GitHub Pages.
Every project repo with GitHub Pages turned on appears automatically at `https://fastkiwi.app/<repo>/`.

Rule for every page: visitors stay on fastkiwi.app for every action. The only links to github.com are
explicit, labelled GitHub buttons (`data-github`, text containing "GitHub") and direct release-asset downloads.
The one other off-site link is Microsoft's official Store badge (`data-store`, self-hosted `img/store/get-it-from-microsoft-en-us-dark.svg` / `-ar.svg`,
copied unchanged from get.microsoft.com) to `https://apps.microsoft.com/detail/<id>`, only for an app that `data/apps.json` marks
`store.live`, with only the badge's own parameters and a campaign ID (`?referrer=appbadge&cid=fastkiwi-site&mode=full`), nothing that tracks visitors. `store/` and `ar/store/` list each app's Store, direct-download and winget status.

## Tests

```sh
npm ci && npx playwright install chromium   # or use a globally installed Playwright
npm test                                    # tools tests + the browser QA (screenshots in tests/output/)
npm run test:quick                          # the same without screenshots
npm run test:live                           # checks the live site, with the real GitHub API
```

- `tests/qa.mjs`: every page at 12 widths, the hero, dialogs, releases and Lemon pages, redirects and feeds,
  with the GitHub API mocked from the apps' real release-note formats (`tests/fixtures/`).
- `tests/tools.test.mjs`: the feed generator and the InstaWords fallback updater.
- `tests/apps-data.test.mjs`: the schema of `data/apps.json`, the "More from FastKiwi" list the apps copy at build time
  ([docs/apps-data.md](docs/apps-data.md)).
- `tests/pdf-kit.mjs`: the FastKiwi Toolbox (`tools/`): PDF Kit's merge, split, images→PDF and PDF→images in a real browser,
  no request to other hosts, en/ar + RTL, offline via the service worker, strings, sitemap and the vendored files' sha256 (`npm run test:pdf`).
- `tests/live-check.mjs`: pages, links, images, download assets and versions on https://fastkiwi.app.

## Automation (`.github/workflows/`)

- `site-qa.yml`: the QA suite on every push and pull request.
- `live-check.yml`: weekly live check; opens (or updates) the issue "Live site check failed".
- `sync.yml`: daily; rebuilds `instawords/` from the InstaWords repo (formerly tafket), updates the static InstaWords download link,
  regenerates `releases.xml` and `ar/releases.xml` (`tools/sync-releases.mjs`), runs the QA and pushes if anything changed.
