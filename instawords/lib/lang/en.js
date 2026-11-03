import { splitGroups } from "./types.js";
// Word tables (exported for scripts/build-vba.mjs, which embeds them in the Excel module).
const SMALL = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];
const HUNDRED = "Hundred";
const POINT = "Point";
const SUBUNIT_JOINER = " and ";
const HYPHEN = "-";
export const EN_WORDS = Object.freeze({ SMALL, TENS, SCALES, HUNDRED, POINT, SUBUNIT_JOINER, HYPHEN });
/** 1..999: "Two Hundred Five", "Twenty-One". */
function groupWords(g) {
    const h = Math.floor(g / 100);
    const r = g % 100;
    const parts = [];
    if (h > 0)
        parts.push(`${SMALL[h]} ${HUNDRED}`);
    if (r > 0 && r < 20)
        parts.push(SMALL[r]);
    else if (r >= 20)
        parts.push(TENS[Math.floor(r / 10)] + (r % 10 ? HYPHEN + SMALL[r % 10] : ""));
    return parts.join(" ");
}
function integerWords(digits) {
    if (digits === "0")
        return SMALL[0];
    const groups = splitGroups(digits);
    const parts = [];
    for (let k = groups.length - 1; k >= 0; k--) {
        const g = groups[k];
        if (g === 0)
            continue;
        parts.push(k === 0 ? groupWords(g) : `${groupWords(g)} ${SCALES[k]}`);
    }
    return parts.join(" ");
}
export const english = {
    info: { id: "en", label: "English", dir: "ltr", supportsHundredsForm: false },
    i18nForms: { gender: false },
    pickForms: (_ar, i18n) => i18n?.en,
    plain(integer, fraction) {
        const intText = integerWords(integer);
        // Digits after the point are read one by one: Twelve Point Zero Five.
        return fraction ? `${intText} ${POINT} ${[...fraction].map((d) => SMALL[+d]).join(" ")}` : intText;
    },
    count(digits, forms) {
        if (digits === "1")
            return forms.one ?? `${SMALL[1]} ${forms.singular}`;
        return `${integerWords(digits)} ${forms.plural}`;
    },
    subunitJoiner: SUBUNIT_JOINER,
};
