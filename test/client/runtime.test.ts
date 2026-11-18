import { describe, expect, it } from 'vitest'
import { ThinSearchRuntime } from '../../src/client/runtime'
import { DEFAULT_DRAFT, type ThinSearchValues } from '../../src/client/config'
import type { ConfigForm } from '../../src/client/types'
import { createFakeContext, createFakeForm, flushMicrotasks, type FakeForm } from './helpers'

/** Attach a thin-search form double to a runtime built over a fake context. */
function attached(options: { readonly value?: Record<string, unknown>; readonly accept?: boolean; readonly revision?: number; readonly writable?: boolean } = {}) {
  const context = createFakeContext({
    sections: {
      'thin-search': options.value ?? { ...DEFAULT_DRAFT, provider: 'bing' },
      web: { searchProvider: 'thin-search' },
    },
  })
  const thin = createFakeForm({
    value: options.value ?? { ...DEFAULT_DRAFT, provider: 'bing' },
    ...(options.accept === undefined ? {} : { accept: options.accept }),
    ...(options.revision === undefined ? {} : { revision: options.revision }),
    ...(options.writable === undefined ? {} : { writable: options.writable }),
  })
  context.forms.set('thin-search', thin as FakeForm<unknown>)
  const runtime = new ThinSearchRuntime(context)
  const detach = runtime.attach(thin.form)
  return { context, thin, runtime, detach }
}

describe('ThinSearchRuntime', () => {
  it('holds configForms.get("thin-search") and publishes it without owner props', () => {
    const { runtime } = attached({ revision: 3 })
    expect(runtime.getSettingsSnapshot().status).toBe('ready')
    expect(runtime.getSettingsSnapshot().revision).toBe(3)
    expect(runtime.getSettingsSnapshot().values.provider).toBe('bing')
  })

  it('writes one field immediately with the current revision', async () => {
    const { thin, runtime } = attached({ revision: 4 })
    await expect(runtime.writeSetting('provider', 'ddg')).resolves.toBe(true)
    expect(thin.calls).toEqual([{ kind: 'set', field: 'provider', value: 'ddg', revision: 4 }])
    expect(runtime.getSettingsSnapshot().values.provider).toBe('ddg')
  })

  it('maps the SearXNG textarea to the instance array and trims text', async () => {
    const { thin, runtime } = attached()
    await runtime.writeSetting('searxngText', 'https://a.example.com/\nhttps://b.example.com')
    await runtime.writeSetting('bingMarket', ' en-US ')
    expect(thin.calls).toEqual([
      { kind: 'set', field: 'searxngInstances', value: ['https://a.example.com', 'https://b.example.com'], revision: 0 },
      { kind: 'set', field: 'bingMarket', value: 'en-US', revision: 1 },
    ])
  })

  it('refuses an invalid value before it reaches the Host', async () => {
    const { thin, runtime } = attached()
    await expect(runtime.writeSetting('cacheTtl', -1)).resolves.toBe(false)
    expect(thin.calls).toEqual([])
    expect(runtime.getSettingsSnapshot().errors.cacheTtl?.key).toBe('validation.cacheTtl')
  })

  it('keeps a field error across another field write and clears it on its own success', async () => {
    const { runtime } = attached()
    await expect(runtime.writeSetting('enhanceSystemPromptPath', 'prompt.md')).resolves.toBe(false)
    expect(runtime.getSettingsSnapshot().errors.enhanceSystemPromptPath?.key).toBe('validation.enhanceSystemPromptPath')
    await expect(runtime.writeSetting('platforms', ['github'])).resolves.toBe(true)
    expect(runtime.getSettingsSnapshot().errors.enhanceSystemPromptPath?.key).toBe('validation.enhanceSystemPromptPath')
    await expect(runtime.writeSetting('enhanceSystemPromptPath', '/tmp/prompt.md')).resolves.toBe(true)
    expect(runtime.getSettingsSnapshot().errors.enhanceSystemPromptPath).toBeUndefined()
  })

  it('keeps a field validation error when the Host refuses that field write', async () => {
    const { runtime } = attached({ accept: false })
    await expect(runtime.writeSetting('enhanceSystemPromptPath', 'prompt.md')).resolves.toBe(false)
    expect(runtime.getSettingsSnapshot().errors.enhanceSystemPromptPath?.key).toBe('validation.enhanceSystemPromptPath')
    await expect(runtime.writeSetting('enhanceSystemPromptPath', '/tmp/prompt.md')).resolves.toBe(false)
    expect(runtime.getSettingsSnapshot().errors.enhanceSystemPromptPath?.key).toBe('validation.enhanceSystemPromptPath')
  })

  it('ignores an older accepted write when the field has a newer validation error (C24-F1)', async () => {
    const context = createFakeContext({
      sections: { 'thin-search': { ...DEFAULT_DRAFT, provider: 'bing' }, web: { searchProvider: 'thin-search' } },
    })
    const thin = createFakeForm({ value: { ...DEFAULT_DRAFT, provider: 'bing' } })
    context.forms.set('thin-search', thin as FakeForm<unknown>)
    const originalSet = thin.form.set.bind(thin.form)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let first = true
    const deferredForm = {
      ...thin.form,
      async set(field: string, value: unknown) {
        if (first) {
          first = false
          await gate
        }
        return originalSet(field, value)
      },
    } as unknown as ConfigForm<ThinSearchValues>
    const runtime = new ThinSearchRuntime(context)
    runtime.attach(deferredForm)

    const oldWrite = runtime.writeSetting('enhanceSystemPromptPath', '/old/prompt.md')
    await expect(runtime.writeSetting('enhanceSystemPromptPath', 'relative.md')).resolves.toBe(false)
    expect(runtime.getSettingsSnapshot().errors.enhanceSystemPromptPath?.key).toBe('validation.enhanceSystemPromptPath')
    release()
    await expect(oldWrite).resolves.toBe(true)
    expect(runtime.getSettingsSnapshot().errors.enhanceSystemPromptPath?.key).toBe('validation.enhanceSystemPromptPath')

    await expect(runtime.writeSetting('enhanceSystemPromptPath', '/new/prompt.md')).resolves.toBe(true)
    expect(runtime.getSettingsSnapshot().errors.enhanceSystemPromptPath).toBeUndefined()
  })

  it('ignores a stale rejection after a newer successful write (C27-F2)', async () => {
    const context = createFakeContext({
      sections: { 'thin-search': { ...DEFAULT_DRAFT, provider: 'bing' }, web: { searchProvider: 'thin-search' } },
    })
    const thin = createFakeForm({ value: { ...DEFAULT_DRAFT, provider: 'bing' } })
    context.forms.set('thin-search', thin as FakeForm<unknown>)
    const originalSet = thin.form.set.bind(thin.form)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let first = true
    const deferredForm = {
      ...thin.form,
      async set(field: string, value: unknown) {
        if (first) {
          first = false
          await gate
          return false
        }
        return originalSet(field, value)
      },
    } as unknown as ConfigForm<ThinSearchValues>
    const runtime = new ThinSearchRuntime(context)
    runtime.attach(deferredForm)

    const stale = runtime.writeSetting('provider', 'ddg')
    await expect(runtime.writeSetting('cacheTtl', 0)).resolves.toBe(true)
    expect(runtime.getSettingsSnapshot().writeFailed).toBe(false)
    release()
    await expect(stale).resolves.toBe(false)
    expect(runtime.getSettingsSnapshot().writeFailed).toBe(false)
    expect(runtime.getSettingsSnapshot().values.provider).toBe('bing')
  })

  it('reports a Host refusal and restores the accepted values', async () => {
    const { runtime } = attached({ accept: false })
    await expect(runtime.writeSetting('provider', 'ddg')).resolves.toBe(false)
    expect(runtime.getSettingsSnapshot().writeFailed).toBe(true)
    expect(runtime.getSettingsSnapshot().values.provider).toBe('bing')
  })

  it('writes the global provider through configForms.get("web").set("searchProvider", id)', async () => {
    const { context, runtime } = attached()
    await expect(runtime.setSearchProvider('thin-search')).resolves.toBe(true)
    expect(context.forms.get('web')?.calls).toEqual([
      { kind: 'set', field: 'searchProvider', value: 'thin-search', revision: 0 },
    ])
  })

  it('reads and writes the preferred engine through the attached form', async () => {
    const { thin, runtime } = attached({ value: { provider: 'searxng' } })
    expect(runtime.currentEngine()).toBe('searxng')
    await expect(runtime.setPreferredEngine('ddg')).resolves.toBe(true)
    expect(thin.calls).toEqual([{ kind: 'set', field: 'provider', value: 'ddg', revision: 0 }])
  })

  it('falls back to bing when the stored engine is unknown', () => {
    const { runtime } = attached({ value: { provider: 'altavista' } })
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

  it('unsubscribes from events and returns to loading on detach', () => {
    const { context, runtime, detach } = attached()
    detach()
    expect(runtime.getSettingsSnapshot().status).toBe('loading')
    runtime.dispose()
    expect(context.records.unsubscribed).toEqual(expect.arrayContaining(['remote:web/providers-changed', 'event:connection/reset']))
  })
})
