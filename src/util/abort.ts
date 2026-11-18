/** Shared promise/abort-signal racing used by the HTTP, pipeline and prompt layers. */

/**
 * Race one promise against an optional abort signal without leaking the abort
 * listener. A missing signal leaves the promise untouched; an already-aborted
 * signal rejects immediately with {@code makeError()} while attaching a
 * rejection handler so the abandoned operation cannot become unhandled.
 * @param promise - operation to await.
 * @param signal - optional caller cancellation.
 * @param makeError - builds the caller-specific cancellation error (same error
 *   type and message the caller previously produced locally).
 * @returns the operation result, or a rejection from the signal.
 */
export function raceWithSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  makeError: () => Error,
): Promise<T> {
  if (signal === undefined) return promise
  if (signal.aborted) {
    void promise.catch(() => undefined)
    return Promise.reject(makeError())
  }
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort)
      rejectPromise(makeError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolvePromise(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        rejectPromise(error)
      },
    )
  })
}
