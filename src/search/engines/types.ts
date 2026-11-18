import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import type { ResolvedConfig } from '../../config'
import type { HttpClient } from '../http'
import type { TimeRange } from '../time-range'

/** The five free engines, in their default fallback order: Bing, AnySearch, SearXNG, DDG, DDG Lite. */
export const ENGINE_IDS = ['bing', 'anysearch', 'searxng', 'ddg', 'ddg-lite'] as const

export type EngineId = typeof ENGINE_IDS[number]

/** Human-readable engine names used in notes and diagnostics. */
export const ENGINE_TITLES: Readonly<Record<EngineId, string>> = Object.freeze({
  bing: 'Bing',
  anysearch: 'AnySearch',
  searxng: 'SearXNG',
  ddg: 'DuckDuckGo HTML',
  'ddg-lite': 'DuckDuckGo Lite',
})

/** Inputs shared by every engine implementation. */
export interface EngineContext {
  readonly query: string
  readonly maxResults: number
  readonly timeRange?: TimeRange
  readonly config: ResolvedConfig
  readonly http: HttpClient
  readonly signal?: AbortSignal
  /** Absolute epoch deadline for this engine; retries and instance loops must stay inside it. */
  readonly deadline: number
  /** Epoch milliseconds captured at the start of the search, for date-relative tier mapping. */
  readonly now: number
}

/** One search backend. Implementations return normalized sources and must honor {@link EngineContext.deadline}. */
export interface SearchEngine {
  readonly id: EngineId
  readonly title: string
  /** Whether the backend maps a time window to a native filter. */
  readonly supportsTimeRange: boolean
  search(context: EngineContext): Promise<WebSearchSource[]>
}

/** Normalize an engine id, returning undefined for unknown values. */
export function normalizeEngineId(value: unknown): EngineId | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return (ENGINE_IDS as readonly string[]).includes(normalized) ? normalized as EngineId : undefined
}

/** Whether an engine id has native time filtering. */
export function supportsTimeRange(id: EngineId): boolean {
  return id === 'searxng' || id === 'ddg' || id === 'ddg-lite'
}
