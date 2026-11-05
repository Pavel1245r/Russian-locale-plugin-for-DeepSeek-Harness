// Smoke test: run lib/client.js the way the Web module loader does and verify
// that applying the plugin registers the Russian language plus every namespace.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

const registered = []
const languages = []
let loaded = null
const sandbox = { window: {} }
sandbox.window.__ModuleLoader__ = {
  load(record) {
    loaded = record
  },
}
const context = vm.createContext(sandbox)
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'lib', 'client.js'), 'utf8'), context)

if (!loaded) throw new Error('bundle did not call __ModuleLoader__.load')
if (loaded.id !== 'dsh-locale-ru') throw new Error('unexpected module id ' + loaded.id)

const exports = loaded.factory((name) => {
  throw new Error('bundle must not require modules, got ' + name)
})
if (typeof exports.apply !== 'function') throw new Error('missing apply')
if (!Array.isArray(exports.inject) || exports.inject[0] !== 'locale') throw new Error('missing inject')

const effects = []
const ctx = {
  effect(fn, label) {
    effects.push(label)
    const dispose = fn()
    if (typeof dispose !== 'function') throw new Error('effect must return a disposer: ' + label)
    return dispose
  },
  locale: {
    addLanguage(def) {
      languages.push(def)
      return () => {}
    },
    register(ns, locale, dict) {
      registered.push({ ns, locale, count: Object.keys(dict).length })
      return () => {}
    },
  },
}

exports.apply(ctx)

if (languages.length !== 1 || languages[0].id !== 'ru') throw new Error('language not registered')
if (registered.length !== Object.keys(exports.DICTS).length) throw new Error('dictionary count mismatch')
const badLocale = registered.filter((r) => r.locale !== 'ru')
if (badLocale.length) throw new Error('non-ru dictionaries registered')
const empty = registered.filter((r) => r.count === 0)
if (empty.length) throw new Error('empty namespaces: ' + empty.map((r) => r.ns).join(','))

console.log(
  `ok: language=${languages[0].label}, namespaces=${registered.length}, keys=${registered.reduce((n, r) => n + r.count, 0)}, effects=${effects.length}`,
)
