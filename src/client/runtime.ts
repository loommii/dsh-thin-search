/**
 * The page's one bridge to the Host-owned services: the thin-search form, the
 * web provider selection, the provider directory, and the locale dictionary.
 *
 * All writes go through ConfigForms. The page registers the row in
 * `plugins.row.config`; the command and the page share this runtime so both
 * use the same form instance.
 * @module dsh-thin-search/client/runtime
 */
import {
  DEFAULT_ENGINE,
  SEARCH_PROVIDER_FIELD,
  THIN_SEARCH_NAMESPACE,
  WEB_NAMESPACE,
  ENGINE_FIELD,
  isEngineId,
  type EngineId,
  type ThinSearchValues,
  type WebSelection,
} from './config'
import type { MessageKey } from './locales'
import { ProviderDirectory, type ProviderDirectorySnapshot } from './provider-directory'
import type { ClientContext, ConfigForm, LocalizedText } from './types'

/** Where the "/thin-search-engine" command reads and writes its selection. */
export interface EngineCommandSource {
  /** Localized copy lookup. */
  t(key: MessageKey, params?: Record<string, unknown>): string
  /** Engine currently stored, or the default engine when the section is absent. */
  currentEngine(): EngineId
  /** Store the preferred engine through the thin-search ConfigForm. */
  setPreferredEngine(id: EngineId): Promise<boolean>
}

/** Shared client state for the row page, the provider card, and the command. */
export class ThinSearchRuntime implements EngineCommandSource {
  private readonly directory: ProviderDirectory
  private readonly translate: (key: string, params?: Record<string, unknown>) => string
  private readonly disposers: (() => void)[]

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

  /** The thin-search row form, shared with whoever else edits the same namespace. */
  get configForm(): ConfigForm<ThinSearchValues> {
    return this.ctx.configForms.get<ThinSearchValues>(THIN_SEARCH_NAMESPACE)
  }

  /** The web namespace form that owns the global provider selection. */
  get webForm(): ConfigForm<WebSelection> {
    return this.ctx.configForms.get<WebSelection>(WEB_NAMESPACE)
  }

  /**
   * Switch the global search provider through ConfigForms — exactly
   * `ctx.configForms.get('web').set('searchProvider', id)`. The Host applies
   * the write live; no deployment patch and no restart.
   */
  setSearchProvider(id: string): Promise<boolean> {
    return this.ctx.configForms.get<WebSelection>(WEB_NAMESPACE).set(SEARCH_PROVIDER_FIELD, id)
  }

  /** Current thin-search preferred engine, falling back to the schema default. */
  currentEngine(): EngineId {
    const provider = this.configForm.getSnapshot().value?.provider
    return isEngineId(provider) ? provider : DEFAULT_ENGINE
  }

  /** Write the preferred engine through `configForms.get('thin-search').set('provider', id)`. */
  setPreferredEngine(id: EngineId): Promise<boolean> {
    return this.ctx.configForms.get<ThinSearchValues>(THIN_SEARCH_NAMESPACE).set(ENGINE_FIELD, id)
  }

  /** Ensure the provider list has been read once. */
  ensureProviders = (): void => {
    this.directory.ensure()
  }

  /** Re-read the registered providers. */
  refreshProviders = (): Promise<void> => this.directory.refresh()

  /** Current provider-directory snapshot for the page's external store. */
  getProvidersSnapshot = (): ProviderDirectorySnapshot => this.directory.getSnapshot()

  /** Subscribe the page to provider-directory changes. */
  subscribeProviders = (listener: () => void): (() => void) => this.directory.subscribe(listener)

  /** Release event subscriptions and stop publishing provider reads. */
  dispose(): void {
    for (const dispose of this.disposers) dispose()
    this.directory.dispose()
  }
}
