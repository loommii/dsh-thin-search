import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { normalizeSources, stripTags } from '../search/normalize'
import type { PlatformAdapter, PlatformContext } from './types'

interface WikipediaSearchResult {
  readonly title?: unknown
  readonly snippet?: unknown
  readonly timestamp?: unknown
}

interface WikipediaResponse {
  readonly query?: { readonly search?: unknown }
}

/** Pick the Wikipedia language edition that matches the query script. */
export function wikipediaHost(query: string): string {
  return /[\u3400-\u9fff]/u.test(query) ? 'zh.wikipedia.org' : 'en.wikipedia.org'
}

/** Parse the MediaWiki search API response. */
export function parseWikipediaJson(payload: unknown, host: string, limit: number): WebSearchSource[] {
  const response = (payload ?? {}) as WikipediaResponse
  const results = Array.isArray(response.query?.search) ? response.query.search : []
  const sources: WebSearchSource[] = []
  for (const raw of results as WikipediaSearchResult[]) {
    if (typeof raw?.title !== 'string') continue
    const title = stripTags(raw.title)
    const page = encodeURIComponent(title.replace(/ /gu, '_'))
    sources.push({
      url: `https://${host}/wiki/${page}`,
      title,
      ...typeof raw.snippet === 'string' && raw.snippet.length > 0 ? { snippet: stripTags(raw.snippet).slice(0, 200) } : {},
      ...typeof raw.timestamp === 'string' ? { publishedAt: raw.timestamp } : {},
    })
  }
  return normalizeSources(sources, limit)
}

/** Wikipedia article search through the MediaWiki API. */
export const wikipediaPlatform: PlatformAdapter = {
  id: 'wikipedia',
  title: 'Wikipedia',
  async search(context: PlatformContext): Promise<WebSearchSource[]> {
    const host = wikipediaHost(context.query)
    const endpoint = new URL(`https://${host}/w/api.php`)
    endpoint.searchParams.set('action', 'query')
    endpoint.searchParams.set('list', 'search')
    endpoint.searchParams.set('srsearch', context.query)
    endpoint.searchParams.set('format', 'json')
    endpoint.searchParams.set('srlimit', String(context.maxResults))
    const payload = await context.http.json<unknown>(endpoint.toString(), {
      accept: 'application/json',
      ...context.signal === undefined ? {} : { signal: context.signal },
      deadline: context.deadline,
    })
    return parseWikipediaJson(payload, host, context.maxResults)
  },
}
