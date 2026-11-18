import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import type { HttpClient, HttpRequestOptions, HttpResponse } from '../../src/search/http'
import type { EngineContext, EngineId, SearchEngine } from '../../src/search/engines/types'
import type { ResolvedConfig } from '../../src/config'
import { DEFAULT_CONFIG } from '../../src/config'

/** Build a resolved config for a test, applying overrides. */
export function testConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}

export interface RecordedCall {
  readonly url: string
  readonly options: HttpRequestOptions | undefined
}

/** HTTP client stub returning one text body. */
export function textHttp(body: string, status = 200): HttpClient & { readonly calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const respond = (url: string, options?: HttpRequestOptions): HttpResponse => {
    calls.push({ url, options })
    return { status, url, headers: new Headers(), body }
  }
  return {
    calls,
    request: async (url, options) => respond(url, options),
    text: async (url, options) => respond(url, options).body,
    json: async <T>(url: string, options?: HttpRequestOptions): Promise<T> => JSON.parse(respond(url, options).body) as T,
  }
}

/** HTTP client stub that routes by URL and records every call. */
export function routingHttp(routes: ReadonlyArray<{ match: string; body: string; status?: number }>): HttpClient & { readonly calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const resolve = (url: string, options?: HttpRequestOptions): HttpResponse => {
    calls.push({ url, options })
    const route = routes.find(candidate => url.includes(candidate.match))
    if (route === undefined) throw new Error(`unexpected URL in test: ${url}`)
    return { status: route.status ?? 200, url, headers: new Headers(), body: route.body }
  }
  return {
    calls,
    request: async (url, options) => resolve(url, options),
    text: async (url, options) => resolve(url, options).body,
    json: async <T>(url: string, options?: HttpRequestOptions): Promise<T> => JSON.parse(resolve(url, options).body) as T,
  }
}

/** Build an engine context for tests. */
export function engineContext(overrides: Partial<EngineContext> & { http: HttpClient }): EngineContext {
  return {
    query: 'test query',
    maxResults: 5,
    config: testConfig(),
    deadline: Date.now() + 12_000,
    now: Date.now(),
    ...overrides,
  }
}

/** A font of source objects used by fake engines. */
export function sources(...urls: string[]): WebSearchSource[] {
  return urls.map((url, index) => ({ url, title: `Result ${index + 1}`, snippet: `Snippet ${index + 1}` }))
}

/** Fake engine bound to a behavior function. */
export function fakeEngine(
  id: EngineId,
  search: (context: EngineContext) => Promise<WebSearchSource[]>,
  timeCapable = false,
): SearchEngine {
  return { id, title: id, supportsTimeRange: timeCapable, search }
}

/** Deferred promise used to model a hung request. */
export function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn
    reject = rejectFn
  })
  return { promise, resolve, reject }
}

/** Build a fake ToolRunContext carrying only the cancellation signal tools read. */
export function toolExec(signal: AbortSignal): { signal: AbortSignal } {
  return { signal }
}
