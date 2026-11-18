import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { normalizeSources, stripTags } from '../search/normalize'
import type { PlatformAdapter, PlatformContext } from './types'

interface BilibiliItem {
  readonly arcurl?: unknown
  readonly title?: unknown
  readonly desc?: unknown
  readonly bvid?: unknown
  readonly pubdate?: unknown
}

interface BilibiliSection {
  readonly data?: unknown
}

interface BilibiliResponse {
  readonly code?: unknown
  readonly message?: unknown
  readonly data?: { readonly result?: unknown }
}

/** Flatten Bilibili's grouped search response into sources. */
export function parseBilibiliJson(payload: unknown, limit: number): WebSearchSource[] {
  const response = (payload ?? {}) as BilibiliResponse
  if (response.code !== 0 && response.code !== undefined) {
    throw new Error(`Bilibili API error: ${typeof response.message === 'string' ? response.message : String(response.code)}`)
  }
  const sections = Array.isArray(response.data?.result) ? response.data.result as BilibiliSection[] : []
  const sources: WebSearchSource[] = []
  for (const section of sections) {
    if (!Array.isArray(section?.data)) continue
    for (const raw of section.data as BilibiliItem[]) {
      if (typeof raw?.arcurl !== 'string' || raw.arcurl.length === 0) continue
      const title = typeof raw.title === 'string' ? stripTags(raw.title) : typeof raw.bvid === 'string' ? raw.bvid : ''
      const snippet = typeof raw.desc === 'string' ? stripTags(raw.desc).slice(0, 200) : ''
      sources.push({
        url: raw.arcurl,
        ...title.length === 0 ? {} : { title },
        ...snippet.length === 0 ? {} : { snippet },
        ...typeof raw.pubdate === 'number' && raw.pubdate > 0 ? { publishedAt: new Date(raw.pubdate * 1000).toISOString() } : {},
      })
    }
  }
  return normalizeSources(sources, limit)
}

/** Bilibili video search through the web-interface API. */
export const bilibiliPlatform: PlatformAdapter = {
  id: 'bilibili',
  title: 'Bilibili',
  limitation: 'May reject requests from data-center or proxy egress IPs (risk control).',
  async search(context: PlatformContext): Promise<WebSearchSource[]> {
    const endpoint = new URL('https://api.bilibili.com/x/web-interface/search/all/v2')
    endpoint.searchParams.set('keyword', context.query)
    const payload = await context.http.json<unknown>(endpoint.toString(), {
      accept: 'application/json',
      headers: { referer: 'https://www.bilibili.com' },
      ...context.signal === undefined ? {} : { signal: context.signal },
      deadline: context.deadline,
    })
    return parseBilibiliJson(payload, context.maxResults)
  },
}
