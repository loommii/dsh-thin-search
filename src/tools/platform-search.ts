import { defineTool } from '@deepseek-ai/dsh-tools'
import { WebError } from '@deepseek-ai/dsh-web'
import { PLATFORM_IDS, isPlatformId } from '../platforms'
import { clampMaxResults } from '../search/pipeline'
import { isHttpError } from '../search/http'
import { escapeMarkdownLabel, renderSourceLine } from './markdown'
import type { ToolHostDeps } from './types'

/** Search one platform through its adapter. */
export function createPlatformSearchTool(deps: ToolHostDeps) {
  return defineTool({
    name: 'platform_search',
    description:
      'Search one specific platform for a query and return source URLs with titles and snippets. '
      + 'Platforms: github, v2ex, bilibili, reddit, hn, stackoverflow, wikipedia, npm. '
      + 'Use this for repositories, forum threads, videos, discussions, questions, encyclopedia entries, or packages. '
      + 'V2EX searches the current hot-topic list only. Bilibili and Reddit may reject requests from data-center or proxy egress IPs.',
    parameters: {
      platform: {
        type: 'string',
        required: true,
        description: `Platform to search: ${PLATFORM_IDS.join(', ')}.`,
      },
      query: {
        type: 'string',
        required: true,
        description: 'The search query.',
      },
      maxResults: {
        type: 'number',
        description: 'Optional result count (default 5, max 10).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          platform: { type: 'string' },
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
      render(_args, value) {
        const lines = (value.sources ?? []).map(source => renderSourceLine(source))
        return [{
          type: 'text',
          text: `Platform search (${escapeMarkdownLabel(value.platform ?? 'unknown')}):\n${lines.length === 0 ? 'No results found.' : lines.join('\n')}`,
        }]
      },
    },
    timeoutMs: 30_000,
    async execute(args, exec) {
      if (!isPlatformId(args.platform)) {
        throw new Error(`unknown platform "${args.platform}"; use one of: ${PLATFORM_IDS.join(', ')}`)
      }
      const platform = args.platform
      const enabled = deps.getConfig().platforms
      if (!enabled.includes(platform)) {
        throw new Error(`platform "${platform}" is disabled in Thin Search settings; enable it on the plugin configuration page`)
      }
      const query = args.query.trim()
      if (query.length === 0) throw new Error('query is required')
      const limit = clampMaxResults(args.maxResults)
      let sources: Awaited<ReturnType<typeof deps.platforms.search>>
      try {
        sources = await deps.platforms.search(platform, query, limit, exec.signal)
      } catch (error: unknown) {
        const aborted = exec.signal.aborted || (isHttpError(error) && error.code === 'ABORTED')
        throw new WebError(
          aborted
            ? 'platform search aborted'
            : `platform search failed: ${error instanceof Error ? error.message : String(error)}`,
          aborted ? 'WEB_ABORTED' : 'WEB_PROVIDER_ERROR',
          { cause: error },
        )
      }
      return {
        platform,
        sources: sources.map(source => ({
          url: source.url,
          ...source.title === undefined ? {} : { title: source.title },
          ...source.snippet === undefined ? {} : { snippet: source.snippet },
          ...source.publishedAt === undefined ? {} : { publishedAt: source.publishedAt },
        })),
      }
    },
  })
}
