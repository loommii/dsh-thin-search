import type { ReactElement } from 'react'
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

/** Minimal host-node mock so refs expose focus() and DOM-like containment. */
interface MockNode {
  readonly props: Record<string, any>
  readonly focus: ReturnType<typeof vi.fn>
  contains(node: unknown): boolean
}

/** Build a createNodeMock factory and its keyed node registry. */
function createMockNodes(): {
  readonly createNodeMock: (element: ReactElement) => MockNode
  readonly byKey: Map<string, MockNode>
} {
  const all: MockNode[] = []
  const byKey = new Map<string, MockNode>()
  const createNodeMock = (element: ReactElement): MockNode => {
    const props = element.props as Record<string, any>
    const node: MockNode = {
      props,
      focus: vi.fn(),
      contains: (child) => all.includes(child as MockNode),
    }
    all.push(node)
    const key = typeof props['data-value'] === 'string'
      ? `value:${props['data-value']}`
      : typeof props['data-control'] === 'string' ? `control:${props['data-control']}` : undefined
    if (key !== undefined) byKey.set(key, node)
    return node
  }
  return { createNodeMock, byKey }
}

/** Mount a pill whose refs are observable mocks. */
async function mountWithNodes(): Promise<{ readonly renderer: ReactTestRenderer; readonly byKey: Map<string, MockNode> }> {
  const mocks = createMockNodes()
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(
      <PillSelect
        id="dsts-pill"
        control="pill"
        label="Choice"
        value="a"
        options={OPTIONS}
        onChange={() => {}}
      />,
      { createNodeMock: mocks.createNodeMock },
    )
  })
  return { renderer, byKey: mocks.byKey }
}

/** Install a document stub that only exposes the active element and listeners. */
function installDocumentStub(): { readonly document: { activeElement: MockNode | null }; restore(): void } {
  const previous = (globalThis as { document?: unknown }).document
  const stub = {
    activeElement: null as MockNode | null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  ;(globalThis as { document?: unknown }).document = stub
  return {
    document: stub,
    restore() { (globalThis as { document?: unknown }).document = previous },
  }
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

  it('moves focus with ArrowUp/ArrowDown and Home/End', async () => {
    const { renderer, byKey } = await mountWithNodes()
    const dom = installDocumentStub()
    try {
      await open(renderer)
      const menu = renderer.root.findByProps({ role: 'menu' })
      const a = byKey.get('value:a')
      const b = byKey.get('value:b')
      expect(a).toBeDefined()
      expect(b).toBeDefined()
      if (a === undefined || b === undefined) return

      dom.document.activeElement = a
      await act(async () => { menu.props.onKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() }) })
      expect(b.focus).toHaveBeenCalled()

      dom.document.activeElement = b
      await act(async () => { menu.props.onKeyDown({ key: 'ArrowUp', preventDefault: vi.fn() }) })
      expect(a.focus).toHaveBeenCalled()

      dom.document.activeElement = b
      await act(async () => { menu.props.onKeyDown({ key: 'Home', preventDefault: vi.fn() }) })
      expect(a.focus).toHaveBeenCalled()

      dom.document.activeElement = a
      await act(async () => { menu.props.onKeyDown({ key: 'End', preventDefault: vi.fn() }) })
      expect(b.focus).toHaveBeenCalled()
      expect(renderer.root.findAllByProps({ role: 'menu' })).toHaveLength(1)
    } finally {
      dom.restore()
    }
  })

  it('does not close while focus moves inside the wrapper', async () => {
    const { renderer, byKey } = await mountWithNodes()
    await open(renderer)
    const wrap = renderer.root.findByProps({ 'data-control': 'pill-wrap' })
    const trigger = byKey.get('control:pill')
    expect(trigger).toBeDefined()
    if (trigger === undefined) return
    await act(async () => { wrap.props.onBlur({ relatedTarget: trigger }) })
    expect(renderer.root.findAllByProps({ role: 'menu' })).toHaveLength(1)
  })
})
