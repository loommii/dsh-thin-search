/**
 * Read-side cache over `ctx.remote.web.listProviders()`.
 *
 * The page and no other surface need the provider list; this module keeps the
 * last accepted list, coalesces concurrent reads, drops late answers after
 * disposal, and publishes an immutable snapshot the React page subscribes to.
 * @module dsh-thin-search/client/provider-directory
 */
import type { RemoteWebService, WebProviderInfo } from './types'

/** Immutable provider-directory state published to the page. */
export interface ProviderDirectorySnapshot {
  /** `idle` before the first read, `loading` during one, `error` after a failed read. */
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  /** Last accepted search providers; retained across a failed refresh. */
  readonly providers: readonly WebProviderInfo[]
}

/** The empty snapshot before the first read. */
export const EMPTY_PROVIDER_DIRECTORY: ProviderDirectorySnapshot = Object.freeze({
  status: 'idle',
  providers: Object.freeze([]),
})

/** Reads and caches the registered search providers. */
export class ProviderDirectory {
  private snapshot: ProviderDirectorySnapshot = EMPTY_PROVIDER_DIRECTORY
  private readonly listeners = new Set<() => void>()
  private loading: Promise<void> | undefined
  private rerun = false
  private sequence = 0
  private disposed = false

  /**
   * @param web - the `remote.web` client namespace.
   */
  constructor(private readonly web: RemoteWebService) {}

  /** Current snapshot; stable until the next accepted read. */
  getSnapshot = (): ProviderDirectorySnapshot => this.snapshot

  /** Observe snapshot replacements. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Load once if no read has started; repeated calls are no-ops. */
  ensure(): void {
    if (this.snapshot.status === 'idle') void this.refresh()
  }

  /**
   * Re-read the provider list. A request arriving while a read is in flight
   * marks a pending refresh; concurrent callers share the running promise.
   * The loop drains every pending request, so an event arriving during a rerun
   * triggers another read. Disposal stops the loop immediately and no rerun
   * starts afterwards.
   */
  async refresh(): Promise<void> {
    if (this.disposed) return
    if (this.loading !== undefined) {
      this.rerun = true
      return this.loading
    }
    const task = this.refreshLoop()
    this.loading = task
    try {
      await task
    } finally {
      if (this.loading === task) this.loading = undefined
    }
  }

  /**
   * Drain the current read and every refresh requested while it was running:
   * as long as a request arrives during a read, another read follows. Once no
   * request is pending, the loop terminates; disposal stops it immediately.
   */
  private async refreshLoop(): Promise<void> {
    do {
      this.rerun = false
      await this.readOnce()
    } while (this.rerun && !this.disposed)
  }

  /** Perform one read and publish its latest answer. */
  private async readOnce(): Promise<void> {
    const sequence = ++this.sequence
    this.publish({ status: this.snapshot.status === 'ready' ? 'ready' : 'loading', providers: this.snapshot.providers })
    try {
      const response = await this.web.listProviders()
      if (this.disposed || sequence !== this.sequence) return
      if (response.ok) this.publish({ status: 'ready', providers: response.value.search })
      else this.publish({ status: 'error', providers: this.snapshot.providers })
    } catch {
      if (this.disposed || sequence !== this.sequence) return
      this.publish({ status: 'error', providers: this.snapshot.providers })
    }
  }

  /** Publish one immutable snapshot and notify subscribers. */
  private publish(next: ProviderDirectorySnapshot): void {
    this.snapshot = Object.freeze(next)
    for (const listener of [...this.listeners]) listener()
  }

  /** Stop publishing; queued and in-flight answers become stale. */
  dispose(): void {
    this.disposed = true
    this.rerun = false
    this.sequence += 1
    this.listeners.clear()
  }
}
