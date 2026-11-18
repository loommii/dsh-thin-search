import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { normalizeSources } from '../normalize'
import { timeRangeTier } from '../time-range'
import type { EngineContext, SearchEngine } from './types'

/** Default public SearXNG instances tried when the config lists none. */
export const DEFAULT_SEARXNG_INSTANCES: readonly string[] = Object.freeze([
  'https://opnxng.com',
  'https://priv.au',
  'https://searx.be',
  'https://searx.tiekoetter.com',
  'https://search.inetol.net',
  'https://paulgo.io',
])

interface SearxngResult {
  readonly url?: unknown
  readonly title?: unknown
  readonly content?: unknown
  readonly publishedDate?: unknown
}

interface SearxngResponse {
  readonly results?: unknown
}

/** Parse one SearXNG JSON response into sources. */
export function parseSearxngJson(payload: unknown, limit: number): WebSearchSource[] {
  const response = (payload ?? {}) as SearxngResponse
  if (!Array.isArray(response.results)) return []
  const sources: WebSearchSource[] = []
  for (const raw of response.results as SearxngResult[]) {
    if (typeof raw?.url !== 'string') continue
    sources.push({
      url: raw.url,
      ...typeof raw.title === 'string' && raw.title.trim().length > 0 ? { title: raw.title } : {},
      ...typeof raw.content === 'string' && raw.content.trim().length > 0 ? { snippet: raw.content } : {},
      ...typeof raw.publishedDate === 'string' && raw.publishedDate.trim().length > 0 ? { publishedAt: raw.publishedDate } : {},
    })
  }
  return normalizeSources(sources, limit)
}

/** SearXNG JSON search, walking configured instances until one returns results. */
export const searxngEngine: SearchEngine = {
  id: 'searxng',
  title: 'SearXNG',
  supportsTimeRange: true,
  async search(context: EngineContext): Promise<WebSearchSource[]> {
    const instances = context.config.searxngInstances.length > 0
      ? context.config.searxngInstances
      : DEFAULT_SEARXNG_INSTANCES
    const tier = timeRangeTier(context.timeRange, new Date(context.now))
    const failures: string[] = []
    for (const instance of instances) {
      try {
        const endpoint = new URL(`${instance.replace(/\/+$/u, '')}/search`)
        endpoint.searchParams.set('q', context.query)
        endpoint.searchParams.set('format', 'json')
        if (tier !== undefined) endpoint.searchParams.set('time_range', tier)
        const payload = await context.http.json<unknown>(endpoint.toString(), {
          accept: 'application/json',
          ...context.signal === undefined ? {} : { signal: context.signal },
          deadline: context.deadline,
        })
        const sources = parseSearxngJson(payload, context.maxResults)
        if (sources.length > 0) return sources
        failures.push(`${instance}: 0 results`)
      } catch (error: unknown) {
        if (context.signal?.aborted === true) throw error
        failures.push(`${instance}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    throw new Error(`all SearXNG instances failed: ${failures.join('; ').slice(0, 400)}`)
  },
}
