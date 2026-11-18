import { describe, expect, it } from 'vitest'
import { ThinSearchRuntime } from '../../src/client/runtime'
import { createFakeContext, createFakeForm, flushMicrotasks } from './helpers'

describe('ThinSearchRuntime', () => {
  it('writes the global provider through configForms.get("web").set("searchProvider", id)', async () => {
    const context = createFakeContext()
    const runtime = new ThinSearchRuntime(context)
    await expect(runtime.setSearchProvider('thin-search')).resolves.toBe(true)
    const calls = context.forms.get('web')?.calls ?? []
    expect(calls).toEqual([{ kind: 'set', field: 'searchProvider', value: 'thin-search' }])
  })

  it('forwards a refused provider switch instead of inventing an answer', async () => {
    const context = createFakeContext()
    context.forms.set('web', createFakeForm({ value: { searchProvider: 'thin-search' }, accept: false }))
    const runtime = new ThinSearchRuntime(context)
    await expect(runtime.setSearchProvider('deepseek-official')).resolves.toBe(false)
    expect(context.forms.get('web')?.calls).toEqual([{ kind: 'set', field: 'searchProvider', value: 'deepseek-official' }])
  })

  it('reads and writes the preferred engine through the thin-search form', async () => {
    const context = createFakeContext({ sections: { 'thin-search': { provider: 'searxng' }, web: { searchProvider: 'thin-search' } } })
    const runtime = new ThinSearchRuntime(context)
    expect(runtime.currentEngine()).toBe('searxng')
    await expect(runtime.setPreferredEngine('ddg')).resolves.toBe(true)
    expect(context.forms.get('thin-search')?.calls).toEqual([{ kind: 'set', field: 'provider', value: 'ddg' }])
  })

  it('falls back to bing when the stored engine is unknown', () => {
    const context = createFakeContext({ sections: { 'thin-search': { provider: 'altavista' }, web: {} } })
    const runtime = new ThinSearchRuntime(context)
    expect(runtime.currentEngine()).toBe('bing')
  })

  it('binds copy and resolves provider descriptions through ctx.locale', () => {
    const context = createFakeContext({ locale: 'zh' })
    const runtime = new ThinSearchRuntime(context)
    expect(runtime.t('provider.title')).toBe('搜索提供方')
    expect(runtime.resolveText({ en: 'English', zh: '中文' })).toBe('中文')
  })

  it('refreshes the provider list on Host events', async () => {
    const context = createFakeContext()
    new ThinSearchRuntime(context)
    const changed = context.records.remoteHandlers.get('web/providers-changed')
    const reset = context.records.eventHandlers.get('connection/reset')
    expect(changed).toBeTypeOf('function')
    expect(reset).toBeTypeOf('function')
    changed?.()
    await flushMicrotasks()
    reset?.()
    await flushMicrotasks()
    expect(context.records.providerReads).toBe(2)
  })

  it('unsubscribes from both events on dispose', () => {
    const context = createFakeContext()
    const runtime = new ThinSearchRuntime(context)
    runtime.dispose()
    expect(context.records.unsubscribed).toEqual(expect.arrayContaining(['remote:web/providers-changed', 'event:connection/reset']))
  })
})
