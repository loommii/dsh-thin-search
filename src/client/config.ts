/**
 * Thin Search client configuration model: the fields the plugin row exposes,
 * their defaults, and the pure draft -> settings-operation mapping the page
 * saves through the owner form's `mutate`.
 *
 * Nothing here talks to the Host: the page receives the accepted section from
 * `plugins.row.config` owner props and writes it back as path operations.
 * @module dsh-thin-search/client/config
 */
import type { SettingsPathOp } from './types'

export type { SettingsPathOp } from './types'

/** Settings namespace the plugin row declares in `cordis.patch.yml`. */
export const THIN_SEARCH_NAMESPACE = 'thin-search'

/** Settings namespace the web capability owns; its `searchProvider` selects the backend. */
export const WEB_NAMESPACE = 'web'

/** Slot a bundle's row configuration registers into. */
export const ROW_CONFIG_SLOT = 'plugins.row.config'

/** Key joining this bundle's package name and the row id the patch declares. */
export const ROW_CONFIG_KEY = 'dsh-thin-search#thin-search'

/** Client command that switches the preferred free engine. */
export const COMMAND_NAME = 'thin-search-engine'

/** Locale namespace owned by this client plugin. */
export const LOCALE_NAMESPACE = 'thin-search'

/** `web` settings field the global provider switch writes. */
export const SEARCH_PROVIDER_FIELD = 'searchProvider'

/** Thin Search settings field the preferred-engine switch writes. */
export const ENGINE_FIELD = 'provider'

/** Free engines in fallback order; the first one is the default. */
export const ENGINE_IDS = ['bing', 'anysearch', 'searxng', 'ddg', 'ddg-lite'] as const

/** One free engine id. */
export type EngineId = typeof ENGINE_IDS[number]

/** Default engine, matching the Host schema. */
export const DEFAULT_ENGINE: EngineId = 'bing'

/** Platform adapters the plugin ships, in the Host's default order. */
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

/** One platform adapter id. */
export type PlatformId = typeof PLATFORM_IDS[number]

/** Whether `value` names a free engine this client can offer. */
export function isEngineId(value: unknown): value is EngineId {
  return typeof value === 'string' && (ENGINE_IDS as readonly string[]).includes(value)
}

/** Whether `value` names a platform adapter the plugin ships. */
export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === 'string' && (PLATFORM_IDS as readonly string[]).includes(value)
}

/** The plugin row's accepted section as the client reads it. */
export interface ThinSearchValues {
  readonly provider?: string
  readonly platforms?: readonly string[]
  readonly cacheTtl?: number
  readonly searchEnhance?: boolean
  readonly enhanceModel?: string
  readonly enhanceSystemPromptPath?: string
  readonly bingMarket?: string
  readonly region?: string
  readonly searxngInstances?: readonly string[]
}

/** The web namespace fields this page reads. */
export interface WebSelection {
  readonly searchProvider?: string
  readonly fetchProvider?: string
}

/** Editable page state: every field the page can save, with the SearXNG list as text. */
export interface Draft {
  /** First engine Thin Search tries. */
  provider: EngineId
  /** Enabled platform adapters. */
  platforms: PlatformId[]
  /** Result-cache lifetime in minutes; 0 disables the cache. */
  cacheTtl: number
  /** Whether search enhancement is enabled. */
  searchEnhance: boolean
  /** `provider:model` override for enhancement; empty uses the Agent model. */
  enhanceModel: string
  /** System prompt file path; empty uses the built-in prompt. */
  enhanceSystemPromptPath: string
  /** Bing market. */
  bingMarket: string
  /** DuckDuckGo region. */
  region: string
  /** Custom SearXNG base URLs, one per line. */
  searxngText: string
}

/** Defaults used when an accepted section omits a field. These mirror the Host schema. */
export const DEFAULT_DRAFT: Draft = Object.freeze({
  provider: DEFAULT_ENGINE,
  platforms: Object.freeze([...PLATFORM_IDS]) as PlatformId[],
  cacheTtl: 5,
  searchEnhance: false,
  enhanceModel: '',
  enhanceSystemPromptPath: '',
  bingMarket: 'zh-CN',
  region: '',
  searxngText: '',
})

/** Error keys the page localizes through `ctx.locale`; no copy lives in the model. */
export type DraftErrorKey =
  | 'validation.cacheTtl'
  | 'validation.enhanceSystemPromptPath'
  | 'validation.searxng'

/** One localized field error. */
export interface DraftError {
  readonly key: DraftErrorKey
  readonly params?: Readonly<Record<string, string>>
}

/** Keep platform ids in the Host's canonical order, without duplicates. */
export function canonicalPlatforms(value: readonly string[]): PlatformId[] {
  const selected = new Set(value)
  return PLATFORM_IDS.filter((id) => selected.has(id))
}

/** Split a SearXNG textarea into normalized entries and the lines that are not absolute http(s) URLs. */
export function parseSearxngInstances(text: string): { instances: string[]; invalid: string[] } {
  const instances: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/u)) {
    const entry = raw.trim()
    if (entry.length === 0) continue
    let url: URL
    try {
      url = new URL(entry)
    } catch {
      invalid.push(entry)
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      invalid.push(entry)
      continue
    }
    const normalized = entry.replace(/\/+$/u, '')
    if (seen.has(normalized)) continue
    seen.add(normalized)
    instances.push(normalized)
  }
  return { instances, invalid }
}

/** Read one string field, trimmed, with a fallback when it is absent. */
function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback
}

/** Read one non-negative whole-number field. */
function readCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

/** Turn an accepted Host section into the page's editable draft. */
export function normalizeDraft(value: unknown): Draft {
  const section = (typeof value === 'object' && value !== null ? value : {}) as ThinSearchValues
  const platforms = Array.isArray(section.platforms)
    ? section.platforms.filter(isPlatformId)
    : [...DEFAULT_DRAFT.platforms]
  const instances = Array.isArray(section.searxngInstances)
    ? section.searxngInstances.filter((entry): entry is string => typeof entry === 'string')
    : []
  return {
    provider: isEngineId(section.provider) ? section.provider : DEFAULT_DRAFT.provider,
    platforms: canonicalPlatforms(platforms),
    cacheTtl: readCount(section.cacheTtl, DEFAULT_DRAFT.cacheTtl),
    searchEnhance: section.searchEnhance === true,
    enhanceModel: readString(section.enhanceModel, DEFAULT_DRAFT.enhanceModel),
    enhanceSystemPromptPath: readString(section.enhanceSystemPromptPath, DEFAULT_DRAFT.enhanceSystemPromptPath),
    bingMarket: readString(section.bingMarket, DEFAULT_DRAFT.bingMarket),
    region: readString(section.region, DEFAULT_DRAFT.region),
    searxngText: instances.join('\n'),
  }
}

/** Whether two ordered string lists carry the same entries. */
function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index])
}

/** Validate the draft before it reaches the Host. */
export function validateDraft(draft: Draft): DraftError[] {
  const errors: DraftError[] = []
  if (!Number.isInteger(draft.cacheTtl) || draft.cacheTtl < 0) errors.push({ key: 'validation.cacheTtl' })
  const path = draft.enhanceSystemPromptPath.trim()
  if (path !== '' && !path.startsWith('~/') && !path.startsWith('/')) {
    errors.push({ key: 'validation.enhanceSystemPromptPath' })
  }
  const { invalid } = parseSearxngInstances(draft.searxngText)
  if (invalid.length > 0) errors.push({ key: 'validation.searxng', params: { entries: invalid.join(', ') } })
  return errors
}

/**
 * Compare the draft with the accepted section and return only the writes that
 * changed. Fields compare in their normalized form so an untouched field never
 * produces a write.
 */
export function draftOps(draft: Draft, accepted: unknown): SettingsPathOp[] {
  const base = normalizeDraft(accepted)
  const ops: SettingsPathOp[] = []
  if (draft.provider !== base.provider) {
    ops.push({ op: 'set', path: [ENGINE_FIELD], value: draft.provider })
  }
  const platforms = canonicalPlatforms(draft.platforms)
  if (!sameList(platforms, base.platforms)) {
    ops.push({ op: 'set', path: ['platforms'], value: platforms })
  }
  if (draft.cacheTtl !== base.cacheTtl) {
    ops.push({ op: 'set', path: ['cacheTtl'], value: draft.cacheTtl })
  }
  if (draft.searchEnhance !== base.searchEnhance) {
    ops.push({ op: 'set', path: ['searchEnhance'], value: draft.searchEnhance })
  }
  const model = draft.enhanceModel.trim()
  if (model !== base.enhanceModel) {
    ops.push({ op: 'set', path: ['enhanceModel'], value: model })
  }
  const promptPath = draft.enhanceSystemPromptPath.trim()
  if (promptPath !== base.enhanceSystemPromptPath) {
    ops.push({ op: 'set', path: ['enhanceSystemPromptPath'], value: promptPath })
  }
  const bingMarket = draft.bingMarket.trim()
  if (bingMarket !== base.bingMarket) {
    ops.push({ op: 'set', path: ['bingMarket'], value: bingMarket })
  }
  const region = draft.region.trim()
  if (region !== base.region) {
    ops.push({ op: 'set', path: ['region'], value: region })
  }
  const { instances } = parseSearxngInstances(draft.searxngText)
  if (!sameList(instances, parseSearxngInstances(base.searxngText).instances)) {
    ops.push({ op: 'set', path: ['searxngInstances'], value: instances })
  }
  return ops
}
