import { defineTool } from '@deepseek-ai/dsh-tools'
import { ENGINE_IDS, normalizeEngineId } from '../search/engines/types'
import { escapeMarkdownLabel } from './markdown'
import type { ToolHostDeps } from './types'

const DEFAULT_TEST_QUERY = 'today USD to JPY exchange rate'

/** Diagnostic tool that probes every free engine individually. */
export function createFreeSearchTestTool(deps: ToolHostDeps) {
  return defineTool({
    name: 'free_search_test',
    description:
      'Test the free web-search engines one by one and report which work right now. Use this to diagnose search failures or verify engine availability. Each engine is probed directly, without fallback.',
    parameters: {
      engines: {
        type: 'array',
        description: `Engines to test (default: all). Options: ${ENGINE_IDS.join(', ')}.`,
        items: { type: 'string' },
      },
      query: {
        type: 'string',
        description: `Optional probe query (default: "${DEFAULT_TEST_QUERY}").`,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                engine: { type: 'string' },
                status: { type: 'string' },
                results: { type: 'number' },
                error: { type: 'string' },
                sampleTitle: { type: 'string' },
                sampleUrl: { type: 'string' },
              },
            },
          },
        },
      },
      render(_args, value) {
        const lines = (value.results ?? []).map((result) => {
          const engine = escapeMarkdownLabel(result.engine ?? 'unknown')
          if (result.status === 'ok') {
            const sample = result.sampleTitle === undefined
              ? ''
              : `, e.g. "${escapeMarkdownLabel(result.sampleTitle.slice(0, 40))}"`
            return `- ${engine}: OK (${result.results ?? 0} results${sample})`
          }
          return `- ${engine}: FAIL - ${escapeMarkdownLabel(result.error ?? 'unknown error')}`
        })
        return [{ type: 'text', text: `Search engine test:\n${lines.join('\n')}` }]
      },
    },
    timeoutMs: 65_000,
    async execute(args, exec) {
      const requested = args.engines !== undefined && args.engines.length > 0 ? args.engines : [...ENGINE_IDS]
      const query = args.query === undefined || args.query.trim().length === 0 ? DEFAULT_TEST_QUERY : args.query
      const results: Array<{
        engine: string
        status: string
        results?: number
        error?: string
        sampleTitle?: string
        sampleUrl?: string
      }> = []
      for (const raw of requested) {
        const engine = normalizeEngineId(raw)
        if (engine === undefined) {
          results.push({ engine: raw, status: 'fail', error: `unknown engine; use one of ${ENGINE_IDS.join(', ')}` })
          continue
        }
        const result = await deps.pipeline.testEngine(engine, { query, maxResults: 3 }, exec.signal)
        if (result.ok && result.sources.length > 0) {
          const first = result.sources[0]
          results.push({
            engine,
            status: 'ok',
            results: result.sources.length,
            ...first?.title === undefined ? {} : { sampleTitle: first.title },
            ...first?.url === undefined ? {} : { sampleUrl: first.url },
          })
        } else {
          results.push({ engine, status: 'fail', error: result.error ?? 'no results' })
        }
      }
      return { results }
    },
  })
}
