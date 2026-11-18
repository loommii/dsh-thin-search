import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAFT,
  ENGINE_IDS,
  PLATFORM_IDS,
  canonicalPlatforms,
  draftOps,
  isEngineId,
  isPlatformId,
  normalizeDraft,
  parseSearxngInstances,
  validateDraft,
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

describe('validateDraft', () => {
  it('accepts the defaults', () => {
    expect(validateDraft(DEFAULT_DRAFT)).toEqual([])
  })

  it('rejects a negative or fractional cache lifetime', () => {
    expect(validateDraft({ ...DEFAULT_DRAFT, cacheTtl: -1 }).map((error) => error.key)).toEqual(['validation.cacheTtl'])
    expect(validateDraft({ ...DEFAULT_DRAFT, cacheTtl: 1.5 }).map((error) => error.key)).toEqual(['validation.cacheTtl'])
  })

  it('accepts ~/ and absolute prompt paths only', () => {
    expect(validateDraft({ ...DEFAULT_DRAFT, enhanceSystemPromptPath: '~/prompt.md' })).toEqual([])
    expect(validateDraft({ ...DEFAULT_DRAFT, enhanceSystemPromptPath: '/etc/prompt.md' })).toEqual([])
    expect(validateDraft({ ...DEFAULT_DRAFT, enhanceSystemPromptPath: 'relative/prompt.md' }).map((error) => error.key))
      .toEqual(['validation.enhanceSystemPromptPath'])
  })

  it('reports invalid SearXNG entries with their text', () => {
    const errors = validateDraft({ ...DEFAULT_DRAFT, searxngText: 'nope' })
    expect(errors).toHaveLength(1)
    expect(errors[0]?.key).toBe('validation.searxng')
    expect(errors[0]?.params).toEqual({ entries: 'nope' })
  })
})

describe('draftOps', () => {
  it('submits nothing for an untouched draft', () => {
    expect(draftOps(DEFAULT_DRAFT, DEFAULT_DRAFT)).toEqual([])
    expect(draftOps(DEFAULT_DRAFT, {})).toEqual([])
  })

  it('submits one operation per changed field', () => {
    const next = {
      ...DEFAULT_DRAFT,
      provider: 'searxng' as const,
      cacheTtl: 0,
      searchEnhance: true,
      enhanceModel: 'deepseek:flash',
      enhanceSystemPromptPath: '~/prompt.md',
      bingMarket: 'en-US',
      region: 'us-en',
      searxngText: 'https://searx.example.com',
      platforms: ['github' as const, 'npm' as const],
    }
    expect(draftOps(next, DEFAULT_DRAFT)).toEqual([
      { op: 'set', path: ['provider'], value: 'searxng' },
      { op: 'set', path: ['platforms'], value: ['github', 'npm'] },
      { op: 'set', path: ['cacheTtl'], value: 0 },
      { op: 'set', path: ['searchEnhance'], value: true },
      { op: 'set', path: ['enhanceModel'], value: 'deepseek:flash' },
      { op: 'set', path: ['enhanceSystemPromptPath'], value: '~/prompt.md' },
      { op: 'set', path: ['bingMarket'], value: 'en-US' },
      { op: 'set', path: ['region'], value: 'us-en' },
      { op: 'set', path: ['searxngInstances'], value: ['https://searx.example.com'] },
    ])
  })

  it('ignores platform order and surrounding whitespace', () => {
    const accepted = { ...DEFAULT_DRAFT, platforms: ['npm', 'github'], bingMarket: 'zh-CN' }
    const draft = { ...DEFAULT_DRAFT, platforms: ['github' as const, 'npm' as const], bingMarket: ' zh-CN ' }
    expect(draftOps(draft, accepted)).toEqual([])
  })

  it('sends an empty platform list when the user disables everything', () => {
    const draft = { ...DEFAULT_DRAFT, platforms: [] }
    expect(draftOps(draft, DEFAULT_DRAFT)).toEqual([{ op: 'set', path: ['platforms'], value: [] }])
  })
})
