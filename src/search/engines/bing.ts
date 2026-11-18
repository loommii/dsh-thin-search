import { parse } from 'node-html-parser'
import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { normalizeSources, sanitizeUrl } from '../normalize'
import type { EngineContext, SearchEngine } from './types'

/** Parse a Bing result page into normalized sources. */
export function parseBingHtml(html: string, limit: number): WebSearchSource[] {
  const root = parse(html)
  const sources: WebSearchSource[] = []
  for (const block of root.querySelectorAll('li.b_algo')) {
    const link = block.querySelector('h2 a') ?? block.querySelector('a')
    const url = sanitizeUrl(link?.getAttribute('href'))
    if (url === undefined) continue
    const title = link?.text.trim()
    const snippet = block.querySelector('.b_caption p')?.text ?? block.querySelector('p')?.text
    sources.push({
      url,
      ...(title === undefined || title.length === 0 ? {} : { title }),
      ...(snippet === undefined ? {} : { snippet }),
    })
  }
  return normalizeSources(sources, limit)
}

/** Bing HTML search, the default free engine. */
export const bingEngine: SearchEngine = {
  id: 'bing',
  title: 'Bing',
  supportsTimeRange: false,
  async search(context: EngineContext): Promise<WebSearchSource[]> {
    const endpoint = new URL('https://www.bing.com/search')
    endpoint.searchParams.set('q', context.query)
    endpoint.searchParams.set('mkt', context.config.bingMarket)
    const html = await context.http.text(endpoint.toString(), {
      accept: 'text/html,application/xhtml+xml',
      ...context.signal === undefined ? {} : { signal: context.signal },
      deadline: context.deadline,
    })
    return parseBingHtml(html, context.maxResults)
  },
}
