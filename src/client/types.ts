/**
 * Structural declarations for the DSH 0.2.2-rc.3 browser plugin surface this
 * bundle consumes.
 *
 * A client bundle may import only the module-table baseline (`react` and
 * `react/jsx-runtime`); every other capability arrives through the Cordis
 * context. These declarations mirror the published rc.3 contracts so the
 * bundle never imports another Client package and still type-checks.
 * @module dsh-thin-search/client/types
 */
import type { ComponentType } from 'react'

/** JSON value as the settings wire carries it. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** Localized package text: English is required, other locales are optional. */
export interface LocalizedText {
  readonly en: string
  readonly [locale: string]: string
}

/** One registered search provider as `web/listProviders` lists it. */
export interface WebProviderInfo {
  /** Provider id, the value `searchProvider` selects. */
  readonly id: string
  /** Display name; the id is shown when absent. */
  readonly title?: string
  /** Picker description resolved through `ctx.locale.resolveText`. */
  readonly description?: LocalizedText
}

/** Every registered provider, grouped by capability and in registration order. */
export interface WebProviderList {
  readonly search: readonly WebProviderInfo[]
  readonly fetch: readonly WebProviderInfo[]
}

/** Remote envelope returned by every `ctx.remote.*` call. */
export type RemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown }

/** The `remote.web` client namespace. */
export interface RemoteWebService {
  listProviders(): Promise<RemoteResult<WebProviderList>>
}

/** One ordered settings path operation. */
export interface SettingsPathOp {
  readonly op: 'set' | 'unset'
  readonly path: readonly string[]
  readonly value?: unknown
}

/** Client-side state of one settings namespace. */
export interface ConfigFormSnapshot<T> {
  /** `loading` before the first accepted section, `ready` while one stands. */
  readonly status: 'loading' | 'ready' | 'unavailable'
  /** Last accepted schema-resolved section. */
  readonly value: T | undefined
  /** Composition layer the Host resolved the section over. */
  readonly base: unknown
  /** Raw user layer; a field's presence there marks an override. */
  readonly user: unknown
  /** Namespace revision fencing the next write. */
  readonly revision: number | undefined
  /** Whether the Host document accepts writes. */
  readonly writable: boolean
}

/** Shared form over one Host settings namespace (`ctx.configForms.get`). */
export interface ConfigForm<T> {
  getSnapshot(): ConfigFormSnapshot<T>
  subscribe(listener: () => void): () => void
  mutate(ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<boolean>
  set(field: string, value: unknown): Promise<boolean>
  unset(field: string): Promise<boolean>
}

/** Page-owner form handoff for one `plugins.row.config` entry. */
export interface ConfigPageForm {
  /** Accepted Host values; refreshed by the page owner. */
  readonly state: ConfigFormSnapshot<Record<string, unknown>>
  /** Submit all field edits together with the revision the editor read. */
  readonly mutate: ConfigForm<Record<string, unknown>>['mutate']
}

/** Owner props of a `plugins.row.config` contribution. */
export interface PluginConfigViewProps {
  /** `summary` renders the one-liner; `page` renders the form with its save control. */
  readonly view: 'summary' | 'page'
  /** Host-owned values and write action for this page's entry. */
  readonly form?: ConfigPageForm | undefined
}

/** Translate function bound to one locale namespace. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

/** Immutable locale state published on every change. */
export interface LocaleSnapshot {
  /** Active locale id. */
  readonly active: string
  /** Monotonic change counter. */
  readonly revision: number
  /** Selectable locales in display order. */
  readonly locales: readonly { readonly id: string; readonly label: string }[]
}

/** The `locale` client service. */
export interface LocaleService {
  bind(namespace: string): Translate
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  getSnapshot(): LocaleSnapshot
  subscribe(listener: () => void): () => void
  resolveText(text: LocalizedText): string
}

/** A slot registration the page's row entry performs. */
export interface RowConfigRegistration {
  /** Slot name, `plugins.row.config`. */
  readonly name: string
  /** Entry key, `<package name>#<row id>`. */
  readonly key: string
}

/** The keyed slot registry (`ctx.slots`). */
export interface SlotService {
  register(options: RowConfigRegistration, component: ComponentType<PluginConfigViewProps>): () => void
  inject(slot: string, callback: () => () => void): () => void
}

/** One localized option row a command popup can show. */
export interface CommandOption {
  /** Stable option id. */
  readonly id: string
  /** Localized row label. */
  readonly label: string
  /** Optional short detail rendered beside the label. */
  readonly detail?: string
  /** The row the shell parks its highlight on. */
  readonly active?: boolean
}

/** Search copy for one command popup opening. */
export interface PopupSearchLabels {
  readonly placeholder: string
  readonly empty: string
  readonly noResults: string
}

/** The popupSelect behavior a client command contributes. */
export interface PopupSelectSpec {
  readonly kind: 'popupSelect'
  searchLabels?(): PopupSearchLabels
  options(session: unknown, signal: AbortSignal): Promise<readonly CommandOption[]>
  onSelect(option: CommandOption, session: unknown): void | Promise<void>
}

/** One client-owned command contribution. */
export interface CommandContribution {
  /** Command name without the leading slash. */
  readonly name: string
  /** Localized menu row title. */
  label?(): string
  /** Localized menu row description. */
  description?(): string
  /** Capability filter called per candidate pass. */
  available(session: unknown): boolean
  /** The command's UI behavior. */
  readonly ui: PopupSelectSpec
}

/** The `commandUi` client service. */
export interface CommandUiService {
  register(contribution: CommandContribution): () => void
}

/** The `configForms` client service. */
export interface ConfigFormsService {
  get<T>(entryId: string): ConfigForm<T>
  whileServed(namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void): () => void
}

/** The Cordis client context surface this plugin reads. */
export interface ClientContext {
  readonly configForms: ConfigFormsService
  readonly locale: LocaleService
  readonly slots: SlotService
  readonly remote: {
    readonly web: RemoteWebService
    $on(event: string, listener: (payload: unknown) => void): () => void
  }
  effect(callback: () => void | (() => void), label?: string): () => void
  inject(dependencies: readonly string[], callback: (ctx: ClientContext) => void): unknown
  get<T>(name: string): T | undefined
  on(event: string, listener: (...args: unknown[]) => void): () => void
}
