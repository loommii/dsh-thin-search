import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { createEnhancer, parseEnhanceModel, sanitizeEnhancedQuery, type EnhanceLlm } from '../../src/enhance'
import { DEFAULT_ENHANCE_SYSTEM_PROMPT, loadEnhanceSystemPrompt, readBounded, resolveEnhanceSystemPromptPath } from '../../src/enhance/prompt'
import { testConfig } from './helpers'

function llmReturning(text: string, seen: GenerateOptions[]): EnhanceLlm {
  return {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      seen.push(options)
      return (async function* generate(): AsyncGenerator<StreamChunk> {
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
}

describe('enhancement model parsing', () => {
  it('parses provider:model overrides', () => {
    expect(parseEnhanceModel('deepseek:flash')).toEqual({ provider: 'deepseek', model: 'flash' })
    expect(parseEnhanceModel('  openai : gpt-5  ')).toEqual({ provider: 'openai', model: 'gpt-5' })
    expect(parseEnhanceModel('')).toBeUndefined()
    expect(parseEnhanceModel('no-colon')).toBeUndefined()
    expect(parseEnhanceModel(':model')).toBeUndefined()
    expect(parseEnhanceModel('provider:')).toBeUndefined()
  })

  it('sanitizes model output and rejects empty or over-long text', () => {
    expect(sanitizeEnhancedQuery('  "deepseek  search"  ')).toBe('deepseek search')
    expect(sanitizeEnhancedQuery('plain query')).toBe('plain query')
    expect(sanitizeEnhancedQuery('')).toBeUndefined()
    expect(sanitizeEnhancedQuery('x'.repeat(81))).toBeUndefined()
  })
})

describe('enhancer', () => {
  it('uses the configured provider:model override first', async () => {
    const seen: GenerateOptions[] = []
    const enhancer = createEnhancer({
      getConfig: () => testConfig({ enhanceModel: 'override:model-b', enhanceSystemPromptPath: '' }),
      getLlm: () => llmReturning('optimized query', seen),
      getAgentSelection: () => ({ provider: 'agent', model: 'model-a' }),
      loadPrompt: async () => 'SYSTEM PROMPT',
    })
    const result = await enhancer('question?')
    expect(result).toMatchObject({ query: 'optimized query', enhanced: true, original: 'question?', model: 'override:model-b' })
    expect(seen[0]).toMatchObject({ provider: 'override', model: 'model-b', system: 'SYSTEM PROMPT', temperature: 0, maxTokens: 60 })
    expect(JSON.stringify(seen[0]?.messages)).toContain('question?')
  })

  it('uses the current Agent model when no override is configured', async () => {
    const seen: GenerateOptions[] = []
    const enhancer = createEnhancer({
      getConfig: () => testConfig(),
      getLlm: () => llmReturning('agent optimized', seen),
      getAgentSelection: () => ({ provider: 'agent', model: 'model-a' }),
      loadPrompt: async () => 'SYSTEM',
    })
    const result = await enhancer('question?')
    expect(result.model).toBe('agent:model-a')
    expect(seen[0]).toMatchObject({ provider: 'agent', model: 'model-a' })
  })

  it('does not fall back to the Agent model when the explicit override fails', async () => {
    const seen: GenerateOptions[] = []
    const failing: EnhanceLlm = {
      stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        seen.push(options)
        if (options.provider === 'override') throw new Error('override unavailable')
        return (async function* generate(): AsyncGenerator<StreamChunk> {
          yield { type: 'text-delta', index: 0, text: 'unexpected fallback' }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      },
    }
    const enhancer = createEnhancer({
      getConfig: () => testConfig({ enhanceModel: 'override:model-b' }),
      getLlm: () => failing,
      getAgentSelection: () => ({ provider: 'agent', model: 'model-a' }),
      loadPrompt: async () => 'SYSTEM',
    })
    await expect(enhancer('question?')).resolves.toMatchObject({
      query: 'question?',
      enhanced: false,
      error: 'override unavailable',
    })
    expect(seen.map(entry => entry.provider)).toEqual(['override'])
  })

  it('reports a malformed override without trying the Agent model', async () => {
    let calls = 0
    const llm: EnhanceLlm = {
      stream(): AsyncIterable<StreamChunk> {
        calls++
        return (async function* generate(): AsyncGenerator<StreamChunk> {
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      },
    }
    const enhancer = createEnhancer({
      getConfig: () => testConfig({ enhanceModel: 'not-a-route' }),
      getLlm: () => llm,
      getAgentSelection: () => ({ provider: 'agent', model: 'model-a' }),
      loadPrompt: async () => 'SYSTEM',
    })
    const result = await enhancer('question?')
    expect(result).toMatchObject({ query: 'question?', enhanced: false })
    expect(result.error).toContain('invalid enhanceModel')
    expect(calls).toBe(0)
  })

  it('skips when no LLM or no model is available', async () => {
    const noLlm = createEnhancer({
      getConfig: () => testConfig(),
      getLlm: () => undefined,
      getAgentSelection: () => ({ provider: 'agent', model: 'model-a' }),
    })
    await expect(noLlm('q')).resolves.toMatchObject({ enhanced: false, error: 'llm service unavailable' })

    const noModel = createEnhancer({
      getConfig: () => testConfig(),
      getLlm: () => llmReturning('x', []),
      getAgentSelection: () => undefined,
    })
    await expect(noModel('q')).resolves.toMatchObject({ enhanced: false, error: 'no model available' })
  })

  it('keeps the original query for empty model output', async () => {
    const enhancer = createEnhancer({
      getConfig: () => testConfig(),
      getLlm: () => llmReturning('   ', []),
      getAgentSelection: () => ({ provider: 'agent', model: 'model-a' }),
      loadPrompt: async () => 'SYSTEM',
    })
    await expect(enhancer('q')).resolves.toMatchObject({ query: 'q', enhanced: false, error: 'empty or invalid enhancement' })
  })

  it('times out a hung model call and retains the original query', async () => {
    const hung: EnhanceLlm = {
      stream(): AsyncIterable<StreamChunk> {
        return (async function* generate(): AsyncGenerator<StreamChunk> {
          await new Promise(() => undefined)
        })()
      },
    }
    const enhancer = createEnhancer({
      getConfig: () => testConfig(),
      getLlm: () => hung,
      getAgentSelection: () => ({ provider: 'agent', model: 'model-a' }),
      loadPrompt: async () => 'SYSTEM',
      timeoutMs: 20,
    })
    await expect(enhancer('q')).resolves.toMatchObject({ query: 'q', enhanced: false, error: 'enhancement timed out' })
  })

  it('propagates caller cancellation', async () => {
    const enhancer = createEnhancer({
      getConfig: () => testConfig(),
      getLlm: () => llmReturning('x', []),
      getAgentSelection: () => ({ provider: 'agent', model: 'model-a' }),
      loadPrompt: async () => 'SYSTEM',
    })
    const controller = new AbortController()
    controller.abort()
    const error = await enhancer('q', controller.signal).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect((error as WebError).code).toBe('WEB_ABORTED')
  })
})

describe('enhancement prompt file', () => {
  it('accepts ~ and absolute paths and rejects relative paths', () => {
    expect(resolveEnhanceSystemPromptPath('', '/home/user')).toBeUndefined()
    expect(resolveEnhanceSystemPromptPath('   ', '/home/user')).toBeUndefined()
    expect(resolveEnhanceSystemPromptPath('~', '/home/user')).toBeUndefined()
    expect(resolveEnhanceSystemPromptPath('~\\prompt.md', '/home/user')).toBeUndefined()
    expect(resolveEnhanceSystemPromptPath('~/prompt.md', '/home/user')).toBe('/home/user/prompt.md')
    expect(resolveEnhanceSystemPromptPath('/tmp/prompt.md', '/home/user')).toBe('/tmp/prompt.md')
    expect(resolveEnhanceSystemPromptPath('prompt.md', '/home/user')).toBeUndefined()
    expect(resolveEnhanceSystemPromptPath('./prompt.md', '/home/user')).toBeUndefined()
  })

  it('loops over short reads instead of silently truncating', async () => {
    const data = Buffer.from('héllo short reads', 'utf8')
    let reads = 0
    const reader = {
      async read(buffer: Buffer, offset: number, _length: number, position: number): Promise<{ bytesRead: number }> {
        reads++
        const take = Math.min(3, data.length - position)
        if (take <= 0) return { bytesRead: 0 }
        data.copy(buffer, offset, position, position + take)
        return { bytesRead: take }
      },
    }
    await expect(readBounded(reader, 64)).resolves.toBe('héllo short reads')
    expect(reads).toBeGreaterThan(3)
  })

  it('rejects a file that crosses the byte cap even through short reads', async () => {
    const data = Buffer.from('abcdef', 'utf8')
    const reader = {
      async read(buffer: Buffer, offset: number, _length: number, position: number): Promise<{ bytesRead: number }> {
        const take = Math.min(2, data.length - position)
        if (take <= 0) return { bytesRead: 0 }
        data.copy(buffer, offset, position, position + take)
        return { bytesRead: take }
      },
    }
    await expect(readBounded(reader, 3)).rejects.toThrow('exceeds 3 bytes')
  })

  it('reads a configured prompt file and falls back to the built-in prompt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thin-search-prompt-'))
    try {
      const file = join(directory, 'system.md')
      await writeFile(file, '  CUSTOM PROMPT  ', 'utf8')
      await expect(loadEnhanceSystemPrompt(file)).resolves.toBe('CUSTOM PROMPT')
      await expect(loadEnhanceSystemPrompt(join(directory, 'missing.md'))).resolves.toBe(DEFAULT_ENHANCE_SYSTEM_PROMPT)
      await expect(loadEnhanceSystemPrompt('')).resolves.toBe(DEFAULT_ENHANCE_SYSTEM_PROMPT)
      expect(DEFAULT_ENHANCE_SYSTEM_PROMPT).toContain('search query')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects a relative path and an oversized custom read with the built-in prompt', async () => {
    const warnings: string[] = []
    const logger = { warn: (message: string) => { warnings.push(message) } }
    await expect(loadEnhanceSystemPrompt('prompt.md', { logger })).resolves.toBe(DEFAULT_ENHANCE_SYSTEM_PROMPT)
    expect(warnings.join('\n')).toContain('not absolute')
    warnings.length = 0
    await expect(loadEnhanceSystemPrompt('/tmp/oversized.md', {
      logger,
      readText: async () => 'x'.repeat(70 * 1024),
    })).resolves.toBe(DEFAULT_ENHANCE_SYSTEM_PROMPT)
    expect(warnings.join('\n')).toContain('exceeds')
  })

  it('bounds the default file read at the configured byte cap', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thin-search-prompt-cap-'))
    try {
      const file = join(directory, 'system.md')
      await writeFile(file, '0123456789', 'utf8')
      await expect(loadEnhanceSystemPrompt(file, { maxBytes: 8 })).resolves.toBe(DEFAULT_ENHANCE_SYSTEM_PROMPT)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('races the prompt read against the caller signal', async () => {
    const controller = new AbortController()
    const pending = loadEnhanceSystemPrompt('/tmp/hanging.md', {
      readText: async () => await new Promise<string>(() => undefined),
      signal: controller.signal,
    })
    controller.abort(new Error('stop'))
    await expect(pending).rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    let reads = 0
    await expect(loadEnhanceSystemPrompt('/tmp/aborted.md', {
      readText: async () => { reads += 1; return 'unused' },
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    expect(reads).toBe(0)
  })
})
