/**
 * dsh-thin-search host entry: registers the {@code thin-search} WebSearchProvider,
 * the three Agent tools, and one system-prompt section against DSH 0.2.2-rc.3 and
 * 0.2.2-rc.5.
 * @module dsh-thin-search
 */
import type { Context } from '@deepseek-ai/cordis'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { Config, snapshotConfig, type ResolvedConfig } from './config'
import { createEnhancer } from './enhance'
import { createPlatformSearchService, PLATFORMS } from './platforms'
import { ResultCache } from './search/cache'
import { createHttpClient } from './search/http'
import { SearchPipeline, type PipelineLike, type PipelineResult } from './search/pipeline'
import { createTools } from './tools'

export { Config } from './config'
export type { Config as ThinSearchConfig, ResolvedConfig } from './config'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'thin-search'

/** Services this plugin requires before {@code apply} runs. */
export const inject = ['web', 'tools', 'systemPrompt']

/** Provider id registered with {@code ctx.web}; patch {@code web.searchProvider} to this value. */
export const THIN_SEARCH_PROVIDER_ID = 'thin-search'

/** Display name shown by provider pickers. */
export const THIN_SEARCH_PROVIDER_TITLE = 'Thin Search'

/** Picker description: what the provider does and when it costs tokens. */
export const THIN_SEARCH_PROVIDER_DESCRIPTION: NonNullable<WebSearchProvider['description']> = {
  en: 'Free, keyless search through Bing, AnySearch, SearXNG, DuckDuckGo HTML and Lite with automatic fallback. No model tokens unless search enhancement is enabled.',
  zh: '免费、免密钥的网页搜索，依次使用 Bing、AnySearch、SearXNG、DuckDuckGo HTML 与 Lite 并自动回退；除非启用搜索增强，否则不消耗模型 token。',
}

/** The provider facade exposed by {@code ctx.web.listProviders()} and used by web_search. */
export interface ThinSearchProvider extends WebSearchProvider {
  readonly id: typeof THIN_SEARCH_PROVIDER_ID
}

/** Build the provider over a search pipeline. */
export function createThinSearchProvider(pipeline: PipelineLike): ThinSearchProvider {
  return {
    id: THIN_SEARCH_PROVIDER_ID,
    title: THIN_SEARCH_PROVIDER_TITLE,
    description: THIN_SEARCH_PROVIDER_DESCRIPTION,
    available: () => true,
    async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
      const result = await pipeline.search({
        query: request.query,
        ...request.maxResults === undefined ? {} : { maxResults: request.maxResults },
      }, signal)
      return {
        sources: result.sources,
        truncated: false,
        ...result.content === undefined ? {} : { content: result.content },
      }
    },
  }
}

/** Build the dynamic system-prompt section text for the current config. */
export function buildSystemPromptText(config: ResolvedConfig): string {
  const platforms = config.platforms.length === 0
    ? '(none enabled)'
    : config.platforms.map((id) => {
      const platform = PLATFORMS.find(candidate => candidate.id === id)
      return platform?.limitation === undefined ? id : `${id} (${platform.limitation})`
    }).join(', ')
  return [
    '## Thin Search (free web search)',
    '',
    'Web search uses whichever provider is selected in the web search settings.',
    `When Thin Search is selected, web_search starts with the preferred engine ${config.provider} and falls back across Bing, AnySearch, SearXNG, DuckDuckGo HTML and DuckDuckGo Lite.`,
    'While Thin Search is selected, an engine that fails or returns no usable result is skipped automatically; the result note names the engine that actually answered.',
    'Do not tell the user that search is unavailable while that fallback can still succeed.',
    '',
    'Time filtering: use the advanced_search tool with timeRange.',
    'Fixed tiers are day, week, month, year; relative values such as 12h, 3d, 2mo, 1y and absolute dates such as 2026-07-01 are accepted.',
    'DuckDuckGo and SearXNG map absolute dates to the nearest fixed tier; Bing and AnySearch cannot apply a time filter, so time-capable engines move to the front for those searches.',
    '',
    `Search enhancement is ${config.searchEnhance ? 'ON: each search first spends tokens on the current Agent model (or the configured provider:model override) to rewrite the query' : 'OFF (the default): queries reach the engines unchanged and no model tokens are spent'}.`,
    'When the user asks for a time window, prefer advanced_search over web_search.',
    '',
    `Platform search is available for: ${platforms}.`,
    'Use platform_search for repository, forum, video, discussion, Q&A, encyclopedia, or package searches.',
    'V2EX only searches its current hot-topic list; Bilibili and Reddit may reject requests from data-center or proxy egress IPs.',
    '',
    'Use free_search_test to probe engines individually when diagnosing failures.',
  ].join('\n')
}

/** Register the provider, tools and prompt section. */
export function apply(ctx: Context, config: Config): void {
  const logger = ctx.logger('thin-search')
  const snapshot = (): ResolvedConfig => snapshotConfig(config)
  const http = createHttpClient({ logger })
  const cache = new ResultCache<PipelineResult>(50)
  const enhance = createEnhancer({
    getConfig: snapshot,
    getLlm: () => ctx.get('llm'),
    getAgentSelection: () => ctx.get('agents')?.currentInitiator()?.model.current(),
    logger,
  })
  const pipeline = new SearchPipeline({ getConfig: snapshot, http, cache, enhance, logger })
  const platforms = createPlatformSearchService({ http, getConfig: snapshot })
  const tools = createTools({ pipeline, platforms, getConfig: snapshot, logger })

  ctx.web.registerSearchProvider(createThinSearchProvider(pipeline))

  ctx.systemPrompt.section({
    name: 'thin-search:engines',
    order: ctx.systemPrompt.getSectionOrder('TOOL_WEB_SEARCH') + 5,
    text: () => buildSystemPromptText(snapshot()),
  })

  for (const tool of tools) ctx.tools.register(tool)
}
