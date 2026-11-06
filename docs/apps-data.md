# `data/apps.json`: the one "More from FastKiwi" list

## بالعربية (ملخص)

`data/apps.json` هو المصدر الوحيد لقائمة «المزيد من FastKiwi»: اسم كل برنامج ووصفه بالعربية والإنجليزية،
ورابط صفحته على fastkiwi.app، ومعرّفه في متجر مايكروسوفت وفي winget، ومسار أيقونته.

- كل برنامج **ينسخ هذا الملف (والأيقونات التي يحتاجها) وقت البناء** ويضمّه داخل البرنامج.
- **البرامج لا تجلب هذا الملف من الإنترنت أبداً وقت التشغيل** (خصوصية: لا طلب شبكة يكشف أن المستخدم فتح البرنامج،
  وتعمل القائمة بلا إنترنت).
- أي تعديل هنا يصل إلى المستخدمين مع الإصدار التالي لكل برنامج، في قطار الجمعة.
- أيقونتا Lemon وInstaFind هما القديمتان (قرار صاحب المشروع)، وInstaWords تستعمل أيقونة «ريشة القلم».
- `tests/apps-data.test.mjs` يفحص البنية في CI.

## English

The council decision: the apps share specs and data, not code. This file is the shared data for each
app's "More from FastKiwi" list (an About box, a menu, a Store-style list). It lives in the site repo
because the site already holds every app's name, page, icon and package ids.

### How the apps use it

- **Build time only.** Each app copies `data/apps.json` (and the icon files it shows) from this repo into
  its own source tree or build output, and embeds it. A pinned commit of this repo, a vendored copy
  refreshed by a script, or a CI step are all fine.
- **Never at runtime.** An app must not fetch `https://fastkiwi.app/data/apps.json` (or the icons) while
  it runs. That request would tell a server that someone opened the app, and the list must work offline.
  The file is public on the site only because everything in this repo is.
- An app leaves itself out of the list by `id`, shows the `name`/`tagline`/`description` in the UI
  language (`ar` or `en`), and links to `url` in that language.
- Apps with `"status": "coming-soon"` have no download yet: show them as "coming soon" or not at all,
  never with a download or install action.
- `store.live` / `winget.live` say whether the listing is public yet. While it is `false`, the id is
  reserved or submitted but not installable: don't show a Store or `winget install` action for it.
- Changes reach users with each app's next release, on the weekly train.

### Schema (version 1)

```jsonc
{
  "schema": 1,              // bumped only for a breaking change; every app must then be told
  "apps": [
    {
      "id": "remember-me",                      // stable, lower-case kebab-case; matches brand/icons/<id>/
      "status": "released",                     // "released" | "coming-soon"
      "name":        { "ar": "ذكرني", "en": "Remember Me" },
      "tagline":     { "ar": "…", "en": "Tasks & reminders" },        // short label, ≤ 40 characters
      "description": { "ar": "…", "en": "…" },                        // one plain line, ≤ 160 characters
      "url":   { "ar": "https://fastkiwi.app/Remember-Me/ar/", "en": "https://fastkiwi.app/Remember-Me/" },
      "store":  { "id": "9NGB1F7T7JGN", "live": false },             // Microsoft Store ID, or null
      "winget": { "id": "Sarmad.RememberMe", "live": false },        // winget package id, or null
      "icon": "img/remember-me.png"            // path in this repo (the site's own copy)
    }
  ]
}
```

Every field is required (use `null` for no Store or winget entry). No other fields are allowed: adding one
is an additive change, so add it here, in the test, and keep `schema` at 1. Texts are plain text: no HTML,
no links, no newlines.

### Icons

`icon` is the file the site itself shows, so the list always matches fastkiwi.app:

| App | Icon | Note |
|---|---|---|
| InstaFind | `img/instafind.svg` | legacy icon (owner decision, 2026-11-06); not brand v2 |
| Remember Me | `img/remember-me.png` | |
| Lemon | `img/lemon.png` | legacy icon (owner decision, 2026-11-06); not brand v2 |
| InstaWords | `img/instawords.svg` | the brand icon, a copy of `brand/icons/instawords/instawords.svg` (the pen nib) |
| InstaConvert | `img/instaconvert.svg` | |

An app that needs other sizes or formats (ICO, small PNGs) rasterises these at build time, or uses its
own icon set for itself; for InstaWords, Remember Me and InstaConvert, `brand/icons/<id>/` has the full set.

### Where the values come from

Names, taglines and descriptions are the ones on the home pages (`index.html`, `ar/index.html`) and on
`downloads/`. Store IDs and winget ids are the ones on the official downloads page (`downloads/`), which come
from each app's repo (Remember Me `docs/distribution/microsoft-store.md`, InstaFind and InstaWords Store
docs, the winget manifests). When one changes, update the page and this file in the same PR.

### Checks

`tests/apps-data.test.mjs` (part of `npm run test:tools`, so it runs in `site-qa.yml` on every push and PR):

- exact keys and types, unique kebab-case ids, ar/en for every text, Arabic in `ar`, one-line texts;
- every `url` is on fastkiwi.app and its page exists here (or is another repo's Pages site, or
  `instawords/en/`, which `sync.yml` brings from tafket);
- Store ID and winget id formats, and that they match the app's card on `downloads/`;
- the icon file exists; Lemon and InstaFind are not brand v2 files; InstaWords is the brand master.
