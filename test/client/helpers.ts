/**
 * Test doubles for the browser plugin surface: a fake ConfigForm, locale
 * registry, command UI, and Cordis context that record every registration and
 * write the page or command performs.
 */
import type {
  ClientContext,
  CommandContribution,
  CommandOption,
  CommandUiService,
  ConfigForm,
  ConfigFormSnapshot,
  LocaleService,
  LocalizedText,
  RemoteResult,
  BundleConfigRegistration,
  SettingsPathOp,
  WebProviderInfo,
  WebProviderList,
} from '../../src/client/types'
import { DICTIONARIES } from '../../src/client/locales'

/** One write a fake ConfigForm received. */
export interface FormCall {
  readonly kind: 'set' | 'unset' | 'mutate'
  readonly field?: string
  readonly value?: unknown
  readonly ops?: readonly SettingsPathOp[]
  readonly revision?: number
}

/** A ConfigForm double plus its recorded writes. */
export interface FakeForm<T> {
  readonly form: ConfigForm<T>
  readonly calls: FormCall[]
  /** Replace the accepted snapshot and notify subscribers. */
  setSnapshot(next: Partial<ConfigFormSnapshot<T>>): void
  /** Notify subscribers without changing the snapshot. */
  notify(): void
}

/** Options for {@link createFakeForm}. */
export interface FakeFormOptions<T> {
  /** Accepted section; defaults to an empty object. */
  readonly value?: T | undefined
  /** Snapshot status; defaults to ready. */
  readonly status?: ConfigFormSnapshot<T>['status']
  /** Whether the Host accepts writes; defaults to true. */
  readonly writable?: boolean
  /** Starting revision. */
  readonly revision?: number
  /** Whether a write is accepted; defaults to true. */
  readonly accept?: boolean
  /** When set, mutate rejects with this error. */
  readonly failWith?: unknown
}

/** Apply one flat path operation to a plain section. */
function applyOps<T>(value: T | undefined, ops: readonly SettingsPathOp[]): T {
  const section = { ...(typeof value === 'object' && value !== null ? value : {}) } as Record<string, unknown>
  for (const op of ops) {
    const field = op.path[0]
    if (field === undefined) continue
    if (op.op === 'set') section[field] = op.value
    else delete section[field]
  }
  return section as T
}

/** Build a ConfigForm double that records writes and can publish snapshots. */
export function createFakeForm<T>(options: FakeFormOptions<T> = {}): FakeForm<T> {
  let snapshot: ConfigFormSnapshot<T> = {
    status: options.status ?? 'ready',
    value: options.value,
    base: undefined,
    user: undefined,
    revision: options.revision ?? 0,
    writable: options.writable ?? true,
  }
  const calls: FormCall[] = []
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const accept = options.accept ?? true
  const form: ConfigForm<T> = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async set(field, value) {
      calls.push({
        kind: 'set',
        field,
        value,
        ...(snapshot.revision === undefined ? {} : { revision: snapshot.revision }),
      })
      if (!accept) return false
      if (options.failWith !== undefined) throw options.failWith
      snapshot = {
        ...snapshot,
        value: applyOps(snapshot.value, [{ op: 'set', path: [field], value }]),
        revision: (snapshot.revision ?? 0) + 1,
      }
      notify()
      return true
    },
    async unset(field) {
      calls.push({
        kind: 'unset',
        field,
        ...(snapshot.revision === undefined ? {} : { revision: snapshot.revision }),
      })
      if (!accept) return false
      snapshot = {
        ...snapshot,
        value: applyOps(snapshot.value, [{ op: 'unset', path: [field] }]),
        revision: (snapshot.revision ?? 0) + 1,
      }
      notify()
      return true
    },
    async mutate(ops, revision) {
      calls.push({ kind: 'mutate', ops, ...(revision === undefined ? {} : { revision }) })
      if (!accept) return false
      if (options.failWith !== undefined) throw options.failWith
      snapshot = {
        ...snapshot,
        value: applyOps(snapshot.value, ops),
        revision: (snapshot.revision ?? 0) + 1,
      }
      notify()
      return true
    },
  }
  return {
    form,
    calls,
    setSnapshot(next) {
      snapshot = { ...snapshot, ...next }
      notify()
    },
    notify,
  }
}

/** A locale registry double backed by the real dictionaries. */
export interface FakeLocale extends LocaleService {
  /** Dictionaries registered through {@link LocaleService.register}. */
  readonly registrations: { readonly namespace: string; readonly dictionaries: Record<string, Record<string, string>> }[]
  /** Active locale id. */
  readonly active: string
  /** Switch the active locale and notify subscribers. */
  setActive(locale: string): void
  /** Look one message up as the runtime would. */
  lookup(namespace: string, key: string): string | undefined
}

/** Build a locale double with the real Thin Search dictionaries preregistered. */
export function createFakeLocale(active = 'en'): FakeLocale {
  const dictionaries = new Map<string, Record<string, Record<string, string>>>()
  const registrations: FakeLocale['registrations'] = []
  const listeners = new Set<() => void>()
  let current = active
  const lookup = (namespace: string, key: string): string | undefined => {
    const byLocale = dictionaries.get(namespace)
    const dictionary = byLocale?.[current] ?? byLocale?.en
    return dictionary?.[key]
  }
  const service: LocaleService = {
    bind: (namespace) => (key, params) => {
      const template = lookup(namespace, key) ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
    },
    register: (namespace, next) => {
      dictionaries.set(namespace, next)
      registrations.push({ namespace, dictionaries: next })
      for (const listener of [...listeners]) listener()
      return () => { dictionaries.delete(namespace) }
    },
    getSnapshot: () => ({ active: current, revision: registrations.length, locales: [{ id: 'zh', label: '中文' }, { id: 'en', label: 'English' }] }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    resolveText: (text: LocalizedText) => text[current] ?? text.en,
  }
  dictionaries.set('thin-search', DICTIONARIES)
  return {
    ...service,
    registrations,
    get active() { return current },
    setActive(locale) {
      current = locale
      for (const listener of [...listeners]) listener()
    },
    lookup: (namespace, key) => lookup(namespace, key),
  }
}

/** Provider list answer strategy for {@link createFakeContext}. */
export type ProviderAnswer =
  | { readonly kind: 'list'; readonly providers: readonly WebProviderInfo[] }
  | { readonly kind: 'error' }
  | { readonly kind: 'throw' }

/** A fake context and its registration records. */
export interface FakeContext extends ClientContext {
  readonly records: {
    readonly effects: { readonly label: string | undefined; readonly dispose: () => void }[]
    readonly whileServedCalls: (readonly string[])[]
    readonly registrations: { readonly options: BundleConfigRegistration; readonly component: unknown }[]
    readonly commands: CommandContribution[]
    readonly injectCalls: (readonly string[])[]
    readonly providerReads: number
    readonly remoteHandlers: Map<string, () => void>
    readonly eventHandlers: Map<string, () => void>
    readonly unsubscribed: string[]
  }
  readonly forms: Map<string, FakeForm<unknown>>
  readonly locale: FakeLocale
  readonly commandUi: CommandUiService | undefined
}

/** Options for {@link createFakeContext}. */
export interface FakeContextOptions {
  /** Namespaces the Host serves; defaults to thin-search. */
  readonly served?: readonly string[]
  /** Initial accepted sections, keyed by namespace. */
  readonly sections?: Record<string, unknown>
  /** Provider list answer(s); a function is called per read. */
  readonly providers?: ProviderAnswer | (() => ProviderAnswer)
  /** Whether `commandUi` is present; defaults to true. */
  readonly withCommandUi?: boolean
  /** Active locale; defaults to en. */
  readonly locale?: string
}

/** Build a Cordis client-context double that records every plugin contribution. */
export function createFakeContext(options: FakeContextOptions = {}): FakeContext {
  const served = options.served ?? ['thin-search']
  const sections = options.sections ?? {
    'thin-search': { provider: 'bing' },
    web: { searchProvider: 'thin-search' },
  }
  const locale = createFakeLocale(options.locale ?? 'en')
  const forms = new Map<string, FakeForm<unknown>>()
  for (const [namespace, value] of Object.entries(sections)) {
    forms.set(namespace, createFakeForm({ value }))
  }
  let providerReads = 0
  const records: FakeContext['records'] = {
    effects: [],
    whileServedCalls: [],
    registrations: [],
    commands: [],
    injectCalls: [],
    get providerReads() { return providerReads },
    remoteHandlers: new Map(),
    eventHandlers: new Map(),
    unsubscribed: [],
  }
  const answer = (): ProviderAnswer => {
    const value = options.providers ?? { kind: 'list', providers: [{ id: 'thin-search', title: 'Thin Search' }] }
    return typeof value === 'function' ? value() : value
  }
  const commandUi: CommandUiService | undefined = (options.withCommandUi ?? true)
    ? {
        register: (contribution) => {
          records.commands.push(contribution)
          return () => {}
        },
      }
    : undefined
  const ctx: FakeContext = {
    configForms: {
      get: <T,>(entryId: string): ConfigForm<T> => {
        const existing = forms.get(entryId)
        if (existing !== undefined) return existing.form as ConfigForm<T>
        const created = createFakeForm<T>({})
        forms.set(entryId, created as FakeForm<unknown>)
        return created.form
      },
      whileServed: (namespaces, register) => {
        records.whileServedCalls.push(namespaces)
        const watched = namespaces.some((namespace) => served.includes(namespace))
        const dispose = watched ? register(new Set(served)) : () => {}
        return dispose
      },
    },
    locale,
    slots: {
      register: (registration, component) => {
        records.registrations.push({ options: registration, component })
        return () => {}
      },
      inject: (slot, callback) => {
        void slot
        return callback()
      },
    },
    remote: {
      web: {
        async listProviders(): Promise<RemoteResult<WebProviderList>> {
          providerReads += 1
          const next = answer()
          if (next.kind === 'throw') throw new Error('provider read failed')
          if (next.kind === 'error') return { ok: false, error: 'unavailable' }
          return { ok: true, value: { search: next.providers, fetch: [] } }
        },
      },
      $on: (event, listener) => {
        records.remoteHandlers.set(event, () => { listener(undefined) })
        return () => {
          records.unsubscribed.push(`remote:${event}`)
          records.remoteHandlers.delete(event)
        }
      },
    },
    effect: (callback, label) => {
      const dispose = callback()
      const entry = { label, dispose: typeof dispose === 'function' ? dispose : () => {} }
      records.effects.push(entry)
      return entry.dispose
    },
    inject: (dependencies, callback) => {
      records.injectCalls.push(dependencies)
      if ((options.withCommandUi ?? true) && commandUi !== undefined) callback(ctx)
      return () => {}
    },
    get: <T,>(name: string): T | undefined => {
      if (name === 'commandUi') return commandUi as T | undefined
      return undefined
    },
    on: (event, listener) => {
      records.eventHandlers.set(event, () => { listener() })
      return () => {
        records.unsubscribed.push(`event:${event}`)
        records.eventHandlers.delete(event)
      }
    },
    records,
    forms,
    commandUi,
  }
  return ctx
}

/** Wait for pending microtasks so provider reads settle. */
export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

/** A view of one command option's fields for assertions. */
export function optionSummary(options: readonly CommandOption[]): { id: string; label: string; active: boolean; detail: string | undefined }[] {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    active: option.active === true,
    detail: option.detail,
  }))
}

/** The contribution a fake context captured for one command name. */
export function commandNamed(context: FakeContext, name: string): CommandContribution {
  const found = context.records.commands.find((command) => command.name === name)
  if (found === undefined) throw new Error(`command "${name}" was not registered`)
  return found
}
