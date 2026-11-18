/**
 * The bundle card's bridge to the Host-owned services: the thin-search
 * ConfigForm store, the web provider selection, the provider directory, and
 * the locale dictionary.
 *
 * DSH 0.2.2-rc.3 renders `plugins.bundle.config` without owner form props, so
 * the runtime holds `configForms.get('thin-search')` itself and exposes one
 * synchronous snapshot plus immediate per-field writes. Every write goes
 * through the ConfigForm, which fences it with the latest namespace revision.
 * @module dsh-thin-search/client/runtime
 */
import {
  DEFAULT_ENGINE,
  SEARCH_PROVIDER_FIELD,
  THIN_SEARCH_NAMESPACE,
  WEB_NAMESPACE,
  isEngineId,
  normalizeDraft,
  settingWrite,
  validateSetting,
  type Draft,
  type DraftError,
  type EngineId,
  type ThinSearchValues,
  type WebSelection,
} from './config'
import type { MessageKey } from './locales'
import { ProviderDirectory, type ProviderDirectorySnapshot } from './provider-directory'
import type { ClientContext, ConfigForm, ConfigFormSnapshot, LocalizedText } from './types'

/** Where the "/thin-search-engine" command reads and writes its selection. */
export interface EngineCommandSource {
  /** Localized copy lookup. */
  t(key: MessageKey, params?: Record<string, unknown>): string
  /** Engine currently stored, or the default engine when the section is absent. */
  currentEngine(): EngineId
  /** Store the preferred engine through the thin-search ConfigForm. */
  setPreferredEngine(id: EngineId): Promise<boolean>
}

/** Immutable snapshot the bundle card renders. */
export interface SettingsSnapshot {
  /** ConfigForm lifecycle state. */
  readonly status: ConfigFormSnapshot<ThinSearchValues>['status']
  /** Whether the Host document accepts writes. */
  readonly writable: boolean
  /** Latest namespace revision the form read. */
  readonly revision: number | undefined
  /** Normalized settings values. */
  readonly values: Draft
  /** Validation errors keyed by the field that produced them. */
  readonly errors: Partial<Record<keyof Draft, DraftError>>
  /** Whether the Host refused the latest write. */
  readonly writeFailed: boolean
}

/** Build the snapshot before the ConfigForm is attached. */
function loadingSnapshot(): SettingsSnapshot {
  return {
    status: 'loading',
    writable: false,
    revision: undefined,
    values: normalizeDraft(undefined),
    errors: {},
    writeFailed: false,
  }
}

/** Shared client state for the bundle card, the command, and provider reads. */
export class ThinSearchRuntime implements EngineCommandSource {
  private readonly directory: ProviderDirectory
  private readonly translate: (key: string, params?: Record<string, unknown>) => string
  private readonly disposers: (() => void)[]
  private readonly listeners = new Set<() => void>()
  /** In-flight form writes, keyed by field and tagged with their write token. */
  private readonly pending = new Map<keyof Draft, number>()
  /** Latest write token per field; a stale settlement must not clear newer state. */
  private readonly writeTokens = new Map<keyof Draft, number>()
  private writeSequence = 0
  /** Highest write token whose form.set has settled; stale settlements are ignored. */
  private lastSettledToken = 0
  private form: ConfigForm<ThinSearchValues> | undefined
  private snapshot: SettingsSnapshot = loadingSnapshot()

  /**
   * @param ctx - the browser plugin context; `configForms`, `locale`, and `remote.web` are required.
   */
  constructor(private readonly ctx: ClientContext) {
    this.translate = ctx.locale.bind('thin-search')
    this.directory = new ProviderDirectory(ctx.remote.web)
    this.disposers = [
      ctx.remote.$on('web/providers-changed', () => { void this.directory.refresh() }),
      ctx.on('connection/reset', () => { void this.directory.refresh() }),
    ]
  }

  /** Localized copy for this plugin's namespace. */
  t = (key: MessageKey, params?: Record<string, unknown>): string => this.translate(key, params)

  /** Resolve a provider's localized description through the locale service. */
  resolveText = (text: LocalizedText): string => this.ctx.locale.resolveText(text)

  /** The thin-search ConfigForm, held by the runtime rather than owner props. */
  get configForm(): ConfigForm<ThinSearchValues> {
    return this.form ?? this.ctx.configForms.get<ThinSearchValues>(THIN_SEARCH_NAMESPACE)
  }

  /** The web namespace form that owns the global provider selection. */
  get webForm(): ConfigForm<WebSelection> {
    return this.ctx.configForms.get<WebSelection>(WEB_NAMESPACE)
  }

  /**
   * Attach the Host form the card reads. The returned disposer detaches the
   * subscription and returns the card to its loading state.
   * @param form - `configForms.get('thin-search')`.
   * @returns subscription disposer.
   */
  attach(form: ConfigForm<ThinSearchValues>): () => void {
    this.form = form
    this.pending.clear()
    this.writeTokens.clear()
    this.lastSettledToken = 0
    this.sync(form.getSnapshot(), { errors: {}, writeFailed: false })
    const off = form.subscribe(() => { this.sync(form.getSnapshot()) })
    return () => {
      off()
      if (this.form !== form) return
      this.form = undefined
      this.pending.clear()
      this.writeTokens.clear()
      this.lastSettledToken = 0
      this.snapshot = loadingSnapshot()
      this.notify()
    }
  }

  /** Current immutable settings snapshot (stable until the next change). */
  getSettingsSnapshot = (): SettingsSnapshot => this.snapshot

  /** Observe settings snapshot replacements. */
  subscribeSettings = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Write one field immediately. The card calls this on a pill pick, a switch
   * toggle, a platform check, or a text commit; no Save control exists.
   * ConfigForm.set carries the latest namespace revision and queues writes in
   * order. On a refused write the optimistic value is replaced by the Host's
   * accepted section and the card shows a note.
   * @param field - draft field to write.
   * @param value - value selected or committed by the control.
   * @returns whether the Host accepted the write.
   */
  async writeSetting<K extends keyof Draft>(field: K, value: Draft[K]): Promise<boolean> {
    const form = this.form
    if (form === undefined || this.snapshot.status !== 'ready' || !this.snapshot.writable) return false
    // Every attempt, including a validation rejection, becomes the field's
    // latest write. An older form.set settlement must not erase the newer error.
    const token = ++this.writeSequence
    this.writeTokens.set(field, token)
    const error = validateSetting(field, value)
    if (error !== undefined) {
      this.publish({
        ...this.snapshot,
        errors: { ...this.snapshot.errors, [field]: error },
        writeFailed: false,
      })
      return false
    }
    const optimistic = { ...this.snapshot.values }
    optimistic[field] = value
    this.pending.set(field, token)
    this.publish({ ...this.snapshot, values: optimistic, writeFailed: false })
    const write = settingWrite(field, value)
    try {
      const accepted = await form.set(write.field, write.value)
      if (this.pending.get(field) === token) this.pending.delete(field)
      if (this.form === form) this.sync(form.getSnapshot(), this.settlement(field, token, accepted))
      return accepted
    } catch {
      if (this.pending.get(field) === token) this.pending.delete(field)
      if (this.form === form) this.sync(form.getSnapshot(), this.settlement(field, token, false))
      return false
    }
  }

  /**
   * Compute the state overrides for one settled write. A settlement older than
   * the newest one already applied cannot change global writeFailed; a stale
   * rejection therefore cannot repaint an error after a newer success. Field
   * errors still clear only when this is the field's latest attempt.
   */
  private settlement(field: keyof Draft, token: number, accepted: boolean): Partial<SettingsSnapshot> {
    const latestForField = this.writeTokens.get(field) === token
    const newestSettled = token > this.lastSettledToken
    if (!newestSettled) return {}
    this.lastSettledToken = token
    const writeFailed = accepted ? false : latestForField ? true : this.snapshot.writeFailed
    const errors = accepted && latestForField ? this.withoutFieldError(field) : undefined
    return errors === undefined ? { writeFailed } : { writeFailed, errors }
  }

  /** Copy the field errors without one field's entry. */
  private withoutFieldError(field: keyof Draft): Partial<Record<keyof Draft, DraftError>> | undefined {
    if (this.snapshot.errors[field] === undefined) return undefined
    const errors = { ...this.snapshot.errors }
    delete errors[field]
    return errors
  }

  /** Switch the global search provider through ConfigForms. */
  setSearchProvider(id: string): Promise<boolean> {
    return this.ctx.configForms.get<WebSelection>(WEB_NAMESPACE).set(SEARCH_PROVIDER_FIELD, id)
  }

  /** Current thin-search preferred engine, falling back to the schema default. */
  currentEngine(): EngineId {
    const provider = this.snapshot.values.provider
    return isEngineId(provider) ? provider : DEFAULT_ENGINE
  }

  /** Write the preferred engine through `configForms.get('thin-search').set('provider', id)`. */
  setPreferredEngine(id: EngineId): Promise<boolean> {
    return this.writeSetting('provider', id)
  }

  /** Ensure the provider list has been read once. */
  ensureProviders = (): void => {
    this.directory.ensure()
  }

  /** Re-read the registered providers. */
  refreshProviders = (): Promise<void> => this.directory.refresh()

  /** Current provider-directory snapshot for the card's external store. */
  getProvidersSnapshot = (): ProviderDirectorySnapshot => this.directory.getSnapshot()

  /** Subscribe the card to provider-directory changes. */
  subscribeProviders = (listener: () => void): (() => void) => this.directory.subscribe(listener)

  /** Release event subscriptions and stop publishing provider reads. */
  dispose(): void {
    for (const dispose of this.disposers) dispose()
    this.directory.dispose()
    this.listeners.clear()
  }

  /** Fold one accepted ConfigForm snapshot into the card state. */
  private sync(formSnapshot: ConfigFormSnapshot<ThinSearchValues>, overrides: Partial<SettingsSnapshot> = {}): void {
    const values = normalizeDraft(formSnapshot.value)
    const merged = values as unknown as Record<keyof Draft, unknown>
    for (const field of this.pending.keys()) merged[field] = this.snapshot.values[field]
    this.publish({
      status: formSnapshot.status,
      writable: formSnapshot.writable,
      revision: formSnapshot.revision,
      values,
      errors: this.snapshot.errors,
      writeFailed: this.snapshot.writeFailed,
      ...overrides,
    })
  }

  /** Replace the snapshot and notify subscribers. */
  private publish(next: SettingsSnapshot): void {
    this.snapshot = next
    this.notify()
  }

  /** Wake every mounted card. */
  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
