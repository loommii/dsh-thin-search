import { describe, expect, it } from 'vitest'
import { apply, inject } from '../../src/client/index'
import { BUNDLE_CONFIG_KEY, BUNDLE_CONFIG_SLOT, COMMAND_NAME, THIN_SEARCH_NAMESPACE } from '../../src/client/config'
import { DICTIONARIES } from '../../src/client/locales'
import { commandNamed, createFakeContext, flushMicrotasks } from './helpers'

describe('client plugin registration', () => {
  it('declares the services the card and command require', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.web', 'configForms'])
  })

  it('registers the en/zh dictionaries for the thin-search namespace', () => {
    const context = createFakeContext()
    apply(context)
    expect(context.locale.registrations).toHaveLength(1)
    expect(context.locale.registrations[0]?.namespace).toBe('thin-search')
    expect(context.locale.registrations[0]?.dictionaries).toBe(DICTIONARIES)
  })

  it('registers only the bundle card inside configForms.whileServed(["thin-search"])', () => {
    const context = createFakeContext()
    apply(context)
    expect(context.records.whileServedCalls).toEqual([[THIN_SEARCH_NAMESPACE]])
    expect(context.records.registrations).toHaveLength(1)
    expect(context.records.registrations[0]?.options).toEqual({
      name: BUNDLE_CONFIG_SLOT,
      key: BUNDLE_CONFIG_KEY,
      locale: 'thin-search',
    })
    expect(BUNDLE_CONFIG_SLOT).toBe('plugins.bundle.config')
    expect(BUNDLE_CONFIG_KEY).toBe('dsh-thin-search')
  })

  it('does not register plugins.row.config or settings.section', () => {
    const context = createFakeContext()
    apply(context)
    const names = context.records.registrations.map((entry) => entry.options.name)
    expect(names).not.toContain('plugins.row.config')
    expect(names).not.toContain('settings.section')
  })

  it('does not mount the card when the Host serves no thin-search namespace', () => {
    const context = createFakeContext({ served: [] })
    apply(context)
    expect(context.records.registrations).toEqual([])
  })

  it('renders the page bundle view with no owner form props', () => {
    const context = createFakeContext()
    apply(context)
    const component = context.records.registrations[0]?.component as (props: { view: 'page' }) => unknown
    expect(() => component({ view: 'page' })).not.toThrow()
    expect(component({ view: 'page' })).toBeTruthy()
  })

  it('registers the /thin-search-engine command through the command UI', () => {
    const context = createFakeContext()
    apply(context)
    expect(context.records.injectCalls).toEqual([['commandUi']])
    const command = commandNamed(context, COMMAND_NAME)
    expect(command.label?.()).toBe('Thin Search engine')
  })

  it('sets the preferred engine through configForms.get("thin-search").set("provider", id)', async () => {
    const context = createFakeContext({ sections: { 'thin-search': { provider: 'bing' }, web: { searchProvider: 'thin-search' } } })
    apply(context)
    const command = commandNamed(context, COMMAND_NAME)
    await command.ui.onSelect({ id: 'searxng', label: 'SearXNG' }, {})
    expect(context.forms.get(THIN_SEARCH_NAMESPACE)?.calls).toEqual([{ kind: 'set', field: 'provider', value: 'searxng', revision: 0 }])
  })

  it('keeps the card working when the command UI is absent', () => {
    const context = createFakeContext({ withCommandUi: false })
    expect(() => { apply(context) }).not.toThrow()
    expect(context.records.registrations).toHaveLength(1)
    expect(context.records.commands).toEqual([])
  })

  it('does not read the provider list before the bundle card renders', async () => {
    const context = createFakeContext()
    apply(context)
    await flushMicrotasks()
    expect(context.records.providerReads).toBe(0)
  })
})
