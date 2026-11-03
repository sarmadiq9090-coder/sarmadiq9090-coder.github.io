// Unit catalog loading and lookup, docs/SPEC.md §14.
import { TafqitError } from "./errors.js";
import { LANGUAGE_MODULES } from "./lang/index.js";
const FORM_KEYS = ["singular", "dual", "plural", "accusative"];
function checkForms(f, where) {
    for (const k of FORM_KEYS) {
        const v = f[k];
        if (typeof v !== "string" || v.trim() === "" || v !== v.trim()) {
            throw new TafqitError("INVALID_CATALOG", `${where}.${k}`);
        }
    }
    if (f.one !== undefined && (typeof f.one !== "string" || f.one.trim() === "" || f.one !== f.one.trim())) {
        throw new TafqitError("INVALID_CATALOG", `${where}.one`);
    }
    if (f.gender !== "m" && f.gender !== "f")
        throw new TafqitError("INVALID_CATALOG", `${where}.gender`);
}
const isText = (v) => typeof v === "string" && v.trim() !== "" && v === v.trim();
/** §17 — `i18n`: one entry per non-Arabic language, each {singular, plural, one?, gender?}. */
function checkI18n(i18n, where) {
    if (i18n === undefined)
        return;
    if (!i18n || typeof i18n !== "object" || Array.isArray(i18n))
        throw new TafqitError("INVALID_CATALOG", where);
    for (const [lang, f] of Object.entries(i18n)) {
        const spec = Object.prototype.hasOwnProperty.call(LANGUAGE_MODULES, lang)
            ? LANGUAGE_MODULES[lang].i18nForms
            : undefined;
        const at = `${where}.${lang}`;
        if (!spec || !f || typeof f !== "object" || Array.isArray(f))
            throw new TafqitError("INVALID_CATALOG", at);
        const allowed = spec.gender ? ["singular", "plural", "one", "gender"] : ["singular", "plural", "one"];
        for (const k of Object.keys(f))
            if (!allowed.includes(k))
                throw new TafqitError("INVALID_CATALOG", `${at}.${k}`);
        const forms = f;
        for (const k of ["singular", "plural"])
            if (!isText(forms[k]))
                throw new TafqitError("INVALID_CATALOG", `${at}.${k}`);
        if (forms.one !== undefined && !isText(forms.one))
            throw new TafqitError("INVALID_CATALOG", `${at}.one`);
        if (spec.gender && forms.gender !== "m" && forms.gender !== "f")
            throw new TafqitError("INVALID_CATALOG", `${at}.gender`);
    }
}
function isPowerOfTen(n) {
    if (!Number.isInteger(n) || n < 10)
        return false;
    while (n % 10 === 0)
        n /= 10;
    return n === 1;
}
/** Lookup key: trimmed, collapsed spaces, Latin lower-cased. */
export function unitKey(name) {
    return name.trim().replace(/\s+/g, " ").toLowerCase();
}
export class Catalog {
    constructor(data) {
        this.index = new Map();
        if (!data || data.schemaVersion !== 1 || !Array.isArray(data.units)) {
            throw new TafqitError("INVALID_CATALOG", "schemaVersion/units");
        }
        for (const u of data.units)
            this.add(u);
        this.units = data.units;
    }
    add(u) {
        const where = `units[${u?.id}]`;
        if (!u || typeof u.id !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(u.id)) {
            throw new TafqitError("INVALID_CATALOG", `${where}.id`);
        }
        if (typeof u.label !== "string" || u.label.trim() === "")
            throw new TafqitError("INVALID_CATALOG", `${where}.label`);
        if (u.forms === null) {
            if (u.category !== "none" || u.subunit || u.i18n !== undefined)
                throw new TafqitError("INVALID_CATALOG", `${where}.forms`);
        }
        else {
            checkForms(u.forms, `${where}.forms`);
            checkI18n(u.i18n, `${where}.i18n`);
        }
        if (u.subunit) {
            checkForms(u.subunit, `${where}.subunit`);
            checkI18n(u.subunit.i18n, `${where}.subunit.i18n`);
            if (!isPowerOfTen(u.subunit.ratio) || u.subunit.ratio > 1e8) {
                throw new TafqitError("INVALID_CATALOG", `${where}.subunit.ratio`);
            }
        }
        // id must be unique; other names may repeat only within the same unit.
        const idKey = unitKey(u.id);
        if (this.index.has(idKey))
            throw new TafqitError("INVALID_CATALOG", `duplicate name "${u.id}"`);
        this.index.set(idKey, u);
        const names = new Set([u.label, u.code ?? "", ...(u.aliases ?? [])].map(unitKey).filter(Boolean));
        names.delete(idKey);
        for (const k of names) {
            const other = this.index.get(k);
            if (other && other !== u)
                throw new TafqitError("INVALID_CATALOG", `duplicate name "${k}"`);
            this.index.set(k, u);
        }
    }
    find(name) {
        return this.index.get(unitKey(name));
    }
    get(name) {
        const u = this.find(name === undefined || name === "" ? "none" : name);
        if (!u)
            throw new TafqitError("UNKNOWN_UNIT", name);
        return u;
    }
}
