import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { normalizeSources, stripTags } from '../search/normalize'
import type { PlatformAdapter, PlatformContext } from './types'

interface V2exTopic {
  readonly id?: unknown
  readonly title?: unknown
  readonly content?: unknown
}

/** Filter V2EX hot topics case-insensitively by the query. */
export function parseV2exJson(payload: unknown, query: string, limit: number): WebSearchSource[] {
  if (!Array.isArray(payload)) return []
  const needle = query.trim().toLowerCase()
  const sources: WebSearchSource[] = []
  for (const raw of payload as V2exTopic[]) {
    const title = typeof raw?.title === 'string' ? stripTags(raw.title) : ''
    const content = typeof raw?.content === 'string' ? stripTags(raw.content) : ''
    if (!title.toLowerCase().includes(needle) && !content.toLowerCase().includes(needle)) continue
    if (typeof raw.id !== 'number') continue
    const snippet = content.slice(0, 200)
    sources.push({
      url: `https://www.v2ex.com/t/${raw.id}`,
      ...title.length === 0 ? {} : { title },
      ...snippet.length === 0 ? {} : { snippet },
    })
  }
  return normalizeSources(sources, limit)
}

/** V2EX hot-topic search; the public API exposes no general full-text search. */
export const v2exPlatform: PlatformAdapter = {
  id: 'v2ex',
  title: 'V2EX',
  limitation: 'Searches the current hot-topic list only (the public V2EX API has no full-text search).',
  async search(context: PlatformContext): Promise<WebSearchSource[]> {
    const payload = await context.http.json<unknown>('https://www.v2ex.com/api/topics/hot.json', {
      accept: 'application/json',
      ...context.signal === undefined ? {} : { signal: context.signal },
      deadline: context.deadline,
    })
    return parseV2exJson(payload, context.query, context.maxResults)
  },
}
