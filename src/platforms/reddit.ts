import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { normalizeSources, stripTags } from '../search/normalize'
import type { PlatformAdapter, PlatformContext } from './types'

interface RedditPost {
  readonly url?: unknown
  readonly title?: unknown
  readonly selftext?: unknown
  readonly created_utc?: unknown
}

interface RedditListing {
  readonly data?: { readonly children?: unknown }
}

/** Parse one Reddit listing response. */
export function parseRedditJson(payload: unknown, limit: number): WebSearchSource[] {
  const listing = (payload ?? {}) as RedditListing
  const children = Array.isArray(listing.data?.children) ? listing.data.children : []
  const sources: WebSearchSource[] = []
  for (const child of children as { readonly data?: RedditPost }[]) {
    const post = child?.data
    if (post === null || typeof post !== 'object' || typeof post.url !== 'string') continue
    const title = typeof post.title === 'string' ? stripTags(post.title) : ''
    const snippet = typeof post.selftext === 'string' ? stripTags(post.selftext).slice(0, 200) : ''
    sources.push({
      url: post.url,
      ...title.length === 0 ? {} : { title },
      ...snippet.length === 0 ? {} : { snippet },
      ...typeof post.created_utc === 'number' && post.created_utc > 0 ? { publishedAt: new Date(post.created_utc * 1000).toISOString() } : {},
    })
  }
  return normalizeSources(sources, limit)
}

/** Reddit search through the legacy JSON listing. */
export const redditPlatform: PlatformAdapter = {
  id: 'reddit',
  title: 'Reddit',
  limitation: 'May reject requests from data-center or proxy egress IPs (risk control).',
  async search(context: PlatformContext): Promise<WebSearchSource[]> {
    const endpoint = new URL('https://old.reddit.com/search.json')
    endpoint.searchParams.set('q', context.query)
    endpoint.searchParams.set('limit', String(context.maxResults))
    endpoint.searchParams.set('sort', 'relevance')
    const payload = await context.http.json<unknown>(endpoint.toString(), {
      accept: 'application/json',
      headers: { 'user-agent': 'dsh-thin-search/1.0.0 (DeepSeekRuntime plugin)' },
      ...context.signal === undefined ? {} : { signal: context.signal },
      deadline: context.deadline,
    })
    return parseRedditJson(payload, context.maxResults)
  },
}
