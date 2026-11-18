import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BUNDLE_CONFIG_KEY, BUNDLE_CONFIG_SLOT } from '../../src/client/config'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const CLIENT_DIR = join(ROOT, 'src/client')

/** Every source file in the browser half. */
function clientSources(): { path: string; text: string }[] {
  const files: { path: string; text: string }[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(ts|tsx)$/u.test(entry)) files.push({ path, text: readFileSync(path, 'utf8') })
    }
  }
  walk(CLIENT_DIR)
  return files
}

/** The text of package.json and the Cordis patch. */
function manifestText(name: 'package.json' | 'cordis.patch.yml'): string {
  return readFileSync(join(ROOT, name), 'utf8')
}

describe('client bundle purity', () => {
  it('imports only React baseline modules and local files', () => {
    for (const source of clientSources()) {
      const specifiers = [...source.text.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map((match) => match[1] ?? '')
      for (const specifier of specifiers) {
        expect(
          specifier === 'react' || specifier === 'react/jsx-runtime' || specifier.startsWith('./'),
          `${source.path} imports ${specifier}`,
        ).toBe(true)
      }
    }
  })

  it('does not import another DSH Client package', () => {
    for (const source of clientSources()) {
      expect(source.text, source.path).not.toMatch(/@deepseek-ai\//u)
    }
  })

  it('does not add a custom HTTP bridge', () => {
    for (const source of clientSources()) {
      expect(source.text, source.path).not.toMatch(/\bfetch\s*\(/u)
      expect(source.text, source.path).not.toMatch(/XMLHttpRequest|\/api\//u)
    }
  })

  it('does not write deployment storage or hardcode a provider id', () => {
    for (const source of clientSources()) {
      expect(source.text, source.path).not.toMatch(/writeFile|readFileSync|node:fs|profile\.(?:json|ya?ml)/u)
      expect(source.text, source.path).not.toMatch(/deepseek-official/u)
    }
  })

  it('does not call a search tool or offer a UI test button', () => {
    for (const source of clientSources()) {
      expect(source.text, source.path).not.toMatch(/free_search_test|rawSearch|testEngine/u)
    }
  })

  it('introduces no session state or session-keyed storage', () => {
    for (const source of clientSources()) {
      expect(source.text, source.path).not.toMatch(/remote\.session|ctx\.sessions|sessionId/u)
    }
  })

  it('registers the bundle card only, not a row or global settings entry', () => {
    const index = readFileSync(join(CLIENT_DIR, 'index.tsx'), 'utf8')
    expect(index).toContain('BUNDLE_CONFIG_SLOT')
    expect(index).toContain('BUNDLE_CONFIG_KEY')
    expect(index).toContain('whileServed([THIN_SEARCH_NAMESPACE]')
    expect(index).not.toContain('plugins.row.config')
    expect(index).not.toContain('settings.section')
    expect(BUNDLE_CONFIG_SLOT).toBe('plugins.bundle.config')
    expect(BUNDLE_CONFIG_KEY).toBe('dsh-thin-search')
  })

  it('uses the runtime ConfigForms store instead of bundle owner form props', () => {
    const page = readFileSync(join(CLIENT_DIR, 'page.tsx'), 'utf8')
    const runtime = readFileSync(join(CLIENT_DIR, 'runtime.ts'), 'utf8')
    expect(page).not.toMatch(/\bform\?\./u)
    expect(page).not.toContain('ConfigPageForm')
    expect(page).not.toContain('saveDraft')
    expect(page).toContain('runtime.writeSetting')
    expect(page).toContain('runtime.subscribeSettings')
    expect(runtime).toContain("configForms.get<ThinSearchValues>(THIN_SEARCH_NAMESPACE)")
    expect(runtime).toContain('form.set(write.field, write.value)')
  })
})

describe('plugin manifest', () => {
  it('declares the web client half and its built artifact', () => {
    const manifest = JSON.parse(manifestText('package.json')) as {
      exports: Record<string, string>
      files: string[]
      dsh: { client: { platform: string; inject?: string[] } }
    }
    expect(manifest.dsh.client.platform).toBe('web')
    expect(manifest.exports['./client']).toBe('./lib/client.js')
    expect(manifest.files).toContain('lib/client.js')
    expect(manifest.dsh.client.inject).toEqual(expect.arrayContaining([
      '@deepseek-ai/dsh-client-ui-settings',
    ]))
  })

  it('keys the bundle card by the package name the patch declares', () => {
    const patch = manifestText('cordis.patch.yml')
    expect(patch).toMatch(/^\s*- id: thin-search$/mu)
    expect(patch).toMatch(/^\s*name: dsh-thin-search$/mu)
    expect(BUNDLE_CONFIG_KEY).toBe('dsh-thin-search')
  })

  it('pins the web row to the thin-search provider without duplicating the patch', () => {
    const patch = manifestText('cordis.patch.yml')
    expect(patch).toMatch(/searchProvider: thin-search/u)
    expect(patch).toMatch(/fetchProvider: http/u)
  })
})
