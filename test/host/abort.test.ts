import { describe, expect, it } from 'vitest'
import { raceWithSignal } from '../../src/util/abort'

describe('raceWithSignal', () => {
  it('leaves the promise untouched without a signal', () => {
    const promise = Promise.resolve('ok')
    expect(raceWithSignal(promise, undefined, () => new Error('unused'))).toBe(promise)
  })

  it('resolves the operation when the signal stays clear', async () => {
    const controller = new AbortController()
    await expect(raceWithSignal(Promise.resolve('ok'), controller.signal, () => new Error('unused'))).resolves.toBe('ok')
  })

  it('rejects with the caller error factory when aborted', async () => {
    const controller = new AbortController()
    const expected = new Error('stop')
    const pending = new Promise<string>(() => undefined)
    const raced = raceWithSignal(pending, controller.signal, () => expected)
    controller.abort()
    await expect(raced).rejects.toBe(expected)
  })

  it('rejects immediately for an already-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    const expected = new Error('already stopped')
    await expect(raceWithSignal(Promise.resolve('ignored'), controller.signal, () => expected)).rejects.toBe(expected)
  })
})
