import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAFT } from '../../src/client/config'
import { saveDraft } from '../../src/client/save'
import { createFakeForm, pageForm } from './helpers'

describe('saveDraft', () => {
  it('never calls the Host for an invalid draft', async () => {
    const fake = createFakeForm({ value: DEFAULT_DRAFT })
    const outcome = await saveDraft(pageForm(fake), { ...DEFAULT_DRAFT, cacheTtl: -1 })
    expect(outcome.status).toBe('invalid')
    expect(outcome.errors.map((error) => error.key)).toEqual(['validation.cacheTtl'])
    expect(fake.calls).toEqual([])
  })

  it('submits no operation when nothing changed', async () => {
    const fake = createFakeForm({ value: DEFAULT_DRAFT, revision: 4 })
    const outcome = await saveDraft(pageForm(fake), { ...DEFAULT_DRAFT })
    expect(outcome).toEqual({ status: 'unchanged', errors: [] })
    expect(fake.calls).toEqual([])
  })

  it('submits the changed fields with the revision the editor read', async () => {
    const fake = createFakeForm({ value: DEFAULT_DRAFT, revision: 7 })
    const outcome = await saveDraft(pageForm(fake), {
      ...DEFAULT_DRAFT,
      provider: 'ddg',
      searchEnhance: true,
      enhanceModel: 'deepseek:flash',
    })
    expect(outcome.status).toBe('saved')
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]).toEqual({
      kind: 'mutate',
      revision: 7,
      ops: [
        { op: 'set', path: ['provider'], value: 'ddg' },
        { op: 'set', path: ['searchEnhance'], value: true },
        { op: 'set', path: ['enhanceModel'], value: 'deepseek:flash' },
      ],
    })
  })

  it('reports a Host refusal', async () => {
    const fake = createFakeForm({ value: DEFAULT_DRAFT, accept: false })
    const outcome = await saveDraft(pageForm(fake), { ...DEFAULT_DRAFT, provider: 'bing', cacheTtl: 1 })
    expect(outcome.status).toBe('rejected')
  })

  it('reports a transport failure without throwing', async () => {
    const fake = createFakeForm({ value: DEFAULT_DRAFT, failWith: new Error('offline') })
    const outcome = await saveDraft(pageForm(fake), { ...DEFAULT_DRAFT, cacheTtl: 1 })
    expect(outcome.status).toBe('failed')
    expect(outcome.errors).toEqual([])
  })
})
