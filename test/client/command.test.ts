import { describe, expect, it } from 'vitest'
import { createEngineCommand } from '../../src/client/command'
import { ENGINE_IDS } from '../../src/client/config'
import type { EngineId } from '../../src/client/config'
import { en } from '../../src/client/locales'
import type { EngineCommandSource } from '../../src/client/runtime'
import { optionSummary } from './helpers'

/** A command source double recording the chosen engine. */
function fakeSource(current: EngineId = 'bing'): EngineCommandSource & { readonly writes: EngineId[] } {
  const writes: EngineId[] = []
  return {
    writes,
    t: (key, params) => {
      const template = en[key] ?? key
      return params === undefined ? template : template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
    },
    currentEngine: () => current,
    async setPreferredEngine(id) {
      writes.push(id)
      return true
    },
  }
}

describe('/thin-search-engine command', () => {
  it('registers the expected name and localized row copy', () => {
    const source = fakeSource()
    const command = createEngineCommand(source)
    expect(command.name).toBe('thin-search-engine')
    expect(command.label?.()).toBe(en['command.label'])
    expect(command.description?.()).toBe(en['command.description'])
    expect(command.available({})).toBe(true)
    expect(command.ui.kind).toBe('popupSelect')
  })

  it('lists all five engines with the current one active', async () => {
    const command = createEngineCommand(fakeSource('searxng'))
    const options = await command.ui.options({}, new AbortController().signal)
    expect(options.map((option) => option.id)).toEqual([...ENGINE_IDS])
    expect(optionSummary(options)).toEqual([
      { id: 'bing', label: en['engine.bing'], active: false, detail: undefined },
      { id: 'anysearch', label: en['engine.anysearch'], active: false, detail: undefined },
      { id: 'searxng', label: en['engine.searxng'], active: true, detail: en['command.current'] },
      { id: 'ddg', label: en['engine.ddg'], active: false, detail: undefined },
      { id: 'ddg-lite', label: en['engine.ddg-lite'], active: false, detail: undefined },
    ])
  })

  it('writes the selected engine through setPreferredEngine', async () => {
    const source = fakeSource()
    const command = createEngineCommand(source)
    await command.ui.onSelect({ id: 'ddg-lite', label: 'DuckDuckGo Lite' }, {})
    expect(source.writes).toEqual(['ddg-lite'])
  })

  it('ignores an option id that is not one of the free engines', async () => {
    const source = fakeSource()
    const command = createEngineCommand(source)
    await command.ui.onSelect({ id: 'deepseek-official', label: 'DeepSeek' }, {})
    expect(source.writes).toEqual([])
  })

  it('provides localized search copy for the popup shell', () => {
    const command = createEngineCommand(fakeSource())
    expect(command.ui.searchLabels?.()).toEqual({
      placeholder: en['command.searchPlaceholder'],
      empty: en['command.searchEmpty'],
      noResults: en['command.searchNoResults'],
    })
  })
})
