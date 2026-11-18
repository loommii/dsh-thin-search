import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_DRAFT, type ThinSearchValues } from '../../src/client/config'
import { ThinSearchBundleConfig } from '../../src/client/page'
import { ThinSearchRuntime } from '../../src/client/runtime'
import type { ConfigForm } from '../../src/client/types'
import { createFakeContext, type FakeForm } from './helpers'

// React 18's act() requires this flag outside a real renderer environment.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Mount the bundle card over the fake context and return its renderer. */
async function mount(): Promise<{
  readonly context: ReturnType<typeof createFakeContext>
  readonly thin: FakeForm<unknown>
  readonly renderer: ReactTestRenderer
}> {
  const context = createFakeContext({
    sections: {
      'thin-search': { ...DEFAULT_DRAFT, platforms: ['github', 'npm'], searchEnhance: false },
      web: { searchProvider: 'thin-search' },
    },
    providers: {
      kind: 'list',
      providers: [
        { id: 'thin-search', title: 'Thin Search' },
        { id: 'deepseek-official', title: 'DeepSeek Search' },
      ],
    },
  })
  const thin = context.forms.get('thin-search')
  if (thin === undefined) throw new Error('missing thin-search form double')
  const runtime = new ThinSearchRuntime(context)
  runtime.attach(thin.form as unknown as ConfigForm<ThinSearchValues>)
  await runtime.refreshProviders()
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(<ThinSearchBundleConfig runtime={runtime} />)
  })
  return { context, thin, renderer }
}

/** Click one pill option after opening its menu. */
async function pick(renderer: ReactTestRenderer, control: string, value: string): Promise<void> {
  const trigger = renderer.root.findByProps({ 'data-control': control })
  await act(async () => { trigger.props.onClick() })
  const option = renderer.root.findByProps({ 'data-control': `${control}-option`, 'data-value': value })
  await act(async () => { option.props.onClick() })
}

describe('Thin Search bundle card interactions', () => {
  it('writes the preferred engine immediately on a pill pick', async () => {
    const { thin, renderer } = await mount()
    await pick(renderer, 'engine', 'ddg')
    expect(thin.calls).toEqual([{ kind: 'set', field: 'provider', value: 'ddg', revision: 0 }])
  })

  it('writes the enhancement switch immediately on toggle', async () => {
    const { thin, renderer } = await mount()
    const toggle = renderer.root.findByProps({ 'data-control': 'enhance' })
    expect(toggle.props['aria-checked']).toBe(false)
    await act(async () => { toggle.props.onClick() })
    expect(thin.calls).toEqual([{ kind: 'set', field: 'searchEnhance', value: true, revision: 0 }])
  })

  it('writes the platform list immediately on a checkbox change', async () => {
    const { thin, renderer } = await mount()
    const v2ex = renderer.root.findByProps({ id: 'dsts-platform-v2ex' })
    await act(async () => { v2ex.props.onChange({}) })
    expect(thin.calls).toEqual([{ kind: 'set', field: 'platforms', value: ['github', 'v2ex', 'npm'], revision: 0 }])
  })

  it('commits text on blur and Enter, and writes immediately', async () => {
    const { thin, renderer } = await mount()
    const input = renderer.root.findByProps({ 'data-control': 'cache-ttl' })
    await act(async () => { input.props.onFocus() })
    await act(async () => { input.props.onChange({ currentTarget: { value: '0' } }) })
    const updated = renderer.root.findByProps({ 'data-control': 'cache-ttl' })
    await act(async () => { updated.props.onBlur() })
    expect(thin.calls).toEqual([{ kind: 'set', field: 'cacheTtl', value: 0, revision: 0 }])

    const market = renderer.root.findByProps({ 'data-control': 'bing-market' })
    await act(async () => { market.props.onFocus() })
    await act(async () => { market.props.onChange({ currentTarget: { value: 'en-US' } }) })
    const marketUpdated = renderer.root.findByProps({ 'data-control': 'bing-market' })
    await act(async () => {
      marketUpdated.props.onKeyDown({
        key: 'Enter',
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        nativeEvent: {},
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      })
    })
    expect(thin.calls).toEqual([
      { kind: 'set', field: 'cacheTtl', value: 0, revision: 0 },
      { kind: 'set', field: 'bingMarket', value: 'en-US', revision: 1 },
    ])
  })

  it('clears a text draft on Escape without writing it', async () => {
    const { thin, renderer } = await mount()
    const input = renderer.root.findByProps({ 'data-control': 'enhance-model' })
    await act(async () => { input.props.onFocus() })
    await act(async () => { input.props.onChange({ currentTarget: { value: 'draft-model' } }) })
    const updated = renderer.root.findByProps({ 'data-control': 'enhance-model' })
    await act(async () => {
      updated.props.onKeyDown({
        key: 'Escape',
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        nativeEvent: {},
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      })
    })
    expect(thin.calls).toEqual([])
    expect(renderer.root.findByProps({ 'data-control': 'enhance-model' }).props['value']).toBe('')
  })

  it('switches the global provider through configForms.get("web").set("searchProvider", id)', async () => {
    const { context, renderer } = await mount()
    await pick(renderer, 'provider', 'deepseek-official')
    expect(context.forms.get('web')?.calls).toEqual([
      { kind: 'set', field: 'searchProvider', value: 'deepseek-official', revision: 0 },
    ])
  })

  it('has no Save/Discard footer and disables controls on a read-only Host', async () => {
    const { thin, renderer } = await mount()
    expect(renderer.root.findAllByProps({ 'data-control': 'save' })).toHaveLength(0)
    expect(renderer.root.findAllByProps({ 'data-control': 'discard' })).toHaveLength(0)
    await act(async () => { thin.setSnapshot({ writable: false }) })
    expect(renderer.root.findByProps({ 'data-control': 'enhance' }).props['disabled']).toBe(true)
    expect(renderer.root.findAllByProps({ role: 'status' }).length).toBeGreaterThan(0)
  })

  it('does not write anything before the user changes a field', async () => {
    const { context, thin, renderer } = await mount()
    expect(thin.calls).toEqual([])
    expect(context.forms.get('web')?.calls).toEqual([])
    renderer.unmount()
  })
})
