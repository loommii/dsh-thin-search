import { describe, expect, it } from 'vitest'
import { HttpError, createHttpClient, detectBlockPage } from '../../src/search/http'
import { bingEngine } from '../../src/search/engines/bing'
import { githubPlatform } from '../../src/platforms/github'
import { engineContext, testConfig } from './helpers'

function response(body: string, status = 200, contentType?: string): Response {
  return new Response(body, {
    status,
    ...contentType === undefined ? {} : { headers: { 'content-type': contentType } },
  })
}

async function capture(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError)
    return error as HttpError
  }
  throw new Error('expected the request to fail')
}

const CHALLENGE_HTML = '<html><head><title>Just a moment...</title></head><body><form id="challenge-form" action="/anomaly"></form></body></html>'
const LEGITIMATE_HTML = [
  '<html><body><ol id="b_results">',
  '<li class="b_algo"><h2><a href="https://example.com/nginx">nginx access denied captcha troubleshooting</a></h2>',
  '<p>How to fix access denied and captcha errors in nginx.</p></li>',
  '</ol></body></html>',
].join('')

describe('HTTP client classification', () => {
  it('retries a 5xx response once and succeeds', async () => {
    let calls = 0
    const client = createHttpClient({
      retryDelayMs: 0,
      fetch: async () => {
        calls++
        return calls === 1 ? response('boom', 500) : response('ok')
      },
    })
    await expect(client.text('https://example.com/search')).resolves.toBe('ok')
    expect(calls).toBe(2)
  })

  it('does not retry a 403 response', async () => {
    let calls = 0
    const client = createHttpClient({
      retryDelayMs: 0,
      fetch: async () => {
        calls++
        return response('forbidden', 403)
      },
    })
    const error = await capture(client.text('https://example.com/search'))
    expect(error.code).toBe('FORBIDDEN')
    expect(error.transient).toBe(false)
    expect(calls).toBe(1)
  })

  it('does not retry a 202 anti-bot challenge', async () => {
    let calls = 0
    const client = createHttpClient({
      retryDelayMs: 0,
      fetch: async () => {
        calls++
        return response('', 202)
      },
    })
    const error = await capture(client.text('https://example.com/search'))
    expect(error.code).toBe('CAPTCHA')
    expect(error.transient).toBe(false)
    expect(calls).toBe(1)
  })

  it('does not retry an actual challenge page served with HTTP 200', async () => {
    let calls = 0
    const client = createHttpClient({
      retryDelayMs: 0,
      fetch: async () => {
        calls++
        return response(CHALLENGE_HTML, 200, 'text/html; charset=utf-8')
      },
    })
    const error = await capture(client.text('https://example.com/search'))
    expect(error.code).toBe('CAPTCHA')
    expect(error.transient).toBe(false)
    expect(calls).toBe(1)
  })

  it('accepts legitimate HTML that mentions captcha and access denied', async () => {
    const client = createHttpClient({
      retryDelayMs: 0,
      fetch: async () => response(LEGITIMATE_HTML, 200, 'text/html; charset=utf-8'),
    })
    await expect(client.text('https://www.bing.com/search?q=captcha+access+denied')).resolves.toContain('nginx access denied')
  })

  it('never treats JSON bodies as challenge pages', async () => {
    const payload = JSON.stringify({
      items: [{ html_url: 'https://github.com/a/b', full_name: 'a/b', description: 'captcha access denied', stargazers_count: 1 }],
    })
    const client = createHttpClient({
      retryDelayMs: 0,
      fetch: async () => response(payload, 200, 'application/json; charset=utf-8'),
    })
    const parsed = await client.json<{ items: Array<{ description: string }> }>('https://api.github.com/search/repositories')
    expect(parsed.items[0]?.description).toBe('captcha access denied')
  })

  it('skips challenge detection for JSON-accepting requests even on a mislabeled body', async () => {
    const client = createHttpClient({
      retryDelayMs: 0,
      fetch: async () => response('{"note":"challenge-form captcha access denied"}', 200, 'text/plain'),
    })
    await expect(client.json<{ note: string }>('https://example.com/data')).resolves.toEqual({ note: 'challenge-form captcha access denied' })
  })

  it('keeps search-engine pages with captcha/access-denied queries usable', async () => {
    const client = createHttpClient({
      retryDelayMs: 0,
      fetch: async () => response(LEGITIMATE_HTML, 200, 'text/html; charset=utf-8'),
    })
    const sources = await bingEngine.search(engineContext({ http: client, query: 'nginx access denied captcha' }))
    expect(sources).toHaveLength(1)
    expect(sources[0]?.url).toBe('https://example.com/nginx')
  })

  it('keeps platform JSON containing captcha/access denied usable', async () => {
    const payload = JSON.stringify({
      items: [{
        html_url: 'https://github.com/a/b',
        full_name: 'a/b',
        description: 'captcha access denied',
        stargazers_count: 3,
      }],
    })
    const client = createHttpClient({
      retryDelayMs: 0,
      fetch: async () => response(payload, 200, 'application/json; charset=utf-8'),
    })
    const sources = await githubPlatform.search({
      query: 'captcha access denied',
      maxResults: 5,
      config: testConfig(),
      http: client,
      deadline: Date.now() + 5_000,
    })
    expect(sources[0]?.title).toBe('a/b')
    expect(sources[0]?.snippet).toContain('captcha access denied')
  })

  it('detects only challenge-specific markup, not free-text words', () => {
    expect(detectBlockPage(CHALLENGE_HTML, { contentType: 'text/html' })).toBe(true)
    expect(detectBlockPage('<html><title>DuckDuckGo</title><div class="anomaly-modal">bots use DuckDuckGo too</div></html>', { contentType: 'text/html' })).toBe(true)
    expect(detectBlockPage('<html><body><li class="b_algo">captcha access denied unusual traffic are you a robot</li></body></html>', { contentType: 'text/html' })).toBe(false)
    expect(detectBlockPage('unusual traffic from your network')).toBe(false)
    expect(detectBlockPage(CHALLENGE_HTML, { accept: 'application/json' })).toBe(false)
    expect(detectBlockPage(CHALLENGE_HTML, { contentType: 'application/json' })).toBe(false)
  })

  it('cancels unread error bodies before throwing', async () => {
    const makeResponse = (status: number, headers: Record<string, string> = {}): { response: Response; wasCancelled: () => boolean } => {
      let cancelled = false
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('unread error body'))
        },
        cancel() {
          cancelled = true
        },
      })
      return {
        response: new Response(stream, { status, headers }),
        wasCancelled: () => cancelled,
      }
    }

    for (const [status, code] of [[202, 'CAPTCHA'], [403, 'FORBIDDEN'], [404, 'HTTP_STATUS'], [500, 'HTTP_STATUS']] as const) {
      const body = makeResponse(status)
      const client = createHttpClient({
        retryDelayMs: 0,
        fetch: async () => body.response,
      })
      const error = await capture(client.text('https://example.com/error', { retries: status === 500 ? 0 : 1 }))
      expect(error.code).toBe(code)
      expect(body.wasCancelled(), `status ${status}`).toBe(true)
    }

    const oversized = makeResponse(200, { 'content-length': '1000' })
    const client = createHttpClient({
      maxBodyBytes: 8,
      retryDelayMs: 0,
      fetch: async () => oversized.response,
    })
    const error = await capture(client.text('https://example.com/oversized', { retries: 0 }))
    expect(error.code).toBe('BODY_TOO_LARGE')
    expect(oversized.wasCancelled()).toBe(true)
  })

  it('enforces maxBodyBytes in UTF-8 bytes rather than UTF-16 code units', async () => {
    const client = createHttpClient({
      maxBodyBytes: 8,
      fetch: async () => response('你好你好', 200, 'text/plain'),
    })
    const error = await capture(client.text('https://example.com/unicode'))
    expect(error.code).toBe('BODY_TOO_LARGE')
    expect(error.message).toContain('12')
  })

  it('retries a network failure once', async () => {
    let calls = 0
    const client = createHttpClient({
      retryDelayMs: 0,
      fetch: async () => {
        calls++
        if (calls === 1) throw new TypeError('connection reset')
        return response('ok')
      },
    })
    await expect(client.text('https://example.com/search')).resolves.toBe('ok')
    expect(calls).toBe(2)
  })

  it('times out a hung request even when fetch ignores the signal', async () => {
    const client = createHttpClient({
      requestTimeoutMs: 20,
      fetch: async () => await new Promise<Response>(() => undefined),
    })
    const started = Date.now()
    const error = await capture(client.text('https://example.com/search'))
    expect(error.code).toBe('TIMEOUT')
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('reports caller cancellation as WEB-style ABORTED without retry', async () => {
    let calls = 0
    const client = createHttpClient({
      requestTimeoutMs: 5_000,
      fetch: async () => {
        calls++
        return await new Promise<Response>(() => undefined)
      },
    })
    const controller = new AbortController()
    const pending = client.text('https://example.com/search', { signal: controller.signal })
    setTimeout(() => controller.abort(new Error('stop')), 10)
    const error = await capture(pending)
    expect(error.code).toBe('ABORTED')
    expect(error.transient).toBe(false)
    expect(calls).toBe(1)
  })

  it('rejects non-http(s) URLs before dispatch', async () => {
    let calls = 0
    const client = createHttpClient({ fetch: async () => { calls++; return response('ok') } })
    const error = await capture(client.text('javascript:alert(1)'))
    expect(error.code).toBe('INVALID_URL')
    expect(calls).toBe(0)
  })

  it('rejects invalid JSON bodies', async () => {
    const client = createHttpClient({ fetch: async () => response('not json', 200, 'text/plain') })
    const error = await capture(client.json('https://example.com/data'))
    expect(error.code).toBe('INVALID_BODY')
    expect(error.transient).toBe(false)
  })

  it('rejects a declared Content-Length above the cap before reading the body', async () => {
    let bodyRead = false
    let cancelled = false
    const oversized = {
      status: 200,
      url: 'https://example.com/declared',
      headers: new Headers({ 'content-length': '1000' }),
      get body() {
        return {
          cancel: async () => { cancelled = true },
          getReader: () => { bodyRead = true; throw new Error('body must not be read') },
        }
      },
      text: async () => { bodyRead = true; return 'small' },
    } as unknown as Response
    let calls = 0
    const client = createHttpClient({
      maxBodyBytes: 8,
      retries: 0,
      fetch: async () => { calls += 1; return oversized },
    })
    const error = await capture(client.text('https://example.com/declared'))
    expect(error.code).toBe('BODY_TOO_LARGE')
    expect(error.transient).toBe(false)
    expect(error.message).toContain('Content-Length')
    expect(bodyRead).toBe(false)
    expect(cancelled).toBe(true)
    expect(calls).toBe(1)
  })

  it('streams the body and cancels as soon as the running byte cap is crossed', async () => {
    const encoder = new TextEncoder()
    let calls = 0
    const client = createHttpClient({
      maxBodyBytes: 5,
      retries: 0,
      fetch: async () => {
        calls += 1
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('aaaa'))
            controller.enqueue(encoder.encode('bbbb'))
            controller.close()
          },
        }), { status: 200 })
      },
    })
    const error = await capture(client.text('https://example.com/stream'))
    expect(error.code).toBe('BODY_TOO_LARGE')
    expect(error.transient).toBe(false)
    expect(error.message).toContain('8')
    expect(calls).toBe(1)
  })

  it('cancels a body read when the caller aborts', async () => {
    let calls = 0
    const client = createHttpClient({
      requestTimeoutMs: 5_000,
      retries: 0,
      fetch: async () => {
        calls += 1
        const encoder = new TextEncoder()
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) { controller.enqueue(encoder.encode('start')) },
        }), { status: 200 })
      },
    })
    const controller = new AbortController()
    const pending = client.text('https://example.com/abort-body', { signal: controller.signal })
    setTimeout(() => controller.abort(new Error('stop')), 10)
    const error = await capture(pending)
    expect(error.code).toBe('ABORTED')
    expect(error.transient).toBe(false)
    expect(calls).toBe(1)
  })

  it('treats a body-read timeout as transient', async () => {
    const client = createHttpClient({
      requestTimeoutMs: 15,
      retries: 0,
      fetch: async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode('start')) },
      }), { status: 200 }),
    })
    const error = await capture(client.text('https://example.com/slow-body'))
    expect(error.code).toBe('TIMEOUT')
    expect(error.transient).toBe(true)
  })
})
