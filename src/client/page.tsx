/**
 * The Thin Search bundle settings card on the installed-plugin detail page.
 *
 * DSH 0.2.2-rc.3 passes no owner form props to `plugins.bundle.config`, so the
 * card subscribes to the runtime's ConfigForm store instead. Every control
 * writes immediately (select on pick, switch on toggle, text on blur/Enter,
 * Escape clears a draft); there is no Save/Discard footer. Layout follows
 * dsh-context v0.85.1: grouped sections, label-left/control-right rows,
 * 36px/18px pill selects, textarea clear affordances, and read-only notes.
 * @module dsh-thin-search/client/page
 */
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  ENGINE_IDS,
  PLATFORM_IDS,
  canonicalPlatforms,
  isEngineId,
  type DraftErrorKey,
  type PlatformId,
} from './config'
import { Group, Note, PillSelect, Row, SwitchRow, TextControl, type PillOption } from './components'
import { engineLabelKey, platformLabelKey } from './locales'
import type { ThinSearchRuntime } from './runtime'
import type { ConfigForm, ConfigFormSnapshot, WebProviderInfo } from './types'
import type { ProviderDirectorySnapshot } from './provider-directory'

/** Props the bundle page wrapper supplies from the plugin's closure. */
export interface ThinSearchBundleConfigProps {
  readonly runtime: ThinSearchRuntime
}

/** Subscribe one ConfigForm snapshot through React's external store. */
function useConfigFormSnapshot<T>(form: ConfigForm<T>): ConfigFormSnapshot<T> {
  const subscribe = useCallback((listener: () => void) => form.subscribe(listener), [form])
  const snapshot = useCallback(() => form.getSnapshot(), [form])
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** The bundle settings card. */
export function ThinSearchBundleConfig({ runtime }: ThinSearchBundleConfigProps): ReactNode {
  const t = runtime.t
  const settings = useSyncExternalStore(runtime.subscribeSettings, runtime.getSettingsSnapshot, runtime.getSettingsSnapshot)
  const webState = useConfigFormSnapshot(runtime.webForm)
  const providers = useSyncExternalStore(runtime.subscribeProviders, runtime.getProvidersSnapshot, runtime.getProvidersSnapshot)
  const [providerError, setProviderError] = useState(false)

  useEffect(() => { runtime.ensureProviders() }, [runtime])

  const fieldError = (key: DraftErrorKey): string | undefined =>
    settings.error?.key === key ? t(settings.error.key, settings.error.params) : undefined

  const pickProvider = async (id: string): Promise<void> => {
    setProviderError(false)
    try {
      const accepted = await runtime.setSearchProvider(id)
      if (!accepted) setProviderError(true)
    } catch {
      setProviderError(true)
    }
  }

  const togglePlatform = (id: PlatformId): void => {
    const platforms = settings.values.platforms.includes(id)
      ? settings.values.platforms.filter((candidate) => candidate !== id)
      : canonicalPlatforms([...settings.values.platforms, id])
    void runtime.writeSetting('platforms', platforms)
  }

  const commitCacheTtl = (text: string): void => {
    const trimmed = text.trim()
    const value = trimmed === '' ? Number.NaN : Number(trimmed)
    void runtime.writeSetting('cacheTtl', value)
  }

  return (
    <div className="dsts-settings-prefs">
      {settings.status === 'loading' ? <Note role="status">{t('status.loading')}</Note> : null}
      {settings.status === 'unavailable' ? <Note role="status">{t('status.unavailable')}</Note> : null}
      {settings.status === 'ready' && !settings.writable ? <Note role="status">{t('status.readOnly')}</Note> : null}
      {settings.writeFailed ? <Note role="alert" error>{t('status.writeFailed')}</Note> : null}

      {settings.status === 'ready' ? (
        <>
          <ProviderGroup
            runtime={runtime}
            webState={webState}
            providers={providers}
            error={providerError}
            onPick={(id) => { void pickProvider(id) }}
            onRetry={() => { void runtime.refreshProviders() }}
          />

          <Group title={t('engine.title')}>
            <Note>{t('engine.description')}</Note>
            <Row label={t('engine.label')} labelId="dsts-engine-label">
              <PillSelect
                id="dsts-engine"
                control="engine"
                label={t('engine.label')}
                value={settings.values.provider}
                options={ENGINE_IDS.map((id): PillOption => ({ id, label: t(engineLabelKey(id)) }))}
                disabled={!settings.writable}
                describedBy="dsts-engine-hint"
                onChange={(id) => { if (isEngineId(id)) void runtime.writeSetting('provider', id) }}
              />
            </Row>
            <Note id="dsts-engine-hint">{t('engine.hint')}</Note>
          </Group>

          <Group title={t('enhance.title')}>
            <Note>{t('enhance.description')}</Note>
            <SwitchRow
              id="dsts-enhance"
              control="enhance"
              label={t('enhance.toggle')}
              checked={settings.values.searchEnhance}
              disabled={!settings.writable}
              onChange={(next) => { void runtime.writeSetting('searchEnhance', next) }}
            />
            <Note>{t('enhance.hint')}</Note>
            <TextControl
              id="dsts-enhance-model"
              control="enhance-model"
              label={t('enhance.modelLabel')}
              value={settings.values.enhanceModel}
              disabled={!settings.writable}
              placeholder={t('enhance.modelPlaceholder')}
              hint={t('enhance.modelHint')}
              clearLabel={t('settings.clear')}
              commit={(value) => { void runtime.writeSetting('enhanceModel', value) }}
            />
            <TextControl
              id="dsts-enhance-prompt"
              control="enhance-prompt-path"
              label={t('enhance.promptPathLabel')}
              value={settings.values.enhanceSystemPromptPath}
              disabled={!settings.writable}
              placeholder={t('enhance.promptPathPlaceholder')}
              hint={t('enhance.promptPathHint')}
              error={fieldError('validation.enhanceSystemPromptPath')}
              clearLabel={t('settings.clear')}
              commit={(value) => { void runtime.writeSetting('enhanceSystemPromptPath', value) }}
            />
          </Group>

          <Group title={t('platforms.title')}>
            <fieldset className="dsts-settings-platforms" disabled={!settings.writable}>
              <legend className="dsts-settings-legend">{t('platforms.legend')}</legend>
              <div className="dsts-settings-chips">
                {PLATFORM_IDS.map((id) => {
                  const enabled = settings.values.platforms.includes(id)
                  return (
                    <label
                      className={enabled ? 'dsts-settings-chip dsts-settings-chip-on' : 'dsts-settings-chip'}
                      key={id}
                      htmlFor={`dsts-platform-${id}`}
                    >
                      <input
                        id={`dsts-platform-${id}`}
                        data-control="platforms"
                        type="checkbox"
                        checked={enabled}
                        disabled={!settings.writable}
                        onChange={() => { togglePlatform(id) }}
                      />
                      <span>{t(platformLabelKey(id))}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
            <Note>{settings.values.platforms.length === 0 ? t('platforms.allDisabled') : t('platforms.hint')}</Note>
          </Group>

          <Group title={t('advanced.title')}>
            <Note>{t('advanced.description')}</Note>
            <TextControl
              id="dsts-cache-ttl"
              control="cache-ttl"
              label={t('advanced.cacheLabel')}
              value={String(settings.values.cacheTtl)}
              disabled={!settings.writable}
              inputMode="numeric"
              hint={t('advanced.cacheHint')}
              error={fieldError('validation.cacheTtl')}
              clearLabel={t('settings.clear')}
              commit={commitCacheTtl}
            />
            <TextControl
              id="dsts-bing-market"
              control="bing-market"
              label={t('advanced.bingMarketLabel')}
              value={settings.values.bingMarket}
              disabled={!settings.writable}
              hint={t('advanced.bingMarketHint')}
              clearLabel={t('settings.clear')}
              commit={(value) => { void runtime.writeSetting('bingMarket', value) }}
            />
            <TextControl
              id="dsts-region"
              control="region"
              label={t('advanced.regionLabel')}
              value={settings.values.region}
              disabled={!settings.writable}
              hint={t('advanced.regionHint')}
              clearLabel={t('settings.clear')}
              commit={(value) => { void runtime.writeSetting('region', value) }}
            />
            <TextControl
              id="dsts-searxng"
              control="searxng-instances"
              label={t('advanced.searxngLabel')}
              value={settings.values.searxngText}
              disabled={!settings.writable}
              multiline
              rows={Math.min(8, Math.max(2, settings.values.searxngText.split('\n').length))}
              placeholder={t('advanced.searxngPlaceholder')}
              hint={t('advanced.searxngHint')}
              error={fieldError('validation.searxng')}
              clearLabel={t('settings.clear')}
              commit={(value) => { void runtime.writeSetting('searxngText', value) }}
            />
          </Group>
        </>
      ) : null}
    </div>
  )
}

/** The global provider group: Host providers plus the ConfigForms write. */
function ProviderGroup({ runtime, webState, providers, error, onPick, onRetry }: {
  readonly runtime: ThinSearchRuntime
  readonly webState: ConfigFormSnapshot<{ readonly searchProvider?: string; readonly fetchProvider?: string }>
  readonly providers: ProviderDirectorySnapshot
  readonly error: boolean
  readonly onPick: (id: string) => void
  readonly onRetry: () => void
}): ReactNode {
  const t = runtime.t
  const list = providers.providers
  const selected = webState.value?.searchProvider ?? ''
  const selectedInfo: WebProviderInfo | undefined = list.find((provider) => provider.id === selected)
  const loading = providers.status === 'loading' && list.length === 0
  const options: PillOption[] = list.map((provider) => ({ id: provider.id, label: provider.title ?? provider.id }))
  if (selected !== '' && selectedInfo === undefined) {
    options.push({ id: selected, label: t('provider.missingOption', { id: selected }) })
  }
  const describedBy = error ? 'dsts-provider-hint dsts-provider-error' : 'dsts-provider-hint'
  return (
    <Group title={t('provider.title')}>
      {webState.status === 'unavailable' ? (
        <Note role="status">{t('provider.unavailable')}</Note>
      ) : (
        <>
          <Note>{t('provider.description')}</Note>
          <Row label={t('provider.label')} labelId="dsts-provider-label">
            <PillSelect
              id="dsts-provider"
              control="provider"
              label={t('provider.label')}
              value={selected}
              options={options}
              placeholder={t('provider.none')}
              disabled={webState.status !== 'ready' || !webState.writable || loading || providers.status === 'error'}
              describedBy={describedBy}
              onChange={onPick}
            />
          </Row>
          <Note id="dsts-provider-hint">{t('provider.hint')}</Note>
          {loading ? <Note role="status">{t('provider.loading')}</Note> : null}
          {providers.status === 'error' ? (
            <Note role="alert" error>
              {t('provider.error')}{' '}
              <button type="button" className="dsts-settings-inline-action" data-control="provider-retry" onClick={onRetry}>
                {t('provider.retry')}
              </button>
            </Note>
          ) : null}
          {selectedInfo?.description === undefined
            ? null
            : <Note>{runtime.resolveText(selectedInfo.description)}</Note>}
          <Note>
            {t('provider.current', {
              name: selectedInfo?.title ?? (selected === '' ? t('provider.none') : selected),
            })}
          </Note>
          {error ? <Note id="dsts-provider-error" role="alert" error>{t('provider.switchFailed')}</Note> : null}
        </>
      )}
    </Group>
  )
}
