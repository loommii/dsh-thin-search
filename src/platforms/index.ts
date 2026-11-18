import { bilibiliPlatform } from './bilibili'
import { githubPlatform } from './github'
import { hackerNewsPlatform } from './hn'
import { npmPlatform } from './npm'
import { redditPlatform } from './reddit'
import { stackOverflowPlatform } from './stackoverflow'
import { v2exPlatform } from './v2ex'
import { wikipediaPlatform } from './wikipedia'
import type { PlatformAdapter, PlatformContext, PlatformId } from './types'
import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import type { ResolvedConfig } from '../config'
import type { HttpClient } from '../search/http'

/** All eight platform adapters in display order. */
export const PLATFORMS: readonly PlatformAdapter[] = Object.freeze([
  githubPlatform,
  v2exPlatform,
  bilibiliPlatform,
  redditPlatform,
  hackerNewsPlatform,
  stackOverflowPlatform,
  wikipediaPlatform,
  npmPlatform,
])

/** Platform lookup keyed by id. */
export const PLATFORM_MAP: ReadonlyMap<PlatformId, PlatformAdapter> = new Map(PLATFORMS.map(platform => [platform.id, platform]))

/** Resolve one platform adapter. */
export function getPlatform(id: PlatformId): PlatformAdapter {
  const platform = PLATFORM_MAP.get(id)
  if (platform === undefined) throw new Error(`unknown platform: ${id}`)
  return platform
}

/** Inputs for the shared platform-search service. */
export interface PlatformSearchServiceOptions {
  readonly http: HttpClient
  readonly getConfig: () => ResolvedConfig
  readonly timeoutMs?: number
  readonly now?: () => number
}

/** Shared platform search used by the {@code platform_search} tool. */
export interface PlatformSearchService {
  search(platform: PlatformId, query: string, maxResults: number, signal?: AbortSignal): Promise<WebSearchSource[]>
}

/** Create the platform-search service with one deadline shared by the adapter's requests. */
export function createPlatformSearchService(options: PlatformSearchServiceOptions): PlatformSearchService {
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? 12_000
  return {
    async search(platform, query, maxResults, signal) {
      const adapter = getPlatform(platform)
      const limit = Math.min(Math.max(Math.trunc(maxResults), 1), 10)
      const context: PlatformContext = {
        query: query.trim(),
        maxResults: limit,
        config: options.getConfig(),
        http: options.http,
        ...signal === undefined ? {} : { signal },
        deadline: now() + timeoutMs,
      }
      return await adapter.search(context)
    },
  }
}

export { PLATFORM_IDS, isPlatformId } from './types'
export type { PlatformAdapter, PlatformContext, PlatformId } from './types'
