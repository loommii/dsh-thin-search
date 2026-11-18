import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import type { ResolvedConfig } from '../config'
import type { HttpClient } from '../search/http'

/** Platform ids supported by the {@code platform_search} tool. */
export const PLATFORM_IDS = [
  'github',
  'v2ex',
  'bilibili',
  'reddit',
  'hn',
  'stackoverflow',
  'wikipedia',
  'npm',
] as const

export type PlatformId = typeof PLATFORM_IDS[number]

/** Display metadata and known limitations for one platform adapter. */
export interface PlatformInfo {
  readonly id: PlatformId
  readonly title: string
  /** Limitation shown in tool and prompt descriptions. */
  readonly limitation?: string
}

/** Inputs for one platform search. */
export interface PlatformContext {
  readonly query: string
  readonly maxResults: number
  readonly config: ResolvedConfig
  readonly http: HttpClient
  readonly signal?: AbortSignal
  /** Absolute epoch deadline shared by every request of this search. */
  readonly deadline: number
}

/** One platform backend. */
export interface PlatformAdapter extends PlatformInfo {
  search(context: PlatformContext): Promise<WebSearchSource[]>
}

/** Keep only known platform ids, deduplicated, preserving registration order. */
export function normalizePlatformIds(value: unknown): PlatformId[] {
  if (!Array.isArray(value)) return [...PLATFORM_IDS]
  const requested = new Set(value.filter((entry): entry is string => typeof entry === 'string'))
  return PLATFORM_IDS.filter(id => requested.has(id))
}

/** Whether {@code value} names a supported platform. */
export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === 'string' && (PLATFORM_IDS as readonly string[]).includes(value)
}
