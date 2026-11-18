/** Global fetch wrapper: URL validation, per-attempt timeout, retry classification, and block-page detection. */

import { raceWithSignal } from '../util/abort'

/** Minimal logger surface shared by the host modules. */
export interface LoggerLike {
  warn(message: string): void
  info?(message: string): void
}

/** Fetch implementation used by the client; tests substitute a fake. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type HttpErrorCode =
  | 'INVALID_URL'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'HTTP_STATUS'
  | 'FORBIDDEN'
  | 'CAPTCHA'
  | 'BODY_TOO_LARGE'
  | 'INVALID_BODY'

/** One classified transport failure. {@link transient} is true only for network errors and 5xx responses. */
export class HttpError extends Error {
  readonly code: HttpErrorCode
  readonly status: number | undefined
  readonly transient: boolean

  constructor(message: string, code: HttpErrorCode, options: { status?: number; transient: boolean; cause?: unknown } = { transient: false }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'HttpError'
    this.code = code
    this.status = options.status
    this.transient = options.transient
  }
}

/** One successful HTTP response body, decoded as UTF-8 text. */
export interface HttpResponse {
  readonly status: number
  readonly url: string
  readonly headers: Headers
  readonly body: string
}

export interface HttpRequestOptions {
  readonly method?: 'GET' | 'POST'
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
  readonly accept?: string
  readonly redirect?: RequestRedirect
  readonly signal?: AbortSignal
  /** Absolute epoch deadline shared by every retry of this request. */
  readonly deadline?: number
  /** Total budget for this request when {@link deadline} is absent. */
  readonly timeoutMs?: number
  /** Retries after the first attempt; only transient failures retry. */
  readonly retries?: number
}

export interface HttpClientOptions {
  readonly fetch?: FetchLike
  readonly userAgent?: string
  readonly acceptLanguage?: string
  readonly retries?: number
  readonly retryDelayMs?: number
  readonly requestTimeoutMs?: number
  readonly maxBodyBytes?: number
  readonly now?: () => number
  readonly logger?: LoggerLike
}

export interface HttpClient {
  request(url: string, options?: HttpRequestOptions): Promise<HttpResponse>
  text(url: string, options?: HttpRequestOptions): Promise<string>
  json<T>(url: string, options?: HttpRequestOptions): Promise<T>
}

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const DEFAULT_ACCEPT_LANGUAGE = 'zh-CN,zh;q=0.9,en;q=0.8'
const DEFAULT_ACCEPT = 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_RETRIES = 1
const DEFAULT_RETRY_DELAY_MS = 250
const DEFAULT_MAX_BODY_BYTES = 2_000_000

/** Response facts that decide whether a body can be a challenge page at all. */
export interface BlockPageOptions {
  /** Response {@code content-type}, when the server supplied one. */
  readonly contentType?: string | null
  /** Request {@code accept} header; JSON consumers skip challenge detection entirely. */
  readonly accept?: string
}

/**
 * Challenge pages are identified by their interstitial form/title markup, never
 * by free-text words: a legitimate result page may legitimately contain
 * "captcha", "access denied", "unusual traffic" or "robot" in a query, title,
 * or snippet. JSON responses and JSON-accepting requests are never challenge
 * pages.
 */
const CHALLENGE_SIGNATURES: readonly RegExp[] = [
  // DuckDuckGo anomaly / challenge interstitial.
  /anomaly-modal|bots use DuckDuckGo too/iu,
  // Generic challenge form (DDG, Bing, Cloudflare and similar interstitials).
  /<form\b[^>]*\bid\s*=\s*["']challenge-form["']/iu,
  /<form\b[^>]*\baction\s*=\s*["'][^"']*(?:\/anomaly|\/challenge|captcha-form|captcha)[^"']*["']/iu,
  // Bing and Cloudflare challenge containers/markers.
  /\b(?:id|class)\s*=\s*["'][^"']*\b(?:b_captcha|captcha-form|cf-challenge|challenge-platform|challenge-container)\b[^"']*["']/iu,
  /cf-browser-verification|attention-required/iu,
  /<title>\s*Just a moment\.\.\.\s*<\/title>/iu,
]

/** Whether a response should be treated as JSON (and therefore never as a challenge page). */
export function isJsonResponse(options: BlockPageOptions = {}): boolean {
  if ((options.accept ?? '').toLowerCase().includes('json')) return true
  return (options.contentType ?? '').toLowerCase().includes('json')
}

/**
 * Detect an anti-bot interstitial using challenge-specific markup. Legitimate
 * pages that merely mention "captcha", "access denied" or "unusual traffic" are
 * not challenges; JSON bodies are never inspected.
 */
export function detectBlockPage(body: string, options: BlockPageOptions = {}): boolean {
  if (isJsonResponse(options)) return false
  const sample = body.slice(0, 8000)
  return CHALLENGE_SIGNATURES.some(pattern => pattern.test(sample))
}

/** Fresh <code>aborted</code> read; a helper avoids TypeScript control-flow narrowing across awaits. */
export function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

/** True for a fetch/AbortSignal abort. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

/** Narrow an unknown failure to {@link HttpError}. */
export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError
}

function parseHttpUrl(raw: string): string {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch (error) {
    throw new HttpError(`invalid URL: ${String(raw)}`, 'INVALID_URL', { transient: false, cause: error })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(`unsupported URL scheme: ${parsed.protocol}`, 'INVALID_URL', { transient: false })
  }
  return parsed.toString()
}

/** Wait for {@code ms}, rejecting with {@code ABORTED} when the caller cancels. */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    if (isAborted(signal)) {
      reject(new HttpError('request aborted', 'ABORTED', { transient: false, cause: signal?.reason }))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new HttpError('request aborted', 'ABORTED', { transient: false, cause: signal?.reason }))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Parse a declared Content-Length; undefined when the header is absent or malformed. */
function declaredBodyLength(headers: Headers): number | undefined {
  const raw = headers.get('content-length')
  if (raw === null) return undefined
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

/** Release an unread error response body; failures are ignored because the status error is authoritative. */
async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // The body may already be closed or locked; classification remains the real outcome.
  }
}

function bodyTooLarge(url: string, maxBytes: number, status: number, bytes: number): HttpError {
  return new HttpError(
    `response body from ${url} exceeds ${maxBytes} bytes (read ${bytes} bytes)`,
    'BODY_TOO_LARGE',
    { status, transient: false },
  )
}

/**
 * Read a response body with a running byte cap. Chunks are decoded as they
 * arrive and the reader is cancelled as soon as the cap is crossed, so an
 * oversized response is never buffered in full. Caller aborts cancel the reader.
 */
async function readBodyWithLimit(
  response: Response,
  url: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  const reader = response.body?.getReader()
  if (reader === undefined) {
    const text = await response.text()
    const bytes = Buffer.byteLength(text, 'utf8')
    if (bytes > maxBytes) throw bodyTooLarge(url, maxBytes, response.status, bytes)
    return text
  }
  let total = 0
  let text = ''
  const decoder = new TextDecoder()
  let cancelled = false
  const cancel = (): void => {
    if (cancelled) return
    cancelled = true
    void reader.cancel().catch(() => undefined)
  }
  const onAbort = (): void => { cancel() }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    for (;;) {
      if (signal.aborted) throw new Error('body read aborted')
      const { done, value } = await reader.read()
      if (done) break
      if (value === undefined) continue
      total += value.byteLength
      if (total > maxBytes) {
        cancel()
        throw bodyTooLarge(url, maxBytes, response.status, total)
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

class FetchHttpClient implements HttpClient {
  private readonly fetchImpl: FetchLike
  private readonly userAgent: string
  private readonly acceptLanguage: string
  private readonly retries: number
  private readonly retryDelayMs: number
  private readonly requestTimeoutMs: number
  private readonly maxBodyBytes: number
  private readonly now: () => number
  private readonly logger: LoggerLike | undefined

  constructor(options: HttpClientOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT
    this.acceptLanguage = options.acceptLanguage ?? DEFAULT_ACCEPT_LANGUAGE
    this.retries = normalizeCount(options.retries, DEFAULT_RETRIES)
    this.retryDelayMs = normalizeDuration(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS)
    this.requestTimeoutMs = normalizeDuration(options.requestTimeoutMs, DEFAULT_TIMEOUT_MS, false)
    this.maxBodyBytes = normalizeDuration(options.maxBodyBytes, DEFAULT_MAX_BODY_BYTES, false)
    this.now = options.now ?? Date.now
    this.logger = options.logger
  }

  private abortError(timedOut: boolean, callerSignal: AbortSignal | undefined): HttpError {
    if (isAborted(callerSignal)) {
      return new HttpError('request aborted', 'ABORTED', { transient: false, cause: callerSignal?.reason })
    }
    return new HttpError(`request timed out after ${this.requestTimeoutMs}ms`, 'TIMEOUT', { transient: timedOut })
  }

  async request(rawUrl: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const url = parseHttpUrl(rawUrl)
    const callerSignal = options.signal
    if (isAborted(callerSignal)) {
      throw new HttpError('request aborted', 'ABORTED', { transient: false, cause: callerSignal?.reason })
    }
    const deadline = options.deadline ?? this.now() + Math.max(1, options.timeoutMs ?? this.requestTimeoutMs)
    const retries = normalizeCount(options.retries, this.retries)
    const headers: Record<string, string> = {
      'user-agent': this.userAgent,
      'accept-language': this.acceptLanguage,
      ...options.accept !== undefined ? { accept: options.accept } : { accept: DEFAULT_ACCEPT },
      ...options.headers,
    }

    for (let attempt = 0; ; attempt++) {
      if (isAborted(callerSignal)) {
        throw new HttpError('request aborted', 'ABORTED', { transient: false, cause: callerSignal?.reason })
      }
      const remaining = deadline - this.now()
      if (remaining <= 0) {
        throw new HttpError(`request deadline exceeded for ${url}`, 'TIMEOUT', { transient: false })
      }
      const controller = new AbortController()
      const state: { timedOut: boolean } = { timedOut: false }
      const timer = setTimeout(() => {
        state.timedOut = true
        controller.abort(new Error('timeout'))
      }, remaining)
      const onCallerAbort = (): void => { controller.abort(callerSignal?.reason) }
      callerSignal?.addEventListener('abort', onCallerAbort, { once: true })
      try {
        const response = await raceWithSignal(
          this.fetchImpl(url, {
            method: options.method ?? 'GET',
            headers,
            ...options.body === undefined ? {} : { body: options.body },
            redirect: options.redirect ?? 'follow',
            signal: controller.signal,
          }),
          controller.signal,
          () => this.abortError(state.timedOut, callerSignal),
        )
        // Classify the status before reading any body: an error or challenge
        // response never needs its payload and must not be buffered.
        if (response.status === 202) {
          await cancelResponseBody(response)
          throw new HttpError(`anti-bot challenge from ${url} (HTTP 202)`, 'CAPTCHA', { status: 202, transient: false })
        }
        if (response.status === 403) {
          await cancelResponseBody(response)
          throw new HttpError(`HTTP 403 from ${url}; the site rejected this client`, 'FORBIDDEN', { status: 403, transient: false })
        }
        if (response.status < 200 || response.status >= 300) {
          await cancelResponseBody(response)
          throw new HttpError(
            `HTTP ${response.status} from ${url}`,
            'HTTP_STATUS',
            { status: response.status, transient: response.status >= 500 },
          )
        }
        const declared = declaredBodyLength(response.headers)
        if (declared !== undefined && declared > this.maxBodyBytes) {
          await cancelResponseBody(response)
          throw new HttpError(
            `response body from ${url} has Content-Length ${declared}, above the ${this.maxBodyBytes}-byte limit`,
            'BODY_TOO_LARGE',
            { status: response.status, transient: false },
          )
        }
        const body = await raceWithSignal(
          readBodyWithLimit(response, url, this.maxBodyBytes, controller.signal),
          controller.signal,
          () => this.abortError(state.timedOut, callerSignal),
        )
        if (detectBlockPage(body, {
          contentType: response.headers.get('content-type'),
          ...options.accept === undefined ? {} : { accept: options.accept },
        })) {
          throw new HttpError(`anti-bot challenge page from ${url}`, 'CAPTCHA', { status: response.status, transient: false })
        }
        return { status: response.status, url: response.url || url, headers: response.headers, body }
      } catch (error: unknown) {
        const classified = error instanceof HttpError
          ? error
          : isAborted(callerSignal)
            ? new HttpError('request aborted', 'ABORTED', { transient: false, cause: callerSignal?.reason })
            : state.timedOut || isAbortError(error)
              ? new HttpError(`request timed out for ${url}`, 'TIMEOUT', { transient: true, cause: error })
              : new HttpError(`network error for ${url}: ${error instanceof Error ? error.message : String(error)}`, 'NETWORK', { transient: true, cause: error })
        if (!classified.transient || attempt >= retries) throw classified
        this.logger?.warn(`thin-search: retrying ${url} after ${classified.code}: ${classified.message}`)
        await sleep(this.retryDelayMs, callerSignal)
      } finally {
        clearTimeout(timer)
        callerSignal?.removeEventListener('abort', onCallerAbort)
      }
    }
  }

  async text(url: string, options: HttpRequestOptions = {}): Promise<string> {
    return (await this.request(url, options)).body
  }

  async json<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
    const body = await this.text(url, { ...options, accept: options.accept ?? 'application/json' })
    try {
      return JSON.parse(body) as T
    } catch (error) {
      throw new HttpError(`invalid JSON from ${url}`, 'INVALID_BODY', { transient: false, cause: error })
    }
  }
}

function normalizeCount(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value >= 0 ? value : fallback
}

function normalizeDuration(value: number | undefined, fallback: number, allowZero = true): number {
  return value !== undefined && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) ? value : fallback
}

/** Create the fetch wrapper used by engines and platforms. */
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  return new FetchHttpClient(options)
}
