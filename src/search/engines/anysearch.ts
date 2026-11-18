import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { normalizeSources } from '../normalize'
import type { EngineContext, SearchEngine } from './types'

/** AnySearch JSON endpoint. */
export const ANYSEARCH_URL = 'https://api.anysearch.com/v1/search'

interface AnysearchResult {
  readonly url?: unknown
  readonly title?: unknown
  readonly snippet?: unknown
}

interface AnysearchResponse {
  readonly code?: unknown
  readonly message?: unknown
  readonly data?: { readonly results?: unknown }
}

/** Parse an AnySearch response body into normalized sources. */
export function parseAnysearchJson(payload: unknown, limit: number): WebSearchSource[] {
  const response = (payload ?? {}) as AnysearchResponse
  if (response.code !== 0 && response.code !== undefined) {
    throw new Error(`AnySearch API error: ${typeof response.message === 'string' ? response.message : String(response.code)}`)
  }
  if (!Array.isArray(response.data?.results)) return []
  const sources: WebSearchSource[] = []
  for (const raw of response.data.results as AnysearchResult[]) {
    if (typeof raw?.url !== 'string') continue
    sources.push({
      url: raw.url,
      ...typeof raw.title === 'string' && raw.title.trim().length > 0 ? { title: raw.title } : {},
      ...typeof raw.snippet === 'string' && raw.snippet.trim().length > 0 ? { snippet: raw.snippet } : {},
    })
  }
  return normalizeSources(sources, limit)
}

/** AnySearch AI search API. */
export const anysearchEngine: SearchEngine = {
  id: 'anysearch',
  title: 'AnySearch',
  supportsTimeRange: false,
  async search(context: EngineContext): Promise<WebSearchSource[]> {
    const payload = await context.http.json<unknown>(ANYSEARCH_URL, {
      method: 'POST',
      accept: 'application/json',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: context.query, max_results: context.maxResults }),
      ...context.signal === undefined ? {} : { signal: context.signal },
      deadline: context.deadline,
    })
    return parseAnysearchJson(payload, context.maxResults)
  },
}
