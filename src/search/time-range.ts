/** Time-window parsing shared by the pipeline, engines and tools. */

/** Fixed tiers supported natively by SearXNG and DuckDuckGo. */
export const TIME_RANGE_TIERS = ['day', 'week', 'month', 'year'] as const

export type TimeRangeTier = typeof TIME_RANGE_TIERS[number]

/** Relative days represented by each fixed tier. */
export const DAYS_BY_RANGE: Readonly<Record<TimeRangeTier, number>> = Object.freeze({
  day: 1,
  week: 7,
  month: 30,
  year: 365,
})

const TIER_DAYS: Readonly<Record<string, TimeRangeTier>> = Object.freeze({
  day: 'day',
  '1d': 'day',
  week: 'week',
  '7d': 'week',
  month: 'month',
  '30d': 'month',
  year: 'year',
  '365d': 'year',
})

/** A parsed time window: either a number of days or a strict ISO calendar date. */
export type TimeRange =
  | { readonly days: number }
  | { readonly after: string }

const ABSOLUTE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u
const RELATIVE = /^(\d+(?:\.\d+)?)\s*(h|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|year|years)$/u

/** Days in a proleptic Gregorian month. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Validate one absolute date and return it in canonical {@code YYYY-MM-DD} form. */
export function normalizeAbsoluteDate(input: string): string | undefined {
  const match = ABSOLUTE_DATE.exec(input.trim())
  if (match === null) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return undefined
  if (day < 1 || day > daysInMonth(year, month)) return undefined
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Normalize one relative unit into fractional days. */
function relativeUnitToDays(value: number, unit: string): number {
  if (unit === 'h' || unit === 'hour' || unit === 'hours') return value / 24
  if (unit === 'w' || unit === 'week' || unit === 'weeks') return value * 7
  if (unit === 'mo' || unit === 'month' || unit === 'months') return value * 30
  if (unit === 'y' || unit === 'year' || unit === 'years') return value * 365
  return value
}

/** Whether an already-normalized absolute date is later than {@code now}'s UTC day. */
function isFutureAbsoluteDate(date: string, now: Date): boolean {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const target = Date.UTC(year, month - 1, day)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return target > today
}

/**
 * Parse a time range from a fixed tier, a relative duration ({@code 12h},
 * {@code 3d}, {@code 2mo}, {@code 1y}), an absolute date ({@code 2026-07-01}),
 * or an already-parsed object. Invalid input, including an absolute date later
 * than {@code now}'s day, returns undefined.
 * @param input - tier, duration, date, or already-parsed object.
 * @param now - reference instant for future-date validation; defaults to now.
 */
export function parseTimeRange(input: unknown, now: Date = new Date()): TimeRange | undefined {
  if (input === undefined || input === null) return undefined
  if (typeof input === 'object') {
    const candidate = input as { days?: unknown; after?: unknown }
    if (typeof candidate.after === 'string') {
      const after = normalizeAbsoluteDate(candidate.after)
      if (after !== undefined) return isFutureAbsoluteDate(after, now) ? undefined : { after }
    }
    if (typeof candidate.days === 'number' && Number.isFinite(candidate.days) && candidate.days > 0) {
      return { days: candidate.days }
    }
    return undefined
  }
  if (typeof input !== 'string') return undefined
  const text = input.trim().toLowerCase()
  if (text.length === 0) return undefined
  const tier = TIER_DAYS[text]
  if (tier !== undefined) return { days: DAYS_BY_RANGE[tier] }
  const after = normalizeAbsoluteDate(text)
  if (after !== undefined) return isFutureAbsoluteDate(after, now) ? undefined : { after }
  const match = RELATIVE.exec(text)
  if (match === null) return undefined
  const rawValue = match[1]
  const unit = match[2]
  if (rawValue === undefined || unit === undefined) return undefined
  const value = Number.parseFloat(rawValue)
  const days = relativeUnitToDays(value, unit)
  if (!Number.isFinite(days) || days <= 0) return undefined
  return { days }
}

/**
 * Days between an absolute date and {@code now}, rounded up and clamped to at
 * least one. Future dates are rejected by {@link parseTimeRange}; the minimum
 * here is only a defensive fallback for direct callers.
 */
export function relativeDaysAfter(after: string, now: Date = new Date()): number {
  const normalized = normalizeAbsoluteDate(after)
  if (normalized === undefined) return 1
  const [year, month, day] = normalized.split('-').map(Number) as [number, number, number]
  const target = Date.UTC(year, month - 1, day)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const days = Math.ceil((today - target) / 86_400_000)
  return Number.isFinite(days) && days > 0 ? days : 1
}

/** Resolve a parsed window to days, converting absolute dates relative to {@code now}. */
export function timeRangeDays(range: TimeRange, now: Date = new Date()): number {
  return 'days' in range ? range.days : relativeDaysAfter(range.after, now)
}

/** Map an arbitrary day count to the nearest fixed tier. */
export function approximateTimeRange(days: number): TimeRangeTier {
  if (!Number.isFinite(days) || days <= 2) return 'day'
  if (days <= 14) return 'week'
  if (days <= 90) return 'month'
  return 'year'
}

/**
 * Map a parsed window to a fixed tier. Absolute dates are converted to relative
 * days first, so DDG and SearXNG receive a tier even for {@code 2026-07-01}.
 */
export function timeRangeTier(range: TimeRange | undefined, now: Date = new Date()): TimeRangeTier | undefined {
  if (range === undefined) return undefined
  return approximateTimeRange(timeRangeDays(range, now))
}

/** Stable cache-key fragment for a parsed window. */
export function timeRangeKey(range: TimeRange | undefined): string {
  if (range === undefined) return ''
  return 'days' in range ? `days:${range.days}` : `after:${range.after}`
}

/** Human-readable label used in notes and tool renders. */
export function timeRangeLabel(range: TimeRange | undefined): string {
  if (range === undefined) return ''
  return 'days' in range ? `${range.days}d` : `after ${range.after}`
}

/** DuckDuckGo {@code df} parameter for a tier. */
export function ddgDateFilter(tier: TimeRangeTier | undefined): string | undefined {
  switch (tier) {
    case 'day': return 'd'
    case 'week': return 'w'
    case 'month': return 'm'
    case 'year': return 'y'
    default: return undefined
  }
}
