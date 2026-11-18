import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { normalizeSources } from '../search/normalize'
import type { PlatformAdapter, PlatformContext } from './types'

interface GithubItem {
  readonly html_url?: unknown
  readonly full_name?: unknown
  readonly name?: unknown
  readonly description?: unknown
  readonly stargazers_count?: unknown
  readonly updated_at?: unknown
}

interface GithubResponse {
  readonly items?: unknown
}

/** Parse GitHub's repository search response. */
export function parseGithubJson(payload: unknown, limit: number): WebSearchSource[] {
  const response = (payload ?? {}) as GithubResponse
  if (!Array.isArray(response.items)) return []
  const sources: WebSearchSource[] = []
  for (const raw of response.items as GithubItem[]) {
    if (typeof raw?.html_url !== 'string') continue
    const title = typeof raw.full_name === 'string' ? raw.full_name : typeof raw.name === 'string' ? raw.name : undefined
    const stars = typeof raw.stargazers_count === 'number' && raw.stargazers_count > 0 ? ` ⭐${raw.stargazers_count}` : ''
    const description = typeof raw.description === 'string' ? raw.description : ''
    const snippet = `${description}${stars}`.trim()
    sources.push({
      url: raw.html_url,
      ...title === undefined ? {} : { title },
      ...snippet.length === 0 ? {} : { snippet },
      ...typeof raw.updated_at === 'string' ? { publishedAt: raw.updated_at } : {},
    })
  }
  return normalizeSources(sources, limit)
}

/** GitHub repository search through the public REST API. */
export const githubPlatform: PlatformAdapter = {
  id: 'github',
  title: 'GitHub',
  async search(context: PlatformContext): Promise<WebSearchSource[]> {
    const endpoint = new URL('https://api.github.com/search/repositories')
    endpoint.searchParams.set('q', context.query)
    endpoint.searchParams.set('per_page', String(context.maxResults))
    const payload = await context.http.json<unknown>(endpoint.toString(), {
      accept: 'application/vnd.github+json',
      ...context.signal === undefined ? {} : { signal: context.signal },
      deadline: context.deadline,
    })
    return parseGithubJson(payload, context.maxResults)
  },
}
