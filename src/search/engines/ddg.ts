import { parse } from 'node-html-parser'
import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { extractDdgUrl, normalizeSources } from '../normalize'
import { ddgDateFilter, timeRangeTier } from '../time-range'
import type { EngineContext, SearchEngine } from './types'

/** Parse DuckDuckGo's HTML result page. */
export function parseDdgHtml(html: string, limit: number): WebSearchSource[] {
  const root = parse(html)
  const sources: WebSearchSource[] = []
  for (const block of root.querySelectorAll('.result')) {
    const link = block.querySelector('a.result__a')
    if (link === null) continue
    const url = extractDdgUrl(link.getAttribute('href'))
    if (url === undefined) continue
    const title = link.text.trim()
    const snippet = block.querySelector('.result__snippet')?.text
    sources.push({
      url,
      ...(title.length === 0 ? {} : { title }),
      ...(snippet === undefined ? {} : { snippet }),
    })
  }
  return normalizeSources(sources, limit)
}

/** DuckDuckGo HTML endpoint. */
export const ddgEngine: SearchEngine = {
  id: 'ddg',
  title: 'DuckDuckGo HTML',
  supportsTimeRange: true,
  async search(context: EngineContext): Promise<WebSearchSource[]> {
    const endpoint = new URL('https://html.duckduckgo.com/html/')
    endpoint.searchParams.set('q', context.query)
    if (context.config.region.length > 0) endpoint.searchParams.set('kl', context.config.region)
    const filter = ddgDateFilter(timeRangeTier(context.timeRange, new Date(context.now)))
    if (filter !== undefined) endpoint.searchParams.set('df', filter)
    const html = await context.http.text(endpoint.toString(), {
      accept: 'text/html,application/xhtml+xml',
      ...context.signal === undefined ? {} : { signal: context.signal },
      deadline: context.deadline,
    })
    return parseDdgHtml(html, context.maxResults)
  },
}
