/** Small LRU cache with per-entry TTL, used for search results. */

interface CacheEntry<V> {
  readonly value: V
  readonly expiresAt: number
}

/**
 * Insertion-ordered map used as an LRU. A successful {@link get} refreshes
 * recency; an expired entry is removed on read. TTL 0 is not special here —
 * callers disable the cache instead of inserting zero-lifetime entries.
 */
export class ResultCache<V> {
  private readonly entries = new Map<string, CacheEntry<V>>()

  constructor(
    private readonly capacity = 50,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new TypeError('ResultCache capacity must be a positive integer')
    }
  }

  /** Read and refresh one entry; expired entries are treated as absent. */
  get(key: string): V | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  /** Insert or replace one entry, evicting the least-recently-used entry above capacity. */
  set(key: string, value: V, ttlMs: number): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      this.entries.delete(key)
      return
    }
    const expiresAt = this.now() + ttlMs
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt })
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  /** Remove one entry. */
  delete(key: string): boolean {
    return this.entries.delete(key)
  }

  /** Remove every entry. */
  clear(): void {
    this.entries.clear()
  }

  /** Number of retained entries, including entries that will expire on next read. */
  get size(): number {
    return this.entries.size
  }
}
