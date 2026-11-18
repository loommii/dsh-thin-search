import { describe, expect, it } from 'vitest'
import { ENGINE_IDS, PLATFORM_IDS } from '../../src/client/config'
import { DICTIONARIES, engineLabelKey, en, platformLabelKey, zh } from '../../src/client/locales'

describe('Thin Search dictionaries', () => {
  it('registers the two baseline languages', () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual(['en', 'zh'])
  })

  it('keeps en and zh key-for-key identical', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

  it('has non-empty copy for every key in both languages', () => {
    for (const [key, value] of Object.entries(en)) expect(value.trim(), key).not.toBe('')
    for (const [key, value] of Object.entries(zh)) expect(value.trim(), key).not.toBe('')
  })

  it('names every engine and platform through an existing message key', () => {
    for (const id of ENGINE_IDS) {
      const key = engineLabelKey(id)
      expect(en[key]).toBeTruthy()
      expect(zh[key]).toBeTruthy()
    }
    for (const id of PLATFORM_IDS) {
      const key = platformLabelKey(id)
      expect(en[key]).toBeTruthy()
      expect(zh[key]).toBeTruthy()
    }
  })

  it('interpolates named parameters', () => {
    expect(en['provider.current'].includes('{name}')).toBe(true)
    expect(en['validation.searxng'].includes('{entries}')).toBe(true)
  })
})
