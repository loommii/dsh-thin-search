/**
 * Built-host integration: every result path rejects non-http(s) and relative
 * URLs, resolves DuckDuckGo redirects, deduplicates by URL, and keeps platform
 * adapters on the same normalization.
 */
import { describe, expect, it } from 'vitest'
import { createApplyContext, executeTool, loadHostBundle, stubFetch, toolNamed, jsonResponse, htmlResponse } from './helpers'

/** Apply the built bundle with a config override and return the provider and tools. */
async function setup(config: Record<string, unknown>): Promise<{
  provider: { search(request: { query: string; maxResults?: number }): Promise<{ sources: { url: string; title?: string }[] }> }
  platform: Record<string, any>
}> {
  const bundle = await loadHostBundle()
  const { ctx, records } = createApplyContext()
  bundle.apply(ctx, bundle.Config(config))
  return {
    provider: records.provider as unknown as {
      search(request: { query: string; maxResults?: number }): Promise<{ sources: { url: string; title?: string }[] }>
    },
    platform: toolNamed(records, 'platform_search'),
  }
}

const MIXED_HTML = [
  '<ol id="b_results">',
  '<li class="b_algo"><h2><a href="https://example.com/alpha">Alpha</a></h2><p>Snippet A</p></li>',
  '<li class="b_algo"><h2><a href="https://example.com/alpha">Duplicate</a></h2><p>Snippet duplicate</p></li>',
  '<li class="b_algo"><h2><a href="javascript:alert(1)">JavaScript</a></h2><p>Snippet J</p></li>',
  '<li class="b_algo"><h2><a href="/relative/path">Relative</a></h2><p>Snippet R</p></li>',
  '<li class="b_algo"><h2><a href="ftp://example.com/file">FTP</a></h2><p>Snippet F</p></li>',
  '<li class="b_algo"><h2><a href="mailto:user@example.com">Mail</a></h2><p>Snippet M</p></li>',
  '<li class="b_algo"><h2><a href="https://example.org/beta">Beta</a></h2><p>Snippet B</p></li>',
  '</ol>',
].join('')

describe('search URL validation', () => {
  it('keeps only absolute http(s) URLs and deduplicates by URL', async () => {
    stubFetch(() => htmlResponse(MIXED_HTML))
    const { provider } = await setup({})
    const result = await provider.search({ query: 'mixed', maxResults: 10 })
    expect(result.sources.map((source) => source.url)).toEqual([
      'https://example.com/alpha',
      'https://example.org/beta',
    ])
    expect(result.sources[0]?.title).toBe('Alpha')
  })

  it('resolves DuckDuckGo redirect URLs to the target and drops a non-http redirect', async () => {
    const body = [
      '<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage%3Fa%3D1&amp;rut=abc">One</a><a class="result__snippet">S1</a></div>',
      '<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=javascript%3Aalert(1)">Bad</a><a class="result__snippet">S2</a></div>',
      '<div class="result"><a class="result__a" href="https://example.org/two">Two</a><a class="result__snippet">S3</a></div>',
    ].join('')
    stubFetch(() => htmlResponse(body))
    const { provider } = await setup({ provider: 'ddg' })
    const result = await provider.search({ query: 'redirect' })
    expect(result.sources.map((source) => source.url)).toEqual([
      'https://example.com/page?a=1',
      'https://example.org/two',
    ])
  })

  it('drops a non-http URL from SearXNG JSON', async () => {
    stubFetch(() => jsonResponse({
      results: [
        { url: 'https://example.com/one', title: 'One' },
        { url: 'ftp://example.com/not-http', title: 'Bad' },
        { url: '/relative', title: 'Relative' },
        { url: 'https://example.com/two', title: 'Two' },
      ],
    }))
    const { provider } = await setup({ provider: 'searxng', searxngInstances: ['https://searx.example'] })
    const result = await provider.search({ query: 'json' })
    expect(result.sources.map((source) => source.url)).toEqual([
      'https://example.com/one',
      'https://example.com/two',
    ])
  })

  it('applies the same URL validation to platform_search', async () => {
    stubFetch(() => jsonResponse({
      items: [
        { html_url: 'https://github.com/alpha/beta', full_name: 'alpha/beta', description: 'ok', stargazers_count: 7, updated_at: '2026-01-02T00:00:00Z' },
        { html_url: 'javascript:alert(1)', full_name: 'bad/js' },
        { html_url: '/relative', full_name: 'bad/relative' },
        { html_url: 'ftp://example.com/repo', full_name: 'bad/ftp' },
      ],
    }))
    const { platform } = await setup({ platforms: ['github'] })
    const value = await executeTool(platform, { platform: 'github', query: 'repo' }) as { sources: { url: string; snippet?: string }[] }
    expect(value.sources.map((source) => source.url)).toEqual(['https://github.com/alpha/beta'])
    expect(value.sources[0]?.snippet).toContain('⭐7')
  })

  it('caps a request above the supported maximum', async () => {
    const body = Array.from({ length: 12 }, (_, index) =>
      `<li class="b_algo"><h2><a href="https://example.com/${index}">R${index}</a></h2><p>S${index}</p></li>`).join('')
    stubFetch(() => htmlResponse(`<ol id="b_results">${body}</ol>`))
    const { provider } = await setup({})
    const result = await provider.search({ query: 'cap', maxResults: 50 })
    expect(result.sources).toHaveLength(10)
  })
})
