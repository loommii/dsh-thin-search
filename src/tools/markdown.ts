/** Shared Markdown escaping for tool render output. */

/** Escape one value used inside a Markdown link label or inline text. */
export function escapeMarkdownLabel(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')
    .replace(/[\r\n]+/gu, ' ')
}

/** Escape a newline-preserving block of untrusted text while keeping its line structure. */
export function escapeMarkdownText(text: string): string {
  return text.split(/\r?\n/u).map(line => escapeMarkdownLabel(line)).join('\n')
}

/** Whether a URL may be emitted as a Markdown destination instead of plain escaped text. */
export function isSafeMarkdownUrl(url: string): boolean {
  return /^https?:\/\//iu.test(url.trim())
}

/** Escape a URL used as a Markdown link destination. */
export function escapeMarkdownDestination(url: string): string {
  return url.trim().replace(/[()<>\s[\]]/gu, (char) => {
    if (char === '(') return '%28'
    if (char === ')') return '%29'
    return encodeURIComponent(char)
  })
}

/** One source-shaped record accepted by the shared renderer. */
export interface RenderableSource {
  readonly url?: string
  readonly title?: string
  readonly snippet?: string
  readonly publishedAt?: string
}

/**
 * Render one source as a Markdown list item. Labels, snippets and timestamps are
 * escaped; an unsafe destination (anything but http/https) is rendered as plain
 * escaped text instead of a link.
 */
export function renderSourceLine(source: RenderableSource, maxSnippet = 120): string {
  const url = source.url ?? ''
  const label = source.title ?? url
  const details = `${source.snippet === undefined ? '' : ` - ${escapeMarkdownLabel(source.snippet.slice(0, maxSnippet))}`}`
    + `${source.publishedAt === undefined ? '' : ` (${escapeMarkdownLabel(source.publishedAt)})`}`
  if (!isSafeMarkdownUrl(url)) {
    return `- ${escapeMarkdownLabel(label)}${details}`
  }
  return `- [${escapeMarkdownLabel(label)}](${escapeMarkdownDestination(url)})${details}`
}
