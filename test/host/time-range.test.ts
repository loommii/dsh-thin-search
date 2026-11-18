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

const NOW = new Date('2026-07-10T12:00:00.000Z')

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
    expect(parseTimeRange('2026-07-01')).toEqual({ after: '2026-07-01' })
    expect(parseTimeRange('2026-02-31')).toBeUndefined()
    expect(parseTimeRange('2026-13-01')).toBeUndefined()
    expect(parseTimeRange('01-07-2026')).toBeUndefined()
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

  it('accepts already parsed objects', () => {
    expect(parseTimeRange({ days: 4 })).toEqual({ days: 4 })
    expect(parseTimeRange({ after: '2026-07-01' })).toEqual({ after: '2026-07-01' })
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

  it('renders stable cache keys and labels', () => {
    expect(timeRangeKey({ days: 3 })).toBe('days:3')
    expect(timeRangeKey({ after: '2026-07-01' })).toBe('after:2026-07-01')
    expect(timeRangeKey(undefined)).toBe('')
    expect(timeRangeLabel({ days: 3 })).toBe('3d')
    expect(timeRangeLabel({ after: '2026-07-01' })).toBe('after 2026-07-01')
  })
})
