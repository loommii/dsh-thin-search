import { describe, expect, it } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import { buildCacheKey, buildEngineChain, clampMaxResults, configCacheKey, SearchPipeline } from '../../src/search/pipeline'
import { ENGINE_IDS } from '../../src/search/engines/types'
import { fakeEngine, sources, testConfig, textHttp } from './helpers'

describe('engine chain', () => {
  it('keeps the preferred engine first without a time window', () => {
    expect(buildEngineChain('searxng', undefined, ENGINE_IDS)).toEqual(['searxng', 'bing', 'anysearch', 'ddg', 'ddg-lite'])
  })

  it('moves time-capable engines to the front when filtering', () => {
    expect(buildEngineChain('bing', { days: 7 }, ENGINE_IDS)).toEqual(['searxng', 'ddg', 'ddg-lite', 'bing', 'anysearch'])
    expect(buildEngineChain('ddg', { days: 7 }, ENGINE_IDS)).toEqual(['ddg', 'searxng', 'ddg-lite', 'bing', 'anysearch'])
  })

  it('clamps result counts and builds stable cache keys', () => {
    expect(clampMaxResults(undefined)).toBe(5)
    expect(clampMaxResults(0)).toBe(1)
    expect(clampMaxResults(99)).toBe(10)
    expect(clampMaxResults(4.8)).toBe(4)
    const config = testConfig()
    expect(buildCacheKey(' Query ', 5, { days: 7 }, 'bing', config))
      .toBe(`query\u00005\u0000days:7\u0000bing\u0000${configCacheKey(config)}`)
  })

  it('fingerprints every engine-affecting config value', () => {
    const base = configCacheKey(testConfig())
    expect(configCacheKey(testConfig({ bingMarket: 'en-US' }))).not.toBe(base)
    expect(configCacheKey(testConfig({ region: 'us-en' }))).not.toBe(base)
    expect(configCacheKey(testConfig({ searxngInstances: ['https://searx.example'] }))).not.toBe(base)
    expect(configCacheKey(testConfig({ searchEnhance: true }))).not.toBe(base)
    expect(configCacheKey(testConfig({ enhanceModel: 'provider:model' }))).not.toBe(base)
    expect(configCacheKey(testConfig({ enhanceSystemPromptPath: '/tmp/prompt.md' }))).not.toBe(base)
    expect(configCacheKey(testConfig())).toBe(base)
  })
})

describe('SearchPipeline fallback', () => {
  it('falls back when the preferred engine fails and notes why', async () => {
    const calls: string[] = []
    const pipeline = new SearchPipeline({
      getConfig: () => testConfig({ provider: 'bing' }),
      http: textHttp(''),
      engines: [
        fakeEngine('bing', async () => { calls.push('bing'); throw new Error('HTTP 403') }),
        fakeEngine('anysearch', async () => { calls.push('anysearch'); return sources('https://example.com/a') }),
      ],
    })
    const result = await pipeline.search({ query: 'hello' })
    expect(calls).toEqual(['bing', 'anysearch'])
    expect(result.engine).toBe('anysearch')
    expect(result.cached).toBe(false)
    expect(result.sources).toHaveLength(1)
    expect(result.content).toContain('bing')
    expect(result.content).toContain('used anysearch')
  })

  it('falls back when an engine returns zero results', async () => {
    const pipeline = new SearchPipeline({
      getConfig: () => testConfig(),
      http: textHttp(''),
      engines: [
        fakeEngine('bing', async () => []),
        fakeEngine('anysearch', async () => sources('https://example.com/b')),
      ],
    })
    const result = await pipeline.search({ query: 'zero' })
    expect(result.engine).toBe('anysearch')
  })

  it('uses the configured provider first', async () => {
    const calls: string[] = []
    const pipeline = new SearchPipeline({
      getConfig: () => testConfig({ provider: 'anysearch' }),
      http: textHttp(''),
      engines: [
        fakeEngine('bing', async () => { calls.push('bing'); return sources('https://example.com/bing') }),
        fakeEngine('anysearch', async () => { calls.push('anysearch'); return sources('https://example.com/any') }),
      ],
    })
    const result = await pipeline.search({ query: 'preferred' })
    expect(calls).toEqual(['anysearch'])
    expect(result.engine).toBe('anysearch')
    expect(result.content).toBeUndefined()
  })

  it('rejects non-http sources and keeps trying engines', async () => {
    const pipeline = new SearchPipeline({
      getConfig: () => testConfig(),
      http: textHttp(''),
      engines: [
        fakeEngine('bing', async () => [{ url: 'javascript:alert(1)' }]),
        fakeEngine('anysearch', async () => sources('https://example.com/safe')),
      ],
    })
    const result = await pipeline.search({ query: 'unsafe' })
    expect(result.engine).toBe('anysearch')
    expect(result.sources[0]?.url).toBe('https://example.com/safe')
  })

  it('throws an explicit WebError when every engine fails', async () => {
    const pipeline = new SearchPipeline({
      getConfig: () => testConfig(),
      http: textHttp(''),
      engines: [
        fakeEngine('bing', async () => { throw new Error('boom') }),
        fakeEngine('anysearch', async () => []),
      ],
    })
    await expect(pipeline.search({ query: 'fail' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  })

  it('rejects an empty query with WEB_INVALID_REQUEST', async () => {
    const pipeline = new SearchPipeline({ getConfig: () => testConfig(), http: textHttp(''), engines: [] })
    await expect(pipeline.search({ query: '   ' })).rejects.toMatchObject({ code: 'WEB_INVALID_REQUEST' })
  })

  it('propagates cancellation as WEB_ABORTED', async () => {
    const pipeline = new SearchPipeline({ getConfig: () => testConfig(), http: textHttp(''), engines: [] })
    const controller = new AbortController()
    controller.abort()
    const error = await pipeline.search({ query: 'x' }, controller.signal).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect((error as WebError).code).toBe('WEB_ABORTED')
  })

  it('respects the total search budget across engines', async () => {
    const pipeline = new SearchPipeline({
      getConfig: () => testConfig(),
      http: textHttp(''),
      totalBudgetMs: 30,
      engineTimeoutMs: 30,
      engines: [
        fakeEngine('bing', async () => await new Promise<never>(() => undefined)),
        fakeEngine('anysearch', async () => sources('https://example.com/too-late')),
      ],
    })
    const error = await pipeline.search({ query: 'budget' }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect((error as WebError).message).toContain('timed out')
  })

  it('times out one engine and continues with the next', async () => {
    const pipeline = new SearchPipeline({
      getConfig: () => testConfig(),
      http: textHttp(''),
      engineTimeoutMs: 25,
      totalBudgetMs: 500,
      engines: [
        fakeEngine('bing', async () => await new Promise<never>(() => undefined)),
        fakeEngine('anysearch', async () => sources('https://example.com/fast')),
      ],
    })
    const result = await pipeline.search({ query: 'slow' })
    expect(result.engine).toBe('anysearch')
    expect(result.content).toContain('timed out')
  })
})

describe('SearchPipeline cache and enhancement', () => {
  it('checks the cache before enhancement', async () => {
    let enhanceCalls = 0
    let engineCalls = 0
    const pipeline = new SearchPipeline({
      getConfig: () => testConfig({ searchEnhance: true, cacheTtl: 5 }),
      http: textHttp(''),
      engines: [fakeEngine('bing', async (context) => {
        engineCalls++
        return sources(`https://example.com/${encodeURIComponent(context.query)}`)
      })],
      enhance: async (query) => {
        enhanceCalls++
        return { query: 'optimized query', enhanced: true, original: query }
      },
    })
    const first = await pipeline.search({ query: 'raw question' })
    expect(enhanceCalls).toBe(1)
    expect(engineCalls).toBe(1)
    expect(first.content).toContain('[enhanced]')
    expect(first.sources[0]?.url).toBe('https://example.com/optimized%20query')

    const second = await pipeline.search({ query: 'raw question' })
    expect(second.cached).toBe(true)
    expect(enhanceCalls).toBe(1)
    expect(engineCalls).toBe(1)
    expect(second.sources).toEqual(first.sources)
  })

  it('disables the cache when cacheTtl is 0 and re-runs enhancement', async () => {
    let enhanceCalls = 0
    let engineCalls = 0
    const pipeline = new SearchPipeline({
      getConfig: () => testConfig({ searchEnhance: true, cacheTtl: 0 }),
      http: textHttp(''),
      engines: [fakeEngine('bing', async () => { engineCalls++; return sources('https://example.com/x') })],
      enhance: async (query) => {
        enhanceCalls++
        return { query: 'better', enhanced: true, original: query }
      },
    })
    const first = await pipeline.search({ query: 'same' })
    const second = await pipeline.search({ query: 'same' })
    expect(first.cached).toBe(false)
    expect(second.cached).toBe(false)
    expect(enhanceCalls).toBe(2)
    expect(engineCalls).toBe(2)
  })

  it('keeps the original query when enhancement fails', async () => {
    const queries: string[] = []
    const pipeline = new SearchPipeline({
      getConfig: () => testConfig({ searchEnhance: true, cacheTtl: 0 }),
      http: textHttp(''),
      engines: [fakeEngine('bing', async (context) => {
        queries.push(context.query)
        return sources('https://example.com/original')
      })],
      enhance: async (query) => ({ query, enhanced: false, error: 'no model available' }),
    })
    const result = await pipeline.search({ query: 'keep me' })
    expect(queries).toEqual(['keep me'])
    expect(result.content).toBeUndefined()
  })

  it('does not serve a cached result after engine-affecting config changes', async () => {
    let config = testConfig({ bingMarket: 'zh-CN' })
    let engineCalls = 0
    const pipeline = new SearchPipeline({
      getConfig: () => config,
      http: textHttp(''),
      engines: [fakeEngine('bing', async () => {
        engineCalls++
        return sources(`https://example.com/${encodeURIComponent(config.bingMarket)}`)
      })],
    })
    const first = await pipeline.search({ query: 'same query' })
    expect(first.cached).toBe(false)
    expect(engineCalls).toBe(1)

    config = testConfig({ bingMarket: 'en-US', region: 'us-en', searxngInstances: ['https://searx.example'] })
    const second = await pipeline.search({ query: 'same query' })
    expect(second.cached).toBe(false)
    expect(engineCalls).toBe(2)

    const third = await pipeline.search({ query: 'same query' })
    expect(third.cached).toBe(true)
    expect(engineCalls).toBe(2)
  })
})

describe('SearchPipeline.testEngine', () => {
  it('returns a failure object instead of throwing for engine errors', async () => {
    const pipeline = new SearchPipeline({
      getConfig: () => testConfig(),
      http: textHttp(''),
      engines: [fakeEngine('bing', async () => { throw new Error('HTTP 403') })],
    })
    const result = await pipeline.testEngine('bing', { query: 'probe' })
    expect(result).toMatchObject({ engine: 'bing', ok: false, error: 'HTTP 403' })
  })

  it('returns sources for a working engine and unknown-engine failures', async () => {
    const pipeline = new SearchPipeline({
      getConfig: () => testConfig(),
      http: textHttp(''),
      engines: [fakeEngine('bing', async () => sources('https://example.com/probe'))],
    })
    const ok = await pipeline.testEngine('bing', { query: 'probe' })
    expect(ok.ok).toBe(true)
    expect(ok.sources).toHaveLength(1)
    const unknown = await pipeline.testEngine('searxng', { query: 'probe' })
    expect(unknown.ok).toBe(false)
  })
})
