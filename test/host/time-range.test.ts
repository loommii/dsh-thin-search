import { describe, expect, it } from 'vitest'
import {
  approximateTimeRange,
  ddgDateFilter,
  parseTimeRange,
  relativeDaysAfter,
  timeRangeDays,
  timeRangeKey,
  timeRangeLabel,
  timeRangeTier,
} from '../../src/search/time-range'

// Local construction keeps every absolute-date expectation stable in any TZ.
const NOW = new Date(2026, 6, 10, 12, 0, 0)

/** Derive a local YYYY-MM-DD date {@code days} before now, using local calendar math. */
function localDateDaysBefore(now: Date, days: number): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)
  date.setDate(date.getDate() - days)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

describe('time-range parser', () => {
  it('parses fixed tiers', () => {
    expect(parseTimeRange('day')).toEqual({ days: 1 })
    expect(parseTimeRange('WEEK')).toEqual({ days: 7 })
    expect(parseTimeRange('month')).toEqual({ days: 30 })
    expect(parseTimeRange('year')).toEqual({ days: 365 })
  })

  it('parses relative durations', () => {
    expect(parseTimeRange('12h')).toEqual({ days: 0.5 })
    expect(parseTimeRange('3d')).toEqual({ days: 3 })
    expect(parseTimeRange('2w')).toEqual({ days: 14 })
    expect(parseTimeRange('2mo')).toEqual({ days: 60 })
    expect(parseTimeRange('1y')).toEqual({ days: 365 })
    expect(parseTimeRange('1.5d')).toEqual({ days: 1.5 })
  })

  it('parses and validates absolute dates', () => {
    expect(parseTimeRange('2026-07-01', NOW)).toEqual({ after: '2026-07-01' })
    expect(parseTimeRange('2026-07-10', NOW)).toEqual({ after: '2026-07-10' })
    expect(parseTimeRange('2026-07-11', NOW)).toBeUndefined()
    expect(parseTimeRange('2027-01-01', NOW)).toBeUndefined()
    expect(parseTimeRange('2026-02-31', NOW)).toBeUndefined()
    expect(parseTimeRange('2026-13-01', NOW)).toBeUndefined()
    expect(parseTimeRange('01-07-2026', NOW)).toBeUndefined()
  })

  it('interprets absolute dates with the local calendar day at UTC+ boundaries', () => {
    // Local constructor keeps this assertion timezone-independent: 01:00 local
    // on 2026-11-19 is still the local "today", even when UTC is still 2026-11-18.
    const localNow = new Date(2026, 10, 19, 1, 0, 0)
    expect(parseTimeRange('2026-11-19', localNow)).toEqual({ after: '2026-11-19' })
    expect(parseTimeRange({ after: '2026-11-19' }, localNow)).toEqual({ after: '2026-11-19' })
    expect(parseTimeRange('2026-11-20', localNow)).toBeUndefined()
    expect(parseTimeRange({ after: '2026-11-20' }, localNow)).toBeUndefined()
  })

  it('rejects empty, zero, negative and unknown values', () => {
    expect(parseTimeRange(undefined)).toBeUndefined()
    expect(parseTimeRange('')).toBeUndefined()
    expect(parseTimeRange('0d')).toBeUndefined()
    expect(parseTimeRange('-3d')).toBeUndefined()
    expect(parseTimeRange('forever')).toBeUndefined()
    expect(parseTimeRange({})).toBeUndefined()
    expect(parseTimeRange({ days: 0 })).toBeUndefined()
    expect(parseTimeRange({ after: 'nope' })).toBeUndefined()
  })

  it('accepts already parsed objects and rejects future object dates', () => {
    expect(parseTimeRange({ days: 4 }, NOW)).toEqual({ days: 4 })
    expect(parseTimeRange({ after: '2026-07-01' }, NOW)).toEqual({ after: '2026-07-01' })
    expect(parseTimeRange({ after: '2027-01-01' }, NOW)).toBeUndefined()
  })

  it('maps days to the nearest native tier', () => {
    expect(approximateTimeRange(1)).toBe('day')
    expect(approximateTimeRange(2)).toBe('day')
    expect(approximateTimeRange(8)).toBe('week')
    expect(approximateTimeRange(30)).toBe('month')
    expect(approximateTimeRange(400)).toBe('year')
  })

  it('converts absolute dates to relative days for DDG and SearXNG', () => {
    expect(relativeDaysAfter('2026-07-01', NOW)).toBe(9)
    expect(relativeDaysAfter('2026-07-10', NOW)).toBe(1)
    expect(relativeDaysAfter('2027-01-01', NOW)).toBe(1)
    expect(timeRangeTier({ after: '2026-07-01' }, NOW)).toBe('week')
    expect(timeRangeTier({ after: '2026-07-09' }, NOW)).toBe('day')
    expect(ddgDateFilter('week')).toBe('w')
    expect(timeRangeDays({ after: '2026-06-01' }, NOW)).toBe(39)
  })

  it('uses local calendar days for the 14/15 and 90/91-day tier edges', () => {
    const localNow = new Date(2026, 10, 19, 1, 0, 0)
    const days14 = localDateDaysBefore(localNow, 14)
    const days15 = localDateDaysBefore(localNow, 15)
    const days90 = localDateDaysBefore(localNow, 90)
    const days91 = localDateDaysBefore(localNow, 91)

    expect(relativeDaysAfter(days14, localNow)).toBe(14)
    expect(timeRangeDays({ after: days14 }, localNow)).toBe(14)
    expect(timeRangeTier({ after: days14 }, localNow)).toBe('week')

    expect(relativeDaysAfter(days15, localNow)).toBe(15)
    expect(timeRangeDays({ after: days15 }, localNow)).toBe(15)
    expect(timeRangeTier({ after: days15 }, localNow)).toBe('month')

    expect(relativeDaysAfter(days90, localNow)).toBe(90)
    expect(timeRangeTier({ after: days90 }, localNow)).toBe('month')

    expect(relativeDaysAfter(days91, localNow)).toBe(91)
    expect(timeRangeDays({ after: days91 }, localNow)).toBe(91)
    expect(timeRangeTier({ after: days91 }, localNow)).toBe('year')
  })

  it('renders stable cache keys and labels', () => {
    expect(timeRangeKey({ days: 3 })).toBe('days:3')
    expect(timeRangeKey({ after: '2026-07-01' })).toBe('after:2026-07-01')
    expect(timeRangeKey(undefined)).toBe('')
    expect(timeRangeLabel({ days: 3 })).toBe('3d')
    expect(timeRangeLabel({ after: '2026-07-01' })).toBe('after 2026-07-01')
  })
})
