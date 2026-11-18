import { describe, expect, it } from 'vitest'
import { bilibiliPlatform, parseBilibiliJson } from '../../src/platforms/bilibili'
import { githubPlatform, parseGithubJson } from '../../src/platforms/github'
import { hackerNewsPlatform, parseHackerNewsJson } from '../../src/platforms/hn'
import { npmPlatform, parseNpmJson } from '../../src/platforms/npm'
import { createPlatformSearchService, PLATFORMS, PLATFORM_IDS } from '../../src/platforms'
import { redditPlatform, parseRedditJson } from '../../src/platforms/reddit'
import { parseStackOverflowJson, stackOverflowPlatform } from '../../src/platforms/stackoverflow'
import { parseV2exJson, v2exPlatform } from '../../src/platforms/v2ex'
import { parseWikipediaJson, wikipediaHost, wikipediaPlatform } from '../../src/platforms/wikipedia'
import type { PlatformAdapter, PlatformContext } from '../../src/platforms/types'
import { testConfig, textHttp } from './helpers'

function context(_adapter: PlatformAdapter, http = textHttp('{}'), overrides: Partial<PlatformContext> = {}): PlatformContext {
  return {
    query: 'query',
    maxResults: 5,
    config: testConfig(),
    http,
    deadline: Date.now() + 12_000,
    ...overrides,
  }
}

const GITHUB = { items: [{ html_url: 'https://github.com/a/b', full_name: 'a/b', description: 'A repo', stargazers_count: 5, updated_at: '2026-01-01T00:00:00Z' }] }
const V2EX = [{ id: 123, title: 'Hello World', content: '<p>body text</p>' }]
const BILIBILI = { code: 0, data: { result: [{ data: [{ arcurl: 'https://www.bilibili.com/video/BV1', title: '<em>Video</em>', desc: 'Description', pubdate: 1_700_000_000 }] }] } }
const REDDIT = { data: { children: [{ data: { url: 'https://reddit.com/r/x', title: 'A post', selftext: 'Post body', created_utc: 1_700_000_000 } }] } }
const HN = { hits: [{ objectID: '42', title: 'HN post', points: 10, num_comments: 3, created_at: '2026-01-01T00:00:00Z' }] }
const STACK = { items: [{ link: 'https://stackoverflow.com/q/1', title: 'Q &amp; A', score: 4, answer_count: 2, is_answered: true, creation_date: 1_700_000_000 }] }
const WIKI = { query: { search: [{ title: 'DeepSeek', snippet: '<span>Chinese AI lab</span>', timestamp: '2026-01-01T00:00:00Z' }] } }
const NPM = { objects: [{ package: { name: 'pkg', version: '1.2.3', description: 'A package', date: '2026-01-01T00:00:00Z', links: { npm: 'https://www.npmjs.com/package/pkg' } } }] }

describe('platform parsers', () => {
  it('parses GitHub repositories', () => {
    const sources = parseGithubJson(GITHUB, 5)
    expect(sources[0]).toMatchObject({ url: 'https://github.com/a/b', title: 'a/b' })
    expect(sources[0]?.snippet).toContain('⭐5')
    expect(sources[0]?.publishedAt).toBe('2026-01-01T00:00:00Z')
  })

  it('filters V2EX hot topics by the query', () => {
    expect(parseV2exJson(V2EX, 'hello', 5)[0]).toMatchObject({ url: 'https://www.v2ex.com/t/123', title: 'Hello World' })
    expect(parseV2exJson(V2EX, 'absent', 5)).toEqual([])
  })

  it('flattens Bilibili sections and strips tags', () => {
    const sources = parseBilibiliJson(BILIBILI, 5)
    expect(sources[0]).toMatchObject({ url: 'https://www.bilibili.com/video/BV1', title: 'Video', snippet: 'Description' })
    expect(() => parseBilibiliJson({ code: -1, message: 'risk control' }, 5)).toThrow('risk control')
  })

  it('parses Reddit listings', () => {
    const sources = parseRedditJson(REDDIT, 5)
    expect(sources[0]).toMatchObject({ url: 'https://reddit.com/r/x', title: 'A post', snippet: 'Post body' })
  })

  it('parses Hacker News hits and build discussion URLs', () => {
    const sources = parseHackerNewsJson(HN, 5)
    expect(sources[0]).toMatchObject({ url: 'https://news.ycombinator.com/item?id=42', title: 'HN post', snippet: 'HN discussion · 10 points · 3 comments' })
  })

  it('parses Stack Overflow results and errors', () => {
    const sources = parseStackOverflowJson(STACK, 5)
    expect(sources[0]).toMatchObject({ url: 'https://stackoverflow.com/q/1', title: 'Q & A' })
    expect(sources[0]?.snippet).toContain('answered')
    expect(() => parseStackOverflowJson({ error_message: 'throttled' }, 5)).toThrow('throttled')
  })

  it('parses Wikipedia results for the matching language edition', () => {
    expect(wikipediaHost('深度求索')).toBe('zh.wikipedia.org')
    expect(wikipediaHost('deepseek')).toBe('en.wikipedia.org')
    const sources = parseWikipediaJson(WIKI, 'zh.wikipedia.org', 5)
    expect(sources[0]).toMatchObject({ url: 'https://zh.wikipedia.org/wiki/DeepSeek', title: 'DeepSeek', snippet: 'Chinese AI lab' })
  })

  it('parses npm packages', () => {
    const sources = parseNpmJson(NPM, 5)
    expect(sources[0]).toMatchObject({ url: 'https://www.npmjs.com/package/pkg', title: 'pkg' })
    expect(sources[0]?.snippet).toContain('v1.2.3')
  })
})

describe('platform adapters', () => {
  it('declares all eight adapters', () => {
    expect(PLATFORM_IDS).toHaveLength(8)
    expect(PLATFORMS.map(platform => platform.id)).toEqual([...PLATFORM_IDS])
    expect(PLATFORMS.filter(platform => platform.limitation !== undefined).map(platform => platform.id).sort())
      .toEqual(['bilibili', 'reddit', 'v2ex'])
  })

  it('calls the expected endpoint for every adapter', async () => {
    const cases: ReadonlyArray<{ adapter: PlatformAdapter; payload: unknown; urlPart: string; query?: string }> = [
      { adapter: githubPlatform, payload: GITHUB, urlPart: 'api.github.com/search/repositories' },
      { adapter: v2exPlatform, payload: V2EX, urlPart: 'v2ex.com/api/topics/hot.json', query: 'hello' },
      { adapter: bilibiliPlatform, payload: BILIBILI, urlPart: 'api.bilibili.com/x/web-interface/search/all/v2' },
      { adapter: redditPlatform, payload: REDDIT, urlPart: 'old.reddit.com/search.json' },
      { adapter: hackerNewsPlatform, payload: HN, urlPart: 'hn.algolia.com/api/v1/search' },
      { adapter: stackOverflowPlatform, payload: STACK, urlPart: 'api.stackexchange.com/2.3/search/advanced' },
      { adapter: wikipediaPlatform, payload: WIKI, urlPart: 'wikipedia.org/w/api.php' },
      { adapter: npmPlatform, payload: NPM, urlPart: 'registry.npmjs.com/-/v1/search' },
    ]
    for (const testCase of cases) {
      const http = textHttp(JSON.stringify(testCase.payload))
      const sources = await testCase.adapter.search(context(testCase.adapter, http, { query: testCase.query ?? 'deepseek' }))
      expect(sources.length, testCase.adapter.id).toBeGreaterThan(0)
      expect(http.calls[0]?.url, testCase.adapter.id).toContain(testCase.urlPart)
    }
  })
})

describe('platform search service', () => {
  it('dispatches, clamps and forwards cancellation', async () => {
    const http = textHttp(JSON.stringify(GITHUB))
    const service = createPlatformSearchService({ http, getConfig: () => testConfig() })
    const controller = new AbortController()
    const sources = await service.search('github', ' deepseek ', 99, controller.signal)
    expect(sources).toHaveLength(1)
    expect(http.calls[0]?.url).toContain('per_page=10')
    expect(http.calls[0]?.options?.signal).toBeDefined()
    expect(http.calls[0]?.options?.signal?.aborted).toBe(false)
  })

  it('rejects unknown platforms', async () => {
    const service = createPlatformSearchService({ http: textHttp('{}'), getConfig: () => testConfig() })
    await expect(service.search('unknown' as never, 'q', 5)).rejects.toThrow('unknown platform')
  })
})
