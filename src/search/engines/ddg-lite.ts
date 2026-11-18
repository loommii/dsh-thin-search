import { parse } from 'node-html-parser'
import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { extractDdgUrl, normalizeSources } from '../normalize'
import { ddgDateFilter, normalizePublishedDate, timeRangeTier } from '../time-range'
import type { EngineContext, SearchEngine } from './types'

/**
 * Parse DuckDuckGo Lite's table-based result page. Rows are walked in document
 * order: a result-link row starts a result, and the snippet/timestamp cells that
 * follow belong to that result until the next result-link row. Parallel
 * querySelectorAll arrays are deliberately not used, because a missing timestamp
 * in one result would shift every later date onto the wrong result.
 */
export function parseDdgLiteHtml(html: string, limit: number): WebSearchSource[] {
  const root = parse(html)
  interface DraftSource {
    url: string
    title: string
    snippet?: string
    publishedAt?: string
  }
  const drafts: DraftSource[] = []
  let current: DraftSource | undefined
  const flush = (): void => {
    if (current !== undefined) drafts.push(current)
    current = undefined
  }

  for (const row of root.querySelectorAll('tr')) {
    const link = row.querySelector('a.result-link')
    if (link !== null) {
      flush()
      const url = extractDdgUrl(link.getAttribute('href'))
      if (url !== undefined) current = { url, title: link.text.trim() }
    }
    if (current === undefined) continue
    if (current.snippet === undefined) {
      const snippet = row.querySelector('td.result-snippet')
      if (snippet !== null) current.snippet = snippet.text
    }
    if (current.publishedAt === undefined) {
      const publishedAt = normalizePublishedDate(row.querySelector('.result-timestamp')?.text)
      if (publishedAt !== undefined) current.publishedAt = publishedAt
    }
  }
  flush()

  return normalizeSources(drafts.map(draft => ({
    url: draft.url,
    ...(draft.title.length === 0 ? {} : { title: draft.title }),
    ...(draft.snippet === undefined ? {} : { snippet: draft.snippet }),
    ...(draft.publishedAt === undefined ? {} : { publishedAt: draft.publishedAt }),
  })), limit)
}

/** DuckDuckGo Lite endpoint. */
export const ddgLiteEngine: SearchEngine = {
  id: 'ddg-lite',
  title: 'DuckDuckGo Lite',
  supportsTimeRange: true,
  async search(context: EngineContext): Promise<WebSearchSource[]> {
    const endpoint = new URL('https://lite.duckduckgo.com/lite/')
    endpoint.searchParams.set('q', context.query)
    if (context.config.region.length > 0) endpoint.searchParams.set('kl', context.config.region)
    const filter = ddgDateFilter(timeRangeTier(context.timeRange, new Date(context.now)))
    if (filter !== undefined) endpoint.searchParams.set('df', filter)
    const html = await context.http.text(endpoint.toString(), {
      accept: 'text/html,application/xhtml+xml',
      ...context.signal === undefined ? {} : { signal: context.signal },
      deadline: context.deadline,
    })
    return parseDdgLiteHtml(html, context.maxResults)
  },
}
