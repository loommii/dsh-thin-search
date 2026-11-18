import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAFT, PLATFORM_IDS } from '../../src/client/config'
import { ThinSearchRowConfig } from '../../src/client/page'
import { ThinSearchRuntime } from '../../src/client/runtime'
import { STYLES } from '../../src/client/styles'
import type { WebProviderInfo } from '../../src/client/types'
import { createFakeContext, pageForm } from './helpers'

/** Build one rendered page and the context behind it. */
async function setup(options: {
  readonly values?: Record<string, unknown>
  readonly web?: Record<string, unknown>
  readonly providers?: readonly WebProviderInfo[]
  readonly providerAnswer?: 'error'
  readonly locale?: string
} = {}) {
  const context = createFakeContext({
    sections: {
      'thin-search': options.values ?? { ...DEFAULT_DRAFT, platforms: [...PLATFORM_IDS] },
      web: options.web ?? { searchProvider: 'thin-search' },
    },
    ...(options.providerAnswer === 'error'
      ? { providers: { kind: 'error' } as const }
      : options.providers === undefined
        ? {}
        : { providers: { kind: 'list', providers: options.providers } as const }),
    ...(options.locale === undefined ? {} : { locale: options.locale }),
  })
  const thin = context.forms.get('thin-search')
  if (thin === undefined) throw new Error('missing thin-search form double')
  const runtime = new ThinSearchRuntime(context)
  await runtime.refreshProviders()
  const render = (): string => renderToStaticMarkup(
    <ThinSearchRowConfig view="page" form={pageForm(thin)} runtime={runtime} />,
  )
  return { context, thin, runtime, render }
}

describe('Thin Search row page', () => {
  it('renders the four cards with localized copy', async () => {
    const { render } = await setup()
    const html = render()
    expect(html).toContain('Thin Search')
    expect(html).toContain('Search provider')
    expect(html).toContain('Preferred engine')
    expect(html).toContain('Search enhancement')
    expect(html).toContain('Platform search')
    expect(html).toContain('Advanced settings')
    expect(html).toContain('class="dsts-page"')
    expect(html).toContain('class="dsts-card"')
  })

  it('renders every engine and platform through the dictionaries', async () => {
    const { render } = await setup()
    const html = render()
    for (const label of ['Bing', 'AnySearch', 'SearXNG', 'DuckDuckGo HTML', 'DuckDuckGo Lite']) {
      expect(html).toContain(label)
    }
    expect((html.match(/data-control="platforms"/g) ?? []).length).toBe(8)
    expect(html).toContain('GitHub')
    expect(html).toContain('Stack Overflow')
  })

  it('lists exactly the providers the Host reports and never hardcodes one', async () => {
    const { render } = await setup({
      providers: [
        { id: 'thin-search', title: 'Thin Search' },
        { id: 'deepseek-official', title: 'DeepSeek Search' },
      ],
    })
    const html = render()
    expect(html).toContain('<option value="thin-search"')
    expect(html).toContain('<option value="deepseek-official"')
    expect(html).toContain('DeepSeek Search')
    expect(html).toContain('Current provider: Thin Search')
  })

  it('keeps a selected provider the Host no longer registers visible', async () => {
    const { render } = await setup({ web: { searchProvider: 'gone' }, providers: [] })
    const html = render()
    expect(html).toContain('<option value="gone"')
    expect(html).toContain('gone (not registered)')
  })

  it('has exactly two selects: the provider and the engine', async () => {
    const { render } = await setup()
    const html = render()
    expect((html.match(/<select/g) ?? []).length).toBe(2)
    expect(html).toContain('data-control="provider"')
    expect(html).toContain('data-control="engine"')
    expect(html).not.toContain('data-control="model"')
    expect(html).not.toContain('data-control="test"')
  })

  it('uses native labelled controls and a role=switch button', async () => {
    const { render } = await setup()
    const html = render()
    expect(html).toContain('for="dsts-provider"')
    expect(html).toContain('id="dsts-provider"')
    expect(html).toContain('for="dsts-engine"')
    expect(html).toContain('id="dsts-engine"')
    expect(html).toContain('for="dsts-cache-ttl"')
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain('aria-labelledby="dsts-enhance-label"')
    expect(html).toContain('<fieldset class="dsts-platforms"')
    expect(html).toContain('<legend class="dsts-legend">Enabled platforms</legend>')
    expect(html).toContain('aria-live="polite"')
  })

  it('keeps the enhancement model as a text field, not a picker', async () => {
    const { render } = await setup({
      values: { ...DEFAULT_DRAFT, platforms: [...PLATFORM_IDS], searchEnhance: true },
    })
    const html = render()
    expect(html).toContain('data-control="enhance-model"')
    expect(html).toContain('placeholder="provider:model"')
    expect(html).toContain('this page offers no model list')
    expect((html.match(/<select/g) ?? []).length).toBe(2)
  })

  it('renders the current values in the platform checklist', async () => {
    const { render } = await setup({
      values: { ...DEFAULT_DRAFT, platforms: ['github', 'npm'] },
    })
    const html = render()
    expect((html.match(/checked=""/g) ?? []).length).toBe(2)
  })

  it('disables the form and shows the read-only notice for a read-only Host', async () => {
    const { thin, render } = await setup()
    thin.setSnapshot({ writable: false })
    const html = render()
    expect(html).toContain('This deployment stores settings read-only.')
    expect(html).toContain('data-control="save"')
    expect(html.match(/data-control="save"[^>]*disabled/g) ?? html.match(/disabled[^>]*data-control="save"/g)).toBeTruthy()
    expect(html.match(/<input[^>]*disabled/g)?.length ?? 0).toBeGreaterThan(0)
  })

  it('shows the loading state before the first accepted section', async () => {
    const { thin, render } = await setup()
    thin.setSnapshot({ status: 'loading' })
    const html = render()
    expect(html).toContain('Loading settings…')
    expect(html).not.toContain('data-control="engine"')
  })

  it('shows the unavailable state for an unserved namespace', async () => {
    const { thin, render } = await setup()
    thin.setSnapshot({ status: 'unavailable' })
    const html = render()
    expect(html).toContain('Thin Search settings are not served by this deployment.')
  })

  it('offers a retry when the provider list read fails', async () => {
    const { render } = await setup({ providerAnswer: 'error' })
    const html = render()
    expect(html).toContain('role="alert"')
    expect(html).toContain('Could not load the registered providers.')
    expect(html).toContain('data-control="provider-retry"')
  })

  it('never renders a raw dictionary key', async () => {
    const { render } = await setup()
    const html = render()
    for (const key of ['provider.title', 'provider.label', 'engine.title', 'platforms.title', 'advanced.title', 'status.unsaved', 'actions.save']) {
      expect(html).not.toContain(key)
    }
  })

  it('switches the whole page to Chinese through ctx.locale', async () => {
    const { render } = await setup({ locale: 'zh' })
    const html = render()
    expect(html).toContain('搜索提供方')
    expect(html).toContain('首选引擎')
    expect(html).toContain('平台搜索')
    expect(html).toContain('高级设置')
    expect(html).not.toContain('Search provider')
  })

  it('uses theme tokens in every style rule', () => {
    expect(STYLES).toContain('var(--dsw-alias-label-primary)')
    expect(STYLES).toContain('var(--dsw-alias-bg-layer-2)')
    expect(STYLES).toContain('var(--dsw-alias-border-l4)')
    expect(STYLES).toContain('var(--dsw-focus-ring-color')
    expect(STYLES).not.toMatch(/#[0-9a-f]{3,6}/i)
  })

  it('renders the summary view as the localized one-liner', () => {
    const html = renderToStaticMarkup(
      <ThinSearchRowConfig
        view="summary"
        runtime={new ThinSearchRuntime(createFakeContext())}
      />,
    )
    expect(html).toBe('Free, keyless web search with engine fallback, result caching, optional model enhancement, and platform search.')
  })
})
