import { describe, expect, it } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { createTools } from '../../src/tools'
import { HttpError } from '../../src/search/http'
import type { PipelineLike } from '../../src/search/pipeline'
import type { PlatformSearchService } from '../../src/platforms'
import { sources, testConfig, toolExec } from './helpers'

function fakePipeline(overrides: Partial<PipelineLike> = {}): PipelineLike {
  return {
    search: async () => ({
      sources: sources('https://example.com/tool'),
      truncated: false,
      engine: 'bing',
      cached: false,
      content: 'fallback note',
    }),
    testEngine: async (engine) => ({ engine, ok: true, sources: sources('https://example.com/probe') }),
    ...overrides,
  }
}

function fakePlatforms(overrides: Partial<PlatformSearchService> = {}): PlatformSearchService {
  return {
    search: async () => sources('https://github.com/a/b'),
    ...overrides,
  }
}

function buildTools(pipeline: PipelineLike = fakePipeline(), platforms: PlatformSearchService = fakePlatforms()) {
  return createTools({ pipeline, platforms, getConfig: () => testConfig() })
}

function byName(tools: readonly ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find(candidate => candidate.name === name)
  if (tool === undefined) throw new Error(`missing tool ${name}`)
  return tool
}

function renderText(tool: ToolDefinition, value: unknown): string {
  const blocks = tool.output.render({}, value as never) as Array<{ type: string; text: string }>
  return blocks.map(block => block.type === 'text' ? block.text : '').join('')
}

const CANONICAL: Readonly<Record<string, unknown>> = {
  free_search_test: { results: [{ engine: 'bing', status: 'ok', results: 1, sampleTitle: 'Example', sampleUrl: 'https://example.com' }] },
  platform_search: { platform: 'github', sources: [{ url: 'https://github.com/a/b', title: 'a/b', snippet: 'desc' }] },
  advanced_search: {
    provider: 'bing',
    content: 'note',
    sources: [{ url: 'https://example.com', title: 'Example', snippet: 'snippet', publishedAt: '2026-01-01T00:00:00Z' }],
  },
}

describe('host tool contracts', () => {
  it('registers the three tools with timeoutMs and ContentBlock renders', () => {
    const tools = buildTools()
    expect(tools.map(tool => tool.name)).toEqual(['free_search_test', 'platform_search', 'advanced_search'])
    for (const tool of tools) {
      expect(tool.timeoutMs, tool.name).toBeGreaterThan(0)
      const blocks = tool.output.render({}, CANONICAL[tool.name] as never)
      expect(Array.isArray(blocks), tool.name).toBe(true)
      expect(blocks.length, tool.name).toBeGreaterThan(0)
      expect(blocks.every(block => block.type === 'text'), tool.name).toBe(true)
      const text = blocks.map(block => block.type === 'text' ? block.text : '').join('')
      expect(text.length, tool.name).toBeGreaterThan(0)
    }
  })

  it('forwards exec.signal from advanced_search', async () => {
    let captured: AbortSignal | undefined
    const tool = byName(buildTools(fakePipeline({
      search: async (_request, signal) => {
        captured = signal
        return { sources: sources('https://example.com/signal'), truncated: false, engine: 'bing', cached: false }
      },
    })), 'advanced_search')
    const controller = new AbortController()
    await tool.execute({ query: 'signal' }, toolExec(controller.signal) as never)
    expect(captured).toBe(controller.signal)
  })

  it('forwards exec.signal from free_search_test', async () => {
    let captured: AbortSignal | undefined
    const tool = byName(buildTools(fakePipeline({
      testEngine: async (engine, _request, signal) => {
        captured = signal
        return { engine, ok: true, sources: sources('https://example.com/probe') }
      },
    })), 'free_search_test')
    const controller = new AbortController()
    await tool.execute({ engines: ['bing'] }, toolExec(controller.signal) as never)
    expect(captured).toBe(controller.signal)
  })

  it('forwards exec.signal from platform_search', async () => {
    let captured: AbortSignal | undefined
    const platforms: PlatformSearchService = {
      search: async (_platform, _query, _maxResults, signal) => {
        captured = signal
        return sources('https://github.com/a/b')
      },
    }
    const tool = byName(buildTools(fakePipeline(), platforms), 'platform_search')
    const controller = new AbortController()
    await tool.execute({ platform: 'github', query: 'q' }, toolExec(controller.signal) as never)
    expect(captured).toBe(controller.signal)
  })

  it('propagates cancellation from advanced_search', async () => {
    const tool = byName(buildTools(fakePipeline({
      search: async (_request, signal) => await new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new WebError('search aborted', 'WEB_ABORTED')), { once: true })
      }),
    })), 'advanced_search')
    const controller = new AbortController()
    const pending = tool.execute({ query: 'cancel me' }, toolExec(controller.signal) as never)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })

  it('reports unknown engines and per-engine failures in free_search_test', async () => {
    const tool = byName(buildTools(fakePipeline({
      testEngine: async (engine) => engine === 'bing'
        ? { engine, ok: false, sources: [], error: 'HTTP 403' }
        : { engine, ok: true, sources: sources('https://example.com') },
    })), 'free_search_test')
    const value = await tool.execute({ engines: ['bing', 'not-an-engine'] }, toolExec(new AbortController().signal) as never) as {
      results: Array<{ engine: string; status: string; error?: string }>
    }
    expect(value.results[0]).toMatchObject({ engine: 'bing', status: 'fail', error: 'HTTP 403' })
    expect(value.results[1]).toMatchObject({ engine: 'not-an-engine', status: 'fail' })
    expect(value.results[1]?.error).toContain('unknown engine')
  })

  it('wraps platform adapter failures as WebError with code and cause', async () => {
    const aborted = new HttpError('aborted', 'ABORTED', { transient: false })
    const abortedTool = byName(buildTools(fakePipeline(), {
      search: async () => { throw aborted },
    }), 'platform_search')
    const abortedError = await abortedTool.execute(
      { platform: 'github', query: 'q' },
      toolExec(new AbortController().signal) as never,
    ).catch((caught: unknown) => caught)
    expect(abortedError).toBeInstanceOf(WebError)
    expect((abortedError as WebError).code).toBe('WEB_ABORTED')
    expect((abortedError as WebError).cause).toBe(aborted)

    const ordinary = new Error('adapter exploded')
    const failedTool = byName(buildTools(fakePipeline(), {
      search: async () => { throw ordinary },
    }), 'platform_search')
    const failedError = await failedTool.execute(
      { platform: 'github', query: 'q' },
      toolExec(new AbortController().signal) as never,
    ).catch((caught: unknown) => caught)
    expect(failedError).toBeInstanceOf(WebError)
    expect((failedError as WebError).code).toBe('WEB_PROVIDER_ERROR')
    expect((failedError as WebError).cause).toBe(ordinary)

    const controller = new AbortController()
    controller.abort()
    const cancelledError = await failedTool.execute(
      { platform: 'github', query: 'q' },
      toolExec(controller.signal) as never,
    ).catch((caught: unknown) => caught)
    expect(cancelledError).toBeInstanceOf(WebError)
    expect((cancelledError as WebError).code).toBe('WEB_ABORTED')
  })

  it('uses WebError WEB_INVALID_REQUEST for every argument validation failure', async () => {
    const advanced = byName(buildTools(), 'advanced_search')
    const platform = byName(createTools({
      pipeline: fakePipeline(),
      platforms: fakePlatforms(),
      getConfig: () => testConfig({ platforms: ['github'] }),
    }), 'platform_search')
    const cases: Array<{ run: Promise<unknown>; message: string }> = [
      {
        run: advanced.execute({ query: '' }, toolExec(new AbortController().signal) as never),
        message: 'query is required',
      },
      {
        run: advanced.execute({ query: 'q', timeRange: 'last fortnight' }, toolExec(new AbortController().signal) as never),
        message: 'invalid timeRange "last fortnight": use day, week, month or year; '
          + 'a relative duration such as 12h, 3d, 2mo or 1y; or an absolute date such as 2026-07-01',
      },
      {
        run: advanced.execute({ query: 'q', engine: 'duckduckgo' }, toolExec(new AbortController().signal) as never),
        message: 'unknown engine "duckduckgo"; use one of: bing, anysearch, searxng, ddg, ddg-lite',
      },
      {
        run: platform.execute({ platform: 'unknown', query: 'q' }, toolExec(new AbortController().signal) as never),
        message: 'unknown platform "unknown"; use one of: github, v2ex, bilibili, reddit, hn, stackoverflow, wikipedia, npm',
      },
      {
        run: platform.execute({ platform: 'npm', query: 'q' }, toolExec(new AbortController().signal) as never),
        message: 'platform "npm" is disabled in Thin Search settings; enable it on the plugin configuration page',
      },
      {
        run: platform.execute({ platform: 'github', query: '' }, toolExec(new AbortController().signal) as never),
        message: 'query is required',
      },
    ]
    for (const testCase of cases) {
      const error = await testCase.run.catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(WebError)
      expect((error as WebError).code).toBe('WEB_INVALID_REQUEST')
      expect((error as WebError).message).toBe(testCase.message)
    }
  })

  it('rejects disabled and unknown platforms', async () => {
    const tools = createTools({ pipeline: fakePipeline(), platforms: fakePlatforms(), getConfig: () => testConfig({ platforms: ['github'] }) })
    const platformTool = byName(tools, 'platform_search')
    await expect(platformTool.execute({ platform: 'npm', query: 'q' }, toolExec(new AbortController().signal) as never))
      .rejects.toThrow('disabled')
    await expect(platformTool.execute({ platform: 'unknown', query: 'q' }, toolExec(new AbortController().signal) as never))
      .rejects.toThrow('unknown platform')
  })

  it('rejects an unparseable timeRange instead of silently dropping it', async () => {
    let called = false
    const tool = byName(buildTools(fakePipeline({
      search: async () => {
        called = true
        return { sources: sources('https://example.com/should-not-run'), truncated: false, engine: 'bing', cached: false }
      },
    })), 'advanced_search')
    await expect(tool.execute({ query: 'q', timeRange: 'last fortnight' }, toolExec(new AbortController().signal) as never))
      .rejects.toThrow('invalid timeRange')
    await expect(tool.execute({ query: 'q', timeRange: '' }, toolExec(new AbortController().signal) as never))
      .rejects.toThrow('invalid timeRange')
    await expect(tool.execute({ query: 'q', timeRange: '2099-01-01' }, toolExec(new AbortController().signal) as never))
      .rejects.toThrow('invalid timeRange')
    expect(called).toBe(false)
  })

  it('passes a parsed timeRange object to the pipeline', async () => {
    let captured: { timeRange?: unknown } | undefined
    const tool = byName(buildTools(fakePipeline({
      search: async (request) => {
        captured = request
        return { sources: sources('https://example.com/parsed'), truncated: false, engine: 'bing', cached: false }
      },
    })), 'advanced_search')
    await tool.execute({ query: 'q', timeRange: '3d' }, toolExec(new AbortController().signal) as never)
    expect(captured?.timeRange).toEqual({ days: 3 })
  })

  it('rejects an unknown engine and documents preferred-engine semantics', async () => {
    const tool = byName(buildTools(), 'advanced_search')
    await expect(tool.execute({ query: 'q', engine: 'duckduckgo' }, toolExec(new AbortController().signal) as never))
      .rejects.toThrow('unknown engine')
    await expect(tool.execute({ query: 'q', engine: 'duckduckgo' }, toolExec(new AbortController().signal) as never))
      .rejects.toThrow('bing, anysearch, searxng, ddg, ddg-lite')
    const parameters = tool.parameters as { properties?: Record<string, { description?: string }> }
    const description = parameters.properties?.engine?.description ?? ''
    expect(description).toContain('preferred')
    expect(description).toContain('timeRange')
    expect(description).toContain('SearXNG')
    expect(description).toContain('supports time filtering')
  })

  it('routes both tools through the shared maxResults clamp', async () => {
    let advancedMax: number | undefined
    let platformMax: number | undefined
    const tools = buildTools(
      fakePipeline({
        search: async (request) => {
          advancedMax = request.maxResults
          return {
            sources: sources('https://example.com/clamped'),
            truncated: false,
            engine: 'bing',
            cached: false,
          }
        },
      }),
      {
        search: async (_platform, _query, maxResults) => {
          platformMax = maxResults
          return sources('https://github.com/a/b')
        },
      },
    )
    await byName(tools, 'advanced_search').execute(
      { query: 'q', maxResults: 100 },
      toolExec(new AbortController().signal) as never,
    )
    await byName(tools, 'platform_search').execute(
      { platform: 'github', query: 'q', maxResults: 0 },
      toolExec(new AbortController().signal) as never,
    )
    expect(advancedMax).toBe(10)
    expect(platformMax).toBe(1)
  })

  it('returns canonical advanced_search output', async () => {
    const tool = byName(buildTools(), 'advanced_search')
    const value = await tool.execute({ query: 'q', timeRange: 'week', engine: 'bing', maxResults: 50 }, toolExec(new AbortController().signal) as never) as {
      provider: string
      content: string
      sources: Array<{ url: string }>
    }
    expect(value.provider).toBe('bing')
    expect(value.content).toBe('fallback note')
    expect(value.sources[0]?.url).toBe('https://example.com/tool')
  })

  it('escapes untrusted Markdown in render labels and destinations', () => {
    const tool = byName(buildTools(), 'advanced_search')
    const blocks = tool.output.render({ query: 'q' }, {
      provider: 'bing',
      content: '',
      sources: [{
        url: 'https://example.com/a(b)',
        title: '[x](https://evil.example)',
        snippet: 'line1\nline2',
        publishedAt: '2026-01-01',
      }],
    } as never) as Array<{ type: string; text: string }>
    const text = blocks.map(block => block.type === 'text' ? block.text : '').join('')
    expect(text).toContain('\\[x\\]')
    expect(text).toContain('a%28b%29')
    expect(text).toContain('line1 line2')
    expect(text).not.toContain('[x](https://evil.example)')
  })

  it('escapes untrusted labels, destinations and the advanced_search content note', () => {
    const probe = '[x](javascript:alert(1))[y](https://example.com/(a))'
    const source = { url: probe, title: probe, snippet: probe, publishedAt: probe }
    const tools = buildTools()
    const platformText = renderText(byName(tools, 'platform_search'), {
      platform: probe,
      sources: [source],
    })
    const freeSearchText = renderText(byName(tools, 'free_search_test'), {
      results: [
        { engine: probe, status: 'ok', results: 1, sampleTitle: probe, sampleUrl: probe },
        { engine: probe, status: 'fail', error: probe },
      ],
    })
    const advancedText = renderText(byName(tools, 'advanced_search'), {
      provider: probe,
      content: probe,
      sources: [source],
    })
    for (const text of [platformText, freeSearchText, advancedText]) {
      expect(text).toContain('\\[x\\]')
      expect(text).not.toContain('](')
      expect(text).not.toContain('[x](javascript:alert(1))')
    }
    expect(platformText).toContain('Platform search (')
    expect(freeSearchText).toContain('Search engine test:')
    expect(advancedText).toContain('Search (')
  })
})
