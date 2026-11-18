/**
 * Release-readiness integration: package metadata, the documented npm pack
 * file list, LICENSE/CHANGELOG, README coverage, repository docs, and the
 * removal of the stale v0.6 root tests.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as Record<string, any>
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')
const readmeEn = readFileSync(new URL('../../README.en.md', import.meta.url), 'utf8')
const changelog = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8')
const license = readFileSync(new URL('../../LICENSE', import.meta.url), 'utf8')
const commitStyle = readFileSync(new URL('../../docs/规范/COMMIT_STYLE.md', import.meta.url), 'utf8')
const ciWorkflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')

/** Expand the package files list the way npm would for a local directory. */
function shippedFiles(): string[] {
  const entries: string[] = []
  for (const pattern of pkg['files'] as string[]) {
    if (pattern.endsWith('/*.json')) {
      const directory = pattern.slice(0, pattern.lastIndexOf('/'))
      for (const name of readdirSync(new URL(`../../${directory}/`, import.meta.url))) {
        if (name.endsWith('.json')) entries.push(`${directory}/${name}`)
      }
      continue
    }
    entries.push(pattern)
  }
  return entries
}

describe('release package metadata', () => {
  it('declares the repository, homepage, author and bugs metadata', () => {
    expect(pkg['name']).toBe('dsh-thin-search')
    expect(pkg['version']).toBe('1.0.0')
    expect(pkg['license']).toBe('MIT')
    expect(pkg['author']).toContain('loommii')
    expect(pkg['repository']).toEqual({ type: 'git', url: 'git+https://github.com/loommii/dsh-thin-search.git' })
    expect(pkg['homepage']).toBe('https://github.com/loommii/dsh-thin-search#readme')
    expect(pkg['bugs']).toEqual({ url: 'https://github.com/loommii/dsh-thin-search/issues' })
  })

  it('targets DSH 0.2.2-rc.3 and Node 24.9 through engines and peers', () => {
    expect(pkg['engines']).toEqual({ node: '>=24.9.0', dsh: '0.2.2-rc.3' })
    for (const name of ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-web']) {
      expect(pkg['peerDependencies'][name]).toBe('0.2.2-rc.3')
    }
    expect(pkg['dsh']).toEqual({
      bundle: { patch: 'cordis.patch.yml' },
      client: {
        inject: [
          '@deepseek-ai/dsh-client-ui-settings',
          '@deepseek-ai/dsh-client-ui-plugin-manager',
          '@deepseek-ai/dsh-client-locale',
          '@deepseek-ai/dsh-api-remotes',
          '@deepseek-ai/dsh-client-ui-commands',
        ],
        platform: 'web',
      },
    })
  })

  it('publishes the documented host and client entry points plus runtime assets', () => {
    expect(pkg['type']).toBe('module')
    expect(pkg['main']).toBe('lib/index.js')
    expect(pkg['exports']).toEqual({
      '.': './lib/index.js',
      './client': './lib/client.js',
      './package.json': './package.json',
      './locale/*.json': './locale/*.json',
    })
    const expected = ['CHANGELOG.md', 'cordis.patch.yml', 'icon.svg', 'lib/client.js', 'lib/index.js', 'locale/en.json', 'locale/zh.json']
    expect(shippedFiles().sort()).toEqual([...expected].sort())
    for (const file of shippedFiles()) expect(existsSync(new URL(`../../${file}`, import.meta.url))).toBe(true)
    // The stale v0.6 proxy artifact is deleted from the repository and never shipped.
    expect(existsSync(new URL('../../lib/proxy.js', import.meta.url))).toBe(false)
  })

  it('runs check and fails on committed-lib drift in CI on Node 24.9', () => {
    expect(ciWorkflow).toContain("node-version: '24.9.0'")
    expect(ciWorkflow).toContain('run: npm ci')
    expect(ciWorkflow).toContain('run: npm run build')
    expect(ciWorkflow).toContain('run: npm run check')
    expect(ciWorkflow).toContain('git diff --exit-code -- lib')
    expect(ciWorkflow).toContain('run: npm pack --dry-run')
  })

  it('keeps npm run check and wires the integration and built-client smoke suites', () => {
    expect(pkg['scripts']['check']).toBe('npm run typecheck && npm test && npm run build')
    expect(pkg['scripts']['test']).toBe('npm run test:host && npm run test:client && npm run test:integration')
    expect(pkg['scripts']['build']).toBe('npm run build:host && npm run build:client && npm run smoke:client')
    expect(pkg['scripts']['test:integration']).toContain('test/integration')
    expect(pkg['scripts']['smoke:client']).toContain('bundle-smoke.mjs')
  })

  it('packs only the runtime files through the real npm pack list', () => {
    const output = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT, encoding: 'utf8' })
    const manifest = JSON.parse(output) as { files: { path: string }[] }[]
    const files = (manifest[0]?.files ?? []).map((file) => file.path)
    for (const required of ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'lib/index.js', 'lib/client.js', 'locale/en.json', 'locale/zh.json', 'icon.svg', 'cordis.patch.yml']) {
      expect(files).toContain(required)
    }
    expect(files.filter((file) => /^(test|tmp|src|docs|scripts|node_modules)\//u.test(file))).toEqual([])
    expect(files.filter((file) => file.endsWith('.tgz') || file.endsWith('.test.js'))).toEqual([])
    expect(files).not.toContain('lib/proxy.js')
  })
})

describe('release documentation', () => {
  it('ships an MIT LICENSE and a v1.0.0 CHANGELOG with migration notes', () => {
    expect(license.startsWith('MIT License')).toBe(true)
    expect(license).toContain('Permission is hereby granted, free of charge')
    expect(changelog).toContain('## [1.0.0]')
    expect(changelog).toContain('DSH 0.2.2-rc.3')
    expect(changelog.toLowerCase()).toContain('migration')
    expect(changelog).toContain('cacheTtl')
    expect(changelog).toContain('enhanceSystemPromptPath')
    expect(changelog).toContain('v1.0.1')
    expect(changelog).toContain('z.never()')
    expect(changelog).toContain('Delete the `cache` boolean; `cacheTtl` now also acts as the on/off switch')
    expect(changelog).toContain('plugins.bundle.config')
    expect(changelog).toContain('Plugins → Installed → dsh-thin-search → Configuration')
    expect(changelog).toContain('F6')
    expect(changelog).toContain('Live-GUI verification limitation')
  })

  it('documents install, configuration, provider switching, proxy, prompt file, platform limits, migration and verification limits', () => {
    for (const required of [
      'DSH 0.2.2-rc.3',
      'Node 24.9',
      'dsh plugin --profile web add dsh-thin-search',
      'enhanceSystemPromptPath',
      'ConfigForms',
      'searchProvider',
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'V2EX',
      'Bilibili',
      'Reddit',
      'npm run check',
      'npm pack --dry-run',
    ]) {
      expect(readme, `README.md must document ${required}`).toContain(required)
      expect(readmeEn, `README.en.md must document ${required}`).toContain(required)
    }
    for (const forbidden of [/plugin-scoped proxy|ProxyAgent|undici/iu, /test engine.{0,20}button/iu, /change it to `?native`?/u]) {
      expect(readme, `README.md must not contain ${forbidden}`).not.toMatch(forbidden)
      expect(readmeEn, `README.en.md must not contain ${forbidden}`).not.toMatch(forbidden)
    }
    // README.md is the Chinese default page; README.en.md mirrors it in English.
    expect(readme).toContain('从旧版本迁移')
    expect(readme).toContain('验证限制')
    expect(readme).toContain('不受支持')
    expect(readme).toContain('插件 → 已安装 → dsh-thin-search → 配置')
    expect(readme).toContain('没有全局设置项')
    expect(readme).toContain('tools.mode')
    expect(readme).toContain('@deepseek-ai/dsh-tool-executor-native')
    expect(readmeEn).toContain('Migration')
    expect(readmeEn).toContain('Verification limits')
    expect(readmeEn).toContain('is not supported on older DSH')
    expect(readmeEn).toContain('Delete the old `cache` boolean; `cacheTtl` now also acts as the on/off switch')
    expect(readmeEn).toContain('tools.mode')
    expect(readmeEn).toContain('@deepseek-ai/dsh-tool-executor-native')
    expect(readmeEn).toContain('request timeouts and 5xx responses retry once')
    expect(readmeEn).toContain('Plugins → Installed → dsh-thin-search → Configuration')
    expect(readmeEn).toContain('there is no global Settings item')
    expect(readmeEn).not.toContain('Plugins -> dsh-thin-search -> Configure')
  })

  it('rewrites the commit style for this repository without stale external-project rules', () => {
    expect(commitStyle).toContain('dsh-thin-search')
    expect(commitStyle).toContain('Conventional Commits')
    expect(commitStyle).not.toMatch(/dsh-provider-usage|provider-usage|usage-stats|dsh-web\b.*AGENTS/iu)
  })

  it('removes the stale v0.6 root tests so npm test runs only current suites', () => {
    expect(existsSync(new URL('../../test/compatibility.test.js', import.meta.url))).toBe(false)
    expect(existsSync(new URL('../../test/client-plugin-page.test.js', import.meta.url))).toBe(false)
  })
})
