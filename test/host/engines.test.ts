import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { HttpClient } from '../../src/search/http'
import { anysearchEngine, parseAnysearchJson } from '../../src/search/engines/anysearch'
import { bingEngine, parseBingHtml } from '../../src/search/engines/bing'
import { ddgEngine, parseDdgHtml } from '../../src/search/engines/ddg'
import { ddgLiteEngine, parseDdgLiteHtml } from '../../src/search/engines/ddg-lite'
import { DEFAULT_SEARXNG_INSTANCES, parseSearxngJson, searxngEngine } from '../../src/search/engines/searxng'
import { ENGINE_IDS, supportsTimeRange } from '../../src/search/engines/types'
import { engineContext, routingHttp, testConfig, textHttp } from './helpers'

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/engines/${name}`, import.meta.url), 'utf8')
}

describe('engine HTML fixtures', () => {
  it('parses Bing results and drops non-http URLs', () => {
    const sources = parseBingHtml(fixture('bing.html'), 10)
    expect(sources).toHaveLength(2)
    expect(sources[0]).toMatchObject({ url: 'https://www.example.com/alpha', title: 'Alpha result', snippet: 'Alpha snippet & details.' })
    expect(sources[1]?.url).toBe('https://www.example.org/beta')
  })

  it('parses DuckDuckGo HTML and decodes the uddg redirect', () => {
    const sources = parseDdgHtml(fixture('ddg.html'), 10)
    expect(sources).toHaveLength(2)
    expect(sources[0]).toMatchObject({
      url: 'https://example.com/page?a=1',
      title: 'Duck result one',
      snippet: 'Duck snippet one',
      publishedAt: '2026-07-01',
    })
    expect(sources[1]?.url).toBe('https://example.org/two')
    expect(sources[1]?.publishedAt).toBeUndefined()
  })

  it('parses DuckDuckGo Lite rows', () => {
    const sources = parseDdgLiteHtml(fixture('ddg-lite.html'), 10)
    expect(sources).toHaveLength(2)
    expect(sources[0]).toMatchObject({ title: 'Lite result one', snippet: 'Lite snippet one', publishedAt: '2026-07-02' })
    expect(sources[0]?.url).toBe('https://example.net/lite')
    expect(sources[1]?.snippet).toBe('Lite snippet two')
    expect(sources[1]?.publishedAt).toBeUndefined()
  })

  it('omits unparseable DDG timestamps instead of failing', () => {
    const html = '<div class="result"><a class="result__a" href="https://example.com/x">X</a><span class="result__timestamp">not a date</span></div>'
    const sources = parseDdgHtml(html, 5)
    expect(sources).toHaveLength(1)
    expect(sources[0]?.publishedAt).toBeUndefined()
  })

  it('parses SearXNG JSON and filters unsupported schemes', () => {
    const sources = parseSearxngJson(JSON.parse(fixture('searxng.json')), 10)
    expect(sources).toHaveLength(2)
    expect(sources[0]).toMatchObject({ url: 'https://example.com/one', title: 'One', snippet: 'First result', publishedAt: '2026-07-01T00:00:00Z' })
    expect(sources.some(source => source.url.startsWith('ftp:'))).toBe(false)
  })

  it('parses AnySearch JSON and reports API errors', () => {
    const sources = parseAnysearchJson(JSON.parse(fixture('anysearch.json')), 10)
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ url: 'https://example.com/any', title: 'Any result' })
    expect(() => parseAnysearchJson({ code: 7, message: 'bad key' }, 10)).toThrow('bad key')
  })
})

describe('engine requests', () => {
  it('sends Bing the configured market', async () => {
    const http = textHttp(fixture('bing.html'))
    const sources = await bingEngine.search(engineContext({ http, config: testConfig({ bingMarket: 'en-US' }) }))
    expect(sources).toHaveLength(2)
    const requested = new URL(http.calls[0]?.url ?? '')
    expect(requested.origin + requested.pathname).toBe('https://www.bing.com/search')
    expect(requested.searchParams.get('q')).toBe('test query')
    expect(requested.searchParams.get('mkt')).toBe('en-US')
  })

  it('maps an absolute date to df=w for DuckDuckGo', async () => {
    const http = textHttp(fixture('ddg.html'))
    const context = engineContext({
      http,
      config: testConfig({ region: 'cn-zh' }),
      timeRange: { after: '2026-07-01' },
      now: Date.UTC(2026, 6, 10),
    })
    await ddgEngine.search(context)
    const requested = new URL(http.calls[0]?.url ?? '')
    expect(requested.searchParams.get('df')).toBe('w')
    expect(requested.searchParams.get('kl')).toBe('cn-zh')
  })

  it('maps an absolute date to df=w for DuckDuckGo Lite', async () => {
    const http = textHttp(fixture('ddg-lite.html'))
    const context = engineContext({ http, timeRange: { after: '2026-07-01' }, now: Date.UTC(2026, 6, 10) })
    await ddgLiteEngine.search(context)
    expect(new URL(http.calls[0]?.url ?? '').searchParams.get('df')).toBe('w')
  })

  it('maps an absolute date to time_range=week for SearXNG and falls back across instances', async () => {
    const calls: string[] = []
    const payload = fixture('searxng.json')
    const http: HttpClient = {
      request: async (url) => { calls.push(url); return { status: 200, url, headers: new Headers(), body: payload } },
      text: async (url) => { calls.push(url); return payload },
      json: async <T>(url: string): Promise<T> => {
        calls.push(url)
        if (url.includes('one.example')) throw new Error('HTTP 500')
        return JSON.parse(payload) as T
      },
    }
    const context = engineContext({
      http,
      config: testConfig({ searxngInstances: ['https://one.example', 'https://two.example'] }),
      timeRange: { after: '2026-07-01' },
      now: Date.UTC(2026, 6, 10),
    })
    const sources = await searxngEngine.search(context)
    expect(sources).toHaveLength(2)
    expect(calls).toHaveLength(2)
    const requested = new URL(calls[1] ?? '')
    expect(requested.searchParams.get('q')).toBe('test query')
    expect(requested.searchParams.get('format')).toBe('json')
    expect(requested.searchParams.get('time_range')).toBe('week')
  })

  it('posts to AnySearch with the query and result count', async () => {
    const http = textHttp(fixture('anysearch.json'))
    const sources = await anysearchEngine.search(engineContext({ http, maxResults: 3 }))
    expect(sources).toHaveLength(1)
    expect(http.calls[0]?.options?.method).toBe('POST')
    expect(JSON.parse(http.calls[0]?.options?.body ?? '{}')).toEqual({ query: 'test query', max_results: 3 })
  })

  it('declares the five engines and time-filter capability', () => {
    expect(ENGINE_IDS).toEqual(['bing', 'anysearch', 'searxng', 'ddg', 'ddg-lite'])
    expect(supportsTimeRange('searxng')).toBe(true)
    expect(supportsTimeRange('ddg')).toBe(true)
    expect(supportsTimeRange('ddg-lite')).toBe(true)
    expect(supportsTimeRange('bing')).toBe(false)
    expect(DEFAULT_SEARXNG_INSTANCES.length).toBeGreaterThan(0)
  })

  it('supports a configured SearXNG instance list at the root path', async () => {
    const http = routingHttp([{ match: 'custom.example', body: fixture('searxng.json') }])
    const context = engineContext({ http, config: testConfig({ searxngInstances: ['https://custom.example'] }) })
    const sources = await searxngEngine.search(context)
    expect(sources.length).toBeGreaterThan(0)
    expect(http.calls[0]?.url).toContain('https://custom.example/search')
  })

  it('preserves a SearXNG instance base path', async () => {
    const http = textHttp(fixture('searxng.json'))
    const context = engineContext({
      http,
      config: testConfig({ searxngInstances: ['https://host.example/searxng'] }),
    })
    await searxngEngine.search(context)
    const requested = new URL(http.calls[0]?.url ?? '')
    expect(requested.origin + requested.pathname).toBe('https://host.example/searxng/search')
  })
})
