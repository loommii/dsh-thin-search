/**
 * Optional query enhancement. Without an override it uses the current Agent
 * model; a configured {@code provider:model} override is exclusive, and its
 * failure is reported instead of silently spending tokens on another route.
 */
import { WebError } from '@deepseek-ai/dsh-web'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ResolvedConfig } from '../config'
import type { LoggerLike } from '../search/http'
import { loadEnhanceSystemPrompt } from './prompt'

/** The slice of {@code ctx.llm} the enhancer uses; tests provide a fake. */
export interface EnhanceLlm {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/** Outcome of one enhancement attempt. */
export interface EnhanceOutcome {
  /** Query that should be sent to the engines. */
  readonly query: string
  /** Whether the model actually rewrote the query. */
  readonly enhanced: boolean
  /** Original input when {@link enhanced} is true. */
  readonly original?: string
  /** Route that produced the rewrite. */
  readonly model?: string
  /** Failure detail when the original query is retained. */
  readonly error?: string
}

/** One enhancement attempt over a fixed model route. */
export type EnhanceFunction = (query: string, signal?: AbortSignal) => Promise<EnhanceOutcome>

export interface EnhancerOptions {
  /** Config snapshot provider; called once per search. */
  readonly getConfig: () => ResolvedConfig
  /** The live LLM service, when available. */
  readonly getLlm: () => EnhanceLlm | undefined
  /**
   * Current Agent model selection, read as
   * {@code ctx.agents.currentInitiator()?.model.current()}. Used only when
   * {@code enhanceModel} is empty; an explicit override is exclusive.
   */
  readonly getAgentSelection: () => Readonly<ModelSelection> | undefined
  /** Prompt loader override for tests. */
  readonly loadPrompt?: (path: string) => Promise<string>
  readonly logger?: LoggerLike
  /** Per-attempt model timeout. */
  readonly timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 8000
const MAX_ENHANCED_LENGTH = 80

/** Parse a {@code provider:model} override; undefined when empty or malformed. */
export function parseEnhanceModel(value: string): ModelSelection | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  const separator = trimmed.indexOf(':')
  if (separator <= 0 || separator === trimmed.length - 1) return undefined
  const provider = trimmed.slice(0, separator).trim()
  const model = trimmed.slice(separator + 1).trim()
  return provider.length > 0 && model.length > 0 ? { provider, model } : undefined
}

/** Strip quotes and collapse whitespace; reject empty or over-long model output. */
export function sanitizeEnhancedQuery(text: string): string | undefined {
  const cleaned = text
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^["'\u2018\u2019\u201c\u201d\x60]+|["'\u2018\u2019\u201c\u201d\x60]+$/gu, '')
    .trim()
  if (cleaned.length === 0 || cleaned.length > MAX_ENHANCED_LENGTH) return undefined
  return cleaned
}

/** Throw the shared cancellation error when the caller already aborted. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new WebError('search enhancement aborted', 'WEB_ABORTED', { cause: signal.reason })
  }
}

/** Build the user message sent to the enhancement model. */
function enhancementMessage(query: string): GenerateOptions['messages'] {
  return [{ role: 'user', content: [{ type: 'text', text: `Input: ${JSON.stringify(query)}\nOutput:` }] }]
}

/** Run one model call and return the accumulated text. */
async function complete(
  llm: EnhanceLlm,
  route: ModelSelection,
  system: string,
  query: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController()
  let timedOut = false
  let rejectTimeout!: (error: Error) => void
  const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('enhancement timeout'))
    rejectTimeout(new Error('enhancement timed out'))
  }, timeoutMs)

  let rejectAborted: ((error: Error) => void) | undefined
  const aborted = signal === undefined
    ? undefined
    : new Promise<never>((_resolve, reject) => { rejectAborted = reject })
  const onAbort = (): void => {
    controller.abort(signal?.reason)
    rejectAborted?.(new WebError('search enhancement aborted', 'WEB_ABORTED', { cause: signal?.reason }))
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  const collect = async (): Promise<string> => {
    const chunks: string[] = []
    let failure: string | undefined
    const stream = llm.stream({
      provider: route.provider,
      model: route.model,
      messages: enhancementMessage(query),
      system,
      temperature: 0,
      maxTokens: 60,
      signal: controller.signal,
    })
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        chunks.push(chunk.text)
      } else if (chunk.type === 'finish') {
        if (chunk.reason.kind === 'error') {
          failure = chunk.reason.failure.message.length > 0 ? chunk.reason.failure.message : chunk.reason.failure.code
        } else if (chunk.reason.kind === 'aborted') {
          failure = timedOut ? 'enhancement timed out' : 'enhancement aborted'
        }
      }
    }
    if (signal?.aborted === true) {
      throw new WebError('search enhancement aborted', 'WEB_ABORTED', { cause: signal.reason })
    }
    if (failure !== undefined) throw new Error(failure)
    return chunks.join('')
  }

  try {
    return await Promise.race(aborted === undefined ? [collect(), timeout] : [collect(), timeout, aborted])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Create the optional query enhancer used before engine search. */
export function createEnhancer(options: EnhancerOptions): EnhanceFunction {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return async (query, signal) => {
    throwIfAborted(signal)
    const config = options.getConfig()
    const llm = options.getLlm()
    if (llm === undefined) return { query, enhanced: false, error: 'llm service unavailable' }
    const configured = config.enhanceModel.trim()
    const override = parseEnhanceModel(configured)
    let candidates: ModelSelection[]
    if (configured.length > 0) {
      // An explicit override is exclusive: a failure is reported rather than
      // falling back to the Agent model the user did not select.
      if (override === undefined) {
        return {
          query,
          enhanced: false,
          error: `invalid enhanceModel "${config.enhanceModel}": expected "provider:model"`,
        }
      }
      candidates = [override]
    } else {
      const agent = options.getAgentSelection()
      candidates = agent === undefined ? [] : [{ provider: agent.provider, model: agent.model }]
    }
    if (candidates.length === 0) return { query, enhanced: false, error: 'no model available' }

    const system = options.loadPrompt === undefined
      ? await loadEnhanceSystemPrompt(config.enhanceSystemPromptPath, {
        ...options.logger === undefined ? {} : { logger: options.logger },
        ...signal === undefined ? {} : { signal },
      })
      : await options.loadPrompt(config.enhanceSystemPromptPath)
    throwIfAborted(signal)

    let lastError: string | undefined
    for (const candidate of candidates) {
      throwIfAborted(signal)
      try {
        const text = await complete(llm, candidate, system, query, signal, timeoutMs)
        const enhanced = sanitizeEnhancedQuery(text)
        if (enhanced === undefined) {
          lastError = 'empty or invalid enhancement'
          continue
        }
        return {
          query: enhanced,
          enhanced: true,
          original: query,
          model: `${candidate.provider}:${candidate.model}`,
        }
      } catch (error: unknown) {
        if (signal?.aborted === true) throw error
        lastError = error instanceof Error ? error.message : String(error)
        options.logger?.warn(`thin-search: enhancement via ${candidate.provider}/${candidate.model} failed: ${lastError}`)
      }
    }
    return { query, enhanced: false, error: lastError ?? 'enhancement failed' }
  }
}
