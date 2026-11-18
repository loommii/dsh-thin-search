import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { normalizeSources, stripTags } from '../search/normalize'
import type { PlatformAdapter, PlatformContext } from './types'

interface StackOverflowItem {
  readonly link?: unknown
  readonly title?: unknown
  readonly score?: unknown
  readonly answer_count?: unknown
  readonly is_answered?: unknown
  readonly creation_date?: unknown
}

interface StackExchangeResponse {
  readonly items?: unknown
  readonly error_message?: unknown
}

/** Parse a Stack Exchange search response. */
export function parseStackOverflowJson(payload: unknown, limit: number): WebSearchSource[] {
  const response = (payload ?? {}) as StackExchangeResponse
  if (typeof response.error_message === 'string' && response.error_message.length > 0) {
    throw new Error(`Stack Exchange API error: ${response.error_message}`)
  }
  if (!Array.isArray(response.items)) return []
  const sources: WebSearchSource[] = []
  for (const raw of response.items as StackOverflowItem[]) {
    if (typeof raw?.link !== 'string' || typeof raw.title !== 'string') continue
    const answered = raw.is_answered === true ? 'answered' : 'unanswered'
    const score = typeof raw.score === 'number' ? raw.score : 0
    const answers = typeof raw.answer_count === 'number' ? raw.answer_count : 0
    sources.push({
      url: raw.link,
      title: stripTags(raw.title),
      snippet: `${answered} · score ${score} · ${answers} answers`,
      ...typeof raw.creation_date === 'number' && raw.creation_date > 0 ? { publishedAt: new Date(raw.creation_date * 1000).toISOString() } : {},
    })
  }
  return normalizeSources(sources, limit)
}

/** Stack Overflow search through the Stack Exchange API. */
export const stackOverflowPlatform: PlatformAdapter = {
  id: 'stackoverflow',
  title: 'Stack Overflow',
  async search(context: PlatformContext): Promise<WebSearchSource[]> {
    const endpoint = new URL('https://api.stackexchange.com/2.3/search/advanced')
    endpoint.searchParams.set('order', 'desc')
    endpoint.searchParams.set('sort', 'relevance')
    endpoint.searchParams.set('q', context.query)
    endpoint.searchParams.set('site', 'stackoverflow')
    endpoint.searchParams.set('pagesize', String(context.maxResults))
    const payload = await context.http.json<unknown>(endpoint.toString(), {
      accept: 'application/json',
      ...context.signal === undefined ? {} : { signal: context.signal },
      deadline: context.deadline,
    })
    return parseStackOverflowJson(payload, context.maxResults)
  },
}
