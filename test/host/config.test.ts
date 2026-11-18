import { describe, expect, it } from 'vitest'
import {
  CONFIG_FIELDS,
  Config,
  DEFAULT_CONFIG,
  cacheTtlMs,
  normalizeCacheTtl,
  normalizeSearxngInstances,
  snapshotConfig,
} from '../../src/config'

describe('thin-search config schema', () => {
  it('declares exactly the nine agreed fields', () => {
    const schemaKeys = Object.keys(Config.dict ?? {}).sort()
    expect(schemaKeys).toEqual([...CONFIG_FIELDS].sort())
    expect(schemaKeys).toHaveLength(9)
    expect(schemaKeys).not.toContain('proxy')
    expect(schemaKeys).not.toContain('cache')
    expect(schemaKeys).not.toContain('enhanceSystemPrompt')
  })

  it('applies the documented defaults', () => {
    const resolved = snapshotConfig(Config({}))
    expect(resolved).toEqual({
      provider: 'bing',
      platforms: ['github', 'v2ex', 'bilibili', 'reddit', 'hn', 'stackoverflow', 'wikipedia', 'npm'],
      cacheTtl: 5,
      searchEnhance: false,
      enhanceModel: '',
      enhanceSystemPromptPath: '',
      bingMarket: 'zh-CN',
      region: '',
      searxngInstances: [],
    })
  })

  it('reads plain values and volatile references identically', () => {
    const plain = snapshotConfig({
      provider: 'searxng',
      platforms: ['github', 'npm'],
      cacheTtl: 12,
      searchEnhance: true,
      enhanceModel: 'deepseek:flash',
      enhanceSystemPromptPath: '/tmp/prompt.md',
      bingMarket: 'en-US',
      region: 'us-en',
      searxngInstances: ['https://searx.example.com/'],
    })
    const volatile = snapshotConfig(Config({
      provider: 'searxng',
      platforms: ['github', 'npm'],
      cacheTtl: 12,
      searchEnhance: true,
      enhanceModel: 'deepseek:flash',
      enhanceSystemPromptPath: '/tmp/prompt.md',
      bingMarket: 'en-US',
      region: 'us-en',
      searxngInstances: ['https://searx.example.com/'],
    }))
    expect(volatile).toEqual(plain)
    expect(plain.searxngInstances).toEqual(['https://searx.example.com'])
  })

  it('falls back from unknown provider and platform ids', () => {
    const resolved = snapshotConfig(Config({ provider: 'unknown', platforms: ['github', 'unknown'] }))
    expect(resolved.provider).toBe('bing')
    expect(resolved.platforms).toEqual(['github'])
  })

  it('treats cacheTtl 0 as disabled and clamps negative values', () => {
    expect(normalizeCacheTtl(0)).toBe(0)
    expect(normalizeCacheTtl(-3)).toBe(0)
    expect(normalizeCacheTtl(2.9)).toBe(2)
    expect(cacheTtlMs({ cacheTtl: 0 })).toBe(0)
    expect(cacheTtlMs({ cacheTtl: 2 })).toBe(120_000)
    expect(DEFAULT_CONFIG.cacheTtl).toBe(5)
  })

  it('drops invalid SearXNG instances', () => {
    expect(normalizeSearxngInstances([
      'https://ok.example.com/',
      'http://ok2.example.com',
      'ftp://bad.example.com',
      'not a url',
      42,
      'https://ok.example.com',
    ])).toEqual(['https://ok.example.com', 'http://ok2.example.com'])
  })
})
