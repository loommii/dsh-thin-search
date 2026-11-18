/**
 * Node 24 exposes the fetch API as globals, and `@types/node` declares
 * `RequestInit`, `Response` and `Headers` globally. `RequestRedirect` is only
 * exported from `undici-types/fetch` rather than declared globally, so the host
 * sources reference it as a bare type name.
 *
 * The host typecheck deliberately does not load the DOM lib (the browser half
 * adds it through `tsconfig.client.json`). This ambient declaration keeps the
 * host build DOM-free without changing the published runtime types.
 */
type RequestRedirect = 'error' | 'follow' | 'manual'
