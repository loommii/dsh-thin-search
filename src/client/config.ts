/**
 * Thin Search client configuration model: the fields the bundle settings card
 * exposes, their defaults, and the per-field write mapping the ConfigForm
 * receives. Every setting is a profile-scoped ConfigForms field.
 *
 * Nothing here talks to the Host: the runtime holds
 * `configForms.get('thin-search')` and writes one field at a time as the user
 * picks a value.
 * @module dsh-thin-search/client/config
 */

/** Settings namespace the plugin row declares in `cordis.patch.yml`. */
export const THIN_SEARCH_NAMESPACE = 'thin-search'

/** Settings namespace the web capability owns; its `searchProvider` selects the backend. */
export const WEB_NAMESPACE = 'web'

/** Slot a bundle's own configuration registers into on its bundle page. */
export const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config'

/** The keyed slot key is the bundle package name. */
export const BUNDLE_CONFIG_KEY = 'dsh-thin-search'

/** Client command that switches the preferred free engine. */
export const COMMAND_NAME = 'thin-search-engine'

/** Locale namespace owned by this client plugin. */
export const LOCALE_NAMESPACE = 'thin-search'

/** `web` settings field the global provider switch writes. */
export const SEARCH_PROVIDER_FIELD = 'searchProvider'

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

/**
 * Whether text looks like an absolute path on any platform the client runs on:
 * `~/` (expanded by the Host), a POSIX `/` root, a Windows drive root, or a
 * UNC share. The Host still decides whether the path exists for its platform.
 * @param value - path text to test.
 * @returns true for an absolute-looking path, false for a relative one.
 */
export function isAbsoluteLikePath(value: string): boolean {
  const path = value.trim()
  return path.startsWith('~/')
    || path.startsWith('/')
    || /^[A-Za-z]:[\\/]/u.test(path)
    || /^\\\\[^\\]/u.test(path)
}

/** The bundle settings section as the client reads it. */
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

/**
 * Validate one field value before it reaches the Host. The card writes a
 * single field at a time, so each write is checked on its own.
 * @param field - draft field being written.
 * @param value - proposed value.
 * @returns the localized error key, or undefined when the value is usable.
 */
export function validateSetting(field: keyof Draft, value: unknown): DraftError | undefined {
  if (field === 'cacheTtl') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? undefined
      : { key: 'validation.cacheTtl' }
  }
  if (field === 'enhanceSystemPromptPath') {
    const path = typeof value === 'string' ? value.trim() : ''
    return path === '' || isAbsoluteLikePath(path)
      ? undefined
      : { key: 'validation.enhanceSystemPromptPath' }
  }
  if (field === 'searxngText') {
    const { invalid } = parseSearxngInstances(typeof value === 'string' ? value : '')
    return invalid.length === 0 ? undefined : { key: 'validation.searxng', params: { entries: invalid.join(', ') } }
  }
  return undefined
}

/** One Host field write produced from one draft field. */
export interface SettingWrite {
  /** Host ConfigForm field name. */
  readonly field: string
  /** Host ConfigForm value. */
  readonly value: unknown
}

/**
 * Map one card control write onto the ConfigForm field/value pair. The
 * SearXNG textarea becomes the instance array; every other field keeps its
 * own name. Text values are trimmed; platform ids are canonicalized.
 * @param field - draft field being written.
 * @param value - proposed value.
 * @returns the Host field and value.
 */
export function settingWrite(field: keyof Draft, value: unknown): SettingWrite {
  if (field === 'searxngText') {
    return { field: 'searxngInstances', value: parseSearxngInstances(typeof value === 'string' ? value : '').instances }
  }
  if (field === 'platforms') {
    return { field: 'platforms', value: canonicalPlatforms(Array.isArray(value) ? value as string[] : []) }
  }
  if (field === 'enhanceModel' || field === 'enhanceSystemPromptPath' || field === 'bingMarket' || field === 'region') {
    return { field, value: typeof value === 'string' ? value.trim() : '' }
  }
  return { field, value }
}
