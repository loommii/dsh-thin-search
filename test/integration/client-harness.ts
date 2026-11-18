/**
 * Loads the built browser half (`lib/client.js`) through the DSH
 * `window.__ModuleLoader__.load` contract and drives it with a minimal
 * stateful React stand-in.
 *
 * The harness is deliberately independent of `test/client`: it proves that the
 * shipped bundle registers `plugins.bundle.config` keyed by the package name,
 * renders the card without owner form props, writes each control immediately
 * through `configForms.get('thin-search')`, switches the global provider
 * through `configForms.get('web')`, and registers the
 * `/thin-search-engine` command.
 */
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

/** One recorded ConfigForm write. */
export interface FormCall {
  readonly kind: 'set' | 'unset' | 'mutate'
  readonly field?: string
  readonly value?: unknown
  readonly ops?: readonly SettingsOp[]
  readonly revision?: number
}

/** One ordered settings path operation. */
export interface SettingsOp {
  readonly op: 'set' | 'unset'
  readonly path: readonly string[]
  readonly value?: unknown
}

/** A ConfigForm double with its recorded writes. */
export interface FakeForm {
  readonly form: Record<string, any>
  readonly calls: FormCall[]
}

/** Options for the ConfigForm double. */
export interface FakeFormOptions {
  /** Host document accepts writes; defaults to true. */
  readonly writable?: boolean
  /** ConfigForm lifecycle state; defaults to ready. */
  readonly status?: 'ready' | 'loading' | 'unavailable'
  /** When false, every write is refused without changing the accepted section. */
  readonly acceptWrites?: boolean
}

/** Build a ConfigForm double over an accepted section. */
export function createForm(initial: Record<string, unknown>, revision = 0, options: FakeFormOptions = {}): FakeForm {
  let state: Record<string, any> = {
    status: options.status ?? 'ready',
    value: initial,
    base: undefined,
    user: undefined,
    revision,
    writable: options.writable ?? true,
  }
  const calls: FormCall[] = []
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of [...listeners]) listener() }
  const apply = (ops: readonly SettingsOp[]): void => {
    const value = { ...(state.value ?? {}) } as Record<string, unknown>
    for (const op of ops) {
      const field = op.path[0]
      if (field === undefined) continue
      if (op.op === 'set') value[field] = op.value
      else delete value[field]
    }
    state = { ...state, value }
  }
  const revisionCall = (): { revision?: number } => state.revision === undefined ? {} : { revision: state.revision }
  const form = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async set(field: string, value: unknown) {
      calls.push({ kind: 'set', field, value, ...revisionCall() })
      if (options.acceptWrites === false) return false
      apply([{ op: 'set', path: [field], value }])
      state = { ...state, revision: (state.revision ?? 0) + 1 }
      notify()
      return true
    },
    async unset(field: string) {
      calls.push({ kind: 'unset', field, ...revisionCall() })
      if (options.acceptWrites === false) return false
      apply([{ op: 'unset', path: [field] }])
      state = { ...state, revision: (state.revision ?? 0) + 1 }
      notify()
      return true
    },
    async mutate(ops: readonly SettingsOp[], expectedRevision?: number) {
      calls.push({ kind: 'mutate', ops, ...expectedRevision === undefined ? {} : { revision: expectedRevision } })
      if (options.acceptWrites === false) return false
      apply(ops)
      state = { ...state, revision: (state.revision ?? 0) + 1 }
      notify()
      return true
    },
  }
  return { form, calls }
}

/** A rendered host element from the stand-in renderer. */
export interface RenderedElement {
  readonly type: string
  readonly props: Record<string, any>
}

/** The loaded browser bundle and the fake context it was applied to. */
export interface ClientHarness {
  readonly source: string
  readonly definitionId: string
  readonly exports: Record<string, any>
  readonly whileServed: readonly (readonly string[])[]
  readonly registrations: readonly { readonly options: Record<string, any>; readonly component: (props: any) => unknown }[]
  readonly commands: readonly Record<string, any>[]
  readonly dictionaries: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>> 
  readonly forms: ReadonlyMap<string, FakeForm>
  readonly providerReads: () => number
  renderPage(): RenderedElement[]
  find(control: string, id?: string): RenderedElement | undefined
  findAll(control: string): RenderedElement[]
  change(control: string, value: string, id?: string): void
  toggle(control: string, checked: boolean, id?: string): void
  blur(control: string, id?: string): void
  keyDown(control: string, key: string, id?: string): void
  click(control: string, id?: string): void
  clickOption(control: string, value: string): void
  flush(): Promise<void>
}

const FRAGMENT = Symbol('Fragment')

/** Walk the element tree, invoking function components the way React would. */
function walk(node: unknown, visit: (element: RenderedElement) => void): void {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'number' || typeof node === 'string') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  const element = node as { type?: unknown; props?: Record<string, any> }
  if (element.type === FRAGMENT) {
    walk(element.props?.['children'], visit)
    return
  }
  if (typeof element.type === 'function') {
    walk((element.type as (props: unknown) => unknown)(element.props ?? {}), visit)
    return
  }
  if (typeof element.type !== 'string') return
  const rendered: RenderedElement = { type: element.type, props: element.props ?? {} }
  visit(rendered)
  walk(rendered.props['children'], visit)
}

/** Build a stateful React stand-in whose hook cells survive re-renders. */
function createReact() {
  const cells: unknown[] = []
  let cursor = 0
  const useState = (initial: unknown): [unknown, (next: unknown) => void] => {
    const index = cursor++
    if (!(index in cells)) {
      cells[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
    }
    return [cells[index], (next: unknown) => {
      cells[index] = typeof next === 'function' ? (next as (value: unknown) => unknown)(cells[index]) : next
    }]
  }
  const react = {
    useState,
    useEffect: (effect: () => void | (() => void)) => { effect() },
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useRef: (current: unknown) => ({ current }),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
    createElement: (type: unknown, props: Record<string, any> | null, ...children: unknown[]) => ({
      type,
      props: { ...props ?? {}, ...children.length === 0 ? {} : { children: children.length === 1 ? children[0] : children } },
    }),
  }
  const jsxRuntime = {
    jsx: (type: unknown, props: Record<string, any>) => ({ type, props: props ?? {} }),
    jsxs: (type: unknown, props: Record<string, any>) => ({ type, props: props ?? {} }),
    Fragment: FRAGMENT,
  }
  return {
    react,
    jsxRuntime,
    reset: (): void => { cursor = 0 },
  }
}

/** Build a locale double backed by the dictionaries the bundle registers. */
function createLocale(records: { dictionaries: Record<string, Record<string, Record<string, string>>> }) {
  let active = 'en'
  return {
    bind: (namespace: string) => (key: string, params?: Record<string, unknown>) => {
      const dictionary = records.dictionaries[namespace]?.[active] ?? records.dictionaries[namespace]?.['en']
      const template = dictionary?.[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
    },
    register: (namespace: string, dictionaries: Record<string, Record<string, string>>) => {
      records.dictionaries[namespace] = dictionaries
      return () => undefined
    },
    getSnapshot: () => ({ active, revision: 0, locales: [] }),
    subscribe: () => () => undefined,
    resolveText: (text: Record<string, string>) => text[active] ?? text['en'] ?? '',
    setActive: (locale: string) => { active = locale },
  }
}

/**
 * Load the built client bundle and apply it over a fake Cordis client context.
 * @param options - accepted thin-search/web sections and their revision.
 */
export async function createClientHarness(options: {
  readonly thinSearch?: Record<string, unknown>
  readonly web?: Record<string, unknown>
  readonly revision?: number
  readonly thinSearchWritable?: boolean
  readonly webWritable?: boolean
  readonly thinSearchStatus?: 'ready' | 'loading' | 'unavailable'
  readonly acceptThinSearchWrites?: boolean
} = {}): Promise<ClientHarness> {
  const source = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
  let definition: { id: string; factory(require: (specifier: string) => unknown): Record<string, any> } | undefined
  const sandbox: Record<string, any> = {
    window: { __ModuleLoader__: { load: (value: typeof definition) => { definition = value } } },
    document: {
      querySelector: () => null,
      createElement: () => ({ dataset: {} }),
      head: { appendChild: () => undefined },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    setTimeout,
    clearTimeout,
    console,
  }
  sandbox['globalThis'] = sandbox
  createContext(sandbox)
  runInContext(source, sandbox)
  if (definition === undefined) throw new Error('lib/client.js did not call window.__ModuleLoader__.load')
  const loaded = definition as { id: string; factory(require: (specifier: string) => unknown): Record<string, any> }

  const reactState = createReact()
  const require = (specifier: string): unknown => {
    if (specifier === 'react') return reactState.react
    if (specifier === 'react/jsx-runtime') return reactState.jsxRuntime
    throw new Error(`unexpected require("${specifier}")`)
  }
  const exports = loaded.factory(require)

  const records = {
    whileServed: [] as string[][],
    registrations: [] as { options: Record<string, any>; component: (props: any) => unknown }[],
    commands: [] as Record<string, any>[],
    dictionaries: {} as Record<string, Record<string, Record<string, string>>>,
  }
  const forms = new Map<string, FakeForm>()
  forms.set('thin-search', createForm(options.thinSearch ?? { provider: 'bing' }, options.revision ?? 0, {
    ...options.thinSearchWritable === undefined ? {} : { writable: options.thinSearchWritable },
    ...options.thinSearchStatus === undefined ? {} : { status: options.thinSearchStatus },
    ...options.acceptThinSearchWrites === undefined ? {} : { acceptWrites: options.acceptThinSearchWrites },
  }))
  forms.set('web', createForm(options.web ?? { searchProvider: 'thin-search' }, options.revision ?? 0, {
    ...options.webWritable === undefined ? {} : { writable: options.webWritable },
  }))
  const locale = createLocale(records)
  let providerReads = 0
  const commandUi = {
    register: (command: Record<string, any>) => {
      records.commands.push(command)
      return () => undefined
    },
  }
  const context: Record<string, any> = {
    configForms: {
      get: (id: string) => {
        let existing = forms.get(id)
        if (existing === undefined) {
          existing = createForm({})
          forms.set(id, existing)
        }
        return existing.form
      },
      whileServed: (namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void) => {
        records.whileServed.push([...namespaces])
        return register(new Set(namespaces))
      },
    },
    locale,
    slots: {
      register: (registration: Record<string, any>, component: (props: any) => unknown) => {
        records.registrations.push({ options: registration, component })
        return () => undefined
      },
      inject: (_slot: string, callback: () => () => void) => callback(),
    },
    remote: {
      web: {
        listProviders: async () => {
          providerReads += 1
          return {
            ok: true,
            value: {
              search: [
                { id: 'thin-search', title: 'Thin Search', description: { en: 'Free search', zh: '\u514d\u8d39\u641c\u7d22' } },
                { id: 'deepseek-official', title: 'DeepSeek Search' },
              ],
              fetch: [],
            },
          }
        },
      },
      $on: () => () => undefined,
    },
    effect: (callback: () => void | (() => void)) => {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => undefined
    },
    inject: (dependencies: readonly string[], callback: (ctx: Record<string, any>) => void) => {
      if (dependencies.includes('commandUi')) callback(context)
      return () => undefined
    },
    get: (name: string) => name === 'commandUi' ? commandUi : undefined,
    on: () => () => undefined,
  }
  exports['apply'](context)

  const renderTree = (): RenderedElement[] => {
    const registration = records.registrations.find((entry) => entry.options['name'] === 'plugins.bundle.config')
    if (registration === undefined) throw new Error('the bundle registered no plugins.bundle.config entry')
    reactState.reset()
    const elements: RenderedElement[] = []
    walk(registration.component({ view: 'page' }), (element) => { elements.push(element) })
    return elements
  }
  const find = (elements: RenderedElement[], control: string, id?: string): RenderedElement | undefined =>
    elements.find((element) => element.props['data-control'] === control && (id === undefined || element.props['id'] === id))
  const requireTarget = (control: string, id?: string): RenderedElement => {
    const target = find(renderTree(), control, id)
    if (target === undefined) throw new Error(`control "${control}" is not rendered`)
    return target
  }

  const harness: ClientHarness = {
    source,
    definitionId: loaded.id,
    exports,
    whileServed: records.whileServed,
    registrations: records.registrations,
    commands: records.commands,
    dictionaries: records.dictionaries,
    forms,
    providerReads: () => providerReads,
    renderPage: renderTree,
    find: (control, id) => find(renderTree(), control, id),
    findAll: (control) => renderTree().filter((element) => element.props['data-control'] === control),
    change: (control, value, id) => {
      const target = requireTarget(control, id)
      target.props['onFocus']?.()
      target.props['onChange']({ currentTarget: { value } })
      renderTree()
    },
    toggle: (control, checked, id) => {
      requireTarget(control, id).props['onChange']({ currentTarget: { checked } })
      renderTree()
    },
    blur: (control, id) => {
      requireTarget(control, id).props['onBlur']()
      renderTree()
    },
    keyDown: (control, key, id) => {
      requireTarget(control, id).props['onKeyDown']({
        key,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        nativeEvent: {},
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
      })
      renderTree()
    },
    click: (control, id) => {
      requireTarget(control, id).props['onClick']()
      renderTree()
    },
    clickOption: (control, value) => {
      const target = renderTree().find((element) =>
        element.props['data-control'] === `${control}-option` && element.props['data-value'] === value)
      if (target === undefined) throw new Error(`option "${value}" of "${control}" is not rendered`)
      target.props['onClick']()
      renderTree()
    },
    flush: async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    },
  }
  return harness
}
