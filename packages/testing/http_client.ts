/**
 * @fileoverview HTTP test client — a thin wrapper over `app.request` so tests
 * stop hand-rolling `Request`/`Response` plumbing.
 *
 * @module @lockness/testing/http_client
 */

/**
 * The minimal shape the client needs — satisfied by a Hono app (`app.request`).
 * Kept structural so the client does not couple to a specific app class.
 */
export interface RequestableApp {
    /** Dispatch a request through the app and resolve its response. */
    request(
        input: string | URL | Request,
        init?: RequestInit,
    ): Response | Promise<Response>
}

/** Options common to every test request. */
export interface TestRequestInit extends RequestInit {
    /** A JSON body — serialised and sent with `content-type: application/json`. */
    json?: unknown
}

/** A fluent client bound to one app. Every method resolves to the `Response`. */
export interface TestClient {
    /** Send a request with an explicit method/init. */
    request(path: string, init?: TestRequestInit): Promise<Response>
    /** GET `path`. */
    get(path: string, init?: TestRequestInit): Promise<Response>
    /** POST `path`. */
    post(path: string, init?: TestRequestInit): Promise<Response>
    /** PUT `path`. */
    put(path: string, init?: TestRequestInit): Promise<Response>
    /** PATCH `path`. */
    patch(path: string, init?: TestRequestInit): Promise<Response>
    /** DELETE `path`. */
    delete(path: string, init?: TestRequestInit): Promise<Response>
}

/** Build the `init` for `app.request`, folding a `json` body into headers. */
function buildInit(method: string, init: TestRequestInit = {}): RequestInit {
    const { json, headers, body, ...rest } = init
    if (json === undefined) return { method, headers, body, ...rest }
    const merged = new Headers(headers)
    merged.set('content-type', 'application/json')
    return { method, headers: merged, body: JSON.stringify(json), ...rest }
}

/**
 * Create a {@link TestClient} bound to an app.
 *
 * @param app - The app to dispatch through (e.g. a Hono instance).
 * @returns A fluent client whose methods resolve to the `Response`.
 *
 * @example
 * ```typescript
 * const client = testClient(app)
 * const res = await client.post('/posts', { json: { title: 'hi' } })
 * assertEquals(res.status, 201)
 * ```
 */
export function testClient(app: RequestableApp): TestClient {
    const send = (path: string, method: string, init?: TestRequestInit) =>
        Promise.resolve(app.request(path, buildInit(method, init)))
    return {
        request: (path, init) => send(path, init?.method ?? 'GET', init),
        get: (path, init) => send(path, 'GET', init),
        post: (path, init) => send(path, 'POST', init),
        put: (path, init) => send(path, 'PUT', init),
        patch: (path, init) => send(path, 'PATCH', init),
        delete: (path, init) => send(path, 'DELETE', init),
    }
}
