// Tafqit rules, docs/SPEC.md §3–§11.
import { TafqitError } from "./errors.js";
import { COMPOUND_ONES, DECIMAL_POINT_WORD, HUNDREDS, MAX_INTEGER_DIGITS, ONES, SCALES, TEENS, TENS, WAW, ZERO, } from "./lexicon.js";
import { normalizeNumber } from "./normalize.js";
/** Split digit string into 3-digit groups, least significant first. */
function splitGroups(digits) {
    const groups = [];
    for (let end = digits.length; end > 0; end -= 3) {
        groups.push(parseInt(digits.slice(Math.max(0, end - 3), end), 10));
    }
    return groups;
}
/** Last two digits of a digit string. */
function lastTwo(digits) {
    return parseInt(digits.slice(-2), 10);
}
/** §3 — words for 1..999. `construct`: 200 exactly is followed directly by a scale word. */
function groupWords(g, gender, hf, construct) {
    const h = Math.floor(g / 100);
    const r = g % 100;
    const parts = [];
    if (h > 0) {
        const table = HUNDREDS[hf];
        parts.push(h === 2 && r === 0 && construct ? table.dualConstruct : table.words[h]);
    }
    if (r >= 1 && r <= 10)
        parts.push(ONES[gender][r]);
    else if (r >= 11 && r <= 19)
        parts.push(TEENS[gender][r - 10]);
    else if (r >= 20) {
        const u = r % 10;
        const t = Math.floor(r / 10);
        parts.push(u === 0 ? TENS[t] : COMPOUND_ONES[gender][u] + WAW + TENS[t]);
    }
    return parts.join(WAW);
}
/** §4 + §6 — a scale group (thousands and up). */
function scaleTerm(g, k, hf, construct) {
    const s = SCALES[k];
    if (g === 1)
        return s.singular;
    if (g === 2)
        return s.dual; // ألفان ريال (accounting usage, R2)
    const r = g % 100;
    let noun;
    if (r <= 2)
        noun = s.singular;
    else if (r <= 10)
        noun = s.plural;
    else
        noun = construct ? s.singular : s.accusative;
    // Hundreds directly before a scale word are always in construct (مائتا ألف).
    return groupWords(g, "m", hf, true) + " " + noun;
}
/** §7 — integer words without the counted noun. `nounFollows` triggers §6.2. */
function integerWords(digits, gender, hf, nounFollows) {
    if (digits === "0")
        return ZERO;
    const groups = splitGroups(digits);
    const parts = [];
    for (let k = groups.length - 1; k >= 1; k--) {
        const g = groups[k];
        if (g === 0)
            continue;
        const isLast = groups.slice(0, k).every((x) => x === 0);
        parts.push(scaleTerm(g, k, hf, isLast && nounFollows));
    }
    if (groups[0] > 0)
        parts.push(groupWords(groups[0], gender, hf, false)); // مائتان ريال (R2)
    return parts.join(WAW);
}
/** §5 — number + counted noun. */
function countPhrase(digits, forms, hf) {
    if (digits === "0")
        return ZERO + " " + forms.singular;
    if (digits === "1")
        return forms.one ?? forms.singular + " " + ONES[forms.gender][1];
    if (digits === "2")
        return forms.dual;
    const r = lastTwo(digits);
    let noun;
    if (r <= 2)
        noun = forms.singular;
    else if (r <= 10)
        noun = forms.plural;
    else
        noun = forms.accusative;
    return integerWords(digits, forms.gender, hf, true) + " " + noun;
}
/** §10 — fraction digits for the no-unit case: leading zeros read as صفر. */
function fractionDigitsWords(fraction, hf) {
    const lead = fraction.match(/^0*/)[0].length;
    const rest = fraction.slice(lead);
    const words = new Array(lead).fill(ZERO);
    if (rest)
        words.push(integerWords(rest, "m", hf, false));
    return words.join(" ");
}
/** Add one to a digit string. */
function incrementDigits(digits) {
    const a = digits.split("");
    let i = a.length - 1;
    while (i >= 0 && a[i] === "9")
        a[i--] = "0";
    if (i < 0)
        a.unshift("1");
    else
        a[i] = String(Number(a[i]) + 1);
    return a.join("");
}
/** §8 / P1 — round half-up to `d` fraction digits on strings. Returns [integer, subunit digits]. */
export function roundHalfUp(integer, fraction, d) {
    let digits = integer + fraction.slice(0, d).padEnd(d, "0");
    if ((fraction[d] ?? "0") >= "5")
        digits = incrementDigits(digits);
    const int = digits.slice(0, digits.length - d).replace(/^0+/, "") || "0";
    if (int.length > MAX_INTEGER_DIGITS)
        throw new TafqitError("TOO_LARGE");
    return [int, digits.slice(digits.length - d)];
}
/** Full phrase without prefix/suffix. */
export function phrase({ number, unit, hundredsForm: hf, decimals }) {
    let { integer } = number;
    const { fraction } = number;
    if (unit.forms === null) {
        const intText = integerWords(integer, "m", hf, false);
        if (!fraction)
            return intText;
        if (fraction.length > 15)
            throw new TafqitError("TOO_MANY_DECIMALS");
        return `${intText} ${DECIMAL_POINT_WORD} ${fractionDigitsWords(fraction, hf)}`;
    }
    let sub = "0";
    if (fraction) {
        if (!unit.subunit)
            throw new TafqitError("FRACTION_NOT_SUPPORTED", unit.label);
        const d = String(unit.subunit.ratio).length - 1;
        let subDigits = fraction.padEnd(d, "0");
        if (fraction.length > d) {
            if (decimals === "error")
                throw new TafqitError("TOO_MANY_DECIMALS", `${unit.label}: ${d}`);
            [integer, subDigits] = roundHalfUp(integer, fraction, d);
        }
        sub = subDigits.replace(/^0+/, "") || "0";
    }
    if (sub === "0")
        return countPhrase(integer, unit.forms, hf);
    const subText = countPhrase(sub, unit.subunit, hf);
    if (integer === "0")
        return subText;
    return countPhrase(integer, unit.forms, hf) + WAW + subText;
}
export { normalizeNumber };
