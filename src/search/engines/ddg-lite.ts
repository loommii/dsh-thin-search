import { parse } from 'node-html-parser'
import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { extractDdgUrl, normalizeSources } from '../normalize'
import { ddgDateFilter, normalizePublishedDate, timeRangeTier } from '../time-range'
import type { EngineContext, SearchEngine } from './types'

/** Parse DuckDuckGo Lite's table-based result page. */
export function parseDdgLiteHtml(html: string, limit: number): WebSearchSource[] {
  const root = parse(html)
  const links = root.querySelectorAll('a.result-link')
  const snippets = root.querySelectorAll('td.result-snippet')
  const timestamps = root.querySelectorAll('.result-timestamp')
  const sources: WebSearchSource[] = []
  links.forEach((link, index) => {
    const url = extractDdgUrl(link.getAttribute('href'))
    if (url === undefined) return
    const title = link.text.trim()
    const snippet = snippets[index]?.text
    const publishedAt = normalizePublishedDate(timestamps[index]?.text)
    sources.push({
      url,
      ...(title.length === 0 ? {} : { title }),
      ...(snippet === undefined ? {} : { snippet }),
      ...(publishedAt === undefined ? {} : { publishedAt }),
    })
  })
  return normalizeSources(sources, limit)
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
