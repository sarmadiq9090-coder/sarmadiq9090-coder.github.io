import { splitGroups } from "./types.js";
// Word tables (exported for scripts/build-vba.mjs, which embeds them in the Excel module).
const SMALL = [
    "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
    "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
/** Tens 20–60; 70, 80 and 90 are built on soixante / quatre-vingt. */
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];
const FOUR_TWENTY = "quatre-vingt";
const CENT = "cent";
const MILLE = "mille";
/** Long scale: billion = 10^12. These are nouns: un million, deux millions. */
const SCALE_NOUNS = ["", "", "million", "milliard", "billion"];
const POINT = "virgule";
const SUBUNIT_JOINER = " et ";
/** Inside numbers: vingt et un, soixante et onze. */
const ET = " et ";
const HYPHEN = "-";
const PLURAL_S = "s";
const ONE_F = "une";
/** Before a noun that directly follows million/milliard/billion. */
const DE = "de ";
const DE_ELIDED = "d'";
/** Nouns starting like this take d' (h is treated as mute). */
const ELIDES = /^[aeiouhàâäéèêëîïôöûüœæ]/i;
export const FR_WORDS = Object.freeze({
    SMALL, TENS, FOUR_TWENTY, CENT, MILLE, SCALE_NOUNS, POINT, SUBUNIT_JOINER, ET, HYPHEN, PLURAL_S, ONE_F, DE, DE_ELIDED, ELIDES,
});
const one = (g) => (g === "f" ? ONE_F : SMALL[1]);
/**
 * 1..99. `final`: no other number word follows (only a noun, million/milliard/billion,
 * or nothing) — then 80 is written quatre-vingts.
 */
function below100(n, g, final) {
    if (n === 1)
        return one(g);
    if (n < 20)
        return SMALL[n];
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (t === 7 || t === 9) {
        const base = t === 7 ? TENS[6] : FOUR_TWENTY;
        return t === 7 && u === 1 ? base + ET + SMALL[11] : base + HYPHEN + SMALL[10 + u]; // soixante et onze, quatre-vingt-onze
    }
    if (t === 8)
        return u === 0 ? FOUR_TWENTY + (final ? PLURAL_S : "") : FOUR_TWENTY + HYPHEN + (u === 1 ? one(g) : SMALL[u]);
    if (u === 0)
        return TENS[t];
    return u === 1 ? TENS[t] + ET + one(g) : TENS[t] + HYPHEN + SMALL[u];
}
/** 1..999. cent takes s when multiplied and `final` with nothing after it in the group. */
function groupWords(g, gender, final) {
    const h = Math.floor(g / 100);
    const r = g % 100;
    const parts = [];
    if (h === 1)
        parts.push(CENT);
    else if (h > 1)
        parts.push(`${SMALL[h]} ${CENT}${r === 0 && final ? PLURAL_S : ""}`);
    if (r > 0)
        parts.push(below100(r, gender, final));
    return parts.join(" ");
}
/** Integer words. `gender` applies to the last group only (un/une); higher groups are masculine. */
function integerWords(digits, gender) {
    if (digits === "0")
        return SMALL[0];
    const groups = splitGroups(digits);
    const parts = [];
    for (let k = groups.length - 1; k >= 1; k--) {
        const g = groups[k];
        if (g === 0)
            continue;
        if (k === 1)
            parts.push(g === 1 ? MILLE : `${groupWords(g, "m", false)} ${MILLE}`); // mille: invariable, never "un mille"
        else
            parts.push(g === 1 ? `${one("m")} ${SCALE_NOUNS[k]}` : `${groupWords(g, "m", true)} ${SCALE_NOUNS[k]}${PLURAL_S}`);
    }
    if (groups[0] > 0)
        parts.push(groupWords(groups[0], gender, true));
    return parts.join(" ");
}
/** "de " or "d'" before a noun that directly follows million/milliard/billion. h is treated as mute. */
function de(noun) {
    return ELIDES.test(noun) ? DE_ELIDED : DE;
}
export const french = {
    info: { id: "fr", label: "Français", dir: "ltr", supportsHundredsForm: false },
    i18nForms: { gender: true },
    pickForms: (_ar, i18n) => i18n?.fr,
    plain(integer, fraction) {
        const intText = integerWords(integer, "m");
        if (!fraction)
            return intText;
        // Leading zeros are read as zéro, the rest as a whole number: douze virgule zéro cinq.
        const lead = fraction.match(/^0*/)[0].length;
        const rest = fraction.slice(lead);
        const words = new Array(lead).fill(SMALL[0]);
        if (rest)
            words.push(integerWords(rest, "m"));
        return `${intText} ${POINT} ${words.join(" ")}`;
    },
    count(digits, forms) {
        if (digits === "0")
            return `${SMALL[0]} ${forms.singular}`;
        if (digits === "1")
            return forms.one ?? `${one(forms.gender)} ${forms.singular}`;
        const words = integerWords(digits, forms.gender);
        // Exactly N million/milliard/billion: un million de dirhams, deux milliards d'euros.
        const link = /000000$/.test(digits) ? de(forms.plural) : "";
        return `${words} ${link}${forms.plural}`;
    },
    subunitJoiner: SUBUNIT_JOINER,
};
