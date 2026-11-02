// Unit catalog loading and lookup, docs/SPEC.md §14.
import { TafqitError } from "./errors.js";
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
            if (u.category !== "none" || u.subunit)
                throw new TafqitError("INVALID_CATALOG", `${where}.forms`);
        }
        else {
            checkForms(u.forms, `${where}.forms`);
        }
        if (u.subunit) {
            checkForms(u.subunit, `${where}.subunit`);
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
