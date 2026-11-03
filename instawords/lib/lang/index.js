import { arabic } from "./ar.js";
import { english } from "./en.js";
import { french } from "./fr.js";
export const LANGUAGE_MODULES = Object.freeze({
    ar: arabic,
    en: english,
    fr: french,
});
/** Supported output languages, in picker order (Arabic first, the default). */
export const LANGUAGES = Object.freeze(Object.values(LANGUAGE_MODULES).map((m) => Object.freeze({ ...m.info })));
export function isLanguage(v) {
    return typeof v === "string" && Object.prototype.hasOwnProperty.call(LANGUAGE_MODULES, v);
}
