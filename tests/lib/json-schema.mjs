// A small JSON Schema (draft 2020-12) validator for the site's own data schemas (no dependencies).
// Supports: $ref (local "#/..." only), type, const, enum, pattern, minLength, properties, required,
// additionalProperties, propertyNames, minProperties, maxProperties, items, minItems, maxItems, uniqueItems.
// Any other keyword throws, so a schema never silently passes a rule this validator does not check.
// validate(schema, data) -> array of "path: message" strings (empty when valid).
const KNOWN = new Set(['$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'const', 'enum', 'pattern', 'minLength',
  'properties', 'required', 'additionalProperties', 'propertyNames', 'minProperties', 'maxProperties', 'items', 'minItems', 'maxItems', 'uniqueItems']);

const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function validate(root, data) {
  const errors = [];
  const resolve = ref => {
    if (!ref.startsWith('#/')) throw new Error(`unsupported $ref ${ref}`);
    return ref.slice(2).split('/').reduce((s, k) => { if (!s || !(k in s)) throw new Error(`unresolved $ref ${ref}`); return s[k]; }, root);
  };
  const walk = (s, v, at) => {
    for (const k of Object.keys(s)) if (!KNOWN.has(k)) throw new Error(`unsupported schema keyword ${k} at ${at}`);
    const err = msg => errors.push(`${at || '/'}: ${msg}`);
    if (s.$ref) walk(resolve(s.$ref), v, at);
    const t = typeOf(v);
    if (s.type && !(s.type === t || (s.type === 'number' && t === 'integer'))) return err(`expected ${s.type}, got ${t}`);
    if ('const' in s && !same(s.const, v)) err(`expected ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.some(e => same(e, v))) err(`${JSON.stringify(v)} not in ${JSON.stringify(s.enum)}`);
    if (t === 'string') {
      if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) err(`${JSON.stringify(v)} does not match ${s.pattern}`);
      if (s.minLength !== undefined && [...v].length < s.minLength) err(`shorter than ${s.minLength}`);
    }
    if (t === 'object') {
      const keys = Object.keys(v);
      for (const r of s.required || []) if (!(r in v)) err(`missing ${r}`);
      if (s.minProperties !== undefined && keys.length < s.minProperties) err(`fewer than ${s.minProperties} properties`);
      if (s.maxProperties !== undefined && keys.length > s.maxProperties) err(`more than ${s.maxProperties} properties`);
      for (const k of keys) {
        const p = `${at}/${k}`;
        if (s.propertyNames) walk(s.propertyNames, k, `${p} (name)`);
        if (s.properties && k in s.properties) walk(s.properties[k], v[k], p);
        else if (s.additionalProperties === false) err(`unexpected property ${k}`);
        else if (typeof s.additionalProperties === 'object') walk(s.additionalProperties, v[k], p);
      }
    }
    if (t === 'array') {
      if (s.minItems !== undefined && v.length < s.minItems) err(`fewer than ${s.minItems} items`);
      if (s.maxItems !== undefined && v.length > s.maxItems) err(`more than ${s.maxItems} items`);
      if (s.uniqueItems && new Set(v.map(x => JSON.stringify(x))).size !== v.length) err('items not unique');
      if (s.items) v.forEach((x, i) => walk(s.items, x, `${at}/${i}`));
    }
  };
  walk(root, data, '');
  return errors;
}
