import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAFT,
  ENGINE_IDS,
  PLATFORM_IDS,
  canonicalPlatforms,
  isEngineId,
  isPlatformId,
  normalizeDraft,
  parseSearxngInstances,
  settingWrite,
  validateSetting,
} from '../../src/client/config'

describe('normalizeDraft', () => {
  it('falls back to the Host defaults for an absent section', () => {
    expect(normalizeDraft(undefined)).toEqual(DEFAULT_DRAFT)
    expect(normalizeDraft({})).toEqual(DEFAULT_DRAFT)
  })

  it('keeps accepted values and canonicalizes platforms', () => {
    const draft = normalizeDraft({
      provider: 'ddg-lite',
      platforms: ['npm', 'github', 'npm', 'unknown'],
      cacheTtl: 12,
      searchEnhance: true,
      enhanceModel: ' deepseek:flash ',
      enhanceSystemPromptPath: '/tmp/prompt.md',
      bingMarket: 'en-US',
      region: 'us-en',
      searxngInstances: ['https://searx.example.com'],
    })
    expect(draft).toEqual({
      provider: 'ddg-lite',
      platforms: ['github', 'npm'],
      cacheTtl: 12,
      searchEnhance: true,
      enhanceModel: 'deepseek:flash',
      enhanceSystemPromptPath: '/tmp/prompt.md',
      bingMarket: 'en-US',
      region: 'us-en',
      searxngText: 'https://searx.example.com',
    })
  })

  it('refuses an unknown engine and an invalid cache lifetime', () => {
    const draft = normalizeDraft({ provider: 'altavista', cacheTtl: -3 })
    expect(draft.provider).toBe(DEFAULT_DRAFT.provider)
    expect(draft.cacheTtl).toBe(DEFAULT_DRAFT.cacheTtl)
  })

  it('keeps an explicitly empty platform list (all platforms disabled)', () => {
    expect(normalizeDraft({ platforms: [] }).platforms).toEqual([])
  })
})

describe('platform and engine guards', () => {
  it('accepts exactly the documented ids', () => {
    expect(ENGINE_IDS).toEqual(['bing', 'anysearch', 'searxng', 'ddg', 'ddg-lite'])
    expect(PLATFORM_IDS).toEqual(['github', 'v2ex', 'bilibili', 'reddit', 'hn', 'stackoverflow', 'wikipedia', 'npm'])
    for (const id of ENGINE_IDS) expect(isEngineId(id)).toBe(true)
    for (const id of PLATFORM_IDS) expect(isPlatformId(id)).toBe(true)
    expect(isEngineId('deepseek-official')).toBe(false)
  })

  it('orders platforms canonically', () => {
    expect(canonicalPlatforms(['npm', 'github', 'reddit'])).toEqual(['github', 'reddit', 'npm'])
  })
})

describe('parseSearxngInstances', () => {
  it('keeps absolute http(s) URLs and drops duplicates', () => {
    const parsed = parseSearxngInstances('https://a.example.com/\n\nhttps://a.example.com\nhttp://b.example.com')
    expect(parsed.instances).toEqual(['https://a.example.com', 'http://b.example.com'])
    expect(parsed.invalid).toEqual([])
  })

  it('reports non-URL and non-http lines', () => {
    const parsed = parseSearxngInstances('not a url\nftp://files.example.com\nhttps://ok.example.com')
    expect(parsed.invalid).toEqual(['not a url', 'ftp://files.example.com'])
    expect(parsed.instances).toEqual(['https://ok.example.com'])
  })
})

describe('validateSetting', () => {
  it('accepts valid per-field values', () => {
    expect(validateSetting('cacheTtl', 0)).toBeUndefined()
    expect(validateSetting('enhanceSystemPromptPath', '~/prompt.md')).toBeUndefined()
    expect(validateSetting('enhanceSystemPromptPath', '/etc/prompt.md')).toBeUndefined()
    expect(validateSetting('searxngText', 'https://searx.example.com')).toBeUndefined()
    expect(validateSetting('provider', 'bing')).toBeUndefined()
  })

  it('rejects a negative or fractional cache lifetime', () => {
    expect(validateSetting('cacheTtl', -1)?.key).toBe('validation.cacheTtl')
    expect(validateSetting('cacheTtl', 1.5)?.key).toBe('validation.cacheTtl')
  })

  it('accepts only ~/ and absolute prompt paths', () => {
    expect(validateSetting('enhanceSystemPromptPath', 'relative/prompt.md')?.key).toBe('validation.enhanceSystemPromptPath')
  })

  it('reports invalid SearXNG entries with their text', () => {
    const error = validateSetting('searxngText', 'nope')
    expect(error?.key).toBe('validation.searxng')
    expect(error?.params).toEqual({ entries: 'nope' })
  })
})

describe('settingWrite', () => {
  it('maps the SearXNG textarea to the instance array', () => {
    expect(settingWrite('searxngText', 'https://a.example.com/\nhttps://b.example.com')).toEqual({
      field: 'searxngInstances',
      value: ['https://a.example.com', 'https://b.example.com'],
    })
  })

  it('canonicalizes platform writes and trims text writes', () => {
    expect(settingWrite('platforms', ['npm', 'github'])).toEqual({ field: 'platforms', value: ['github', 'npm'] })
    expect(settingWrite('bingMarket', ' en-US ')).toEqual({ field: 'bingMarket', value: 'en-US' })
  })

  it('forwards scalar writes unchanged', () => {
    expect(settingWrite('provider', 'ddg')).toEqual({ field: 'provider', value: 'ddg' })
    expect(settingWrite('cacheTtl', 0)).toEqual({ field: 'cacheTtl', value: 0 })
    expect(settingWrite('searchEnhance', true)).toEqual({ field: 'searchEnhance', value: true })
  })
})
