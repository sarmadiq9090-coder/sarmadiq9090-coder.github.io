// Public API. Zero dependencies; runs in browsers and Node.
import { Catalog } from "./catalog.js";
import { TafqitError } from "./errors.js";
import { phrase } from "./engine.js";
import { normalizeNumber } from "./normalize.js";
import defaultCatalogData from "./generated/units-data.js";
export { TafqitError, ERROR_MESSAGES } from "./errors.js";
export { normalizeNumber } from "./normalize.js";
export { Catalog } from "./catalog.js";
const HUNDREDS_FORMS = ["مائة", "مئة"];
function resolveHundreds(v) {
    if (v === undefined || v === "")
        return "مائة";
    if (HUNDREDS_FORMS.includes(v))
        return v;
    throw new TafqitError("INVALID_OPTION", `hundredsForm=${v}`);
}
/** Create an engine bound to a units catalog (e.g. a customised units.json). */
export function createTafqit(catalogData = defaultCatalogData) {
    const catalog = new Catalog(catalogData);
    const tafqit = (input, options = {}) => {
        const unit = catalog.get(options.unit);
        const hundredsForm = resolveHundreds(options.hundredsForm);
        const number = normalizeNumber(input);
        const decimals = options.decimals ?? "round";
        if (decimals !== "round" && decimals !== "error")
            throw new TafqitError("INVALID_OPTION", `decimals=${decimals}`);
        const text = phrase({ number, unit, hundredsForm, decimals });
        return [options.prefix?.trim(), text, options.suffix?.trim()].filter(Boolean).join(" ");
    };
    const tryTafqit = (input, options) => {
        let cleaned;
        try {
            cleaned = normalizeNumber(input).cleaned;
        }
        catch {
            /* reported below */
        }
        try {
            return { ok: true, result: tafqit(input, options), cleaned: cleaned };
        }
        catch (e) {
            if (e instanceof TafqitError) {
                return { ok: false, error: { code: e.code, message: e.message }, ...(cleaned !== undefined ? { cleaned } : {}) };
            }
            throw e;
        }
    };
    const convert = (req) => ({
        result: tafqit(req.the_number, { unit: req.unit, hundredsForm: req.hundreds_form }),
    });
    return { tafqit, tryTafqit, convert, units: catalog.units, findUnit: (n) => catalog.find(n) };
}
const defaultEngine = createTafqit();
export const tafqit = defaultEngine.tafqit;
export const tryTafqit = defaultEngine.tryTafqit;
export const convert = defaultEngine.convert;
export const units = defaultEngine.units;
export const findUnit = defaultEngine.findUnit;
export default tafqit;
