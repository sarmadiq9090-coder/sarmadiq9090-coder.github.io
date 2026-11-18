# قاموس عربي موحّد · Unified Arabic number dictionary

<div dir="rtl">

## ما هذا؟

`arabic-numbers.json` هو القاموس المشترك لألفاظ الأعداد العربية في كل تطبيقات FastKiwi. يأخذه كل تطبيق
وقت البناء بدل أن يكتب الألفاظ بنفسه، فتبقى الكلمات واحدة في كل مكان:

```
https://fastkiwi.app/data/arabic-numbers.json
https://fastkiwi.app/data/arabic-numbers.schema.json
```

- **بيانات فقط**: ألفاظ الأعداد والأرقام والفواصل. لا يحوي محرّك قواعد ولا شيفرة. قواعد التركيب (متى
  يُستعمل المثنى أو الجمع أو المنصوب) في مواصفة InstaWords ‏`docs/SPEC.md`.
- **مولَّد لا مكتوب باليد**: يُنتَج من مستودع InstaWords (‏`src/lexicon.ts` و`src/normalize.ts`
  و`tests/golden/cases.json`) بالسكربت `scripts/export-dictionary.mjs`. لا تعدّله هنا يدوياً.
- `source.commit` آخر إيداع في InstaWords غيّر أحد ملفات المصدر، و`version` رقم إصدار (semver) للمحتوى.

## قاعدة الأرقام (القرار D-012)

تُعرض الأرقام **بالأرقام الغربية 123 افتراضياً**، والأرقام العربية الهندية **١٢٣ خيار** يختاره المستخدم ولا
يُفرض عليه. «ذكّرني» يعرض 123 فقط بلا خيار. ويقبل كل حقل إدخال الأرقام الغربية والعربية الهندية
والفارسية، وفاصل الآلاف `,` أو `٬`، والفاصلة العشرية `.` أو `٫`. الحقل في الملف:
`"digitDisplay": {"default": "latin", "options": ["latin", "arabic-indic"]}`.

## التحديث

من نسخة InstaWords (بعد أي تغيير في الألفاظ، مع رفع `DICTIONARY_VERSION` في السكربت):

```sh
node scripts/export-dictionary.mjs --out <site>/data/arabic-numbers.json    # يكتب الملف
node scripts/export-dictionary.mjs --check <site>/data/arabic-numbers.json  # يفشل إن كان قديماً
```

ثم افتح طلب دمج في هذا المستودع. فحص الموقع (`tests/qa.mjs`) يتحقق من مطابقة الملف للمخطط ومن أنه يُخدَم.

</div>

## What it is

`arabic-numbers.json` is the shared Arabic number-word dictionary of every FastKiwi app. Apps copy it at
build time instead of typing the words themselves, so the words are the same everywhere (URLs above).

- **Data only**: words, digits and separators. No grammar engine, no code. How the words combine (when to
  use the dual, the plural or the accusative) is InstaWords' `docs/SPEC.md`.
- **Generated, not hand-typed**: built from the InstaWords repo (`src/lexicon.ts`, `src/normalize.ts`,
  `tests/golden/cases.json`) by `scripts/export-dictionary.mjs`. Don't edit it here.
- `source.commit` is the last InstaWords commit that changed a source file; `version` is the content's
  semver (patch: a corrected word, minor: an added field, major: a changed or removed field).

| Key | Content |
|---|---|
| `words.zero`, `words.decimalPoint` | صفر, فاصلة |
| `words.ones`, `words.teens`, `words.compoundOnes` | 1–10, 11–19 and the units digit inside 21–99, each `m` (masculine noun) / `f` (feminine noun), keyed by value |
| `words.tens` | 20–90 |
| `words.hundreds` | `default` spelling (مائة) and both `forms` (مائة, مئة): 100–900 plus `dualConstruct` (مائتا before a scale word) |
| `words.scales` | thousand, million, billion (مليار), trillion: `singular`, `dual` (nominative), `plural`, `accusative` |
| `conjunction` | `word` «و» and `joiner` `" و"` (a space, then و attached to the next word) |
| `digits` | `toLatin` for Arabic-Indic ٠–٩ and Persian ۰–۹; `separators.thousands` `,` `٬`; `separators.decimal` `.` `٫`; `ignored` whitespace |
| `digitDisplay` | the digit rule below |
| `examples` | the Arabic golden cases of InstaWords (number, unit id, options, expected text) for self-tests |

## The digit rule (decision D-012)

Numbers are displayed with **Western digits 123 by default**; Arabic-Indic **١٢٣ is a user option**, never
forced. Remember Me shows 123 only, with no option. Every input field should accept Western, Arabic-Indic
and Persian digits, `,` or `٬` as the thousands separator and `.` or `٫` as the decimal point.

## Updating

From an InstaWords checkout, after a word changes (and after bumping `DICTIONARY_VERSION` in the script),
run the `--out` command above, then open a PR here. The site QA (`tests/qa.mjs`) checks the file against
the schema and that it is served.
