import type { WebSearchSource } from '@deepseek-ai/dsh-web'

/** Decode one numeric entity without throwing on malformed input. */
function fromCodePoint(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return ''
  try {
    return String.fromCodePoint(value)
  } catch {
    return ''
  }
}

/** Decode the small HTML entity set search result titles and snippets use. */
export function decodeEntities(text: string): string {
  return String(text)
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&#x27;/gu, "'")
    .replace(/&apos;/gu, "'")
    .replace(/&nbsp;/gu, ' ')
    .replace(/&#(\d+);/gu, (_, code: string) => fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) => fromCodePoint(Number.parseInt(code, 16)))
}

/** Remove tags, decode entities, and collapse whitespace. */
export function stripTags(html: string): string {
  return decodeEntities(String(html).replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim())
}

const SNIPPET_NOISE = /\b(sign up|sign in|log in|login|subscribe( to| for)?|member[- ]?only|become a member|create (a )?free account|read more|continue reading|story continues|get started|install (the )?app|view on|medium membership|join \w+ for free|get updates from this writer|stories in your inbox|remember me for|unlock this|free to read|become a patron)\b/giu

/** Remove boilerplate phrases and markdown noise from a provider snippet. */
export function cleanSnippet(text: string | undefined, maxLength = 300): string | undefined {
  if (text === undefined) return undefined
  const cleaned = String(text)
    .replace(SNIPPET_NOISE, ' ')
    .replace(/^\s*(#{1,6}\s*|\[\s*x?\s*\]\s*|-\s*\[\s*x?\s*\]\s*|>\s*)/gmu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (cleaned.length === 0) return undefined
  return cleaned.slice(0, maxLength)
}

/** Accept only absolute http(s) URLs; returns undefined for relative, data, javascript, and malformed values. */
export function sanitizeUrl(raw: string | undefined, base?: string): string | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (trimmed.length === 0) return undefined
  try {
    const url = base === undefined ? new URL(trimmed) : new URL(trimmed, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

/** Normalize one source: valid URL, clean title and snippet, bounded summary. */
export function normalizeSource(source: WebSearchSource): WebSearchSource | undefined {
  const url = sanitizeUrl(source.url)
  if (url === undefined) return undefined
  const title = source.title === undefined ? undefined : decodeEntities(source.title).trim() || undefined
  const snippet = cleanSnippet(source.snippet)
  const summary = source.summary === undefined ? undefined : decodeEntities(source.summary).trim() || undefined
  const publishedAt = source.publishedAt === undefined ? undefined : source.publishedAt.trim() || undefined
  return {
    url,
    ...(title === undefined ? {} : { title }),
    ...(snippet === undefined ? {} : { snippet }),
    ...(summary === undefined ? {} : { summary }),
    ...(publishedAt === undefined ? {} : { publishedAt }),
  }
}

/** Normalize, deduplicate by URL, and cap a source list. */
export function normalizeSources(sources: readonly WebSearchSource[], limit: number): WebSearchSource[] {
  const seen = new Set<string>()
  const normalized: WebSearchSource[] = []
  for (const source of sources) {
    const candidate = normalizeSource(source)
    if (candidate === undefined || seen.has(candidate.url)) continue
    seen.add(candidate.url)
    normalized.push(candidate)
    if (normalized.length >= limit) break
  }
  return normalized
}

/** Extract a DuckDuckGo redirect target from an {@code href}. */
export function extractDdgUrl(rel: string | undefined, base = 'https://duckduckgo.com'): string | undefined {
  if (rel === undefined) return undefined
  const trimmed = rel.trim()
  if (trimmed.length === 0) return undefined
  const match = /[?&]uddg=([^&]+)/u.exec(trimmed)
  if (match !== null) {
    const encoded = match[1]
    if (encoded === undefined) return undefined
    try {
      return sanitizeUrl(decodeURIComponent(encoded))
    } catch {
      return undefined
    }
  }
  if (trimmed.startsWith('//')) return sanitizeUrl(`https:${trimmed}`)
  return sanitizeUrl(trimmed, base)
}

/** Join optional text fragments with single newlines, dropping empty values. */
export function joinNotes(notes: readonly (string | undefined)[]): string | undefined {
  const present = notes.filter((note): note is string => note !== undefined && note.trim().length > 0)
  return present.length === 0 ? undefined : present.join('\n')
}
