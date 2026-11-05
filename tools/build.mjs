// Builds lib/client.js from locales/en.json (namespace → key → English copy)
// plus locales/ru*.json (English source string → Russian). Keys without a
// translation keep the English copy, so a partial pack still works.
import fs from 'node:fs'
import path from 'node:path'

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const dir = path.join(root, '..')
const localesDir = path.join(dir, 'locales')

const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'))

const ru = {}
const parts = fs
  .readdirSync(localesDir)
  .filter((name) => /^ru(\..+)?\.json$/.test(name))
  .sort()
for (const name of parts) {
  Object.assign(ru, JSON.parse(fs.readFileSync(path.join(localesDir, name), 'utf8')))
}

const overridesPath = path.join(localesDir, 'ru.overrides.json')
const overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')) : {}

const dicts = {}
const missing = []
const placeholderMismatch = []
let translated = 0
let total = 0

for (const [ns, entries] of Object.entries(en)) {
  const out = {}
  dicts[ns] = out
  for (const [key, source] of Object.entries(entries)) {
    total += 1
    // A per-key override wins over the shared English → Russian map, which lets
    // one English word carry different Russian wording in different contexts.
    const value = Object.hasOwn(overrides, `${ns}:${key}`) ? overrides[`${ns}:${key}`] : ru[source]
    if (typeof value === 'string') {
      out[key] = value
      translated += 1
      const before = [...source.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
      const after = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
      if (before !== after) placeholderMismatch.push({ ns, key, source, value })
    } else {
      out[key] = source
      missing.push(source)
    }
  }
}

const uniqueMissing = [...new Set(missing)]

const body = `window.__ModuleLoader__.load({
\tid: "dsh-locale-ru",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
\t\tconst DICTS = ${JSON.stringify(dicts, null, '\t')};
\t\tconst inject = ["locale"];
\t\tfunction apply(ctx) {
\t\t\tctx.effect(() => ctx.locale.addLanguage({ id: "ru", label: "Русский", fallback: "en" }), "locale-ru: language");
\t\t\tfor (const ns of Object.keys(DICTS)) {
\t\t\t\tctx.effect(() => ctx.locale.register(ns, "ru", DICTS[ns]), "locale-ru: dictionary " + ns);
\t\t\t}
\t\t}
\t\texports.DICTS = DICTS;
\t\texports.apply = apply;
\t\texports.inject = inject;
\t\treturn module.exports;
\t}
});
`

fs.writeFileSync(path.join(dir, 'lib', 'client.js'), body)

console.log(`namespaces ${Object.keys(dicts).length}, keys ${total}, translated ${translated}, missing ${uniqueMissing.length}`)
if (placeholderMismatch.length > 0) {
  console.log('placeholder mismatches:')
  for (const item of placeholderMismatch) console.log(' ', item.ns, item.key, JSON.stringify(item.source), '->', JSON.stringify(item.value))
}
if (uniqueMissing.length > 0) {
  console.log('untranslated source strings:')
  for (const source of uniqueMissing) console.log('  ' + JSON.stringify(source))
}
