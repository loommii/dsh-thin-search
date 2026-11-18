import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { normalizeSources, stripTags } from '../search/normalize'
import type { PlatformAdapter, PlatformContext } from './types'

interface HnHit {
  readonly url?: unknown
  readonly title?: unknown
  readonly story_title?: unknown
  readonly objectID?: unknown
  readonly points?: unknown
  readonly num_comments?: unknown
  readonly created_at?: unknown
}

interface HnResponse {
  readonly hits?: unknown
}

/** Parse an Algolia Hacker News search response. */
export function parseHackerNewsJson(payload: unknown, limit: number): WebSearchSource[] {
  const response = (payload ?? {}) as HnResponse
  if (!Array.isArray(response.hits)) return []
  const sources: WebSearchSource[] = []
  for (const raw of response.hits as HnHit[]) {
    const title = typeof raw?.title === 'string' ? raw.title : typeof raw.story_title === 'string' ? raw.story_title : ''
    if (title.length === 0 && typeof raw?.objectID !== 'string') continue
    const url = typeof raw.url === 'string' && raw.url.length > 0
      ? raw.url
      : typeof raw.objectID === 'string' ? `https://news.ycombinator.com/item?id=${raw.objectID}` : undefined
    if (url === undefined) continue
    const points = typeof raw.points === 'number' ? raw.points : undefined
    const comments = typeof raw.num_comments === 'number' ? raw.num_comments : undefined
    const snippet = points === undefined && comments === undefined
      ? undefined
      : `HN discussion · ${points ?? 0} points · ${comments ?? 0} comments`
    sources.push({
      url,
      ...title.length === 0 ? {} : { title: stripTags(title) },
      ...snippet === undefined ? {} : { snippet },
      ...typeof raw.created_at === 'string' ? { publishedAt: raw.created_at } : {},
    })
  }
  return normalizeSources(sources, limit)
}

/** Hacker News search through the Algolia API. */
export const hackerNewsPlatform: PlatformAdapter = {
  id: 'hn',
  title: 'Hacker News',
  async search(context: PlatformContext): Promise<WebSearchSource[]> {
    const endpoint = new URL('https://hn.algolia.com/api/v1/search')
    endpoint.searchParams.set('query', context.query)
    endpoint.searchParams.set('hitsPerPage', String(context.maxResults))
    const payload = await context.http.json<unknown>(endpoint.toString(), {
      accept: 'application/json',
      ...context.signal === undefined ? {} : { signal: context.signal },
      deadline: context.deadline,
    })
    return parseHackerNewsJson(payload, context.maxResults)
  },
}
