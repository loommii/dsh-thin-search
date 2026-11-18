import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAFT, PLATFORM_IDS } from '../../src/client/config'
import { ThinSearchRowConfig } from '../../src/client/page'
import { ThinSearchRuntime } from '../../src/client/runtime'
import { createFakeContext, pageForm, type FakeForm } from './helpers'

// React 18's act() requires this flag outside a real renderer environment.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Mount the page over the fake context and return its renderer. */
async function mount(): Promise<{
  readonly context: ReturnType<typeof createFakeContext>
  readonly thin: FakeForm<unknown>
  readonly renderer: ReactTestRenderer
}> {
  const context = createFakeContext({
    sections: {
      'thin-search': { ...DEFAULT_DRAFT, platforms: [...PLATFORM_IDS] },
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
  await runtime.refreshProviders()
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(<ThinSearchRowConfig view="page" form={pageForm(thin)} runtime={runtime} />)
  })
  return { context, thin, renderer }
}

/** Fire a change event with one fake DOM target. */
async function change(renderer: ReactTestRenderer, control: string, value: string): Promise<void> {
  const node = renderer.root.findByProps({ 'data-control': control })
  await act(async () => {
    node.props.onChange({ currentTarget: { value } })
  })
}

describe('Thin Search page interactions', () => {
  it('saves edited fields through the owner form mutate with the read revision', async () => {
    const { thin, renderer } = await mount()
    await change(renderer, 'engine', 'ddg')
    const save = renderer.root.findByProps({ 'data-control': 'save' })
    expect(save.props.disabled).toBe(false)
    await act(async () => { save.props.onClick() })
    await act(async () => { await Promise.resolve() })
    expect(thin.calls).toEqual([
      { kind: 'mutate', revision: 0, ops: [{ op: 'set', path: ['provider'], value: 'ddg' }] },
    ])
  })

  it('switches the global provider through configForms.get("web").set("searchProvider", id)', async () => {
    const { context, renderer } = await mount()
    await change(renderer, 'provider', 'deepseek-official')
    expect(context.forms.get('web')?.calls).toEqual([
      { kind: 'set', field: 'searchProvider', value: 'deepseek-official' },
    ])
  })

  it('does not write anything before the user changes a field', async () => {
    const { context, thin, renderer } = await mount()
    expect(thin.calls).toEqual([])
    expect(context.forms.get('web')?.calls).toEqual([])
    renderer.unmount()
  })
})
