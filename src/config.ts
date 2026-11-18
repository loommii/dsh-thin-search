import z from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/cordis'
import { ENGINE_IDS, normalizeEngineId, type EngineId } from './search/engines/types'
import { PLATFORM_IDS, normalizePlatformIds, type PlatformId } from './platforms/types'

/**
 * Every configuration field Thin Search exposes on its own plugin page.
 * The list is deliberately closed: legacy fields ({@code proxy}, {@code cache},
 * {@code enhanceSystemPrompt}) are not read and are not part of the schema.
 */
export const CONFIG_FIELDS = [
  'provider',
  'platforms',
  'cacheTtl',
  'searchEnhance',
  'enhanceModel',
  'enhanceSystemPromptPath',
  'bingMarket',
  'region',
  'searxngInstances',
] as const

export type ConfigField = typeof CONFIG_FIELDS[number]

/** Config references as handed to {@code apply} by the Cordis loader. */
export interface Config {
  /** Preferred free engine; one of {@link ENGINE_IDS}. */
  provider: Volatile<string>
  /** Enabled platform ids; one of {@link PLATFORM_IDS}. */
  platforms: Volatile<string[]>
  /** Result-cache lifetime in minutes; 0 disables the cache. */
  cacheTtl: Volatile<number>
  /** Whether search enhancement (an extra model call) is enabled. */
  searchEnhance: Volatile<boolean>
  /** {@code provider:model} override for enhancement; empty uses the current Agent model. */
  enhanceModel: Volatile<string>
  /** Filesystem path to a system prompt file; empty uses the built-in prompt. */
  enhanceSystemPromptPath: Volatile<string>
  /** Bing {@code mkt} market, for example {@code zh-CN}. */
  bingMarket: Volatile<string>
  /** DuckDuckGo {@code kl} region, for example {@code cn-zh}; empty leaves the default. */
  region: Volatile<string>
  /** Custom SearXNG base URLs; empty uses the built-in instance list. */
  searxngInstances: Volatile<string[]>
}

/** Schemastery schema for the plugin row. Exactly the nine agreed fields. */
export const Config = z.object({
  provider: z.string().default('bing').volatile(),
  platforms: z.array(z.string()).default([...PLATFORM_IDS]).volatile(),
  cacheTtl: z.number().min(0).default(5).volatile(),
  searchEnhance: z.boolean().default(false).volatile(),
  enhanceModel: z.string().default('').volatile(),
  enhanceSystemPromptPath: z.string().default('').volatile(),
  bingMarket: z.string().default('zh-CN').volatile(),
  region: z.string().default('').volatile(),
  searxngInstances: z.array(z.string()).default([]).volatile(),
})

/** Fully resolved config used by one operation. */
export interface ResolvedConfig {
  readonly provider: EngineId
  readonly platforms: readonly PlatformId[]
  readonly cacheTtl: number
  readonly searchEnhance: boolean
  readonly enhanceModel: string
  readonly enhanceSystemPromptPath: string
  readonly bingMarket: string
  readonly region: string
  readonly searxngInstances: readonly string[]
}

/** Defaults applied when a reference is absent or invalid. */
export const DEFAULT_CONFIG: ResolvedConfig = Object.freeze({
  provider: 'bing',
  platforms: Object.freeze([...PLATFORM_IDS]),
  cacheTtl: 5,
  searchEnhance: false,
  enhanceModel: '',
  enhanceSystemPromptPath: '',
  bingMarket: 'zh-CN',
  region: '',
  searxngInstances: Object.freeze([]),
})

/**
 * Read one field from either a Cordis volatile reference or a plain value.
 * Tests and programmatic callers use plain values; the loader passes references.
 */
function readValue<T>(value: T | Volatile<T> | undefined, fallback: T): T {
  if (value === undefined) return fallback
  if (typeof value === 'object' && value !== null && typeof (value as Volatile<T>).get === 'function') {
    const current = (value as Volatile<T>).get() as unknown as T | undefined
    return current === undefined ? fallback : current
  }
  return value as T
}

/** Clamp a cache lifetime to a non-negative whole number of minutes. */
export function normalizeCacheTtl(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.floor(numeric)
}

/** Keep only absolute http(s) SearXNG base URLs, deduplicated and slash-normalized. */
export function normalizeSearxngInstances(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const instances: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (trimmed.length === 0) continue
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      continue
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
    const normalized = trimmed.replace(/\/+$/u, '')
    if (seen.has(normalized)) continue
    seen.add(normalized)
    instances.push(normalized)
  }
  return instances
}

/** Resolve any supported config shape (references, plain object, or undefined) into one stable snapshot. */
export function snapshotConfig(source: unknown): ResolvedConfig {
  const config = (source ?? {}) as Partial<Record<ConfigField, unknown>>
  const provider = normalizeEngineId(readValue(config.provider as string | Volatile<string> | undefined, DEFAULT_CONFIG.provider))
  const platforms = normalizePlatformIds(readValue(config.platforms as string[] | Volatile<string[]> | undefined, [...DEFAULT_CONFIG.platforms]))
  return {
    provider: provider ?? DEFAULT_CONFIG.provider,
    platforms,
    cacheTtl: normalizeCacheTtl(readValue(config.cacheTtl as number | Volatile<number> | undefined, DEFAULT_CONFIG.cacheTtl)),
    searchEnhance: readValue(config.searchEnhance as boolean | Volatile<boolean> | undefined, DEFAULT_CONFIG.searchEnhance) === true,
    enhanceModel: String(readValue(config.enhanceModel as string | Volatile<string> | undefined, DEFAULT_CONFIG.enhanceModel)).trim(),
    enhanceSystemPromptPath: String(readValue(config.enhanceSystemPromptPath as string | Volatile<string> | undefined, DEFAULT_CONFIG.enhanceSystemPromptPath)).trim(),
    bingMarket: String(readValue(config.bingMarket as string | Volatile<string> | undefined, DEFAULT_CONFIG.bingMarket)).trim() || DEFAULT_CONFIG.bingMarket,
    region: String(readValue(config.region as string | Volatile<string> | undefined, DEFAULT_CONFIG.region)).trim(),
    searxngInstances: normalizeSearxngInstances(readValue(config.searxngInstances as string[] | Volatile<string[]> | undefined, [])),
  }
}

/** Result-cache lifetime in milliseconds; 0 means disabled. */
export function cacheTtlMs(config: Pick<ResolvedConfig, 'cacheTtl'>): number {
  return config.cacheTtl > 0 ? config.cacheTtl * 60_000 : 0
}

/** Whether {@code value} names one of the five free engines. */
export function isFreeEngine(value: unknown): value is EngineId {
  return typeof value === 'string' && (ENGINE_IDS as readonly string[]).includes(value)
}
