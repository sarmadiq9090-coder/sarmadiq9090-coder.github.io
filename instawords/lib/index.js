// Public API. Zero dependencies; runs in browsers and Node.
import { Catalog } from "./catalog.js";
import { TafqitError, WARNING_MESSAGES } from "./errors.js";
import { phrase } from "./engine.js";
import { normalizeNumber } from "./normalize.js";
import { isLanguage } from "./lang/index.js";
import defaultCatalogData from "./generated/units-data.js";
export { TafqitError, ERROR_MESSAGES, WARNING_MESSAGES } from "./errors.js";
export { normalizeNumber } from "./normalize.js";
export { Catalog } from "./catalog.js";
export { LANGUAGES } from "./lang/index.js";
const HUNDREDS_FORMS = ["مائة", "مئة"];
function resolveHundreds(v) {
    if (v === undefined || v === "")
        return "مائة";
    if (HUNDREDS_FORMS.includes(v))
        return v;
    throw new TafqitError("INVALID_OPTION", `hundredsForm=${v}`);
}
function resolveLanguage(v) {
    if (v === undefined || v === "")
        return "ar";
    if (isLanguage(v))
        return v;
    throw new TafqitError("INVALID_OPTION", `language=${v}`);
}
/** Create an engine bound to a units catalog (e.g. a customised units.json). */
export function createTafqit(catalogData = defaultCatalogData) {
    const catalog = new Catalog(catalogData);
    const run = (input, options, warnings) => {
        const language = resolveLanguage(options.language);
        const unit = catalog.get(options.unit);
        // Validated for every language, but only Arabic uses it.
        const hundredsForm = resolveHundreds(options.hundredsForm);
        const number = normalizeNumber(input, language);
        const decimals = options.decimals ?? "round";
        if (decimals !== "round" && decimals !== "error")
            throw new TafqitError("INVALID_OPTION", `decimals=${decimals}`);
        const text = phrase({ number, unit, hundredsForm, decimals, language, warnings });
        return [options.prefix?.trim(), text, options.suffix?.trim()].filter(Boolean).join(" ");
    };
    const tafqit = (input, options = {}) => run(input, options, []);
    const tryTafqit = (input, options = {}) => {
        let cleaned;
        try {
            // The separator convention of the output language; Arabic's when the language is invalid.
            cleaned = normalizeNumber(input, isLanguage(options.language) ? options.language : "ar").cleaned;
        }
        catch {
            /* reported below */
        }
        try {
            const warnings = [];
            const result = run(input, options, warnings);
            return {
                ok: true, result, cleaned: cleaned,
                ...(warnings.length ? { warnings: warnings.map((code) => ({ code, message: WARNING_MESSAGES[code] })) } : {}),
            };
        }
        catch (e) {
            if (e instanceof TafqitError) {
                const error = { code: e.code, message: e.message, ...(e.readings ? { readings: [...e.readings] } : {}) };
                return { ok: false, error, ...(cleaned !== undefined ? { cleaned } : {}) };
            }
            throw e;
        }
    };
    const convert = (req) => ({
        result: tafqit(req.the_number, { unit: req.unit, hundredsForm: req.hundreds_form, language: req.language }),
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
