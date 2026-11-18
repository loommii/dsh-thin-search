/**
 * Built-bundle integration: the documented host entry point registers the
 * Thin Search provider, the three Agent tools and one dynamic system-prompt
 * section, and answers web_search end-to-end over a stubbed network.
 */
import { describe, expect, it } from 'vitest'
import { fixture, createApplyContext, htmlResponse, jsonResponse, loadHostBundle, sectionText, stubFetch } from './helpers'

describe('built host entry provider registration', () => {
  it('loads the documented entry point and exports the DSH contract surface', async () => {
    const bundle = await loadHostBundle()
    expect(bundle.name).toBe('thin-search')
    expect([...bundle.inject]).toEqual(['web', 'tools', 'systemPrompt'])
    expect(bundle.THIN_SEARCH_PROVIDER_ID).toBe('thin-search')
    expect(bundle.THIN_SEARCH_PROVIDER_TITLE).toBe('Thin Search')
    expect(Object.keys(bundle.THIN_SEARCH_PROVIDER_DESCRIPTION).sort()).toEqual(['en', 'zh'])
    expect(bundle.THIN_SEARCH_PROVIDER_DESCRIPTION['en']).toContain('fallback')
    expect(bundle.THIN_SEARCH_PROVIDER_DESCRIPTION['zh']).toContain('回退')
    expect(typeof bundle.apply).toBe('function')
    expect(typeof bundle.createThinSearchProvider).toBe('function')
    expect(typeof bundle.buildSystemPromptText).toBe('function')
    expect(typeof bundle.Config).toBe('function')
  })

  it('apply() registers the provider, the three tools and one prompt section', async () => {
    const bundle = await loadHostBundle()
    const { ctx, records } = createApplyContext()
    bundle.apply(ctx, bundle.Config({}))

    const provider = records.provider
    expect(provider).toBeDefined()
    expect(provider?.id).toBe('thin-search')
    expect(provider?.title).toBe('Thin Search')
    expect(provider?.available()).toBe(true)
    expect('ready' in (provider ?? {})).toBe(false)
    expect(records.tools.map((tool) => tool.name)).toEqual(['free_search_test', 'platform_search', 'advanced_search'])
    expect(records.tools.map((tool) => tool.timeoutMs)).toEqual([65_000, 30_000, 60_000])

    expect(records.sections).toHaveLength(1)
    expect(records.sections[0]?.name).toBe('thin-search:engines')
    expect(records.sections[0]?.order).toBe(2005)
    expect(records.sectionOrderQueries).toEqual(['TOOL_WEB_SEARCH'])
    const text = sectionText(records.sections[0]!)
    expect(text).toContain('preferred engine bing')
    expect(text).toContain('Web search uses whichever provider is selected')
    expect(text).toContain('When Thin Search is selected')
    expect(text).toContain('advanced_search')
    expect(text).toContain('V2EX')
  })

  it('answers web_search with normalized sources from the built provider', async () => {
    const stub = stubFetch(() => htmlResponse(fixture('bing.html')))
    const bundle = await loadHostBundle()
    const { ctx, records } = createApplyContext()
    bundle.apply(ctx, bundle.Config({}))

    const result = await records.provider!.search({ query: 'alpha', maxResults: 5 })
    expect(result.truncated).toBe(false)
    expect(result.sources.map((source) => source.url)).toEqual([
      'https://www.example.com/alpha',
      'https://www.example.org/beta',
    ])
    expect(result.sources[0]?.snippet).toContain('Alpha snippet & details')
    expect(stub.calls).toHaveLength(1)
    expect(stub.calls[0]?.url).toContain('https://www.bing.com/search')
    expect(new URL(stub.calls[0]!.url).searchParams.get('mkt')).toBe('zh-CN')
  })

  it('retries a transient 5xx once and falls back to the next engine', async () => {
    const stub = stubFetch((url) => {
      if (url.includes('bing.com')) return htmlResponse('temporarily unavailable', 503)
      return jsonResponse({
        code: 0,
        data: { results: [{ url: 'https://fallback.example/result', title: 'Fallback', snippet: 'Second engine' }] },
      })
    })
    const bundle = await loadHostBundle()
    const { ctx, records } = createApplyContext()
    bundle.apply(ctx, bundle.Config({}))

    const result = await records.provider!.search({ query: 'fallback', maxResults: 5 })
    expect(result.sources.map((source) => source.url)).toEqual(['https://fallback.example/result'])
    expect(result.content ?? '').toContain('used anysearch')
    const bingCalls = stub.calls.filter((call) => call.url.includes('bing.com'))
    const anysearchCalls = stub.calls.filter((call) => call.url.includes('anysearch'))
    expect(bingCalls).toHaveLength(2)
    expect(anysearchCalls).toHaveLength(1)
  })

  it('passes maxResults through the provider facade', async () => {
    const body = Array.from({ length: 8 }, (_, index) =>
      `<li class="b_algo"><h2><a href="https://example.com/${index}">Result ${index}</a></h2><p>Snippet ${index}</p></li>`).join('')
    stubFetch(() => htmlResponse(`<ol id="b_results">${body}</ol>`))
    const bundle = await loadHostBundle()
    const { ctx, records } = createApplyContext()
    bundle.apply(ctx, bundle.Config({}))

    const result = await records.provider!.search({ query: 'limit', maxResults: 2 })
    expect(result.sources).toHaveLength(2)
  })
})
