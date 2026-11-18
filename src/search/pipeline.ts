/** Engine chain, fallback, result cache and normalization for the Thin Search provider. */
import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import type { EnhanceFunction, EnhanceOutcome } from '../enhance'
import { cacheTtlMs, type ResolvedConfig } from '../config'
import { ResultCache } from './cache'
import { ENGINES, createEngineMap } from './engines'
import type { EngineContext, EngineId, SearchEngine } from './engines/types'
import type { HttpClient, LoggerLike } from './http'
import { joinNotes, normalizeSources } from './normalize'
import { parseTimeRange, timeRangeLabel, timeRangeKey, type TimeRange } from './time-range'

/** Request accepted by the pipeline; extends the public web request with time and engine hints. */
export interface PipelineRequest extends WebSearchRequest {
  /** Fixed tier, relative duration, or absolute date. */
  readonly timeRange?: string | TimeRange
  /** Engine to try first; the configured provider when absent. */
  readonly engine?: string
}

/** Result returned by the pipeline. Extra fields are consumed by the advanced-search tool. */
export interface PipelineResult extends WebSearchResult {
  /** Engine that produced the sources. */
  readonly engine: EngineId
  /** Whether this result came from the result cache. */
  readonly cached: boolean
  /** Enhancement detail when the model rewrote the query. */
  readonly enhanced?: { readonly original: string; readonly query: string }
}

/** Structural pipeline surface consumed by tools and the provider facade. */
export interface PipelineLike {
  search(request: PipelineRequest, signal?: AbortSignal): Promise<PipelineResult>
  testEngine(engineId: EngineId, request: PipelineRequest, signal?: AbortSignal): Promise<EngineTestResult>
}

/** Outcome of a single-engine diagnostic run. */
export interface EngineTestResult {
  readonly engine: EngineId
  readonly ok: boolean
  readonly sources: readonly WebSearchSource[]
  readonly error?: string
}

export interface SearchPipelineOptions {
  /** Current resolved config; read once per search. */
  readonly getConfig: () => ResolvedConfig
  /** Shared HTTP client used by every engine. */
  readonly http: HttpClient
  /** Engine overrides for tests. */
  readonly engines?: readonly SearchEngine[]
  /** Result cache; tests inject a clock-bound instance. */
  readonly cache?: ResultCache<PipelineResult>
  /** Optional enhancement step; when absent, {@code searchEnhance} is a no-op. */
  readonly enhance?: EnhanceFunction
  readonly logger?: LoggerLike
  readonly now?: () => number
  /** Total wall-clock budget for one search across every engine. */
  readonly totalBudgetMs?: number
  /** Timeout for one engine attempt. */
  readonly engineTimeoutMs?: number
}

const DEFAULT_TOTAL_BUDGET_MS = 35_000
const DEFAULT_ENGINE_TIMEOUT_MS = 12_000
/**
 * Fair-share floor for one engine when {@code engineTimeoutMs >= MIN_ENGINE_BUDGET_MS}.
 * It is not a universal tail guarantee: a remaining total below this value wins
 * (so the search never exceeds {@code totalBudgetMs}), and a configured
 * engine timeout below this value is authoritative instead.
 */
export const MIN_ENGINE_BUDGET_MS = 6_000
const DEFAULT_MAX_RESULTS = 5
const MAX_RESULTS_LIMIT = 10

/**
 * Split the remaining total budget fairly across the engines still to try:
 * {@code floor(remaining / remainingEngines)}, clamped to
 * [{@link MIN_ENGINE_BUDGET_MS}, engineTimeoutMs], and never above the
 * remaining total budget.
 *
 * The MIN floor is conditional. The tail-engine guarantee holds only when
 * {@code totalBudgetMs >= chainLength * MIN_ENGINE_BUDGET_MS} and
 * {@code engineTimeoutMs >= MIN_ENGINE_BUDGET_MS}; under those conditions every
 * engine is attempted and each reached engine gets at least MIN. The default
 * engineTimeoutMs is 12000, above the 6000 floor. This does not make every
 * engine reachable for every budget: when
 * {@code totalBudgetMs < chainLength * MIN_ENGINE_BUDGET_MS} (for example
 * 5 engines / 10 s), budgets degrade to {@code [6000, 4000, 0, 0, 0]} and the
 * later engines are not attempted, because the total wall-clock cap wins. A
 * longer chain likewise ends below MIN once the remaining budget runs out
 * (6 engines / 35 s gives a 5000 ms tail). engineTimeoutMs is a hard cap; when
 * {@code engineTimeoutMs < MIN_ENGINE_BUDGET_MS}, the configured engine timeout
 * is authoritative and the floor never raises it (for example 5000 ms stays
 * 5000 ms).
 */
export function computeEngineBudget(
  remainingBudgetMs: number,
  remainingEngines: number,
  engineTimeoutMs: number,
): number {
  if (!Number.isFinite(remainingBudgetMs) || remainingBudgetMs <= 0) return 0
  if (!Number.isFinite(remainingEngines) || remainingEngines < 1) return Math.min(remainingBudgetMs, engineTimeoutMs)
  const fairShare = Math.floor(remainingBudgetMs / remainingEngines)
  const bounded = Math.min(engineTimeoutMs, Math.max(MIN_ENGINE_BUDGET_MS, fairShare))
  return Math.max(0, Math.min(remainingBudgetMs, bounded))
}

/** Clamp a requested result count into the range the free engines support. */
export function clampMaxResults(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_RESULTS
  return Math.min(Math.max(Math.trunc(value), 1), MAX_RESULTS_LIMIT)
}

/** Live config values that change engine results or enhancement output. */
export type CacheKeyConfig = Pick<
  ResolvedConfig,
  'bingMarket' | 'region' | 'searxngInstances' | 'searchEnhance' | 'enhanceModel' | 'enhanceSystemPromptPath'
>

/** Stable fingerprint of the engine-affecting config, joined into every cache key. */
export function configCacheKey(config: CacheKeyConfig): string {
  return [
    config.bingMarket,
    config.region,
    JSON.stringify([...config.searxngInstances]),
    config.searchEnhance ? 'enhance:on' : 'enhance:off',
    config.enhanceModel,
    config.enhanceSystemPromptPath,
  ].join('\u0001')
}

/** Stable cache key from the request and live config, computed before enhancement. */
export function buildCacheKey(
  query: string,
  maxResults: number,
  timeRange: TimeRange | undefined,
  engine: EngineId,
  config: CacheKeyConfig,
): string {
  return [
    query.trim().toLowerCase(),
    maxResults,
    timeRangeKey(timeRange),
    engine,
    configCacheKey(config),
  ].join('\u0000')
}

/**
 * Build the fallback chain. Without a time window the preferred engine leads.
 * With a time window, time-capable engines lead (preferred first when capable),
 * because Bing and AnySearch cannot apply the filter.
 */
export function buildEngineChain(
  preferred: EngineId,
  timeRange: TimeRange | undefined,
  available: readonly SearchEngine[],
): EngineId[] {
  const preferredEngine = available.find(engine => engine.id === preferred)
  if (preferredEngine === undefined) {
    if (timeRange === undefined) return available.map(engine => engine.id)
    return [
      ...available.filter(engine => engine.supportsTimeRange).map(engine => engine.id),
      ...available.filter(engine => !engine.supportsTimeRange).map(engine => engine.id),
    ]
  }
  if (timeRange === undefined) {
    return [preferred, ...available.filter(engine => engine.id !== preferred).map(engine => engine.id)]
  }
  return [
    ...preferredEngine.supportsTimeRange ? [preferred] : [],
    ...available
      .filter(engine => engine.id !== preferred && engine.supportsTimeRange)
      .map(engine => engine.id),
    ...available.filter(engine => !engine.supportsTimeRange).map(engine => engine.id),
  ]
}

function abortError(signal: AbortSignal | undefined): WebError {
  return new WebError('search aborted', 'WEB_ABORTED', { cause: signal?.reason })
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw abortError(signal)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Race one engine operation against its own timeout/abort signal. */
function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => undefined)
    return Promise.reject(new Error('engine aborted'))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort)
      reject(new Error('engine aborted'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/** The provider pipeline: cache → optional enhancement → engine fallback → cache store. */
export class SearchPipeline {
  private readonly engines: ReadonlyMap<EngineId, SearchEngine>
  private readonly engineList: readonly SearchEngine[]
  private readonly cache: ResultCache<PipelineResult>
  private readonly enhance: EnhanceFunction | undefined
  private readonly logger: LoggerLike | undefined
  private readonly now: () => number
  private readonly totalBudgetMs: number
  private readonly engineTimeoutMs: number

  constructor(private readonly options: SearchPipelineOptions) {
    this.engineList = options.engines ?? ENGINES
    this.engines = createEngineMap(this.engineList)
    this.cache = options.cache ?? new ResultCache<PipelineResult>()
    this.enhance = options.enhance
    this.logger = options.logger
    this.now = options.now ?? Date.now
    this.totalBudgetMs = options.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS
    this.engineTimeoutMs = options.engineTimeoutMs ?? DEFAULT_ENGINE_TIMEOUT_MS
  }

  /**
   * Run one engine under its own timeout signal. The signal is also handed to the
   * engine so its HTTP requests abort at the same deadline.
   */
  private async runEngine(
    engine: SearchEngine,
    context: Omit<EngineContext, 'signal'>,
    callerSignal: AbortSignal | undefined,
  ): Promise<WebSearchSource[]> {
    const controller = new AbortController()
    let timedOut = false
    const budget = Math.max(1, context.deadline - this.now())
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort(new Error('engine timeout'))
    }, budget)
    const onCallerAbort = (): void => { controller.abort(callerSignal?.reason) }
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true })
    try {
      return await raceWithAbort(engine.search({ ...context, signal: controller.signal }), controller.signal)
    } catch (error: unknown) {
      if (callerSignal?.aborted === true) throw abortError(callerSignal)
      if (timedOut) throw new Error(`engine "${engine.id}" timed out after ${budget}ms`)
      throw error
    } finally {
      clearTimeout(timer)
      callerSignal?.removeEventListener('abort', onCallerAbort)
    }
  }

  /** Run one search through cache, enhancement and the engine chain. */
  async search(request: PipelineRequest, signal?: AbortSignal): Promise<PipelineResult> {
    throwIfAborted(signal)
    const query = typeof request.query === 'string' ? request.query.trim() : ''
    if (query.length === 0) {
      throw new WebError('search query is required', 'WEB_INVALID_REQUEST')
    }
    const config = this.options.getConfig()
    const maxResults = clampMaxResults(request.maxResults)
    const timeRange = parseTimeRange(request.timeRange)
    const preferred = (typeof request.engine === 'string' ? request.engine.trim().toLowerCase() : '') as EngineId
    const preferredId = this.engines.has(preferred) ? preferred : config.provider
    const ttl = cacheTtlMs(config)
    const cacheKey = buildCacheKey(query, maxResults, timeRange, preferredId, config)

    // The cache is consulted before enhancement: a hit never calls the model.
    if (ttl > 0) {
      const hit = this.cache.get(cacheKey)
      if (hit !== undefined) return { ...hit, cached: true, sources: [...hit.sources] }
    }

    let effectiveQuery = query
    let enhancement: EnhanceOutcome | undefined
    if (config.searchEnhance && this.enhance !== undefined) {
      enhancement = await this.enhance(query, signal)
      throwIfAborted(signal)
      if (enhancement.enhanced) {
        effectiveQuery = enhancement.query
      } else if (enhancement.error !== undefined) {
        this.logger?.warn(`thin-search: enhancement skipped: ${enhancement.error}`)
      }
    }

    const chain = buildEngineChain(preferredId, timeRange, this.engineList)
    const startedAt = this.now()
    const totalDeadline = startedAt + this.totalBudgetMs
    const failures = new Map<EngineId, string>()
    let lastError: string | undefined
    let timedOut = false

    for (const [index, engineId] of chain.entries()) {
      throwIfAborted(signal)
      const remaining = totalDeadline - this.now()
      if (remaining <= 0) {
        timedOut = true
        break
      }
      const engine = this.engines.get(engineId)
      if (engine === undefined) continue
      const remainingEngines = chain.length - index
      const budget = computeEngineBudget(remaining, remainingEngines, this.engineTimeoutMs)
      const engineDeadline = Math.min(totalDeadline, this.now() + budget)
      const context: EngineContext = {
        query: effectiveQuery,
        maxResults,
        ...timeRange === undefined ? {} : { timeRange },
        config,
        http: this.options.http,
        deadline: engineDeadline,
        now: startedAt,
      }
      try {
        const sources = await this.runEngine(engine, context, signal)
        throwIfAborted(signal)
        if (sources.length === 0) {
          lastError = `${engineId} returned 0 results`
          failures.set(engineId, lastError)
          this.logger?.warn(`thin-search: ${engineId} returned 0 results; trying the next engine`)
          continue
        }
        const normalized = normalizeSources(sources, maxResults)
        if (normalized.length === 0) {
          lastError = `${engineId} returned no valid http(s) sources`
          failures.set(engineId, lastError)
          continue
        }
        const preferredEngine = this.engines.get(preferredId)
        const preferredFailure = engineId === preferredId
          ? undefined
          : failures.get(preferredId) ?? (timeRange !== undefined && preferredEngine !== undefined && !preferredEngine.supportsTimeRange
            ? `does not support time filtering (${timeRangeLabel(timeRange)})`
            : 'unavailable')
        const timeFilterNote = timeRange !== undefined && !engine.supportsTimeRange
          ? `Note: ${engineId} does not support time filtering (${timeRangeLabel(timeRange)}); results are not time-filtered.`
          : undefined
        const content = joinNotes([
          enhancement?.enhanced === true
            ? `[enhanced] "${enhancement.original ?? query}" -> "${enhancement.query}"`
            : undefined,
          preferredFailure === undefined ? undefined : `Note: ${preferredId} ${preferredFailure}; used ${engineId}.`,
          timeFilterNote,
        ])
        const result: PipelineResult = {
          sources: normalized,
          truncated: false,
          engine: engineId,
          cached: false,
          ...enhancement?.enhanced === true
            ? { enhanced: { original: enhancement.original ?? query, query: enhancement.query } }
            : {},
          ...content === undefined ? {} : { content },
        }
        if (ttl > 0) this.cache.set(cacheKey, result, ttl)
        return result
      } catch (error: unknown) {
        throwIfAborted(signal)
        const message = errorMessage(error)
        failures.set(engineId, message)
        lastError = message
        this.logger?.warn(`thin-search: engine "${engineId}" failed (${message}); trying the next engine`)
      }
    }

    if (timedOut) {
      throw new WebError(
        `search timed out after ${Math.round(this.totalBudgetMs / 1000)}s across ${chain.length} engines`,
        'WEB_PROVIDER_ERROR',
        lastError === undefined ? undefined : { cause: new Error(lastError) },
      )
    }
    const detail = [...failures.entries()].map(([id, message]) => `${id}: ${message}`).join('; ')
    throw new WebError(
      `all free search engines failed${detail.length === 0 ? '' : `: ${detail}`}`,
      'WEB_PROVIDER_ERROR',
    )
  }

  /**
   * Run exactly one engine, without cache, enhancement, or fallback. Used by the
   * {@code free_search_test} diagnostic tool; cancellation still propagates.
   */
  async testEngine(engineId: EngineId, request: PipelineRequest, signal?: AbortSignal): Promise<EngineTestResult> {
    throwIfAborted(signal)
    const query = typeof request.query === 'string' ? request.query.trim() : ''
    if (query.length === 0) throw new WebError('search query is required', 'WEB_INVALID_REQUEST')
    const engine = this.engines.get(engineId)
    if (engine === undefined) return { engine: engineId, ok: false, sources: [], error: `unknown engine: ${engineId}` }
    const config = this.options.getConfig()
    const timeRange = parseTimeRange(request.timeRange)
    const startedAt = this.now()
    const context: EngineContext = {
      query,
      maxResults: clampMaxResults(request.maxResults),
      ...timeRange === undefined ? {} : { timeRange },
      config,
      http: this.options.http,
      deadline: startedAt + this.engineTimeoutMs,
      now: startedAt,
    }
    try {
      const sources = await this.runEngine(engine, context, signal)
      throwIfAborted(signal)
      const normalized = normalizeSources(sources, context.maxResults)
      return {
        engine: engineId,
        ok: normalized.length > 0,
        sources: normalized,
        ...normalized.length === 0 ? { error: sources.length === 0 ? 'returned 0 results' : 'returned no valid http(s) sources' } : {},
      }
    } catch (error: unknown) {
      throwIfAborted(signal)
      return { engine: engineId, ok: false, sources: [], error: errorMessage(error) }
    }
  }
}
