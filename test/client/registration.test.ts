import { describe, expect, it } from 'vitest'
import { apply, inject } from '../../src/client/index'
import { COMMAND_NAME, ROW_CONFIG_KEY, THIN_SEARCH_NAMESPACE } from '../../src/client/config'
import { DICTIONARIES } from '../../src/client/locales'
import { commandNamed, createFakeContext, flushMicrotasks } from './helpers'

describe('client plugin registration', () => {
  it('declares the services the page and command require', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.web', 'configForms'])
  })

  it('registers the en/zh dictionaries for the thin-search namespace', () => {
    const context = createFakeContext()
    apply(context)
    expect(context.locale.registrations).toHaveLength(1)
    expect(context.locale.registrations[0]?.namespace).toBe('thin-search')
    expect(context.locale.registrations[0]?.dictionaries).toBe(DICTIONARIES)
  })

  it('guards the row configuration with configForms.whileServed(["thin-search"])', () => {
    const context = createFakeContext()
    apply(context)
    expect(context.records.whileServedCalls).toEqual([[THIN_SEARCH_NAMESPACE]])
    expect(context.records.registrations).toHaveLength(1)
    expect(context.records.registrations[0]?.options).toEqual({
      name: 'plugins.row.config',
      key: ROW_CONFIG_KEY,
    })
    expect(ROW_CONFIG_KEY).toBe('dsh-thin-search#thin-search')
  })

  it('does not mount the row page when the Host serves no thin-search namespace', () => {
    const context = createFakeContext({ served: [] })
    apply(context)
    expect(context.records.registrations).toEqual([])
  })

  it('does not register the legacy settings.section card', () => {
    const context = createFakeContext()
    apply(context)
    expect(context.records.registrations.filter((entry) => entry.options.name === 'settings.section')).toEqual([])
  })

  it('renders the summary view as localized text', () => {
    const context = createFakeContext()
    apply(context)
    const component = context.records.registrations[0]?.component as (props: { view: 'summary' }) => unknown
    expect(component({ view: 'summary' })).toBe(DICTIONARIES.en?.['summary'])
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
    expect(context.forms.get(THIN_SEARCH_NAMESPACE)?.calls).toEqual([{ kind: 'set', field: 'provider', value: 'searxng' }])
  })

  it('keeps the page working when the command UI is absent', () => {
    const context = createFakeContext({ withCommandUi: false })
    expect(() => { apply(context) }).not.toThrow()
    expect(context.records.registrations).toHaveLength(1)
    expect(context.records.commands).toEqual([])
  })

  it('does not read the provider list before the row page renders', async () => {
    const context = createFakeContext()
    apply(context)
    const component = context.records.registrations[0]?.component as (props: { view: 'summary' }) => unknown
    expect(component({ view: 'summary' })).toBeTruthy()
    // The provider read is lazy: the page's effect calls ensureProviders when it
    // first renders. Rendering is covered by page.test.tsx; here assert that
    // applying the plugin does not read the Host before the page exists.
    await flushMicrotasks()
    expect(context.records.providerReads).toBe(0)
  })
})
