/**
 * Built-client integration: the shipped lib/client.js registers the
 * plugins.row.config page, maps the owner form to native controls, saves
 * edits through form.mutate with the read revision, switches the global web
 * provider through ConfigForms, and exposes the /thin-search-engine command.
 */
import { describe, expect, it } from 'vitest'
import { createClientHarness, type FakeForm } from './client-harness'

/** Accepted thin-search section used by the page tests. */
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

describe('built client registration and form mapping', () => {
  it('loads through window.__ModuleLoader__.load and registers the guarded row page', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH })
    expect(harness.definitionId).toBe('dsh-thin-search')
    expect(harness.exports['apply']).toBeTypeOf('function')
    expect([...harness.exports['inject']]).toEqual(['slots', 'locale', 'remote', 'remote.web', 'configForms'])
    expect(harness.whileServed).toEqual([['thin-search']])
    expect(harness.registrations).toHaveLength(1)
    expect(harness.registrations[0]?.options).toEqual({
      name: 'plugins.row.config',
      key: 'dsh-thin-search#thin-search',
    })
    expect(harness.renderSummary()).toBe(
      'Free, keyless web search with engine fallback, result caching, optional model enhancement, and platform search.',
    )
    const en = harness.dictionaries['thin-search']?.['en'] ?? {}
    const zh = harness.dictionaries['thin-search']?.['zh'] ?? {}
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('maps the accepted section onto native controls and a platform checklist', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH })
    const tree = harness.renderPage()
    expect(harness.find('engine')?.props['value']).toBe('bing')
    expect(harness.find('provider')?.props['value']).toBe('thin-search')
    expect(harness.find('cache-ttl')?.props['value']).toBe(5)
    expect(harness.find('enhance')?.props['aria-checked']).toBe(false)
    expect(harness.find('bing-market')?.props['value']).toBe('zh-CN')
    const platforms = tree.filter((element) => element.props['data-control'] === 'platforms')
    expect(platforms).toHaveLength(8)
    expect(platforms.filter((element) => element.props['checked'] === true)).toHaveLength(2)
    expect(harness.find('save')?.props['disabled']).toBe(true)
  })

  it('saves edited fields through form.mutate with the read revision', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH, revision: 3 })
    harness.change('engine', 'ddg')
    harness.change('cache-ttl', '0')
    harness.change('platforms', '', 'dsts-platform-v2ex')
    expect(harness.find('save')?.props['disabled']).toBe(false)
    harness.click('save')
    await harness.flush()
    const thin = harness.forms.get('thin-search') as FakeForm
    expect(thin.calls).toEqual([
      {
        kind: 'mutate',
        revision: 3,
        ops: [
          { op: 'set', path: ['provider'], value: 'ddg' },
          { op: 'set', path: ['platforms'], value: ['github', 'v2ex', 'npm'] },
          { op: 'set', path: ['cacheTtl'], value: 0 },
        ],
      },
    ])
  })

  it('switches the global provider through configForms.get("web").set("searchProvider", id)', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH })
    harness.change('provider', 'deepseek-official')
    await harness.flush()
    const web = harness.forms.get('web') as FakeForm
    expect(web.calls).toEqual([{ kind: 'set', field: 'searchProvider', value: 'deepseek-official' }])
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
    expect(thin.calls).toEqual([{ kind: 'set', field: 'provider', value: 'searxng' }])
  })

  it('ships a browser bundle with no network or Node access', async () => {
    const harness = await createClientHarness({ thinSearch: THIN_SEARCH })
    expect(harness.source).not.toMatch(/XMLHttpRequest|node:fs/u)
    expect(harness.source).not.toMatch(/\bfetch\s*\(/u)
    const required = [...harness.source.matchAll(/require\("([^"]+)"\)/gu)].map((match) => match[1])
    expect(required).toEqual(['react', 'react/jsx-runtime'])
    expect(harness.registrations.filter((entry) => entry.options['name'] === 'settings.section')).toEqual([])
  })
})
