import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import { normalizeSources } from '../search/normalize'
import type { PlatformAdapter, PlatformContext } from './types'

interface NpmPackage {
  readonly name?: unknown
  readonly version?: unknown
  readonly description?: unknown
  readonly date?: unknown
  readonly links?: { readonly npm?: unknown }
}

interface NpmObject {
  readonly package?: NpmPackage
}

interface NpmResponse {
  readonly objects?: unknown
}

/** Parse the npm registry search response. */
export function parseNpmJson(payload: unknown, limit: number): WebSearchSource[] {
  const response = (payload ?? {}) as NpmResponse
  if (!Array.isArray(response.objects)) return []
  const sources: WebSearchSource[] = []
  for (const raw of response.objects as NpmObject[]) {
    const pkg = raw?.package
    if (pkg === undefined || typeof pkg.name !== 'string' || pkg.name.length === 0) continue
    const url = typeof pkg.links?.npm === 'string' ? pkg.links.npm : `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`
    const version = typeof pkg.version === 'string' ? `v${pkg.version}` : ''
    const description = typeof pkg.description === 'string' ? pkg.description : ''
    const snippet = `${version} — ${description}`.replace(/^\s*—\s*/u, '').trim()
    sources.push({
      url,
      title: pkg.name,
      ...snippet.length === 0 ? {} : { snippet: snippet.slice(0, 200) },
      ...typeof pkg.date === 'string' ? { publishedAt: pkg.date } : {},
    })
  }
  return normalizeSources(sources, limit)
}

/** npm package search through the registry search API. */
export const npmPlatform: PlatformAdapter = {
  id: 'npm',
  title: 'npm',
  async search(context: PlatformContext): Promise<WebSearchSource[]> {
    const endpoint = new URL('https://registry.npmjs.com/-/v1/search')
    endpoint.searchParams.set('text', context.query)
    endpoint.searchParams.set('size', String(context.maxResults))
    const payload = await context.http.json<unknown>(endpoint.toString(), {
      accept: 'application/json',
      ...context.signal === undefined ? {} : { signal: context.signal },
      deadline: context.deadline,
    })
    return parseNpmJson(payload, context.maxResults)
  },
}
