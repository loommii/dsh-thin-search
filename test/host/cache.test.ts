import { describe, expect, it } from 'vitest'
import { ResultCache } from '../../src/search/cache'

describe('ResultCache', () => {
  it('returns values until the TTL expires', () => {
    let now = 1_000
    const cache = new ResultCache<string>(10, () => now)
    cache.set('a', 'one', 500)
    expect(cache.get('a')).toBe('one')
    now += 499
    expect(cache.get('a')).toBe('one')
    now += 1
    expect(cache.get('a')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('evicts the least-recently-used entry above capacity', () => {
    const cache = new ResultCache<string>(2, () => 0)
    cache.set('a', 'one', 10_000)
    cache.set('b', 'two', 10_000)
    expect(cache.get('a')).toBe('one')
    cache.set('c', 'three', 10_000)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe('one')
    expect(cache.get('c')).toBe('three')
    expect(cache.size).toBe(2)
  })

  it('treats a non-positive TTL as a delete', () => {
    const cache = new ResultCache<string>(2, () => 0)
    cache.set('a', 'one', 10_000)
    cache.set('a', 'one', 0)
    expect(cache.get('a')).toBeUndefined()
  })

  it('supports delete and clear', () => {
    const cache = new ResultCache<string>(2, () => 0)
    cache.set('a', 'one', 10_000)
    expect(cache.delete('a')).toBe(true)
    expect(cache.delete('a')).toBe(false)
    cache.set('b', 'two', 10_000)
    cache.clear()
    expect(cache.size).toBe(0)
  })
})
