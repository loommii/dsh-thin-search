/**
 * Built-bundle integration: the v1.0.0 config schema is exactly the nine
 * volatile fields, legacy fields are gone, and the shipped bundle patch only
 * pins the two web provider fields.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  cacheTtlMs,
  normalizeCacheTtl,
  normalizeSearxngInstances,
  snapshotConfig,
} from '../../src/config'
import { configValue, loadHostBundle, type SchemaJson } from './helpers'

const PATCH = readFileSync(new URL('../../cordis.patch.yml', import.meta.url), 'utf8')

/** Field names the v1.0.0 schema exposes. */
const FIELDS = [
  'provider',
  'platforms',
  'cacheTtl',
  'searchEnhance',
  'enhanceModel',
  'enhanceSystemPromptPath',
  'bingMarket',
  'region',
  'searxngInstances',
]

describe('built host config schema', () => {
  it('exposes exactly the nine agreed volatile fields with their defaults', async () => {
    const bundle = await loadHostBundle()
    const json = bundle.Config.toJSON() as SchemaJson
    const root = json.refs[json.uid]
    expect(root?.dict).toBeDefined()
    expect(Object.keys(root!.dict!).sort()).toEqual([...FIELDS].sort())
    for (const field of FIELDS) {
      const ref = json.refs[root!.dict![field]!]
      expect(ref?.meta?.volatile, `${field} must be volatile`).toBe(true)
    }
    expect(json.refs[root!.dict!['provider']!]?.meta?.default).toBe('bing')
    expect(json.refs[root!.dict!['cacheTtl']!]?.meta?.default).toBe(5)
    expect(json.refs[root!.dict!['searchEnhance']!]?.meta?.default).toBe(false)
    expect(json.refs[root!.dict!['bingMarket']!]?.meta?.default).toBe('zh-CN')
    expect(json.refs[root!.dict!['enhanceSystemPromptPath']!]?.meta?.default).toBe('')

    const config = bundle.Config({})
    expect(configValue(config, 'provider')).toBe('bing')
    expect(configValue(config, 'cacheTtl')).toBe(5)
    expect(configValue(config, 'platforms')).toEqual(['github', 'v2ex', 'bilibili', 'reddit', 'hn', 'stackoverflow', 'wikipedia', 'npm'])
    expect(configValue(config, 'searxngInstances')).toEqual([])
  })

  it('rejects a negative cache lifetime and ignores legacy fields', async () => {
    const bundle = await loadHostBundle()
    const validated = bundle.Config['~standard'].validate({ cacheTtl: -3 }) as { issues?: { path: string[] }[] }
    expect(validated.issues?.[0]?.path).toEqual(['cacheTtl'])
    const json = bundle.Config.toJSON() as SchemaJson
    const root = json.refs[json.uid]
    for (const legacy of ['proxy', 'cache', 'enhanceSystemPrompt', 'searchProviderId']) {
      expect(root!.dict![legacy]).toBeUndefined()
    }
  })

  it('normalizes hostile or partial values into a stable snapshot', () => {
    const resolved = snapshotConfig({
      provider: 'NOPE',
      platforms: ['npm', 'unknown', 'github', 'npm'],
      cacheTtl: -2.7,
      searchEnhance: 'yes',
      enhanceModel: '  ',
      enhanceSystemPromptPath: '',
      bingMarket: '',
      region: '  ',
      searxngInstances: ['https://searx.example/', 'https://searx.example', 'ftp://bad', 'not a url', ''],
    })
    expect(resolved.provider).toBe('bing')
    expect(resolved.platforms).toEqual(['github', 'npm'])
    expect(resolved.cacheTtl).toBe(0)
    expect(resolved.searchEnhance).toBe(false)
    expect(resolved.enhanceModel).toBe('')
    expect(resolved.bingMarket).toBe('zh-CN')
    expect(resolved.searxngInstances).toEqual(['https://searx.example'])
    expect(cacheTtlMs(resolved)).toBe(0)
    expect(cacheTtlMs({ cacheTtl: 5 })).toBe(300_000)
    expect(normalizeCacheTtl(4.9)).toBe(4)
    expect(normalizeSearxngInstances('nope')).toEqual([])
    expect(DEFAULT_CONFIG.provider).toBe('bing')
    expect(DEFAULT_CONFIG.platforms).toHaveLength(8)
  })

  it('pins only web.searchProvider and web.fetchProvider in the bundle patch', () => {
    expect(PATCH).toContain('- insert:')
    expect(PATCH).toContain('id: thin-search')
    expect(PATCH).toContain('name: dsh-thin-search')
    const thinRow = PATCH.slice(PATCH.indexOf('- id: thin-search'), PATCH.indexOf('- id: web'))
    const thinKeys = [...thinRow.matchAll(/^ {8}([A-Za-z][\w]*):/gmu)].map((match) => match[1])
    expect(thinKeys.sort()).toEqual(['bingMarket', 'provider'])
    expect(thinRow).not.toMatch(/proxy|enhanceSystemPrompt|\bcache:/u)

    const webRow = PATCH.slice(PATCH.indexOf('- id: web'))
    const webKeys = [...webRow.matchAll(/^ {4}([A-Za-z][\w]*):/gmu)].map((match) => match[1])
    expect(webKeys).toEqual(['searchProvider', 'fetchProvider'])
    expect(webRow).toContain('searchProvider: thin-search')
    expect(webRow).toContain('fetchProvider: http')
    expect(PATCH).not.toMatch(/bridge|profile[- ]patch|ProxyAgent/iu)
  })
})
