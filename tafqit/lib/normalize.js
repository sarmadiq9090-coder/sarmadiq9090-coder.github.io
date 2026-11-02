// Input cleaning, docs/SPEC.md §1. Pure string processing — no floats.
import { TafqitError } from "./errors.js";
import { MAX_INTEGER_DIGITS } from "./lexicon.js";
const SPACES = /[    \t\r\n]/g;
const THOUSANDS = /[,٬]/g;
const DECIMAL = /٫/g;
const VALID = /^(\d+(\.\d*)?|\.\d+)$/;
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
export function normalizeNumber(input) {
    if (typeof input === "number") {
        if (!Number.isFinite(input))
            throw new TafqitError("INVALID_FORMAT");
        // Numbers are accepted for convenience; strings are recommended for money.
        input = Number.isInteger(input) ? BigInt(input).toString() : String(input);
    }
    let s = String(input).replace(SPACES, "");
    if (s === "")
        throw new TafqitError("EMPTY");
    s = toAsciiDigits(s).replace(THOUSANDS, "").replace(DECIMAL, ".");
    if (/^[-−]/.test(s))
        throw new TafqitError("NEGATIVE");
    if (s.startsWith("+"))
        s = s.slice(1);
    if (!VALID.test(s))
        throw new TafqitError("INVALID_FORMAT");
    const dot = s.indexOf(".");
    let integer = dot === -1 ? s : s.slice(0, dot);
    let fraction = dot === -1 ? "" : s.slice(dot + 1);
    integer = integer.replace(/^0+/, "") || "0";
    fraction = fraction.replace(/0+$/, "");
    if (integer.length > MAX_INTEGER_DIGITS)
        throw new TafqitError("TOO_LARGE");
    return { integer, fraction, cleaned: fraction ? `${integer}.${fraction}` : integer };
}
