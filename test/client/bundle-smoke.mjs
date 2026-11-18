/**
 * Built-artifact smoke test for the browser half.
 *
 * Loads `lib/client.js` the way the DSH client module loader does — by putting
 * the file in a VM with `window.__ModuleLoader__.load` — then calls the
 * factory with a fake `require` and drives `apply` through a fake Cordis
 * context. It proves the tsdown wrapper, the exported `apply`/`inject`, the
 * row registration, the dictionaries, and the command all survive bundling.
 *
 * Run after `npm run build:client` (the `smoke:client` script).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
let definition
const sandbox = {
  window: { __ModuleLoader__: { load: (value) => { definition = value } } },
  setTimeout,
  clearTimeout,
  console,
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(source, sandbox)

assert.equal(definition?.id, 'dsh-thin-search', 'the bundle must declare the package id')
const react = {
  useCallback: (fn) => fn,
  useEffect: () => {},
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}
const jsxRuntime = {
  jsx: (type, props) => ({ type, props }),
  jsxs: (type, props) => ({ type, props }),
  Fragment: Symbol('Fragment'),
}
const require = (specifier) => {
  if (specifier === 'react') return react
  if (specifier === 'react/jsx-runtime') return jsxRuntime
  throw new Error(`unexpected require("${specifier}")`)
}
/** Copy a VM-realm value into this realm for structural assertions. */
const plain = (value) => JSON.parse(JSON.stringify(value))
const exports = definition.factory(require)
assert.equal(typeof exports.apply, 'function', 'the bundle must export apply')
assert.deepEqual([...exports.inject].map(String), ['slots', 'locale', 'remote', 'remote.web', 'configForms'])

const records = { whileServed: [], registrations: [], commands: [], dictionaries: [], forms: new Map() }
const makeForm = (value, accept = true) => {
  let snapshot = { status: 'ready', value, base: undefined, user: undefined, revision: 1, writable: true }
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    async set(field, next) {
      if (!accept) return false
      snapshot = { ...snapshot, value: { ...snapshot.value, [field]: next }, revision: snapshot.revision + 1 }
      for (const listener of [...listeners]) listener()
      return true
    },
    async unset() { return accept },
    async mutate() { return accept },
  }
}
const forms = new Map([
  ['thin-search', makeForm({ provider: 'bing' })],
  ['web', makeForm({ searchProvider: 'thin-search' })],
])
const context = {
  configForms: {
    get: (id) => { if (!forms.has(id)) forms.set(id, makeForm({})); return forms.get(id) },
    whileServed: (namespaces, register) => {
      records.whileServed.push(namespaces)
      return register(new Set(['thin-search']))
    },
  },
  locale: {
    bind: () => (key) => key,
    register: (namespace, dictionaries) => { records.dictionaries.push({ namespace, dictionaries }); return () => {} },
    getSnapshot: () => ({ active: 'en', revision: 0, locales: [] }),
    subscribe: () => () => {},
    resolveText: (text) => typeof text === 'string' ? text : text.en,
  },
  slots: {
    register: (options, component) => { records.registrations.push({ options, component }); return () => {} },
    inject: (_slot, callback) => callback(),
  },
  remote: {
    web: { listProviders: async () => ({ ok: true, value: { search: [{ id: 'thin-search' }], fetch: [] } }) },
    $on: () => () => {},
  },
  effect: (callback) => {
    const dispose = callback()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  inject: (_deps, callback) => callback(context),
  get: (name) => name === 'commandUi'
    ? { register: (command) => { records.commands.push(command); return () => {} } }
    : undefined,
  on: () => () => {},
}
exports.apply(context)

assert.deepEqual(plain(records.whileServed), [['thin-search']])
assert.deepEqual(plain(records.dictionaries.map((entry) => entry.namespace)), ['thin-search'])
assert.deepEqual(plain(records.registrations.map((entry) => entry.options)), [
  { name: 'plugins.row.config', key: 'dsh-thin-search#thin-search' },
])
const summary = records.registrations[0].component({ view: 'summary' })
assert.equal(typeof summary, 'string', 'the summary view must render text')
assert.ok(summary.length > 0)
const command = records.commands[0]
assert.equal(command.name, 'thin-search-engine')
const options = await command.ui.options({}, new AbortController().signal)
assert.deepEqual(plain(options.map((option) => option.id)), ['bing', 'anysearch', 'searxng', 'ddg', 'ddg-lite'])
await command.ui.onSelect({ id: 'searxng', label: 'SearXNG' }, {})
assert.deepEqual(plain(forms.get('thin-search').getSnapshot().value), { provider: 'searxng' })

console.log(JSON.stringify(plain({
  bundle: 'lib/client.js',
  id: definition.id,
  inject: [...exports.inject],
  whileServed: records.whileServed,
  registration: records.registrations[0].options,
  dictionaries: records.dictionaries.map((entry) => Object.keys(entry.dictionaries).sort()),
  command: command.name,
  engines: options.map((option) => option.id),
  providerAfterSelect: forms.get('thin-search').getSnapshot().value.provider,
})))
