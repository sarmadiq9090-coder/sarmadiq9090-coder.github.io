// Input cleaning, docs/SPEC.md §1. Pure string processing — no floats.
import { AMBIGUITY_QUESTION, TafqitError } from "./errors.js";
import { MAX_INTEGER_DIGITS } from "./lexicon.js";
import { isLanguage } from "./lang/index.js";
/** Spaces: trimmed at both ends; between digits they separate thousands groups (§1.1). */
const SPACES = /[\u0020\u00a0\u2009\u202f\t\r\n]/;
const EDGE_SPACES = /^[\u0020\u00a0\u2009\u202f\t\r\n]+|[\u0020\u00a0\u2009\u202f\t\r\n]+$/g;
/** U+066B ARABIC DECIMAL SEPARATOR: always the decimal point. */
const AR_DECIMAL = "٫";
/** U+066C ARABIC THOUSANDS SEPARATOR: always a thousands separator. */
const AR_THOUSANDS = "٬";
/** Separator written for a run of spaces between two digits. */
const SPACE = " ";
function toAsciiDigits(s) {
    let out = "";
    for (const ch of s) {
        const c = ch.charCodeAt(0);
        if (c >= 0x0660 && c <= 0x0669)
            out += String.fromCharCode(c - 0x0660 + 48);
        else if (c >= 0x06f0 && c <= 0x06f9)
            out += String.fromCharCode(c - 0x06f0 + 48);
        else
            out += ch;
    }
    return out;
}
const isDigit = (ch) => ch >= "0" && ch <= "9";
/** First group of a grouped number: 1–3 digits once its leading zeros are dropped (§1.1). */
function isLeadGroup(g) {
    const t = g.replace(/^0+/, "");
    return t.length >= 1 && t.length <= 3;
}
/**
 * One reading of an ambiguous number for the AMBIGUOUS_SEPARATOR message: "," is the decimal
 * point (`decimalComma`) or a thousands separator, "." the other one; spaces and ٬ are thousands
 * separators and ٫ the decimal point in both. Fraction digits are kept as written (12.50), so the
 * user recognises them. undefined when that reading is not a number.
 */
function reading(body, decimalComma) {
    let s = "";
    for (const ch of body) {
        if (isDigit(ch))
            s += ch;
        else if (ch === AR_DECIMAL)
            s += ".";
        else if (ch === ",")
            s += decimalComma ? "." : "";
        else if (ch === ".")
            s += decimalComma ? "" : ".";
        // spaces and ٬ are dropped
    }
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s))
        return undefined;
    const dot = s.indexOf(".");
    const integer = (dot === -1 ? s : s.slice(0, dot)).replace(/^0+/, "") || "0";
    const fraction = dot === -1 ? "" : s.slice(dot + 1);
    return fraction ? `${integer}.${fraction}` : integer;
}
/** The distinct readings, the one that takes the last separator as the decimal point first. */
function readings(body, lastSeparator) {
    const commaFirst = lastSeparator === ",";
    const out = [];
    for (const r of [reading(body, commaFirst), reading(body, !commaFirst)]) {
        if (r !== undefined && !out.includes(r))
            out.push(r);
    }
    return out;
}
/** The AMBIGUOUS_SEPARATOR error, with the readings in the detail: «هل تقصد 12.50 أم 1250؟». */
function ambiguous(body, lastSeparator) {
    const r = readings(body, lastSeparator);
    const q = AMBIGUITY_QUESTION;
    return new TafqitError("AMBIGUOUS_SEPARATOR", r.length ? q.start + r.join(q.or) + q.end : undefined, r);
}
/**
 * Clean a number (§1). `language` selects the separator convention (§1.1): "," is the decimal
 * point for "fr", a thousands separator otherwise. A JavaScript number or bigint is always read
 * with "." as the decimal point, whatever the language.
 */
export function normalizeNumber(input, language) {
    if (language !== undefined && language !== "" && !isLanguage(language)) {
        throw new TafqitError("INVALID_OPTION", `language=${String(language)}`);
    }
    let decimalComma = language === "fr";
    if (typeof input === "number") {
        if (!Number.isFinite(input))
            throw new TafqitError("INVALID_FORMAT");
        // Numbers are accepted for convenience; strings are recommended for money.
        input = Number.isInteger(input) ? BigInt(input).toString() : String(input);
        decimalComma = false;
    }
    else if (typeof input === "bigint") {
        decimalComma = false;
    }
    let s = String(input).replace(EDGE_SPACES, "");
    if (s === "")
        throw new TafqitError("EMPTY");
    if (s[0] === "-" || s[0] === "−")
        throw new TafqitError("NEGATIVE");
    if (s[0] === "+")
        s = s.slice(1).replace(EDGE_SPACES, "");
    const body = toAsciiDigits(s);
    // Tokens: digit groups and the separators between them. A run of spaces between two digits is
    // one SPACE separator; spaces next to another separator are dropped ("1, 250" = "1,250").
    const groups = [""];
    const seps = [];
    let digits = 0;
    let space = false;
    let afterSep = false;
    for (const ch of body) {
        if (isDigit(ch)) {
            if (space) {
                seps.push(SPACE);
                groups.push("");
            }
            groups[groups.length - 1] += ch;
            digits++;
            space = false;
            afterSep = false;
        }
        else if (SPACES.test(ch)) {
            if (!afterSep)
                space = true;
        }
        else if (ch === "," || ch === "." || ch === AR_DECIMAL || ch === AR_THOUSANDS) {
            if (afterSep)
                throw new TafqitError("INVALID_FORMAT"); // two separators in a row
            seps.push(ch);
            groups.push("");
            space = false;
            afterSep = true;
        }
        else {
            throw new TafqitError("INVALID_FORMAT");
        }
    }
    if (digits === 0)
        throw new TafqitError("INVALID_FORMAT");
    // The decimal point: index into seps, or -1 (§1.1).
    const k = seps.length;
    const last = seps[k - 1] ?? "";
    let dec = -1;
    if (seps.includes(AR_DECIMAL)) {
        // ٫ is the decimal point in every language: once, last, and never with ".".
        if (seps.indexOf(AR_DECIMAL) !== k - 1 || seps.includes("."))
            throw new TafqitError("INVALID_FORMAT");
        dec = k - 1;
    }
    else if (!decimalComma) {
        // Arabic and English: "." is the decimal point and must come after every other separator.
        const dot = seps.indexOf(".");
        if (dot !== -1) {
            if (dot !== k - 1)
                throw ambiguous(body, last); // 1.250,75 · 1.250.000 · 1.5 000
            dec = dot;
        }
    }
    else if (last === "," || last === ".") {
        // French: the last "," or "." is the decimal point when it is the only one of its kind
        // (1 250,75 · 1.250,75 · 1,250.75 · 12,50 · 1,250 · 5.250); several are thousands (1.250.000).
        if (seps.filter((x) => x === last).length === 1)
            dec = k - 1;
    }
    // Thousands separators: one kind, a first group of 1–3 digits, then groups of exactly 3.
    const end = dec === -1 ? k : dec;
    for (let i = 0; i < end; i++) {
        if (seps[i] !== seps[0] || groups[i + 1].length !== 3)
            throw ambiguous(body, last);
    }
    if (end > 0 && !isLeadGroup(groups[0]))
        throw ambiguous(body, last);
    let integer = groups.slice(0, end + 1).join("");
    let fraction = dec === -1 ? "" : groups[k];
    integer = integer.replace(/^0+/, "") || "0";
    fraction = fraction.replace(/0+$/, "");
    if (integer.length > MAX_INTEGER_DIGITS)
        throw new TafqitError("TOO_LARGE");
    return { integer, fraction, cleaned: fraction ? `${integer}.${fraction}` : integer };
}
