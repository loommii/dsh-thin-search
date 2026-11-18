/**
 * Shared building blocks for the v1.0.0 integration suite.
 *
 * These helpers sit at the seam the unit suites do not cover: they load the
 * built host bundle (`lib/index.js`) and stub the process-wide fetch so a
 * search runs from the provider facade through the HTTP client, the engine
 * fallback chain, normalization and the tool facades.
 */
import { readFileSync } from 'node:fs'
import { afterEach, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { PromptSection } from '@deepseek-ai/dsh-system-prompt'
import type { WebSearchProvider } from '@deepseek-ai/dsh-web'

/** Directory holding the recorded engine bodies. */
const FIXTURE_DIR = new URL('../fixtures/engines/', import.meta.url)

/** Read one recorded engine body. */
export function fixture(name: string): string {
  return readFileSync(new URL(name, FIXTURE_DIR), 'utf8')
}

/** One fetch attempt captured by {@link stubFetch}. */
export interface FetchCall {
  readonly url: string
  readonly init: RequestInit | undefined
}

/** A stubbed global fetch plus the attempts it recorded. */
export interface FetchStub {
  readonly calls: FetchCall[]
}

/** Handler deciding one response from the requested URL and options. */
export type FetchHandler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>

/** Replace the process-wide fetch for one test and record every attempt. */
export function stubFetch(handler: FetchHandler): FetchStub {
  const calls: FetchCall[] = []
  const stub = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    calls.push({ url, init })
    return await handler(url, init)
  })
  vi.stubGlobal('fetch', stub)
  return { calls }
}

/** A fetch that only settles when the request signal aborts. */
export function abortableFetch(): FetchHandler {
  return async (_url, init) => await new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal
    const fail = (): void => { reject(new DOMException('aborted', 'AbortError')) }
    if (signal?.aborted === true) { fail(); return }
    signal?.addEventListener('abort', fail, { once: true })
  })
}

/** Build one HTML response. */
export function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

/** Build one JSON response. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

// Each importing test file gets its own module instance, so this cleanup is
// scoped to that file's tests and always restores the real fetch.
afterEach(() => { vi.unstubAllGlobals() })

/** The built host bundle's runtime surface used by the integration suite. */
export interface HostBundle {
  name: string
  inject: readonly string[]
  Config: ((input?: Record<string, unknown>) => unknown) & { toJSON(): SchemaJson; '~standard': { validate(value: unknown): unknown } }
  apply(ctx: Context, config: unknown): void
  createThinSearchProvider(pipeline: unknown): WebSearchProvider
  buildSystemPromptText(config: unknown): string
  THIN_SEARCH_PROVIDER_ID: string
  THIN_SEARCH_PROVIDER_TITLE: string
  THIN_SEARCH_PROVIDER_DESCRIPTION: Readonly<Record<string, string>>
}

/** Minimal shape of the schemastery JSON used by the config assertions. */
export interface SchemaJson {
  uid: string
  refs: Record<string, { meta?: { volatile?: boolean; default?: unknown; min?: number }; dict?: Record<string, string> }>
}

/** Load the built host entry exactly as the DSH loader would. */
export async function loadHostBundle(): Promise<HostBundle> {
  const url = new URL('../../lib/index.js', import.meta.url).href
  return await import(/* @vite-ignore */ url) as HostBundle
}

/** Registration records captured from a fake Cordis host context. */
export interface ApplyRecords {
  provider?: WebSearchProvider
  readonly tools: ToolDefinition[]
  readonly sections: PromptSection[]
  readonly sectionOrderQueries: string[]
}

/** Build a Cordis host context that records the plugin's registrations. */
export function createApplyContext(): { ctx: Context; records: ApplyRecords } {
  const records: ApplyRecords = { tools: [], sections: [], sectionOrderQueries: [] }
  const ctx = {
    logger: () => ({ warn: () => undefined, info: () => undefined }),
    get: () => undefined,
    web: {
      registerSearchProvider: (provider: WebSearchProvider) => {
        records.provider = provider
        return () => undefined
      },
    },
    tools: {
      register: (tool: ToolDefinition) => {
        records.tools.push(tool)
        return () => undefined
      },
    },
    systemPrompt: {
      section: (section: PromptSection) => {
        records.sections.push(section)
        return () => undefined
      },
      getSectionOrder: (name: string) => {
        records.sectionOrderQueries.push(name)
        return 2000
      },
    },
  } as unknown as Context
  return { ctx, records }
}

/** Find one registered tool by name. */
export function toolNamed(records: ApplyRecords, name: string): Record<string, any> {
  const tool = records.tools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`tool "${name}" was not registered`)
  return tool as unknown as Record<string, any>
}

/** Read the live value of a schemastery volatile config reference. */
export function configValue<T = unknown>(config: unknown, field: string): T {
  const ref = (config as Record<string, { get(): T }>)[field]
  if (ref === undefined) throw new Error(`config field "${field}" is missing`)
  return ref.get()
}

/** Resolve a prompt section's text whether it is static or a function. */
export function sectionText(section: PromptSection): string {
  const text = section.text
  return typeof text === 'function' ? text({} as never) : String(text)
}

/** Call a tool's execute with a minimal run context. */
export function executeTool(tool: Record<string, any>, args: unknown, signal?: AbortSignal): Promise<unknown> {
  const exec = signal === undefined ? {} : { signal }
  return tool.execute(args, exec) as Promise<unknown>
}
