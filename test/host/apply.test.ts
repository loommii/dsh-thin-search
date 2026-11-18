import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { WebSearchProvider } from '@deepseek-ai/dsh-web'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { PromptSection } from '@deepseek-ai/dsh-system-prompt'
import { Config } from '../../src/config'
import { apply } from '../../src/index'

describe('plugin apply', () => {
  it('registers the provider, three tools and one prompt section', () => {
    const provider = { current: undefined as WebSearchProvider | undefined }
    const tools: ToolDefinition[] = []
    const sections: PromptSection[] = []
    const orders: string[] = []
    const ctx = {
      logger: () => ({ warn: () => undefined, info: () => undefined }),
      get: () => undefined,
      web: { registerSearchProvider: (value: WebSearchProvider) => { provider.current = value; return () => undefined } },
      tools: { register: (value: ToolDefinition) => { tools.push(value); return () => undefined } },
      systemPrompt: {
        section: (value: PromptSection) => { sections.push(value); return () => undefined },
        getSectionOrder: (name: string) => { orders.push(name); return 2000 },
      },
    } as unknown as Context

    apply(ctx, Config({}))

    expect(provider.current?.id).toBe('thin-search')
    expect('ready' in (provider.current ?? {})).toBe(false)
    expect(tools.map(tool => tool.name)).toEqual(['free_search_test', 'platform_search', 'advanced_search'])
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({ name: 'thin-search:engines', order: 2005 })
    expect(orders).toEqual(['TOOL_WEB_SEARCH'])
    const text = typeof sections[0]?.text === 'function' ? sections[0].text({ scope: undefined } as never) : sections[0]?.text
    expect(text).toContain('preferred engine bing')
    expect(text).toContain('When Thin Search is selected')
    expect(text).toContain('V2EX')
  })
})
