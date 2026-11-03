// Shared conversion pipeline (docs/SPEC.md §8–§10, §17): fraction → subunit, rounding,
// limits and errors. The words come from the language modules in src/lang/.
import { TafqitError } from "./errors.js";
import { MAX_INTEGER_DIGITS } from "./lexicon.js";
import { LANGUAGE_MODULES } from "./lang/index.js";
import { normalizeNumber } from "./normalize.js";
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
export function phrase({ number, unit, hundredsForm: hf, decimals, language = "ar" }) {
    const lang = LANGUAGE_MODULES[language];
    let { integer } = number;
    const { fraction } = number;
    if (unit.forms === null) {
        if (fraction.length > 15)
            throw new TafqitError("TOO_MANY_DECIMALS");
        return lang.plain(integer, fraction, hf);
    }
    const forms = lang.pickForms(unit.forms, unit.i18n);
    if (forms === undefined)
        throw new TafqitError("NO_LANGUAGE_FORMS", `${unit.id}: ${language}`);
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
        return lang.count(integer, forms, hf);
    const subForms = lang.pickForms(unit.subunit, unit.subunit.i18n);
    if (subForms === undefined)
        throw new TafqitError("NO_LANGUAGE_FORMS", `${unit.id}.subunit: ${language}`);
    const subText = lang.count(sub, subForms, hf);
    if (integer === "0")
        return subText;
    return lang.count(integer, forms, hf) + lang.subunitJoiner + subText;
}
export { normalizeNumber };
