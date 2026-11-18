/**
 * The Thin Search row page on the Plugins page.
 *
 * The page reads the accepted section from the owner form props and saves
 * every edit through the owner's `mutate`; the global provider card is the one
 * other surface, and it reads `web` through ConfigForms and switches with
 * `configForms.get('web').set('searchProvider', id)`. All copy comes from
 * `ctx.locale`; all controls are native and theme-token styled.
 * @module dsh-thin-search/client/page
 */
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  ENGINE_IDS,
  PLATFORM_IDS,
  canonicalPlatforms,
  draftOps,
  isEngineId,
  normalizeDraft,
  validateDraft,
  type Draft,
  type DraftError,
  type DraftErrorKey,
  type PlatformId,
} from './config'
import { describedBy, Field, Section, Switch } from './components'
import { engineLabelKey, platformLabelKey } from './locales'
import { saveDraft } from './save'
import type { ThinSearchRuntime } from './runtime'
import type {
  ConfigForm,
  ConfigFormSnapshot,
  ConfigPageForm,
  PluginConfigViewProps,
  WebProviderInfo,
} from './types'
import type { ProviderDirectorySnapshot } from './provider-directory'

/** Owner props plus the runtime the plugin's `apply` closes over. */
export interface ThinSearchRowConfigProps extends PluginConfigViewProps {
  readonly runtime: ThinSearchRuntime
}

/** The page's save-state banner. */
type SaveState = 'idle' | 'saved' | 'failed' | 'invalid'

/**
 * The `plugins.row.config` component: the summary line for a row without a
 * package description, and the full page for `view: 'page'`.
 */
export function ThinSearchRowConfig({ view, form, runtime }: ThinSearchRowConfigProps): ReactNode {
  if (view === 'summary') return runtime.t('summary')
  return <ThinSearchPage form={form} runtime={runtime} />
}

/** Subscribe one ConfigForm snapshot through React's external store. */
function useConfigFormSnapshot<T>(form: ConfigForm<T>): ConfigFormSnapshot<T> {
  const subscribe = useCallback((listener: () => void) => form.subscribe(listener), [form])
  const snapshot = useCallback(() => form.getSnapshot(), [form])
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** The page shell shared by the loading, unavailable, and ready branches. */
function PageFrame({ runtime, busy, children }: {
  readonly runtime: ThinSearchRuntime
  readonly busy: boolean
  readonly children: ReactNode
}): ReactNode {
  return (
    <section className="dsts-page" aria-busy={busy}>
      <header className="dsts-header">
        <h2 className="dsts-title">{runtime.t('page.title')}</h2>
        <p className="dsts-intro">{runtime.t('page.intro')}</p>
      </header>
      {children}
    </section>
  )
}

/** The page body. */
function ThinSearchPage({ form, runtime }: {
  readonly form: ConfigPageForm | undefined
  readonly runtime: ThinSearchRuntime
}): ReactNode {
  const t = runtime.t
  const state = form?.state
  const [draft, setDraft] = useState<Draft>(() => normalizeDraft(state?.value))
  const [syncedRevision, setSyncedRevision] = useState<number | undefined>(state?.revision)
  const [fieldErrors, setFieldErrors] = useState<readonly DraftError[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saving, setSaving] = useState(false)
  const [providerError, setProviderError] = useState(false)

  const webState = useConfigFormSnapshot(runtime.webForm)
  const providers = useSyncExternalStore(runtime.subscribeProviders, runtime.getProvidersSnapshot, runtime.getProvidersSnapshot)

  useEffect(() => { runtime.ensureProviders() }, [runtime])

  // Adopt an accepted Host section after a save or an external edit.
  useEffect(() => {
    if (state?.revision === syncedRevision) return
    setSyncedRevision(state?.revision)
    setDraft(normalizeDraft(state?.value))
    setFieldErrors([])
    setSaveState('idle')
  }, [state?.revision, state?.value, syncedRevision])

  const editable = state?.status === 'ready' && state.writable && !saving
  const dirty = draftOps(draft, state?.value).length > 0
  const errorText = (key: DraftErrorKey): string | undefined => {
    const error = fieldErrors.find((candidate) => candidate.key === key)
    return error === undefined ? undefined : t(error.key, error.params)
  }

  const togglePlatform = (id: PlatformId): void => {
    const selected = new Set(draft.platforms)
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    setDraft({ ...draft, platforms: canonicalPlatforms([...selected]) })
  }

  const discard = (): void => {
    setDraft(normalizeDraft(state?.value))
    setFieldErrors([])
    setSaveState('idle')
  }

  const submit = async (): Promise<void> => {
    if (form === undefined || !editable) return
    const errors = validateDraft(draft)
    if (errors.length > 0) {
      setFieldErrors(errors)
      setSaveState('invalid')
      return
    }
    setSaving(true)
    setSaveState('idle')
    try {
      const outcome = await saveDraft(form, draft)
      setFieldErrors(outcome.errors)
      setSaveState(
        outcome.status === 'saved' || outcome.status === 'unchanged'
          ? 'saved'
          : outcome.status === 'invalid' ? 'invalid' : 'failed',
      )
    } finally {
      setSaving(false)
    }
  }

  const switchProvider = async (id: string): Promise<void> => {
    setProviderError(false)
    try {
      const accepted = await runtime.setSearchProvider(id)
      if (!accepted) setProviderError(true)
    } catch {
      setProviderError(true)
    }
  }

  const statusText = saveState === 'saved'
    ? t('status.saved')
    : saveState === 'failed'
      ? t('status.saveFailed')
      : saveState === 'invalid'
        ? t('status.invalid')
        : dirty
          ? t('status.unsaved')
          : ''

  if (form === undefined || state === undefined) {
    return (
      <PageFrame runtime={runtime} busy={false}>
        <p className="dsts-status" role="status">{t('status.unavailable')}</p>
      </PageFrame>
    )
  }
  if (state.status === 'loading') {
    return (
      <PageFrame runtime={runtime} busy>
        <p className="dsts-status" role="status">{t('status.loading')}</p>
      </PageFrame>
    )
  }
  if (state.status === 'unavailable') {
    return (
      <PageFrame runtime={runtime} busy={false}>
        <p className="dsts-status" role="status">{t('status.unavailable')}</p>
      </PageFrame>
    )
  }

  return (
    <PageFrame runtime={runtime} busy={saving}>
      {state.writable ? null : <p className="dsts-status">{t('status.readOnly')}</p>}

      <ProviderCard
        runtime={runtime}
        webState={webState}
        providers={providers}
        providerError={providerError}
        onSelect={(id) => { void switchProvider(id) }}
        onRetry={() => { void runtime.refreshProviders() }}
      />

      <Section title={t('engine.title')} description={t('engine.description')}>
        <Field id="dsts-engine" label={t('engine.label')} hint={t('engine.hint')}>
          <select
            id="dsts-engine"
            data-control="engine"
            className="dsts-select"
            value={draft.provider}
            disabled={!editable}
            aria-describedby={describedBy('dsts-engine', t('engine.hint'), undefined)}
            onChange={(event) => {
              const next = event.currentTarget.value
              if (isEngineId(next)) setDraft({ ...draft, provider: next })
            }}
          >
            {ENGINE_IDS.map((id) => <option key={id} value={id}>{t(engineLabelKey(id))}</option>)}
          </select>
        </Field>
      </Section>

      <Section title={t('enhance.title')} description={t('enhance.description')}>
        <Switch
          id="dsts-enhance"
          control="enhance"
          label={t('enhance.toggle')}
          hint={t('enhance.hint')}
          checked={draft.searchEnhance}
          disabled={!editable}
          onToggle={(next) => { setDraft({ ...draft, searchEnhance: next }) }}
        />
        <Field id="dsts-enhance-model" label={t('enhance.modelLabel')} hint={t('enhance.modelHint')}>
          <input
            id="dsts-enhance-model"
            data-control="enhance-model"
            className="dsts-input"
            type="text"
            value={draft.enhanceModel}
            placeholder={t('enhance.modelPlaceholder')}
            disabled={!editable || !draft.searchEnhance}
            aria-describedby={describedBy('dsts-enhance-model', t('enhance.modelHint'), undefined)}
            onChange={(event) => { setDraft({ ...draft, enhanceModel: event.currentTarget.value }) }}
          />
        </Field>
        <Field
          id="dsts-enhance-prompt"
          label={t('enhance.promptPathLabel')}
          hint={t('enhance.promptPathHint')}
          error={errorText('validation.enhanceSystemPromptPath')}
        >
          <input
            id="dsts-enhance-prompt"
            data-control="enhance-prompt-path"
            className="dsts-input"
            type="text"
            value={draft.enhanceSystemPromptPath}
            placeholder={t('enhance.promptPathPlaceholder')}
            disabled={!editable || !draft.searchEnhance}
            aria-describedby={describedBy('dsts-enhance-prompt', t('enhance.promptPathHint'), errorText('validation.enhanceSystemPromptPath'))}
            onChange={(event) => { setDraft({ ...draft, enhanceSystemPromptPath: event.currentTarget.value }) }}
          />
        </Field>
      </Section>

      <Section title={t('platforms.title')} description={t('platforms.description')}>
        <fieldset className="dsts-platforms" disabled={!editable}>
          <legend className="dsts-legend">{t('platforms.legend')}</legend>
          {PLATFORM_IDS.map((id) => (
            <label className="dsts-platform" key={id} htmlFor={`dsts-platform-${id}`}>
              <input
                id={`dsts-platform-${id}`}
                data-control="platforms"
                type="checkbox"
                checked={draft.platforms.includes(id)}
                disabled={!editable}
                onChange={() => { togglePlatform(id) }}
              />
              {t(platformLabelKey(id))}
            </label>
          ))}
        </fieldset>
        <p className="dsts-hint">{draft.platforms.length === 0 ? t('platforms.allDisabled') : t('platforms.hint')}</p>
      </Section>

      <Section title={t('advanced.title')} description={t('advanced.description')}>
        <Field
          id="dsts-cache-ttl"
          label={t('advanced.cacheLabel')}
          hint={t('advanced.cacheHint')}
          error={errorText('validation.cacheTtl')}
        >
          <input
            id="dsts-cache-ttl"
            data-control="cache-ttl"
            className="dsts-input"
            type="number"
            min={0}
            step={1}
            value={draft.cacheTtl}
            disabled={!editable}
            aria-describedby={describedBy('dsts-cache-ttl', t('advanced.cacheHint'), errorText('validation.cacheTtl'))}
            onChange={(event) => {
              const next = Number(event.currentTarget.value)
              setDraft({ ...draft, cacheTtl: Number.isFinite(next) ? next : 0 })
            }}
          />
        </Field>
        <Field id="dsts-bing-market" label={t('advanced.bingMarketLabel')} hint={t('advanced.bingMarketHint')}>
          <input
            id="dsts-bing-market"
            data-control="bing-market"
            className="dsts-input"
            type="text"
            value={draft.bingMarket}
            disabled={!editable}
            aria-describedby={describedBy('dsts-bing-market', t('advanced.bingMarketHint'), undefined)}
            onChange={(event) => { setDraft({ ...draft, bingMarket: event.currentTarget.value }) }}
          />
        </Field>
        <Field id="dsts-region" label={t('advanced.regionLabel')} hint={t('advanced.regionHint')}>
          <input
            id="dsts-region"
            data-control="region"
            className="dsts-input"
            type="text"
            value={draft.region}
            disabled={!editable}
            aria-describedby={describedBy('dsts-region', t('advanced.regionHint'), undefined)}
            onChange={(event) => { setDraft({ ...draft, region: event.currentTarget.value }) }}
          />
        </Field>
        <Field
          id="dsts-searxng"
          label={t('advanced.searxngLabel')}
          hint={t('advanced.searxngHint')}
          error={errorText('validation.searxng')}
        >
          <textarea
            id="dsts-searxng"
            data-control="searxng-instances"
            className="dsts-textarea"
            rows={3}
            value={draft.searxngText}
            placeholder={t('advanced.searxngPlaceholder')}
            disabled={!editable}
            aria-describedby={describedBy('dsts-searxng', t('advanced.searxngHint'), errorText('validation.searxng'))}
            onChange={(event) => { setDraft({ ...draft, searxngText: event.currentTarget.value }) }}
          />
        </Field>
      </Section>

      <footer className="dsts-footer">
        <div className="dsts-actions">
          <button
            type="button"
            className="dsts-btn dsts-btnOutline"
            data-control="discard"
            disabled={!editable || !dirty}
            onClick={discard}
          >
            {t('actions.discard')}
          </button>
          <button
            type="button"
            className="dsts-btn dsts-btnPrimary"
            data-control="save"
            disabled={!editable || !dirty}
            onClick={() => { void submit() }}
          >
            {saving ? t('status.saving') : t('actions.save')}
          </button>
        </div>
        <p className="dsts-status" role="status" aria-live="polite">{statusText}</p>
      </footer>
    </PageFrame>
  )
}

/** The global provider card: lists the Host's registered search providers. */
function ProviderCard({ runtime, webState, providers, providerError, onSelect, onRetry }: {
  readonly runtime: ThinSearchRuntime
  readonly webState: ConfigFormSnapshot<{ readonly searchProvider?: string; readonly fetchProvider?: string }>
  readonly providers: ProviderDirectorySnapshot
  readonly providerError: boolean
  readonly onSelect: (id: string) => void
  readonly onRetry: () => void
}): ReactNode {
  const t = runtime.t
  const list = providers.providers
  const selected = webState.value?.searchProvider ?? ''
  const selectedInfo: WebProviderInfo | undefined = list.find((provider) => provider.id === selected)
  const missing = selected !== '' && selectedInfo === undefined
  const loading = providers.status === 'loading' && list.length === 0
  return (
    <Section title={t('provider.title')} description={t('provider.description')}>
      {providers.status === 'error' ? (
        <div className="dsts-inlineAlert">
          <p className="dsts-error" role="alert">{t('provider.error')}</p>
          <button type="button" className="dsts-btn dsts-btnOutline" data-control="provider-retry" onClick={onRetry}>
            {t('provider.retry')}
          </button>
        </div>
      ) : null}
      {webState.status === 'unavailable' ? (
        <p className="dsts-status">{t('provider.unavailable')}</p>
      ) : (
        <Field
          id="dsts-provider"
          label={t('provider.label')}
          hint={t('provider.hint')}
          error={providerError ? t('provider.switchFailed') : undefined}
        >
          <select
            id="dsts-provider"
            data-control="provider"
            className="dsts-select"
            value={selected}
            disabled={webState.status !== 'ready' || !webState.writable || loading}
            aria-describedby={describedBy('dsts-provider', t('provider.hint'), providerError ? t('provider.switchFailed') : undefined)}
            onChange={(event) => { onSelect(event.currentTarget.value) }}
          >
            {selected === '' ? <option value="" disabled>{t('provider.none')}</option> : null}
            {list.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.title ?? provider.id}</option>
            ))}
            {missing ? <option value={selected}>{t('provider.missingOption', { id: selected })}</option> : null}
          </select>
        </Field>
      )}
      {loading ? <p className="dsts-status" role="status">{t('provider.loading')}</p> : null}
      {webState.status === 'unavailable' || selectedInfo === undefined || selectedInfo.description === undefined
        ? null
        : <p className="dsts-hint">{runtime.resolveText(selectedInfo.description)}</p>}
      {webState.status === 'unavailable'
        ? null
        : (
          <p className="dsts-hint">
            {t('provider.current', {
              name: selectedInfo?.title ?? (selected === '' ? t('provider.none') : selected),
            })}
          </p>
        )}
    </Section>
  )
}
