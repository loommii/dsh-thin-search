/**
 * Built-host integration: the three Agent tools declare their timeouts, render
 * ContentBlock arrays, validate their arguments, and forward the run signal into
 * the pipeline and platform adapters so cancellation reaches the network.
 */
import { describe, expect, it } from 'vitest'
import {
  abortableFetch,
  createApplyContext,
  executeTool,
  loadHostBundle,
  stubFetch,
  toolNamed,
} from './helpers'

/** Apply the built bundle and return the registered tool facades. */
async function setup(config: Record<string, unknown> = {}): Promise<Record<string, Record<string, any>>> {
  const bundle = await loadHostBundle()
  const { ctx, records } = createApplyContext()
  bundle.apply(ctx, bundle.Config(config))
  return {
    free: toolNamed(records, 'free_search_test'),
    platform: toolNamed(records, 'platform_search'),
    advanced: toolNamed(records, 'advanced_search'),
  }
}

describe('built host tools', () => {
  it('declares a positive timeout for every tool', async () => {
    const tools = await setup()
    expect(tools.free?.['timeoutMs']).toBe(65_000)
    expect(tools.platform?.['timeoutMs']).toBe(30_000)
    expect(tools.advanced?.['timeoutMs']).toBe(60_000)
  })

  it('renders ContentBlock arrays instead of bare strings', async () => {
    const tools = await setup()
    const advanced = tools.advanced!.output.render(
      { query: 'x', timeRange: 'week' },
      { provider: 'ddg', content: 'note', sources: [{ url: 'https://example.com/a', title: 'A', snippet: 'S' }] },
    ) as { type: string; text: string }[]
    expect(Array.isArray(advanced)).toBe(true)
    expect(advanced[0]?.type).toBe('text')
    expect(advanced[0]?.text).toContain('[A](https://example.com/a)')
    expect(advanced[0]?.text).toContain('timeRange=week')

    const platform = tools.platform!.output.render(
      { platform: 'github' },
      { platform: 'github', sources: [{ url: 'https://example.com/b', title: 'B' }] },
    ) as { type: string; text: string }[]
    expect(platform[0]?.type).toBe('text')
    expect(platform[0]?.text).toContain('Platform search (github)')

    const free = tools.free!.output.render(
      { engines: ['bing'] },
      { results: [{ engine: 'bing', status: 'ok', results: 2, sampleTitle: 'Sample' }] },
    ) as { type: string; text: string }[]
    expect(free[0]?.type).toBe('text')
    expect(free[0]?.text).toContain('bing: OK (2 results')
  })

  it('rejects malformed arguments before touching the network', async () => {
    const stub = stubFetch(() => { throw new Error('network must not be reached') })
    const tools = await setup()
    await expect(executeTool(tools.advanced!, { query: 'x', timeRange: 'yesterday' })).rejects.toThrow(/invalid timeRange/u)
    await expect(executeTool(tools.advanced!, { query: '   ' })).rejects.toThrow(/query is required/u)
    await expect(executeTool(tools.platform!, { platform: 'nope', query: 'x' })).rejects.toThrow(/unknown platform/u)
    expect(stub.calls).toHaveLength(0)
  })

  it('rejects a platform disabled in the plugin settings', async () => {
    const stub = stubFetch(() => { throw new Error('network must not be reached') })
    const tools = await setup({ platforms: ['github'] })
    await expect(executeTool(tools.platform!, { platform: 'v2ex', query: 'x' })).rejects.toThrow(/disabled/u)
    expect(stub.calls).toHaveLength(0)
  })

  it('reports an unknown engine from free_search_test without a request', async () => {
    const stub = stubFetch(() => { throw new Error('network must not be reached') })
    const tools = await setup()
    const result = await executeTool(tools.free!, { engines: ['nope'] }) as { results: { engine: string; status: string; error?: string }[] }
    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.engine).toBe('nope')
    expect(result.results[0]?.status).toBe('fail')
    expect(result.results[0]?.error ?? '').toContain('unknown engine')
    expect(stub.calls).toHaveLength(0)
  })

  it('forwards the run signal from advanced_search into the HTTP request', async () => {
    const stub = stubFetch(abortableFetch())
    const tools = await setup({ cacheTtl: 0 })
    const controller = new AbortController()
    const pending = executeTool(tools.advanced!, { query: 'cancelled' }, controller.signal)
    setTimeout(() => { controller.abort() }, 10)
    await expect(pending).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    expect(stub.calls.length).toBeGreaterThan(0)
    expect(stub.calls[0]?.init?.signal?.aborted).toBe(true)
  })

  it('forwards the run signal from platform_search into the HTTP request', async () => {
    const stub = stubFetch(abortableFetch())
    const tools = await setup({ platforms: ['github'] })
    const controller = new AbortController()
    const pending = executeTool(tools.platform!, { platform: 'github', query: 'cancelled' }, controller.signal)
    setTimeout(() => { controller.abort() }, 10)
    // Platform adapters surface the HTTP client's explicit cancellation code;
    // the point of this test is that the run signal reaches the network.
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' })
    expect(stub.calls.length).toBeGreaterThan(0)
    expect(stub.calls[0]?.init?.signal?.aborted).toBe(true)
  })

  it('refuses to start free_search_test with an already-aborted signal', async () => {
    const stub = stubFetch(() => { throw new Error('network must not be reached') })
    const tools = await setup()
    const controller = new AbortController()
    controller.abort()
    await expect(executeTool(tools.free!, { engines: ['bing'] }, controller.signal)).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    expect(stub.calls).toHaveLength(0)
  })
})
