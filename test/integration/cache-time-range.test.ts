/**
 * Built-host integration: result cache ordering (cache before enhancement),
 * cache-key config fingerprinting, absolute-date time-range conversion for the
 * time-capable engines, and HTTP failure classification through the shared
 * client.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type ResolvedConfig } from '../../src/config'
import { createHttpClient } from '../../src/search/http'
import type { HttpClient } from '../../src/search/http'
import { ResultCache } from '../../src/search/cache'
import { SearchPipeline, type PipelineResult } from '../../src/search/pipeline'
import { bingEngine, ddgEngine, searxngEngine } from '../../src/search/engines'
import type { EngineContext, EngineId, SearchEngine } from '../../src/search/engines/types'
import { fixture, htmlResponse, jsonResponse } from './helpers'

/** A pipeline config derived from the v1.0.0 defaults. */
function config(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return { ...DEFAULT_CONFIG, cacheTtl: 0, ...overrides }
}

/** An HTTP client that must never be called by a fake engine. */
const unusedHttp: HttpClient = {
  request: async () => { throw new Error('unexpected HTTP request') },
  text: async () => { throw new Error('unexpected HTTP request') },
  json: async () => { throw new Error('unexpected HTTP request') },
}

/** A fake engine with a recorded call count. */
function fakeEngine(id: EngineId, behavior: (context: EngineContext) => Promise<{ url: string; title: string }[]>, calls: string[]): SearchEngine {
  return {
    id,
    title: id,
    supportsTimeRange: id === 'ddg' || id === 'ddg-lite' || id === 'searxng',
    async search(context) {
      calls.push(id)
      const sources = await behavior(context)
      return sources.map((source) => ({ url: source.url, title: source.title }))
    },
  }
}

describe('search result cache', () => {
  it('serves a repeated query from the cache before any enhancement call', async () => {
    let now = 1_000_000
    const calls: string[] = []
    const enhanceCalls: string[] = []
    const engine = fakeEngine('bing', async () => [{ url: 'https://example.com/cache', title: 'Cached' }], calls)
    const cache = new ResultCache<PipelineResult>(10, () => now)
    const pipeline = new SearchPipeline({
      getConfig: () => config({ cacheTtl: 5, searchEnhance: true }),
      http: unusedHttp,
      engines: [engine],
      cache,
      enhance: async (query) => {
        enhanceCalls.push(query)
        return { query, enhanced: false }
      },
      now: () => now,
    })

    const first = await pipeline.search({ query: 'cache me' })
    const second = await pipeline.search({ query: 'cache me' })
    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(calls).toEqual(['bing'])
    expect(enhanceCalls).toEqual(['cache me'])

    now += 6 * 60_000
    const third = await pipeline.search({ query: 'cache me' })
    expect(third.cached).toBe(false)
    expect(calls).toEqual(['bing', 'bing'])
    expect(enhanceCalls).toHaveLength(2)
  })

  it('disables the cache when cacheTtl is 0', async () => {
    const calls: string[] = []
    const engine = fakeEngine('bing', async () => [{ url: 'https://example.com/no-cache', title: 'No cache' }], calls)
    const pipeline = new SearchPipeline({
      getConfig: () => config({ cacheTtl: 0 }),
      http: unusedHttp,
      engines: [engine],
      cache: new ResultCache<PipelineResult>(10),
    })
    const first = await pipeline.search({ query: 'no cache' })
    const second = await pipeline.search({ query: 'no cache' })
    expect(first.cached).toBe(false)
    expect(second.cached).toBe(false)
    expect(calls).toEqual(['bing', 'bing'])
  })

  it('keys the cache on engine-affecting config so a change is not served stale', async () => {
    const calls: string[] = []
    const engine = fakeEngine('bing', async () => [{ url: 'https://example.com/keyed', title: 'Keyed' }], calls)
    let current = config({ cacheTtl: 5, bingMarket: 'zh-CN', region: '' })
    const pipeline = new SearchPipeline({
      getConfig: () => current,
      http: unusedHttp,
      engines: [engine],
      cache: new ResultCache<PipelineResult>(10),
    })
    await pipeline.search({ query: 'fingerprint' })
    current = { ...current, bingMarket: 'en-US' }
    await pipeline.search({ query: 'fingerprint' })
    expect(calls).toEqual(['bing', 'bing'])
    current = { ...current, region: 'us-en', searchEnhance: true }
    await pipeline.search({ query: 'fingerprint' })
    expect(calls).toEqual(['bing', 'bing', 'bing'])
  })
})

describe('time-range conversion', () => {
  it('converts an absolute date to a DuckDuckGo df tier from the pipeline clock', async () => {
    const urls: string[] = []
    const http: HttpClient = {
      request: async () => { throw new Error('unused') },
      text: async (url) => { urls.push(url); return fixture('ddg.html') },
      json: async () => { throw new Error('unused') },
    }
    const now = Date.UTC(2026, 6, 10, 12)
    const pipeline = new SearchPipeline({
      getConfig: () => config({ provider: 'ddg' }),
      http,
      engines: [ddgEngine],
      now: () => now,
    })
    const result = await pipeline.search({ query: 'absolute', timeRange: '2026-06-01' })
    expect(result.engine).toBe('ddg')
    expect(result.sources).toHaveLength(2)
    const request = new URL(urls[0]!)
    expect(request.searchParams.get('df')).toBe('m')
  })

  it('maps relative durations and converts an absolute date for SearXNG', async () => {
    const urls: string[] = []
    const http: HttpClient = {
      request: async () => { throw new Error('unused') },
      text: async () => { throw new Error('unused') },
      json: async (url) => { urls.push(url); return JSON.parse(fixture('searxng.json')) },
    }
    const now = Date.UTC(2026, 6, 10, 12)
    const pipeline = new SearchPipeline({
      getConfig: () => config({ provider: 'searxng', searxngInstances: ['https://searx.example'] }),
      http,
      engines: [searxngEngine],
      now: () => now,
    })
    const weekly = await pipeline.search({ query: 'relative', timeRange: '3d' })
    expect(weekly.sources).toHaveLength(2)
    expect(new URL(urls[0]!).searchParams.get('time_range')).toBe('week')

    const dated = await pipeline.search({ query: 'absolute', timeRange: '2026-06-01' })
    expect(dated.engine).toBe('searxng')
    expect(new URL(urls[1]!).searchParams.get('time_range')).toBe('month')
  })

  it('moves time-capable engines to the front only when a window is requested', async () => {
    const order: string[] = []
    const bing = fakeEngine('bing', async () => [{ url: 'https://example.com/bing', title: 'Bing' }], order)
    const ddg = fakeEngine('ddg', async () => [{ url: 'https://example.com/ddg', title: 'DDG' }], order)
    const make = (): SearchPipeline => new SearchPipeline({
      getConfig: () => config({ provider: 'bing' }),
      http: unusedHttp,
      engines: [bing, ddg],
    })
    await make().search({ query: 'window', timeRange: 'week' })
    expect(order).toEqual(['ddg'])
    order.length = 0
    await make().search({ query: 'no window' })
    expect(order).toEqual(['bing'])
  })
})

describe('HTTP failure classification through the built pipeline', () => {
  /** Build a single-engine pipeline over a fetch stub with the cache disabled. */
  function pipelineOver(engine: SearchEngine, fetchImpl: typeof fetch, cacheTtl = 0): SearchPipeline {
    return new SearchPipeline({
      getConfig: () => config({ provider: engine.id, cacheTtl }),
      http: createHttpClient({ fetch: fetchImpl, retryDelayMs: 0 }),
      engines: [engine],
      engineTimeoutMs: 5_000,
      totalBudgetMs: 10_000,
    })
  }

  it('treats HTTP 202 as a non-retryable challenge', async () => {
    let attempts = 0
    const fetchImpl = (async () => { attempts += 1; return new Response('challenge', { status: 202 }) }) as unknown as typeof fetch
    const pipeline = pipelineOver(bingEngine, fetchImpl)
    await expect(pipeline.search({ query: 'challenge' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
    expect(attempts).toBe(1)
  })

  it('retries a 5xx once and reports every engine failure', async () => {
    let attempts = 0
    const fetchImpl = (async () => { attempts += 1; return new Response('boom', { status: 500 }) }) as unknown as typeof fetch
    const pipeline = pipelineOver(bingEngine, fetchImpl)
    await expect(pipeline.search({ query: 'boom' })).rejects.toThrow(/bing: HTTP 500/u)
    expect(attempts).toBe(2)
  })

  it('never treats JSON bodies mentioning captcha or access denied as a challenge page', async () => {
    const payload = {
      results: [{
        url: 'https://example.com/legit',
        title: 'Legitimate result',
        content: 'captcha access denied unusual traffic robot',
      }],
    }
    const fetchImpl = (async () => jsonResponse(payload)) as unknown as typeof fetch
    const pipeline = pipelineOver(searxngEngine, fetchImpl)
    const result = await pipeline.search({ query: 'legit' })
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]?.url).toBe('https://example.com/legit')
  })

  it('keeps legitimate HTML that merely mentions challenge words', async () => {
    const body = '<ol id="b_results"><li class="b_algo"><h2><a href="https://example.com/legit">captcha access denied</a></h2><p>unusual traffic robot</p></li></ol>'
    const fetchImpl = (async () => htmlResponse(body)) as unknown as typeof fetch
    const pipeline = pipelineOver(bingEngine, fetchImpl)
    const result = await pipeline.search({ query: 'legit html' })
    expect(result.sources).toHaveLength(1)
  })

  it('rejects a real challenge interstitial without retrying', async () => {
    const body = '<html><head><title>Just a moment...</title></head><body><form id="challenge-form" action="/challenge"></form></body></html>'
    let attempts = 0
    const fetchImpl = (async () => { attempts += 1; return htmlResponse(body) }) as unknown as typeof fetch
    const pipeline = pipelineOver(bingEngine, fetchImpl)
    await expect(pipeline.search({ query: 'blocked' })).rejects.toThrow(/anti-bot challenge/u)
    expect(attempts).toBe(1)
  })

  it('ignores a stale cached answer after the cache is disabled', async () => {
    const calls: string[] = []
    const engine = fakeEngine('bing', async () => [{ url: 'https://example.com/once', title: 'Once' }], calls)
    const cache = new ResultCache<PipelineResult>(10)
    let current = config({ cacheTtl: 5 })
    const pipeline = new SearchPipeline({
      getConfig: () => current,
      http: unusedHttp,
      engines: [engine],
      cache,
    })
    await pipeline.search({ query: 'toggle' })
    current = { ...current, cacheTtl: 0 }
    const uncached = await pipeline.search({ query: 'toggle' })
    expect(uncached.cached).toBe(false)
    expect(calls).toHaveLength(2)
  })
})
