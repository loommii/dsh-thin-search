import { open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import { WebError } from '@deepseek-ai/dsh-web'
import type { LoggerLike } from '../search/http'
import { raceWithSignal } from '../util/abort'

/** Built-in fallback prompt used when no prompt file is configured or readable. */
export const DEFAULT_ENHANCE_SYSTEM_PROMPT = [
  'You rewrite a user input into one compact web-search query.',
  '',
  'Rules:',
  '1. Identify the intent (informational, navigational, or transactional) and keep the core entities: product, brand, place, person, technical term, version, and date.',
  '2. Remove filler, greetings, and conversational phrasing such as "please", "help me", "I want to know", "how much", "what is", and "thanks".',
  '3. Add only context the search requires and the user implied: for example "price" for a cost question, or "release notes" for a latest-version question.',
  '4. Keep comparison and constraint words such as "vs", "compare", "difference", "review", "recommend", and "ranking".',
  '5. Order the most important entity first, separate terms with single spaces, and use at most 8 terms.',
  '',
  'Output:',
  '- Return exactly one line containing the search query.',
  '- Do not explain, quote, or add punctuation other than spaces.',
  '- Do not invent entities the user did not mention.',
  '- If the input is already a clean query, return it unchanged.',
].join('\n')

/** Smallest accepted prompt byte size; larger files fall back to the built-in prompt. */
export const MAX_ENHANCE_PROMPT_BYTES = 64 * 1024

/** Options for resolving and reading the configured prompt file. */
export interface PromptFileOptions {
  readonly home?: string
  readonly readText?: (path: string) => Promise<string>
  readonly logger?: LoggerLike
  /** Caller cancellation; races the file read so an aborted search stops promptly. */
  readonly signal?: AbortSignal
  /** Accepted file size in bytes; defaults to {@link MAX_ENHANCE_PROMPT_BYTES}. */
  readonly maxBytes?: number
}

class PromptTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super('prompt file exceeds ' + String(maxBytes) + ' bytes')
    this.name = 'PromptTooLargeError'
  }
}

function abortError(signal: AbortSignal | undefined): WebError {
  return new WebError('enhancement prompt read aborted', 'WEB_ABORTED', { cause: signal?.reason })
}

/** Fresh aborted read; keeps TypeScript narrowing from hiding a later abort. */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

/** Minimal file-like reader used by the bounded prompt read. */
export interface BoundedReader {
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }>
}

/**
 * Read one reader to EOF or maxBytes + 1 bytes. A short read is not EOF: the
 * loop keeps reading at the next offset until the reader reports zero bytes or
 * the cap is crossed, so a valid prompt is never silently truncated.
 */
export async function readBounded(reader: BoundedReader, maxBytes: number): Promise<string> {
  const buffer = Buffer.alloc(maxBytes + 1)
  let total = 0
  while (total <= maxBytes) {
    const { bytesRead } = await reader.read(buffer, total, maxBytes + 1 - total, total)
    if (bytesRead <= 0) break
    total += bytesRead
  }
  if (total > maxBytes) throw new PromptTooLargeError(maxBytes)
  return buffer.subarray(0, total).toString('utf8')
}

/** Read at most maxBytes + 1 bytes so an oversized prompt is rejected without buffering it. */
async function readFileBounded(path: string, maxBytes: number): Promise<string> {
  const handle = await open(path, 'r')
  try {
    return await readBounded(handle, maxBytes)
  } finally {
    await handle.close()
  }
}

function normalizeMaxBytes(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return MAX_ENHANCE_PROMPT_BYTES
  return Math.min(Math.floor(value), MAX_ENHANCE_PROMPT_BYTES)
}

/**
 * Expand {@code ~} and validate an absolute path. Empty input means the built-in
 * prompt; a relative path is invalid and also resolves to undefined. The page
 * accepts absolute path shapes for every platform and leaves the final
 * platform-specific decision here.
 */
export function resolveEnhanceSystemPromptPath(input: string, home: string = homedir()): string | undefined {
  const trimmed = input.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.startsWith('~/')) return resolve(home, trimmed.slice(2))
  return isAbsolute(trimmed) ? trimmed : undefined
}

/**
 * Read the configured enhancement system prompt. An empty, invalid, unreadable,
 * blank or oversized file falls back to {@link DEFAULT_ENHANCE_SYSTEM_PROMPT}
 * instead of failing the search; the failure is logged when a logger is available.
 * The read is bounded and races the caller signal so it stays inside the tool's
 * timeout budget.
 */
export async function loadEnhanceSystemPrompt(input: string, options: PromptFileOptions = {}): Promise<string> {
  if (isAborted(options.signal)) throw abortError(options.signal)
  const path = resolveEnhanceSystemPromptPath(input, options.home ?? homedir())
  if (path === undefined) {
    if (input.trim().length > 0) {
      options.logger?.warn('thin-search: enhancement prompt path "' + input.trim() + '" is not absolute or ~/...; using the built-in prompt')
    }
    return DEFAULT_ENHANCE_SYSTEM_PROMPT
  }
  const maxBytes = normalizeMaxBytes(options.maxBytes)
  const readText = options.readText ?? (async (file: string) => await readFileBounded(file, maxBytes))
  try {
    const text = await raceWithSignal(readText(path), options.signal, () => abortError(options.signal))
    if (isAborted(options.signal)) throw abortError(options.signal)
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      options.logger?.warn('thin-search: enhancement prompt file ' + path + ' exceeds ' + String(maxBytes) + ' bytes; using the built-in prompt')
      return DEFAULT_ENHANCE_SYSTEM_PROMPT
    }
    const content = text.trim()
    if (content.length > 0) return content
    options.logger?.warn('thin-search: enhancement prompt file ' + path + ' is empty; using the built-in prompt')
  } catch (error: unknown) {
    if (isAborted(options.signal)) throw abortError(options.signal)
    if (error instanceof PromptTooLargeError) {
      options.logger?.warn('thin-search: enhancement prompt file ' + path + ' exceeds ' + String(maxBytes) + ' bytes; using the built-in prompt')
      return DEFAULT_ENHANCE_SYSTEM_PROMPT
    }
    options.logger?.warn('thin-search: cannot read enhancement prompt file ' + path + ' (' + (error instanceof Error ? error.message : String(error)) + '); using the built-in prompt')
  }
  return DEFAULT_ENHANCE_SYSTEM_PROMPT
}
