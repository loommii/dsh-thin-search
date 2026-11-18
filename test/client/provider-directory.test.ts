import { describe, expect, it } from 'vitest'
import { ProviderDirectory } from '../../src/client/provider-directory'
import type { RemoteResult, RemoteWebService, WebProviderInfo, WebProviderList } from '../../src/client/types'
import { flushMicrotasks } from './helpers'

/** A remote.web double that answers from a queue and counts reads. */
function fakeWeb(answers: (RemoteResult<WebProviderList> | Error)[]): RemoteWebService & { readonly reads: number } {
  let reads = 0
  return {
    get reads() { return reads },
    async listProviders() {
      const answer = answers[Math.min(reads, answers.length - 1)]
      reads += 1
      if (answer instanceof Error) throw answer
      return answer ?? { ok: true, value: { search: [], fetch: [] } }
    },
  }
}

const provider = (id: string): WebProviderInfo => ({ id, title: id })

describe('ProviderDirectory', () => {
  it('publishes the Host search providers from a successful read', async () => {
    const web = fakeWeb([{ ok: true, value: { search: [provider('thin-search')], fetch: [] } }])
    const directory = new ProviderDirectory(web)
    expect(directory.getSnapshot()).toEqual({ status: 'idle', providers: [] })
    await directory.refresh()
    expect(directory.getSnapshot()).toEqual({ status: 'ready', providers: [provider('thin-search')] })
    expect(web.reads).toBe(1)
  })

  it('loads once on ensure and coalesces a read already in flight', async () => {
    const web = fakeWeb([{ ok: true, value: { search: [provider('a')], fetch: [] } }])
    const directory = new ProviderDirectory(web)
    directory.ensure()
    directory.ensure()
    const second = directory.refresh()
    await second
    await flushMicrotasks()
    expect(web.reads).toBe(1)
    expect(directory.getSnapshot().status).toBe('ready')
  })

  it('keeps the last accepted list when a refresh fails', async () => {
    const web = fakeWeb([
      { ok: true, value: { search: [provider('a')], fetch: [] } },
      { ok: false, error: 'unavailable' },
    ])
    const directory = new ProviderDirectory(web)
    await directory.refresh()
    await directory.refresh()
    expect(directory.getSnapshot()).toEqual({ status: 'error', providers: [provider('a')] })
  })

  it('reports a thrown read as an error without throwing', async () => {
    const directory = new ProviderDirectory(fakeWeb([new Error('network')]))
    await expect(directory.refresh()).resolves.toBeUndefined()
    expect(directory.getSnapshot().status).toBe('error')
  })

  it('notifies subscribers with a new snapshot', async () => {
    const web = fakeWeb([{ ok: true, value: { search: [provider('a')], fetch: [] } }])
    const directory = new ProviderDirectory(web)
    let notifications = 0
    const dispose = directory.subscribe(() => { notifications += 1 })
    await directory.refresh()
    expect(notifications).toBeGreaterThanOrEqual(2)
    dispose()
    await directory.refresh()
    expect(notifications).toBeGreaterThanOrEqual(2)
  })

  it('drops a late answer after disposal', async () => {
    let resolveRead!: (value: RemoteResult<WebProviderList>) => void
    const web: RemoteWebService = {
      listProviders: () => new Promise((resolve) => { resolveRead = resolve }),
    }
    const directory = new ProviderDirectory(web)
    const pending = directory.refresh()
    directory.dispose()
    resolveRead({ ok: true, value: { search: [provider('late')], fetch: [] } })
    await pending
    expect(directory.getSnapshot().providers).toEqual([])
  })
})
