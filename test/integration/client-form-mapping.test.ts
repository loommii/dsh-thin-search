/**
 * Built-client integration: the shipped lib/client.js registers the
 * plugins.bundle.config card keyed by the package name, renders it with no
 * owner form props, writes each control immediately through ConfigForms,
 * switches the global web provider, and exposes the /thin-search-engine
 * command.
 */
import { describe, expect, it } from 'vitest'
import { createClientHarness, type FakeForm } from './client-harness'

/** Join all text rendered inside an element list. */
function textOf(elements: readonly { readonly props: Record<string, any> }[]): string {
  const parts: string[] = []
  const collect = (node: unknown): void => {
    if (typeof node === 'string' || typeof node === 'number') { parts.push(String(node)); return }
    if (Array.isArray(node)) { for (const child of node) collect(child); return }
    if (node === null || typeof node !== 'object') return
    const props = (node as { props?: Record<string, any> }).props
    if (props !== undefined) collect(props['children'])
  }
  for (const element of elements) collect(element.props['children'])
  return parts.join(' ')
}

/** Accepted thin-search section used by the card tests. */
const THIN_SEARCH = {
  provider: 'bing',
  platforms: ['github', 'npm'],
  cacheTtl: 5,
  searchEnhance: false,
  enhanceModel: '',
  enhanceSystemPromptPath: '',
  bingMarket: 'zh-CN',
  region: '',
  searxngInstances: [],
}

describe('built client registration and bundle card mapping', () => {
  it('loads through window.__ModuleLoader__.load and registers the guarded bundle card', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH })
    expect(harness.definitionId).toBe('dsh-thin-search')
    expect(harness.exports['apply']).toBeTypeOf('function')
    expect([...harness.exports['inject']]).toEqual(['slots', 'locale', 'remote', 'remote.web', 'configForms'])
    expect(harness.whileServed).toEqual([['thin-search']])
    expect(harness.registrations).toHaveLength(1)
    expect(harness.registrations[0]?.options).toEqual({
      name: 'plugins.bundle.config',
      key: 'dsh-thin-search',
      locale: 'thin-search',
    })
    expect(harness.registrations.filter((entry) => entry.options['name'] === 'plugins.row.config')).toEqual([])
    expect(harness.registrations.filter((entry) => entry.options['name'] === 'settings.section')).toEqual([])
    expect(harness.source).toContain('plugins.bundle.config')
    expect(harness.source).not.toContain('plugins.row.config')
    expect(harness.source).not.toContain('settings.section')
    const en = harness.dictionaries['thin-search']?.['en'] ?? {}
    const zh = harness.dictionaries['thin-search']?.['zh'] ?? {}
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('renders the dsh-context-style card without owner form props', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH })
    harness.renderPage()
    await harness.flush()
    const elements = harness.renderPage()
    expect(elements.filter((element) => element.type === 'select')).toEqual([])
    expect(harness.find('engine')?.props['className']).toBe('dsts-settings-select')
    expect(harness.find('engine')?.props['aria-haspopup']).toBe('menu')
    expect(harness.find('provider')?.props['className']).toBe('dsts-settings-select')
    expect(harness.find('enhance')?.props['role']).toBe('switch')
    expect(harness.find('enhance')?.props['aria-checked']).toBe(false)
    expect(harness.findAll('platforms')).toHaveLength(8)
    expect(harness.findAll('platforms').filter((element) => element.props['checked'] === true)).toHaveLength(2)
    expect(harness.findAll('save')).toEqual([])
    expect(harness.findAll('discard')).toEqual([])
    const classes = elements.map((element) => element.props['className']).filter((value): value is string => typeof value === 'string')
    expect(classes).toContain('dsts-settings-group')
    expect(classes).toContain('dsts-settings-row')
    expect(classes).toContain('dsts-settings-label')
  })

  it('writes the preferred engine immediately on a pill pick', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH, revision: 3 })
    harness.click('engine')
    harness.clickOption('engine', 'ddg')
    await harness.flush()
    const thin = harness.forms.get('thin-search') as FakeForm
    expect(thin.calls).toEqual([{ kind: 'set', field: 'provider', value: 'ddg', revision: 3 }])
  })

  it('writes switches and platform checks immediately', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH })
    harness.click('enhance')
    harness.toggle('platforms', true, 'dsts-platform-v2ex')
    await harness.flush()
    const thin = harness.forms.get('thin-search') as FakeForm
    expect(thin.calls).toEqual([
      { kind: 'set', field: 'searchEnhance', value: true, revision: 0 },
      { kind: 'set', field: 'platforms', value: ['github', 'v2ex', 'npm'], revision: 1 },
    ])
  })

  it('commits text on blur/Enter and clears a draft on Escape', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH })
    harness.change('cache-ttl', '0')
    harness.blur('cache-ttl')
    harness.change('enhance-model', 'draft-model')
    harness.keyDown('enhance-model', 'Escape')
    await harness.flush()
    const thin = harness.forms.get('thin-search') as FakeForm
    expect(thin.calls).toEqual([{ kind: 'set', field: 'cacheTtl', value: 0, revision: 0 }])
    expect(harness.find('enhance-model')?.props['value']).toBe('')
  })

  it('switches the global provider through configForms.get("web").set("searchProvider", id)', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH })
    harness.renderPage()
    await harness.flush()
    harness.click('provider')
    expect(harness.findAll('provider-option').map((option) => option.props['data-value'])).toEqual([
      'thin-search',
      'deepseek-official',
    ])
    harness.clickOption('provider', 'deepseek-official')
    await harness.flush()
    const web = harness.forms.get('web') as FakeForm
    expect(web.calls).toEqual([{ kind: 'set', field: 'searchProvider', value: 'deepseek-official', revision: 0 }])
  })

  it('registers the /thin-search-engine command and writes the preferred engine', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH })
    expect(harness.commands).toHaveLength(1)
    const command = harness.commands[0]!
    expect(command['name']).toBe('thin-search-engine')
    const options = await command['ui'].options({}, new AbortController().signal) as { id: string; active?: boolean }[]
    expect(options.map((option) => option.id)).toEqual(['bing', 'anysearch', 'searxng', 'ddg', 'ddg-lite'])
    expect(options[0]?.active).toBe(true)
    await command['ui'].onSelect({ id: 'searxng' }, {})
    const thin = harness.forms.get('thin-search') as FakeForm
    expect(thin.calls).toEqual([{ kind: 'set', field: 'provider', value: 'searxng', revision: 0 }])
  })

  it('renders the read-only note and disables every settings control', async () => {
    const harness = await createClientHarness({
      thinSearch: THIN_SEARCH,
      thinSearchWritable: false,
      webWritable: false,
    })
    const tree = harness.renderPage()
    expect(textOf(tree)).toContain('This deployment stores settings read-only.')
    expect(harness.find('engine')?.props['disabled']).toBe(true)
    expect(harness.find('enhance')?.props['disabled']).toBe(true)
    expect(harness.find('cache-ttl')?.props['disabled']).toBe(true)
    expect(harness.find('provider')?.props['disabled']).toBe(true)
    expect(harness.findAll('platforms').every((element) => element.props['disabled'] === true)).toBe(true)
    harness.click('engine')
    await harness.flush()
    const thin = harness.forms.get('thin-search') as FakeForm
    expect(thin.calls).toEqual([])
  })

  it('shows the Host-refusal note and keeps the accepted value after a rejected write', async () => {
    const harness = await createClientHarness({
      thinSearch: THIN_SEARCH,
      acceptThinSearchWrites: false,
    })
    harness.click('engine')
    harness.clickOption('engine', 'ddg')
    await harness.flush()
    const thin = harness.forms.get('thin-search') as FakeForm
    expect(thin.calls).toEqual([{ kind: 'set', field: 'provider', value: 'ddg', revision: 0 }])
    expect((thin.form.getSnapshot() as { value: { provider?: string } }).value.provider).toBe('bing')
    expect(textOf(harness.renderPage())).toContain('The Host refused the change.')
  })

  it('shows the unavailable note when the Host serves no thin-search namespace', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH, thinSearchStatus: 'unavailable' })
    const tree = harness.renderPage()
    expect(textOf(tree)).toContain('Thin Search settings are not served by this deployment.')
    expect(harness.find('engine')).toBeUndefined()
  })

  it('ships a browser bundle with no network or Node access', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH })
    expect(harness.source).not.toMatch(/XMLHttpRequest|node:fs/u)
    expect(harness.source).not.toMatch(/\bfetch\s*\(/u)
    const required = [...harness.source.matchAll(/require\("([^"]+)"\)/gu)].map((match) => match[1])
    expect(required).toEqual(['react', 'react/jsx-runtime'])
  })
})
