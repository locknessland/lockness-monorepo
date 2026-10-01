#!/usr/bin/env -S deno run --allow-net
/**
 * @fileoverview A localhost-only registry that speaks enough of the JSR
 * protocol for `deno publish` to upload to it and for `deno run` to resolve
 * from it (#470).
 *
 * The kit boot gate (`deno task kits:smoke --registry`) publishes this
 * workspace into it and then boots each starter kit with `JSR_URL` pointing
 * here. That is the only way to exercise what a user actually downloads
 * before it is on jsr.io: `deno publish` rewrites every module it bundles (it
 * writes `@jsxImportSource` pragmas, among others), and v0.4.0 shipped broken
 * because nothing ran those rewritten files before the irreversible publish.
 * Workspace resolution and Deno `links` both load the raw source and both
 * passed while the published api kit could not start.
 *
 * What it serves:
 *
 * | Request | Answer |
 * | :------ | :----- |
 * | `POST /api/scopes/lockness/packages/<p>/versions/<v>` | gunzips and untars the bundle, keeps it in memory |
 * | `GET /api/scopes/lockness/packages/<p>/versions/<v>` | 200 once received, 404 before (how `deno publish` skips a published version) |
 * | `GET /api/publish_status/<id>` | `success` for every upload it accepted |
 * | `GET /api/scopes/lockness/packages/<p>` | 200 — every package "exists" |
 * | `GET /@lockness/<p>/meta.json` | the versions it received |
 * | `GET /@lockness/<p>/<v>_meta.json` | sha256 manifest of every file, plus `exports` |
 * | `GET /@lockness/<p>/<v>/<file>` | the file, as uploaded |
 * | any other scope | passed through to jsr.io, read-only |
 *
 * **A `@lockness/*` package it did not receive is a 404, never a fallback to
 * jsr.io.** A silent fallback would let a kit resolve the last release and
 * pass against code that is not the code under test — the exact blind spot
 * this gate exists to close.
 *
 * **Who may talk to it.** It binds only a loopback literal (`127.0.0.0/8` or
 * `::1`), so the network cannot reach it. Loopback alone does not stop a
 * browser on the same machine. Any page can send a cross-site "no-cors" POST
 * to `http://127.0.0.1:<port>`, and the `Host` check passes. Without a further
 * check, that page could publish a higher version of a `@lockness/*` package,
 * and `init` and the kits would then run its code with `-A`. Three checks close
 * that:
 *
 * - Any request carrying `Origin` or `Sec-Fetch-Site` is refused with 403.
 *   Browsers always send one of them; Deno's `fetch`, its module loader and
 *   `deno publish` send neither.
 * - A publish needs `Authorization: Bearer <token>`. The token is a fresh
 *   `crypto.randomUUID()` per run ({@link LocalJsr.token}), handed only to
 *   `deno publish --token` and never logged. Anything else gets 401.
 * - A request whose `Host` is not a loopback literal is refused, which stops
 *   DNS rebinding. `localhost` is refused on purpose: it is a name, and a name
 *   can be made to resolve elsewhere.
 *
 * What it does not model, and the post-publish `/ship` check covers instead:
 * server-side dependency data in `_meta.json`, `createdAt` (so Deno's minimum
 * dependency age never applies), provenance, and JSR's own publish-time
 * validation.
 *
 * @example
 * ```bash
 * deno run --allow-net scripts/local_jsr.ts          # ephemeral port, printed
 * ```
 *
 * @module
 */

import { parse as parseJsonc } from '@std/jsonc'
import { compare, parse as parseSemver } from '@std/semver'
import { UntarStream } from '@std/tar/untar-stream'

/** The only address the registry binds by default. */
export const LOCAL_JSR_HOSTNAME = '127.0.0.1'

/** The scope the registry accepts uploads for and answers for itself. */
export const LOCAL_JSR_SCOPE = 'lockness'

/** Where every scope other than {@link LOCAL_JSR_SCOPE} is read from. */
export const JSR_UPSTREAM = 'https://jsr.io'

/** Bytes backed by a plain `ArrayBuffer`, as Web Crypto and `Response` want them. */
export type Bytes = Uint8Array<ArrayBuffer>

/** One version of one package, as `deno publish` uploaded it. */
export interface PublishedPackage {
    /** Every file of the bundle, keyed by its absolute path (`/mod.ts`). */
    readonly files: ReadonlyMap<string, Bytes>
    /** The `exports` of the uploaded config, normalised to a map. */
    readonly exports: Readonly<Record<string, string>>
}

/** What `deno run` reads as `<version>_meta.json`. */
export interface VersionMeta {
    /** Every file with its size and `sha256-<hex>` checksum. */
    readonly manifest: Record<string, { size: number; checksum: string }>
    /** The package's exports. */
    readonly exports: Readonly<Record<string, string>>
}

/** What `deno run` reads as `meta.json`. */
export interface PackageMeta {
    readonly scope: string
    readonly name: string
    readonly latest: string | null
    readonly versions: Record<string, Record<string, never>>
}

/**
 * Every package version the registry has received, in memory.
 *
 * @example
 * ```ts
 * const store = new LocalJsrStore()
 * store.add('core', '0.4.0', { files: new Map(), exports: { '.': './mod.ts' } })
 * store.versions('core') // ['0.4.0']
 * ```
 */
export class LocalJsrStore {
    readonly #packages = new Map<string, Map<string, PublishedPackage>>()

    /**
     * Keep one uploaded version.
     *
     * @param name - Package name without the scope (`core`).
     * @param version - Its version.
     * @param pkg - The bundle.
     * @throws {Error} When that version was already received — a registry
     * version is immutable, and a second upload is a bug in the caller.
     */
    add(name: string, version: string, pkg: PublishedPackage): void {
        const versions = this.#packages.get(name) ?? new Map()
        if (versions.has(version)) {
            throw new Error(`@${LOCAL_JSR_SCOPE}/${name}@${version} exists`)
        }
        versions.set(version, pkg)
        this.#packages.set(name, versions)
    }

    /**
     * @param name - Package name without the scope.
     * @param version - The version.
     * @returns The bundle, or `undefined` when it was never received.
     */
    get(name: string, version: string): PublishedPackage | undefined {
        return this.#packages.get(name)?.get(version)
    }

    /**
     * @param name - Package name without the scope.
     * @returns Every version received for it, in upload order.
     */
    versions(name: string): string[] {
        return [...(this.#packages.get(name)?.keys() ?? [])]
    }

    /** @returns Every package name received, sorted. */
    names(): string[] {
        return [...this.#packages.keys()].sort()
    }
}

/**
 * Whether a hostname is a loopback **literal**.
 *
 * Accepts any `127.0.0.0/8` dotted quad and `::1` (bare or bracketed, as
 * `URL.hostname` writes it). Refuses every name, `localhost` included.
 *
 * @param hostname - A hostname as `URL.hostname` or `Deno.serve` sees it.
 * @returns Whether it can only reach this machine.
 *
 * @example
 * ```ts
 * isLoopbackHostname('127.0.0.1') // true
 * isLoopbackHostname('[::1]')     // true
 * isLoopbackHostname('localhost') // false
 * ```
 */
export function isLoopbackHostname(hostname: string): boolean {
    if (hostname === '::1' || hostname === '[::1]') return true
    const octets = hostname.split('.')
    if (octets.length !== 4 || octets[0] !== '127') return false
    return octets.every((octet) =>
        /^(0|[1-9][0-9]{0,2})$/.test(octet) && Number(octet) <= 255
    )
}

/**
 * Parse a registry URL and refuse anything that is not plain-HTTP loopback.
 *
 * This is what stands between `JSR_URL` and an accidental publish of a
 * workspace to a real host with a fake token.
 *
 * @param value - The URL, typically the value given to `JSR_URL`.
 * @returns The parsed URL.
 * @throws {Error} When it does not parse, is not `http:`, carries credentials
 * or a path, or its host is not a loopback literal.
 *
 * @example
 * ```ts
 * assertLoopbackUrl('http://127.0.0.1:49152') // URL
 * assertLoopbackUrl('https://jsr.io')         // throws
 * ```
 */
export function assertLoopbackUrl(value: string): URL {
    let url: URL
    try {
        url = new URL(value)
    } catch {
        throw new Error(`not a URL: ${JSON.stringify(value)}`)
    }
    if (url.protocol !== 'http:') {
        throw new Error(`refusing ${url.protocol} registry: loopback http only`)
    }
    if (url.username !== '' || url.password !== '') {
        throw new Error('refusing a registry URL that carries credentials')
    }
    if (!isLoopbackHostname(url.hostname)) {
        throw new Error(
            `refusing registry host "${url.hostname}": not a loopback literal`,
        )
    }
    if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
        throw new Error('refusing a registry URL with a path or query')
    }
    return url
}

/** A request, classified by what the registry does with it. */
export type Route =
    | { kind: 'publish'; scope: string; name: string; version: string }
    | { kind: 'versionInfo'; scope: string; name: string; version: string }
    | { kind: 'publishStatus'; id: string }
    | { kind: 'packageInfo'; scope: string; name: string }
    | { kind: 'unknownApi' }
    | { kind: 'packageMeta'; scope: string; name: string }
    | { kind: 'versionMeta'; scope: string; name: string; version: string }
    | {
        kind: 'file'
        scope: string
        name: string
        version: string
        path: string
    }
    | { kind: 'other' }
    | { kind: 'malformed' }

/**
 * Split a path into decoded segments.
 *
 * @returns The segments, or `undefined` when one does not decode.
 */
function segments(pathname: string): string[] | undefined {
    try {
        return pathname.split('/').slice(1).map((s) => decodeURIComponent(s))
    } catch {
        return undefined
    }
}

/**
 * Classify a request by method and path.
 *
 * @param method - The HTTP method.
 * @param pathname - The URL path, still percent-encoded.
 * @returns What the request is asking for.
 *
 * @example
 * ```ts
 * parseRoute('GET', '/@lockness/core/0.4.0_meta.json')
 * // { kind: 'versionMeta', scope: 'lockness', name: 'core', version: '0.4.0' }
 * ```
 */
export function parseRoute(method: string, pathname: string): Route {
    const parts = segments(pathname)
    if (parts === undefined) return { kind: 'malformed' }

    if (parts[0] === 'api') {
        const [, a, scope, b, name, c, version, ...extra] = parts
        if (a === 'publish_status' && scope && parts.length === 3) {
            return { kind: 'publishStatus', id: scope }
        }
        if (a !== 'scopes' || b !== 'packages' || !scope || !name) {
            return { kind: 'unknownApi' }
        }
        if (c === undefined) return { kind: 'packageInfo', scope, name }
        if (c === 'versions' && version && extra.length === 0) {
            return method === 'POST'
                ? { kind: 'publish', scope, name, version }
                : { kind: 'versionInfo', scope, name, version }
        }
        return { kind: 'unknownApi' }
    }

    const [first, name, second, ...rest] = parts
    if (!first?.startsWith('@') || !name || !second) return { kind: 'other' }
    const scope = first.slice(1)
    if (second === 'meta.json' && rest.length === 0) {
        return { kind: 'packageMeta', scope, name }
    }
    if (second.endsWith('_meta.json') && rest.length === 0) {
        const version = second.slice(0, -'_meta.json'.length)
        return { kind: 'versionMeta', scope, name, version }
    }
    if (rest.length > 0 && rest.every((s) => s !== '')) {
        return {
            kind: 'file',
            scope,
            name,
            version: second,
            path: `/${rest.join('/')}`,
        }
    }
    return { kind: 'other' }
}

/**
 * Turn a tar entry path into the absolute in-package path JSR serves it at.
 *
 * @param path - The entry path (`./mod.ts`, `package/mod.ts`, `mod.ts`).
 * @returns The path with a single leading `/`.
 * @throws {Error} On an empty path or one with a `..` or `.` segment, which no
 * bundle `deno publish` writes contains.
 *
 * @example
 * ```ts
 * normaliseTarPath('./exceptions/handler.ts') // '/exceptions/handler.ts'
 * ```
 */
export function normaliseTarPath(path: string): string {
    const relative = path.replace(/^\.?\//, '').replace(/^package\//, '')
    const parts = relative.split('/')
    if (
        relative === '' ||
        parts.some((p) => p === '' || p === '.' || p === '..')
    ) {
        throw new Error(`refusing tar entry ${JSON.stringify(path)}`)
    }
    return `/${relative}`
}

/**
 * Gunzip and untar a bundle into memory.
 *
 * @param body - The gzipped tarball `deno publish` uploads.
 * @returns Every regular file, keyed by {@link normaliseTarPath}.
 * @throws {Error} When the stream is not a gzipped tar, or an entry path is
 * refused.
 *
 * @example
 * ```ts
 * const files = await readTarball(request.body!)
 * files.get('/deno.json')
 * ```
 */
export async function readTarball(
    body: ReadableStream<Bytes>,
): Promise<Map<string, Bytes>> {
    const files = new Map<string, Bytes>()
    const entries = body
        .pipeThrough(new DecompressionStream('gzip'))
        .pipeThrough(new UntarStream())
    for await (const entry of entries) {
        if (entry.readable === undefined) continue
        const bytes = new Uint8Array(
            await new Response(entry.readable).arrayBuffer(),
        )
        files.set(normaliseTarPath(entry.path), bytes)
    }
    return files
}

/** Whether a value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the `exports` of an uploaded config the way JSR normalises it.
 *
 * @param config - The parsed `deno.json(c)`.
 * @returns A string `exports` as `{ '.': value }`, a map of strings as-is,
 * and `{}` for anything else.
 *
 * @example
 * ```ts
 * readExports({ exports: './mod.ts' }) // { '.': './mod.ts' }
 * ```
 */
export function readExports(config: unknown): Record<string, string> {
    if (!isRecord(config)) return {}
    const { exports } = config
    if (typeof exports === 'string') return { '.': exports }
    if (!isRecord(exports)) return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(exports)) {
        if (typeof value === 'string') out[key] = value
    }
    return out
}

/** `sha256-<hex>`, the checksum format of a JSR version manifest. */
async function checksum(bytes: Bytes): Promise<string> {
    const digest = new Uint8Array(
        await crypto.subtle.digest('SHA-256', bytes),
    )
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0'))
    return `sha256-${hex.join('')}`
}

/**
 * Build a version's `_meta.json`.
 *
 * @param pkg - The bundle.
 * @returns The manifest Deno checks every downloaded file against.
 *
 * @example
 * ```ts
 * (await versionMeta(pkg)).manifest['/mod.ts'].checksum // 'sha256-…'
 * ```
 */
export async function versionMeta(pkg: PublishedPackage): Promise<VersionMeta> {
    const manifest: VersionMeta['manifest'] = {}
    for (const [path, bytes] of pkg.files) {
        manifest[path] = { size: bytes.length, checksum: await checksum(bytes) }
    }
    return { manifest, exports: pkg.exports }
}

/**
 * Build a package's `meta.json`.
 *
 * @param scope - The scope, without `@`.
 * @param name - The package name.
 * @param versions - Every version received.
 * @returns The version list, with the highest SemVer as `latest`.
 *
 * @example
 * ```ts
 * packageMeta('lockness', 'core', ['0.4.0', '0.4.1']).latest // '0.4.1'
 * ```
 */
export function packageMeta(
    scope: string,
    name: string,
    versions: readonly string[],
): PackageMeta {
    const sorted = [...versions].sort((a, b) =>
        compare(parseSemver(a), parseSemver(b))
    )
    return {
        scope,
        name,
        latest: sorted.at(-1) ?? null,
        versions: Object.fromEntries(sorted.map((v) => [v, {}])),
    }
}

/** A JSR-style JSON error. */
function apiError(status: number, code: string, message: string): Response {
    return Response.json({ code, message }, { status })
}

/** Package names and versions JSR would accept; nothing else is stored. */
const NAME = /^[a-z0-9][a-z0-9-]*$/
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/

/** Options for {@link createLocalJsrHandler}. */
export interface LocalJsrHandlerOptions {
    /** Where uploads go and reads come from. */
    readonly store: LocalJsrStore
    /**
     * The bearer token a publish must carry. Required: a handler that would
     * take an unauthenticated upload is not constructible.
     */
    readonly publishToken: string
    /** Base URL every other scope is read from. Defaults to jsr.io. */
    readonly upstream?: string
    /** How the upstream is fetched; injectable for tests. */
    readonly fetchUpstream?: (url: URL, init: RequestInit) => Promise<Response>
    /** Where the registry reports uploads and refusals. Silent by default. */
    readonly log?: (line: string) => void
}

/**
 * The registry's request handler, without a socket — `Deno.serve` binds it in
 * {@link startLocalJsr}, and the tests call it directly.
 *
 * @param options - Store, publish token, upstream and logging.
 * @returns A `Deno.serve`-compatible handler.
 * @throws {Error} When `publishToken` is too short to be a per-run random value.
 *
 * @example
 * ```ts
 * const handler = createLocalJsrHandler({
 *     store: new LocalJsrStore(),
 *     publishToken: crypto.randomUUID(),
 * })
 * await handler(new Request('http://127.0.0.1/@lockness/core/meta.json'))
 * // 404: never received, and never fetched from jsr.io
 * ```
 */
export function createLocalJsrHandler(
    options: LocalJsrHandlerOptions,
): (request: Request) => Promise<Response> {
    const { store } = options
    if (options.publishToken.length < 16) {
        throw new Error('publishToken must be a per-run random value')
    }
    const expectedAuthorization = `Bearer ${options.publishToken}`
    const upstream = new URL(options.upstream ?? JSR_UPSTREAM)
    const fetchUpstream = options.fetchUpstream ??
        ((url: URL, init: RequestInit) => fetch(url, init))
    const log = options.log ?? (() => {})
    const statuses = new Map<string, Record<string, string>>()

    const notReceived = (what: string): Response => {
        log(`404 ${what} (not received; never fetched from jsr.io)`)
        return apiError(404, 'notFound', `${what} was not published here`)
    }

    const passthrough = async (
        request: Request,
        url: URL,
    ): Promise<Response> => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return apiError(405, 'methodNotAllowed', 'read-only passthrough')
        }
        const target = new URL(url.pathname + url.search, upstream)
        try {
            const response = await fetchUpstream(target, {
                method: request.method,
            })
            // `fetch` already decoded the body, so the encoding headers no
            // longer describe it; forwarding them breaks the client.
            const headers = new Headers(response.headers)
            headers.delete('content-encoding')
            headers.delete('content-length')
            headers.delete('transfer-encoding')
            return new Response(response.body, {
                status: response.status,
                headers,
            })
        } catch (error) {
            log(`502 ${target.href}: ${(error as Error).message}`)
            return apiError(502, 'upstreamError', (error as Error).message)
        }
    }

    const publish = async (
        request: Request,
        url: URL,
        route: Extract<Route, { kind: 'publish' }>,
    ): Promise<Response> => {
        const { scope, name, version } = route
        // Never logged: neither the expected value nor what was sent.
        if (request.headers.get('authorization') !== expectedAuthorization) {
            log(`401 POST @${scope}/${name}@${version}: no valid publish token`)
            return apiError(401, 'unauthorized', 'publish token required')
        }
        if (scope !== LOCAL_JSR_SCOPE) {
            return apiError(403, 'scopeNotAllowed', `only @${LOCAL_JSR_SCOPE}`)
        }
        if (!NAME.test(name) || !VERSION.test(version)) {
            return apiError(400, 'invalidPackage', `${name}@${version}`)
        }
        if (store.get(name, version) !== undefined) {
            return apiError(409, 'versionAlreadyExists', `${name}@${version}`)
        }
        if (request.body === null) {
            return apiError(400, 'missingTarball', 'empty body')
        }
        let files: Map<string, Bytes>
        try {
            files = await readTarball(request.body)
        } catch (error) {
            log(`400 @${scope}/${name}@${version}: ${(error as Error).message}`)
            return apiError(400, 'invalidTarball', (error as Error).message)
        }
        const configPath = url.searchParams.get('config') ?? '/deno.json'
        const configBytes = files.get(configPath)
        let config: unknown = undefined
        try {
            config = configBytes === undefined
                ? undefined
                : parseJsonc(new TextDecoder().decode(configBytes))
        } catch (error) {
            return apiError(400, 'invalidConfig', (error as Error).message)
        }
        const exports = readExports(config)
        if (Object.keys(exports).length === 0) {
            return apiError(400, 'missingExports', `${configPath} has none`)
        }
        store.add(name, version, { files, exports })
        const id = crypto.randomUUID()
        const status = {
            id,
            status: 'success',
            packageScope: scope,
            packageName: name,
            packageVersion: version,
        }
        statuses.set(id, status)
        log(`published @${scope}/${name}@${version} (${files.size} files)`)
        return Response.json(status, { status: 202 })
    }

    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url)
        if (!isLoopbackHostname(url.hostname)) {
            log(`403 host ${url.hostname}`)
            return apiError(403, 'hostNotAllowed', 'loopback hosts only')
        }
        if (
            request.headers.has('origin') ||
            request.headers.has('sec-fetch-site')
        ) {
            log(`403 ${request.method} ${url.pathname}: browser request`)
            return apiError(403, 'browserNotAllowed', 'no browser requests')
        }
        const route = parseRoute(request.method, url.pathname)
        switch (route.kind) {
            case 'malformed':
                return apiError(400, 'malformedPath', url.pathname)
            case 'publish':
                return await publish(request, url, route)
            case 'publishStatus': {
                const status = statuses.get(route.id)
                return status === undefined
                    ? apiError(404, 'notFound', 'unknown publish')
                    : Response.json(status)
            }
            case 'packageInfo':
                return route.scope === LOCAL_JSR_SCOPE
                    ? Response.json({ scope: route.scope, name: route.name })
                    : apiError(404, 'notFound', 'scope not served here')
            case 'versionInfo':
                return route.scope === LOCAL_JSR_SCOPE &&
                        store.get(route.name, route.version) !== undefined
                    ? Response.json({
                        scope: route.scope,
                        package: route.name,
                        version: route.version,
                    })
                    : apiError(404, 'notFound', 'version not published here')
            case 'unknownApi':
                log(`404 ${request.method} ${url.pathname} (unmodelled API)`)
                return apiError(404, 'notFound', 'not modelled')
            case 'other':
                return await passthrough(request, url)
        }

        if (route.scope !== LOCAL_JSR_SCOPE) {
            return await passthrough(request, url)
        }
        const full = `@${route.scope}/${route.name}`
        if (route.kind === 'packageMeta') {
            const versions = store.versions(route.name)
            return versions.length === 0
                ? notReceived(full)
                : Response.json(packageMeta(route.scope, route.name, versions))
        }
        const pkg = store.get(route.name, route.version)
        if (pkg === undefined) return notReceived(`${full}@${route.version}`)
        if (route.kind === 'versionMeta') {
            return Response.json(await versionMeta(pkg))
        }
        const bytes = pkg.files.get(route.path)
        // No content-type, as measured with the prototype: Deno then takes
        // the media type from the extension, as it does for a jsr.io file.
        return bytes === undefined
            ? notReceived(`${full}@${route.version}${route.path}`)
            : new Response(bytes.slice())
    }
}

/** A running registry. */
export interface LocalJsr {
    /** Its base URL, `http://127.0.0.1:<ephemeral port>` — give it to `JSR_URL`. */
    readonly url: string
    /**
     * The per-run publish token (`crypto.randomUUID()`), for
     * `deno publish --token` only. Never log it or write it to disk.
     */
    readonly token: string
    /** What it has received. */
    readonly store: LocalJsrStore
    /** Stop listening and wait until it has. Safe to call twice. */
    shutdown(): Promise<void>
}

/** Options for {@link startLocalJsr}. */
export interface StartLocalJsrOptions {
    /** A loopback literal to bind. Defaults to {@link LOCAL_JSR_HOSTNAME}. */
    readonly hostname?: string
    /** The port; `0` (the default) asks the OS for a free one. */
    readonly port?: number
    /** Base URL every other scope is read from. Defaults to jsr.io. */
    readonly upstream?: string
    /** Where uploads and refusals are reported. Silent by default. */
    readonly log?: (line: string) => void
}

/**
 * Start the registry on a loopback address.
 *
 * @param options - Bind address, port, upstream, logging.
 * @returns The running registry; call `shutdown()` in a `finally`.
 * @throws {Error} When the hostname is not a loopback literal.
 *
 * @example
 * ```ts
 * const jsr = startLocalJsr()
 * try {
 *     // JSR_URL=jsr.url deno publish …
 * } finally {
 *     await jsr.shutdown()
 * }
 * ```
 */
export function startLocalJsr(options: StartLocalJsrOptions = {}): LocalJsr {
    const hostname = options.hostname ?? LOCAL_JSR_HOSTNAME
    if (!isLoopbackHostname(hostname)) {
        throw new Error(`refusing to bind ${hostname}: loopback literals only`)
    }
    const store = new LocalJsrStore()
    const token = crypto.randomUUID()
    const server = Deno.serve(
        {
            hostname: hostname.replace(/^\[|\]$/g, ''),
            port: options.port ?? 0,
            onListen: () => {},
        },
        createLocalJsrHandler({
            store,
            publishToken: token,
            upstream: options.upstream,
            log: options.log,
        }),
    )
    const host = server.addr.hostname.includes(':')
        ? `[${server.addr.hostname}]`
        : server.addr.hostname
    let stopped: Promise<void> | undefined
    return {
        url: `http://${host}:${server.addr.port}`,
        token,
        store,
        shutdown: () => {
            stopped ??= server.shutdown()
            return stopped
        },
    }
}

if (import.meta.main) {
    const jsr = startLocalJsr({ log: (line) => console.log(line) })
    console.log(`local JSR on ${jsr.url} — Ctrl-C to stop`)
    Deno.addSignalListener('SIGINT', () => {
        jsr.shutdown().then(() => Deno.exit(0))
    })
}
