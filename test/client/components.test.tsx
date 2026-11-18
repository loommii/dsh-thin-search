import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { PillSelect } from '../../src/client/components'

// React 18's act() requires this flag outside a real renderer environment.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const OPTIONS = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]

/** Mount one pill select. */
async function mount(disabled = false): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(
      <PillSelect
        id="dsts-pill"
        control="pill"
        label="Choice"
        value="a"
        options={OPTIONS}
        disabled={disabled}
        onChange={() => {}}
      />,
    )
  })
  return renderer
}

/** Open the menu through the trigger. */
async function open(renderer: ReactTestRenderer): Promise<void> {
  const trigger = renderer.root.findByProps({ 'data-control': 'pill' })
  await act(async () => { trigger.props.onClick() })
}

describe('PillSelect focus and keyboard behavior', () => {
  it('closes when focus leaves the wrapper (focusout)', async () => {
    const renderer = await mount()
    await open(renderer)
    expect(renderer.root.findAllByProps({ role: 'menu' })).toHaveLength(1)
    const wrap = renderer.root.findByProps({ 'data-control': 'pill-wrap' })
    await act(async () => { wrap.props.onBlur({ relatedTarget: null }) })
    expect(renderer.root.findAllByProps({ role: 'menu' })).toHaveLength(0)
  })

  it('closes when the trigger becomes disabled', async () => {
    const renderer = await mount()
    await open(renderer)
    expect(renderer.root.findAllByProps({ role: 'menu' })).toHaveLength(1)
    await act(async () => {
      renderer.update(
        <PillSelect
          id="dsts-pill"
          control="pill"
          label="Choice"
          value="a"
          options={OPTIONS}
          disabled
          onChange={() => {}}
        />,
      )
    })
    expect(renderer.root.findAllByProps({ role: 'menu' })).toHaveLength(0)
    expect(renderer.root.findByProps({ 'data-control': 'pill' }).props['disabled']).toBe(true)
  })

  it('keeps closing on Escape', async () => {
    const renderer = await mount()
    await open(renderer)
    const menu = renderer.root.findByProps({ role: 'menu' })
    await act(async () => {
      menu.props.onKeyDown({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })
    })
    expect(renderer.root.findAllByProps({ role: 'menu' })).toHaveLength(0)
  })
})
