import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAFT, PLATFORM_IDS, type ThinSearchValues } from '../../src/client/config'
import { ThinSearchBundleConfig } from '../../src/client/page'
import { ThinSearchRuntime } from '../../src/client/runtime'
import { STYLES } from '../../src/client/styles'
import type { ConfigForm, WebProviderInfo } from '../../src/client/types'
import { createFakeContext, type ProviderAnswer } from './helpers'

/** Build one rendered bundle card and the context behind it. */
async function setup(options: {
  readonly values?: Record<string, unknown>
  readonly web?: Record<string, unknown>
  readonly providers?: readonly WebProviderInfo[]
  readonly providerAnswer?: 'error'
  readonly providerSource?: ProviderAnswer | (() => ProviderAnswer)
  readonly skipProviderLoad?: boolean
  readonly locale?: string
} = {}) {
  const context = createFakeContext({
    sections: {
      'thin-search': options.values ?? { ...DEFAULT_DRAFT, platforms: [...PLATFORM_IDS] },
      web: options.web ?? { searchProvider: 'thin-search' },
    },
    ...(options.providerSource !== undefined
      ? { providers: options.providerSource }
      : options.providerAnswer === 'error'
        ? { providers: { kind: 'error' } as const }
        : options.providers === undefined
          ? {}
          : { providers: { kind: 'list', providers: options.providers } as const }),
    ...(options.locale === undefined ? {} : { locale: options.locale }),
  })
  const thin = context.forms.get('thin-search')
  if (thin === undefined) throw new Error('missing thin-search form double')
  const runtime = new ThinSearchRuntime(context)
  const detach = runtime.attach(thin.form as unknown as ConfigForm<ThinSearchValues>)
  if (options.skipProviderLoad !== true) await runtime.refreshProviders()
  const render = (): string => renderToStaticMarkup(<ThinSearchBundleConfig runtime={runtime} />)
  return { context, thin, runtime, detach, render }
}

describe('Thin Search bundle settings card', () => {
  it('renders dsh-context-style groups with localized titles', async () => {
    const { render } = await setup()
    const html = render()
    expect(html).toContain('class="dsts-settings-prefs"')
    expect(html).toContain('class="dsts-settings-group"')
    expect(html).toContain('Search provider')
    expect(html).toContain('Preferred engine')
    expect(html).toContain('Search enhancement')
    expect(html).toContain('Platform search')
    expect(html).toContain('Advanced settings')
    expect(html).toContain('class="dsts-settings-group-title"')
    expect(html).toContain('class="dsts-settings-row"')
    expect(html).toContain('class="dsts-settings-label"')
  })

  it('uses pill selects instead of native selects and has no Save/Discard footer', async () => {
    const { render } = await setup()
    const html = render()
    expect(html).not.toContain('<select')
    expect(html).not.toContain('data-control="save"')
    expect(html).not.toContain('data-control="discard"')
    expect(html).not.toContain('>Save<')
    expect(html).not.toContain('Discard')
    expect(html).toContain('class="dsts-settings-select"')
    expect(html).toContain('data-control="engine"')
    expect(html).toContain('data-control="provider"')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
  })

  it('shows the current pill values and every platform checkbox', async () => {
    const { render } = await setup({ values: { ...DEFAULT_DRAFT, platforms: ['github', 'npm'] } })
    const html = render()
    expect(html).toContain('Bing')
    expect(html).toContain('Thin Search')
    expect((html.match(/data-control="platforms"/g) ?? []).length).toBe(8)
    expect((html.match(/checked=""/g) ?? []).length).toBe(2)
    expect((html.match(/dsts-settings-chip-on/g) ?? []).length).toBe(2)
    expect(html).toContain('GitHub')
    expect(html).toContain('Stack Overflow')
  })

  it('uses accessible labels, a switch role, a fieldset legend, and live notes', async () => {
    const { render } = await setup()
    const html = render()
    expect(html).toContain('for="dsts-cache-ttl"')
    expect(html).toContain('id="dsts-cache-ttl"')
    expect(html).toContain('aria-labelledby="dsts-engine-label"')
    expect(html).toContain('aria-labelledby="dsts-provider-label"')
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain('<fieldset class="dsts-settings-platforms"')
    expect(html).toContain('<legend class="dsts-settings-legend">Enabled platforms</legend>')
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="Preferred engine"')
  })

  it('renders text/textarea rows with clear affordances and no model picker', async () => {
    const { render } = await setup({ values: { ...DEFAULT_DRAFT, platforms: [...PLATFORM_IDS], enhanceModel: 'deepseek:flash', searxngInstances: ['https://searx.example.com'] } })
    const html = render()
    expect(html).toContain('data-control="enhance-model"')
    expect(html).toContain('data-control="searxng-instances"')
    expect(html).toContain('class="dsts-settings-textarea"')
    expect(html).toContain('data-control="clear-searxng-instances"')
    expect(html).not.toContain('data-control="model"')
    expect(html).not.toContain('data-control="test"')
    expect(html).not.toContain('<select')
  })

  it('lists the Host providers and never hardcodes an official id', async () => {
    const { render } = await setup({
      providers: [
        { id: 'thin-search', title: 'Thin Search', description: { en: 'Free search', zh: '免费搜索' } },
        { id: 'deepseek-official', title: 'DeepSeek Search' },
      ],
    })
    const html = render()
    expect(html).toContain('Thin Search')
    expect(html).toContain('Current provider: Thin Search')
    expect(html).toContain('Free search')
  })

  it('keeps a selected provider the Host no longer registers visible', async () => {
    const { render } = await setup({ web: { searchProvider: 'gone' }, providers: [] })
    const html = render()
    expect(html).toContain('gone (not registered)')
  })

  it('shows a read-only note and disables every control', async () => {
    const { thin, render } = await setup()
    thin.setSnapshot({ writable: false })
    const html = render()
    expect(html).toContain('This deployment stores settings read-only.')
    expect(html).toContain('data-control="engine"')
    expect(html.match(/data-control="engine"[^>]*disabled/g) ?? html.match(/disabled[^>]*data-control="engine"/g)).toBeTruthy()
    expect(html.match(/data-control="enhance"[^>]*disabled/g) ?? html.match(/disabled[^>]*data-control="enhance"/g)).toBeTruthy()
    expect(html).toContain('role="status"')
  })

  it('shows the loading and unavailable notes', async () => {
    const { thin, render } = await setup()
    thin.setSnapshot({ status: 'loading' })
    expect(render()).toContain('Loading settings…')
    expect(render()).not.toContain('data-control="engine"')
    thin.setSnapshot({ status: 'unavailable' })
    expect(render()).toContain('Thin Search settings are not served by this deployment.')
  })

  it('offers a retry when the provider list read fails', async () => {
    const { render } = await setup({ providerAnswer: 'error' })
    const html = render()
    expect(html).toContain('role="alert"')
    expect(html).toContain('Could not load the registered providers.')
    expect(html).toContain('data-control="provider-retry"')
  })

  it('keeps the provider select interactive when a refresh fails after a good list', async () => {
    let reads = 0
    const { runtime, render } = await setup({
      providerSource: () => {
        reads += 1
        return reads === 1
          ? { kind: 'list', providers: [{ id: 'thin-search', title: 'Thin Search' }] }
          : { kind: 'error' }
      },
    })
    await runtime.refreshProviders()
    const html = render()
    expect(html).toContain('Could not load the registered providers.')
    expect(html).toContain('data-control="provider-retry"')
    expect(html).not.toMatch(/data-control="provider"[^>]*disabled/u)
  })

  it('disables the provider select while loading an empty list', async () => {
    const { runtime, render } = await setup({
      skipProviderLoad: true,
      providerSource: () => ({ kind: 'list', providers: [{ id: 'thin-search', title: 'Thin Search' }] }),
    })
    runtime.ensureProviders()
    const html = render()
    expect(html).toMatch(/data-control="provider"[^>]*disabled/u)
  })

  it('never renders a raw dictionary key', async () => {
    const { render } = await setup()
    const html = render()
    for (const key of ['provider.title', 'engine.title', 'platforms.title', 'advanced.title', 'settings.clear', 'status.writeFailed']) {
      expect(html).not.toContain(key)
    }
  })

  it('switches the whole card to Chinese through ctx.locale', async () => {
    const { render } = await setup({ locale: 'zh' })
    const html = render()
    expect(html).toContain('搜索提供方')
    expect(html).toContain('首选引擎')
    expect(html).toContain('平台搜索')
    expect(html).toContain('高级设置')
    expect(html).not.toContain('Search provider')
  })

  it('matches the dsh-context pill and textarea styles with theme tokens', () => {
    expect(STYLES).toContain('height:36px')
    expect(STYLES).toContain('border-radius:18px')
    expect(STYLES).toContain('.dsts-settings-textarea')
    expect(STYLES).toContain('.dsts-settings-textx')
    expect(STYLES).toContain('.dsts-settings-group-title')
    expect(STYLES).toContain('var(--dsw-alias-label-primary)')
    expect(STYLES).toContain('var(--dsw-alias-bg-module-platform)')
    expect(STYLES).toContain('var(--dsw-alias-state-business-primary)')
    expect(STYLES).not.toMatch(/#[0-9a-f]{3,6}/i)
  })
})
