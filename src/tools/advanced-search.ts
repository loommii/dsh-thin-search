import { defineTool } from '@deepseek-ai/dsh-tools'
import { ENGINE_IDS, normalizeEngineId } from '../search/engines/types'
import { parseTimeRange, type TimeRange } from '../search/time-range'
import { clampMaxResults, type PipelineRequest } from '../search/pipeline'
import { escapeMarkdownLabel, escapeMarkdownText, renderSourceLine } from './markdown'
import type { ToolHostDeps } from './types'

/** Web search with an optional time window and engine hint, using the full fallback pipeline. */
export function createAdvancedSearchTool(deps: ToolHostDeps) {
  return defineTool({
    name: 'advanced_search',
    description:
      'Search the web with optional time filtering or a forced first engine. '
      + 'Use this when the user wants results from a specific window (for example "last week" or "this month"). '
      + 'The same automatic engine fallback as web_search applies.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'The search query.',
      },
      maxResults: {
        type: 'number',
        description: 'Optional result count (default 5, max 10).',
      },
      timeRange: {
        type: 'string',
        description:
          'Optional time filter: day, week, month, year; a relative duration such as 12h, 3d, 2mo, 1y; '
          + 'or an absolute date such as 2026-07-01 (published after that date). '
          + 'DuckDuckGo and SearXNG map absolute dates to the nearest fixed tier.',
      },
      engine: {
        type: 'string',
        description:
          `Optional preferred engine (default: the configured provider): ${ENGINE_IDS.join(', ')}. `
          + 'When timeRange is set, time-capable engines (SearXNG, DDG, DDG-Lite) are tried first; '
          + 'the preferred engine leads only when it supports time filtering.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          provider: { type: 'string' },
          content: { type: 'string' },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                url: { type: 'string' },
                title: { type: 'string' },
                snippet: { type: 'string' },
                publishedAt: { type: 'string' },
              },
            },
          },
        },
      },
      render(args, value) {
        const lines = (value.sources ?? []).map(source => renderSourceLine(source))
        const header = `Search (${escapeMarkdownLabel(value.provider ?? 'unknown')}${args.timeRange === undefined ? '' : `, timeRange=${escapeMarkdownLabel(args.timeRange)}`}):`
        const body = `${header}\n${lines.length === 0 ? 'No results found.' : lines.join('\n')}`
        return [{
          type: 'text',
          text: value.content === undefined || value.content.length === 0
            ? body
            : `${body}\n\n${escapeMarkdownText(value.content)}`,
        }]
      },
    },
    timeoutMs: 60_000,
    async execute(args, exec) {
      const query = args.query.trim()
      if (query.length === 0) throw new Error('query is required')
      let timeRange: TimeRange | undefined = undefined
      if (args.timeRange !== undefined) {
        timeRange = parseTimeRange(args.timeRange)
        if (timeRange === undefined) {
          throw new Error(
            `invalid timeRange ${JSON.stringify(args.timeRange)}: use day, week, month or year; `
            + 'a relative duration such as 12h, 3d, 2mo or 1y; or an absolute date such as 2026-07-01',
          )
        }
      }
      const engine = normalizeEngineId(args.engine)
      if (args.engine !== undefined && engine === undefined) {
        throw new Error(`unknown engine ${JSON.stringify(args.engine)}; use one of: ${ENGINE_IDS.join(', ')}`)
      }
      const request: PipelineRequest = {
        query,
        maxResults: clampMaxResults(args.maxResults),
        ...timeRange === undefined ? {} : { timeRange },
        ...engine === undefined ? {} : { engine },
      }
      const result = await deps.pipeline.search(request, exec.signal)
      return {
        provider: result.engine,
        content: result.content ?? '',
        sources: result.sources.map(source => ({
          url: source.url,
          ...source.title === undefined ? {} : { title: source.title },
          ...source.snippet === undefined ? {} : { snippet: source.snippet },
          ...source.publishedAt === undefined ? {} : { publishedAt: source.publishedAt },
        })),
      }
    },
  })
}
