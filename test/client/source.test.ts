import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ROW_CONFIG_KEY } from '../../src/client/config'

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

  it('does not write a profile or hardcode a provider id', () => {
    for (const source of clientSources()) {
      expect(source.text, source.path).not.toMatch(/\bprofile\b/u)
      expect(source.text, source.path).not.toMatch(/deepseek-official/u)
    }
  })

  it('does not call a search tool or offer a UI test button', () => {
    for (const source of clientSources()) {
      expect(source.text, source.path).not.toMatch(/free_search_test|rawSearch|testEngine/u)
    }
  })

  it('routes the row page edits through the owner form state and mutate', () => {
    const page = readFileSync(join(CLIENT_DIR, 'page.tsx'), 'utf8')
    const save = readFileSync(join(CLIENT_DIR, 'save.ts'), 'utf8')
    expect(page).toMatch(/form\?\.state/u)
    expect(page).toContain('saveDraft(form, draft)')
    expect(page).not.toContain('ctx.configForms')
    expect(save).toContain('form.mutate(ops, form.state.revision)')
    expect(save).not.toContain('ctx.configForms')
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

  it('keys the row registration to the id cordis.patch.yml declares', () => {
    const patch = manifestText('cordis.patch.yml')
    expect(patch).toMatch(/^\s*- id: thin-search$/mu)
    expect(patch).toMatch(/^\s*name: dsh-thin-search$/mu)
    expect(ROW_CONFIG_KEY).toBe('dsh-thin-search#thin-search')
  })

  it('pins the web row to the thin-search provider without duplicating the patch', () => {
    const patch = manifestText('cordis.patch.yml')
    expect(patch).toMatch(/searchProvider: thin-search/u)
    expect(patch).toMatch(/fetchProvider: http/u)
  })
})
