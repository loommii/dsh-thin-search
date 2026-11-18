import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  name: string
  version: string
  type: string
  main: string
  engines: Record<string, string>
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
  devDependencies: Record<string, string>
  scripts: Record<string, string>
  dsh: { bundle: { patch: string }; client: { platform: string } }
}

describe('v1.0.0 package manifest', () => {
  it('targets DSH 0.2.2-rc.3 and Node 24.9', () => {
    expect(pkg.name).toBe('dsh-thin-search')
    expect(pkg.version).toBe('1.0.0')
    expect(pkg.type).toBe('module')
    expect(pkg.main).toBe('lib/index.js')
    expect(pkg.engines.dsh).toBe('0.2.2-rc.3')
    expect(pkg.engines.node).toBe('>=24.9.0')
    expect(pkg.dsh.bundle.patch).toBe('cordis.patch.yml')
    expect(pkg.dsh.client.platform).toBe('web')
    expect(pkg.peerDependencies['@deepseek-ai/dsh-web']).toBe('0.2.2-rc.3')
    expect(pkg.devDependencies['@deepseek-ai/cordis']).toBe('~4.1.0')
  })

  it('drops the legacy runtime dependencies', () => {
    const all = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.devDependencies }
    expect(all.undici).toBeUndefined()
    expect(all['@deepseek-ai/dsh-atomic-write']).toBeUndefined()
    expect(all['@deepseek-ai/dsh-settings']).toBeUndefined()
    expect(pkg.dependencies['node-html-parser']).toBeDefined()
    expect(pkg.dependencies['@deepseek-ai/schemastery']).toBe('~3.19.0')
  })

  it('exposes host-only verification scripts', () => {
    expect(pkg.scripts['typecheck:host']).toContain('tsconfig.host.json')
    expect(pkg.scripts['test:host']).toContain('test/host')
    expect(pkg.scripts['build:host']).toContain('tsdown.host.config.ts')
    expect(pkg.scripts.check).toBe('npm run typecheck && npm test && npm run build')
  })
})
