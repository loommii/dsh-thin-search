import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import {
  THIN_SEARCH_PROVIDER_DESCRIPTION,
  THIN_SEARCH_PROVIDER_ID,
  THIN_SEARCH_PROVIDER_TITLE,
  buildSystemPromptText,
  createThinSearchProvider,
} from '../../src/index'
import type { PipelineLike } from '../../src/search/pipeline'
import { sources, testConfig } from './helpers'

function pipeline(overrides: Partial<PipelineLike> = {}): PipelineLike {
  return {
    search: async () => ({ sources: sources('https://example.com/one'), truncated: false, engine: 'bing', cached: false }),
    testEngine: async (engine) => ({ engine, ok: true, sources: [] }),
    ...overrides,
  }
}

describe('thin-search provider contract', () => {
  it('exposes id, title, localized description and search without ready()', () => {
    const provider = createThinSearchProvider(pipeline())
    expect(provider.id).toBe('thin-search')
    expect(THIN_SEARCH_PROVIDER_ID).toBe('thin-search')
    expect(provider.title).toBe('Thin Search')
    expect(THIN_SEARCH_PROVIDER_TITLE).toBe('Thin Search')
    const description = provider.description as { en: string; zh: string }
    const exportedDescription = THIN_SEARCH_PROVIDER_DESCRIPTION as { en: string; zh: string }
    expect(description.en).toBe(exportedDescription.en)
    expect(description.zh.length).toBeGreaterThan(0)
    expect(provider.available()).toBe(true)
    expect('ready' in provider).toBe(false)
    expect(typeof provider.search).toBe('function')
  })

  it('returns normalized sources and forwards maxResults', async () => {
    let request: unknown
    const provider = createThinSearchProvider(pipeline({
      search: async (value) => {
        request = value
        return { sources: sources('https://example.com/two'), truncated: false, engine: 'anysearch', cached: false, content: 'note' }
      },
    }))
    const result = await provider.search({ query: 'hello', maxResults: 4 })
    expect(request).toEqual({ query: 'hello', maxResults: 4 })
    expect(result).toEqual({
      sources: [{ url: 'https://example.com/two', title: 'Result 1', snippet: 'Snippet 1' }],
      truncated: false,
      content: 'note',
    })
  })

  it('propagates pipeline cancellation', async () => {
    const provider = createThinSearchProvider(pipeline({
      search: async (_request, signal) => {
        if (signal?.aborted === true) throw new WebError('search aborted', 'WEB_ABORTED')
        return { sources: [], truncated: false, engine: 'bing', cached: false }
      },
    }))
    const controller = new AbortController()
    controller.abort()
    await expect(provider.search({ query: 'q' }, controller.signal)).rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })
})

describe('system prompt section text', () => {
  it('names the preferred engine, time filtering and platform limits', () => {
    const text = buildSystemPromptText(testConfig({
      provider: 'searxng',
      searchEnhance: true,
      platforms: ['github', 'v2ex', 'bilibili', 'reddit'],
    }))
    expect(text).toContain('searxng')
    expect(text).toContain('advanced_search')
    expect(text).toContain('day, week, month, year')
    expect(text).toContain('V2EX')
    expect(text).toContain('Bilibili')
    expect(text).toContain('ON')
    expect(text).toContain('When Thin Search is selected')
  })

  it('does not claim thin-search serves web_search unconditionally', () => {
    const text = buildSystemPromptText(testConfig())
    expect(text).not.toContain('served by the thin-search provider')
    expect(text).toContain('Web search uses whichever provider is selected')
    expect(text).toContain('When Thin Search is selected')
  })

  it('describes enhancement as off by default', () => {
    const text = buildSystemPromptText(testConfig())
    expect(text).toContain('OFF (the default)')
    expect(text).toContain('free_search_test')
  })
})

describe('bundle patch', () => {
  it('inserts the thin-search row and only sets the web provider fields', () => {
    const patch = readFileSync(new URL('../../cordis.patch.yml', import.meta.url), 'utf8')
    expect(patch).toContain('- insert:')
    expect(patch).toContain('id: thin-search')
    expect(patch).toContain('name: dsh-thin-search')
    expect(patch).toContain('searchProvider: thin-search')
    expect(patch).toContain('fetchProvider: http')
    expect(patch).not.toMatch(/bridge/i)
    expect(patch).not.toMatch(/profile[- ]patch/i)
    expect(patch).not.toMatch(/enhanceSystemPrompt/i)
    expect(patch).not.toMatch(/proxy/i)

    const webRow = patch.slice(patch.indexOf('- id: web'))
    const webKeys = [...webRow.matchAll(/^ {4}([A-Za-z][\w]*):/gmu)].map(match => match[1])
    expect(webKeys).toEqual(['searchProvider', 'fetchProvider'])
  })
})
