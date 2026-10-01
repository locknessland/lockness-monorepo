/**
 * @fileoverview The localhost JSR registry behind the kit boot gate (#470):
 * its loopback refusals, its routing, the bundle it reads, and — the property
 * the gate rests on — that a `@lockness/*` package it never received is a 404,
 * never a fetch from jsr.io.
 *
 * @module
 */

import { assert, assertEquals, assertRejects, assertThrows } from '@std/assert'
import { TarStream, type TarStreamInput } from '@std/tar/tar-stream'
import {
    assertLoopbackUrl,
    type Bytes,
    createLocalJsrHandler,
    isLoopbackHostname,
    LocalJsrStore,
    normaliseTarPath,
    packageMeta,
    parseRoute,
    readExports,
    readTarball,
    startLocalJsr,
    TarballTooLargeError,
    versionMeta,
} from './local_jsr.ts'

const encode = (text: string): Bytes => new TextEncoder().encode(text)

/** A gzipped tarball shaped like the one `deno publish` uploads. */
function tarball(files: Record<string, string>): ReadableStream<Bytes> {
    const entries: TarStreamInput[] = Object.entries(files).map((
        [path, text],
    ) => {
        const bytes = encode(text)
        return {
            type: 'file',
            path,
            size: bytes.length,
            readable: ReadableStream.from([bytes]),
        }
    })
    return ReadableStream.from(entries)
        .pipeThrough(new TarStream())
        .pipeThrough(new CompressionStream('gzip'))
}

/** The per-run publish token the harness's handler expects. */
const TOKEN = crypto.randomUUID()

/** The header `deno publish --token <TOKEN>` sends. */
const AUTH = { authorization: `Bearer ${TOKEN}` }

/** A handler whose upstream records every URL it is asked for. */
function harness() {
    const store = new LocalJsrStore()
    const upstream: string[] = []
    const handler = createLocalJsrHandler({
        store,
        publishToken: TOKEN,
        fetchUpstream: (url) => {
            upstream.push(url.href)
            return Promise.resolve(
                new Response('{"upstream":true}', {
                    headers: {
                        'content-type': 'application/json',
                        'content-encoding': 'gzip',
                    },
                }),
            )
        },
    })
    const at = (path: string, init?: RequestInit) =>
        handler(new Request(`http://127.0.0.1:4507${path}`, init))
    return { store, upstream, at }
}

const CORE = {
    './deno.json': JSON.stringify({
        name: '@lockness/core',
        version: '0.4.0',
        exports: { '.': './mod.ts', './jsx-runtime': './jsx.ts' },
    }),
    './mod.ts': 'export const core = 1\n',
    './jsx.ts': 'export const jsx = 1\n',
}

/** Publish `@lockness/core@0.4.0` through the handler, as `deno publish` does. */
async function publishCore(at: ReturnType<typeof harness>['at']) {
    return await at(
        '/api/scopes/lockness/packages/core/versions/0.4.0?config=/deno.json',
        { method: 'POST', body: tarball(CORE), headers: AUTH },
    )
}

Deno.test('isLoopbackHostname accepts loopback literals and refuses names', () => {
    for (const host of ['127.0.0.1', '127.1.2.3', '::1', '[::1]']) {
        assert(isLoopbackHostname(host), host)
    }
    for (
        const host of [
            'localhost',
            '0.0.0.0',
            '128.0.0.1',
            '10.0.0.1',
            '127.0.0.256',
            '127.0.0',
            '127.0.0.01',
            'jsr.io',
            '',
        ]
    ) {
        assert(!isLoopbackHostname(host), host)
    }
})

Deno.test('assertLoopbackUrl takes loopback http and refuses the rest', () => {
    assertEquals(assertLoopbackUrl('http://127.0.0.1:49152').port, '49152')
    assertEquals(assertLoopbackUrl('http://[::1]:49152/').hostname, '[::1]')
    for (
        const url of [
            'https://jsr.io',
            'http://jsr.io',
            'http://localhost:4507',
            'https://127.0.0.1:4507',
            'http://user:pw@127.0.0.1:4507',
            'http://127.0.0.1:4507/api',
            'http://127.0.0.1:4507/?x=1',
            'not a url',
        ]
    ) {
        assertThrows(() => assertLoopbackUrl(url), Error, undefined, url)
    }
})

Deno.test('parseRoute classifies every request the gate makes', () => {
    const cases: [string, string, unknown][] = [
        ['POST', '/api/scopes/lockness/packages/core/versions/0.4.0', {
            kind: 'publish',
            scope: 'lockness',
            name: 'core',
            version: '0.4.0',
        }],
        ['GET', '/api/scopes/lockness/packages/core/versions/0.4.0', {
            kind: 'versionInfo',
            scope: 'lockness',
            name: 'core',
            version: '0.4.0',
        }],
        ['GET', '/api/scopes/lockness/packages/core', {
            kind: 'packageInfo',
            scope: 'lockness',
            name: 'core',
        }],
        ['GET', '/api/publish_status/abc', {
            kind: 'publishStatus',
            id: 'abc',
        }],
        ['GET', '/api/users/me', { kind: 'unknownApi' }],
        ['GET', '/@lockness/core/meta.json', {
            kind: 'packageMeta',
            scope: 'lockness',
            name: 'core',
        }],
        ['GET', '/%40lockness/core/meta.json', {
            kind: 'packageMeta',
            scope: 'lockness',
            name: 'core',
        }],
        ['GET', '/@lockness/core/0.4.0_meta.json', {
            kind: 'versionMeta',
            scope: 'lockness',
            name: 'core',
            version: '0.4.0',
        }],
        ['GET', '/@lockness/core/0.4.0/exceptions/handler.ts', {
            kind: 'file',
            scope: 'lockness',
            name: 'core',
            version: '0.4.0',
            path: '/exceptions/handler.ts',
        }],
        ['GET', '/@std/path/1.1.4/mod.ts', {
            kind: 'file',
            scope: 'std',
            name: 'path',
            version: '1.1.4',
            path: '/mod.ts',
        }],
        ['GET', '/@std/path', { kind: 'upstream' }],
        ['GET', '/', { kind: 'notServed' }],
        ['GET', '//evil.example/x', { kind: 'notServed' }],
        ['GET', '/@STD/path/meta.json', { kind: 'notServed' }],
        ['GET', '/@lockness/core', { kind: 'notServed' }],
        ['GET', '/@lockness/core/0.4.0/', { kind: 'notServed' }],
        ['GET', '/@Lockness/core/meta.json', { kind: 'notServed' }],
        ['GET', '/%E0%A4%A', { kind: 'malformed' }],
    ]
    for (const [method, path, expected] of cases) {
        assertEquals(parseRoute(method, path), expected, `${method} ${path}`)
    }
})

Deno.test('normaliseTarPath roots a path and refuses traversal', () => {
    assertEquals(normaliseTarPath('./mod.ts'), '/mod.ts')
    assertEquals(normaliseTarPath('package/a/b.ts'), '/a/b.ts')
    assertEquals(normaliseTarPath('/deno.json'), '/deno.json')
    for (const path of ['../etc/passwd', './a/../b.ts', 'a//b.ts', './']) {
        assertThrows(() => normaliseTarPath(path), Error, 'refusing', path)
    }
})

Deno.test('readExports normalises the forms JSR accepts', () => {
    assertEquals(readExports({ exports: './mod.ts' }), { '.': './mod.ts' })
    assertEquals(readExports({ exports: { '.': './mod.ts', './x': 3 } }), {
        '.': './mod.ts',
    })
    assertEquals(readExports({}), {})
    assertEquals(readExports(null), {})
    assertEquals(readExports({ exports: ['./mod.ts'] }), {})
})

Deno.test('packageMeta names the highest SemVer as latest', () => {
    const meta = packageMeta('lockness', 'core', ['0.10.0', '0.4.1', '0.9.0'])
    assertEquals(meta.latest, '0.10.0')
    assertEquals(Object.keys(meta.versions), ['0.4.1', '0.9.0', '0.10.0'])
    assertEquals(packageMeta('lockness', 'core', []).latest, null)
})

Deno.test('versionMeta checksums every file as sha256-<hex>', async () => {
    const meta = await versionMeta({
        files: new Map([['/a.txt', encode('abc')]]),
        exports: { '.': './a.txt' },
    })
    assertEquals(meta.manifest['/a.txt'], {
        size: 3,
        checksum:
            'sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    })
    assertEquals(meta.exports, { '.': './a.txt' })
})

Deno.test('readTarball gunzips and untars a bundle', async () => {
    const files = await readTarball(tarball(CORE))
    assertEquals([...files.keys()].sort(), ['/deno.json', '/jsx.ts', '/mod.ts'])
    assertEquals(
        new TextDecoder().decode(files.get('/mod.ts')),
        CORE['./mod.ts'],
    )
})

/** `count` zero bytes: gzip shrinks them to almost nothing, a tiny bomb. */
const zeros = (count: number) => '\0'.repeat(count)

Deno.test('readTarball stops a decompression bomb at the decompressed cap', async () => {
    // 256 KiB of zeros gzips to a few hundred bytes; the cap is 32 KiB.
    await assertRejects(
        () =>
            readTarball(tarball({ './big.ts': zeros(256 * 1024) }), {
                maxCompressedBytes: 1024 * 1024,
                maxDecompressedBytes: 32 * 1024,
                maxFileBytes: 1024 * 1024,
            }),
        TarballTooLargeError,
        'decompressed',
    )
})

Deno.test('readTarball refuses a file over the per-file cap before buffering it', async () => {
    await assertRejects(
        () =>
            readTarball(tarball({ './big.ts': zeros(8 * 1024) }), {
                maxCompressedBytes: 1024 * 1024,
                maxDecompressedBytes: 1024 * 1024,
                maxFileBytes: 4 * 1024,
            }),
        TarballTooLargeError,
        '/big.ts',
    )
})

Deno.test('readTarball refuses a body over the compressed cap', async () => {
    const random = crypto.getRandomValues(new Uint8Array(32 * 1024))
    const body = ReadableStream.from([random])
    await assertRejects(
        () =>
            readTarball(body, {
                maxCompressedBytes: 8 * 1024,
                maxDecompressedBytes: 1024 * 1024,
                maxFileBytes: 1024 * 1024,
            }),
        TarballTooLargeError,
        'compressed',
    )
})

Deno.test('a publish over a cap is a 413 and stores nothing', async () => {
    const store = new LocalJsrStore()
    const handler = createLocalJsrHandler({
        store,
        publishToken: TOKEN,
        limits: {
            maxCompressedBytes: 64 * 1024,
            maxDecompressedBytes: 32 * 1024,
            maxFileBytes: 1024 * 1024,
        },
        fetchUpstream: () => Promise.reject(new Error('must not be reached')),
    })
    const url =
        'http://127.0.0.1:4507/api/scopes/lockness/packages/core/versions/0.4.0'

    const declared = await handler(
        new Request(url, {
            method: 'POST',
            headers: { ...AUTH, 'content-length': String(65 * 1024) },
            body: new Uint8Array(65 * 1024),
        }),
    )
    await declared.body?.cancel()
    assertEquals(declared.status, 413)

    const bomb = await handler(
        new Request(url, {
            method: 'POST',
            headers: AUTH,
            body: tarball({ ...CORE, './big.ts': zeros(256 * 1024) }),
        }),
    )
    await bomb.body?.cancel()
    assertEquals(bomb.status, 413)
    assertEquals(store.names(), [])
})

Deno.test('readTarball refuses a traversal entry', async () => {
    await assertRejects(
        () => readTarball(tarball({ '../escape.ts': 'x' })),
        Error,
        'refusing',
    )
})

Deno.test('a published version is served back over the read protocol', async () => {
    const { at, upstream } = harness()

    const published = await publishCore(at)
    assertEquals(published.status, 202)
    const { id, status } = await published.json()
    assertEquals(status, 'success')

    const polled = await at(`/api/publish_status/${id}`)
    assertEquals((await polled.json()).status, 'success')
    assertEquals(
        (await at('/api/scopes/lockness/packages/core/versions/0.4.0')).status,
        200,
    )
    assertEquals(
        (await at('/api/scopes/lockness/packages/core')).status,
        200,
    )

    const meta = await (await at('/@lockness/core/meta.json')).json()
    assertEquals(meta.latest, '0.4.0')

    const versionMeta = await (await at('/@lockness/core/0.4.0_meta.json'))
        .json()
    assertEquals(versionMeta.exports, {
        '.': './mod.ts',
        './jsx-runtime': './jsx.ts',
    })
    assertEquals(Object.keys(versionMeta.manifest).sort(), [
        '/deno.json',
        '/jsx.ts',
        '/mod.ts',
    ])

    const file = await at('/@lockness/core/0.4.0/mod.ts')
    assertEquals(await file.text(), CORE['./mod.ts'])
    assertEquals(upstream, [], 'nothing of @lockness may come from jsr.io')
})

Deno.test('a @lockness package it never received is a 404, never jsr.io', async () => {
    const { at, upstream } = harness()
    await publishCore(at)

    for (
        const path of [
            '/@lockness/auth/meta.json',
            '/@lockness/auth/0.4.0_meta.json',
            '/@lockness/auth/0.4.0/mod.ts',
            '/@lockness/core/0.3.0_meta.json',
            '/@lockness/core/0.3.0/mod.ts',
            '/@lockness/core/0.4.0/missing.ts',
        ]
    ) {
        const response = await at(path)
        await response.body?.cancel()
        assertEquals(response.status, 404, path)
    }
    const before = await at('/api/scopes/lockness/packages/auth/versions/0.4.0')
    await before.body?.cancel()
    assertEquals(before.status, 404)
    assertEquals(upstream, [])
})

Deno.test('every other scope is read from jsr.io, read-only', async () => {
    const { at, upstream } = harness()

    const response = await at('/@std/path/meta.json?x=1')
    assertEquals(await response.json(), { upstream: true })
    assertEquals(response.headers.get('content-encoding'), null)
    assertEquals(upstream, ['https://jsr.io/@std/path/meta.json?x=1'])

    const post = await at('/@std/path/meta.json', { method: 'POST' })
    await post.body?.cancel()
    assertEquals(post.status, 405)
    assertEquals(upstream.length, 1)
})

Deno.test('the passthrough reaches jsr.io only, and only for /@<scope>/ paths', async () => {
    const { at, upstream } = harness()
    await publishCore(at)
    for (
        const path of [
            '//evil.example/x',
            '/\\evil.example/x',
            '//evil.example',
            '/',
            '/robots.txt',
            '/@STD/path/meta.json',
            '/@lockness/core',
            '/@lockness/core/',
            '/@lockness/core/0.4.0/',
            '/@lockness/core/meta.json/',
            '/@lockness/core/0.4.0_meta.json/',
            '/@lockness/',
            '/@Lockness/core/meta.json',
            '/@LOCKNESS/core/0.4.0/mod.ts',
            '/%40Lockness/core/meta.json',
        ]
    ) {
        const response = await at(path)
        await response.body?.cancel()
        assert(
            response.status === 404 || response.status === 400,
            `${path}: ${response.status}`,
        )
    }
    assertEquals(upstream, [], 'none of these may leave the machine')

    const allowed = await at('/@std/path/1.1.4/mod.ts')
    await allowed.body?.cancel()
    assertEquals(upstream, ['https://jsr.io/@std/path/1.1.4/mod.ts'])
})

Deno.test('a passthrough target off the upstream origin is refused', async () => {
    const reached: string[] = []
    const handler = createLocalJsrHandler({
        store: new LocalJsrStore(),
        publishToken: TOKEN,
        // An upstream with a path: a relative join could still escape it.
        upstream: 'https://jsr.io/',
        fetchUpstream: (url) => {
            reached.push(url.href)
            return Promise.resolve(new Response('ok'))
        },
    })
    const response = await handler(
        new Request('http://127.0.0.1:4507/@std/path/meta.json'),
    )
    await response.body?.cancel()
    assertEquals(response.status, 200)
    assert(reached.every((href) => href.startsWith('https://jsr.io/')))
})

Deno.test('uploads are refused outside the scope, twice, or without exports', async () => {
    const { at } = harness()
    const refused = async (path: string, files: Record<string, string>) => {
        const response = await at(path, {
            method: 'POST',
            body: tarball(files),
            headers: AUTH,
        })
        await response.body?.cancel()
        return response.status
    }

    assertEquals(
        await refused('/api/scopes/std/packages/path/versions/9.9.9', CORE),
        403,
    )
    assertEquals(
        await refused('/api/scopes/lockness/packages/core/versions/0.4.0', {
            './deno.json': '{"name":"@lockness/core"}',
            './mod.ts': '',
        }),
        400,
    )
    assertEquals((await publishCore(at)).status, 202)
    assertEquals(
        await refused(
            '/api/scopes/lockness/packages/core/versions/0.4.0',
            CORE,
        ),
        409,
    )
})

Deno.test('a request whose Host is not a loopback literal is refused', async () => {
    const { store } = harness()
    const handler = createLocalJsrHandler({
        store,
        publishToken: TOKEN,
        fetchUpstream: () => Promise.reject(new Error('must not be reached')),
    })
    for (const host of ['localhost', 'evil.example', '192.168.1.10']) {
        const response = await handler(
            new Request(`http://${host}:4507/@std/path/meta.json`),
        )
        await response.body?.cancel()
        assertEquals(response.status, 403, host)
    }
})

Deno.test('a cross-site browser POST cannot publish (#470 review)', async () => {
    const { at, store, upstream } = harness()
    const path = '/api/scopes/lockness/packages/cli/versions/0.4.9999'
    const attempts: [string, RequestInit][] = [
        // What a page's no-cors form or fetch sends: Origin, a simple
        // content-type, and no credential.
        ['cross-site no-cors', {
            method: 'POST',
            body: tarball(CORE),
            headers: {
                origin: 'https://evil.example',
                'content-type': 'text/plain',
                'sec-fetch-site': 'cross-site',
            },
        }],
        ['no Authorization', { method: 'POST', body: tarball(CORE) }],
        ['wrong token', {
            method: 'POST',
            body: tarball(CORE),
            headers: { authorization: 'Bearer not-the-run-token' },
        }],
        ['right token, but from a browser', {
            method: 'POST',
            body: tarball(CORE),
            headers: { ...AUTH, origin: 'null' },
        }],
        ['right token, Sec-Fetch-Site only', {
            method: 'POST',
            body: tarball(CORE),
            headers: { ...AUTH, 'sec-fetch-site': 'same-site' },
        }],
    ]
    for (const [label, init] of attempts) {
        const response = await at(path, init)
        await response.body?.cancel()
        assert(
            [401, 403].includes(response.status),
            `${label}: ${response.status}`,
        )
    }
    assertEquals(store.names(), [], 'nothing may be stored')
    assertEquals(upstream, [])

    const published = await at(path, {
        method: 'POST',
        body: tarball(CORE),
        headers: AUTH,
    })
    await published.body?.cancel()
    assertEquals(published.status, 202)
    assertEquals(store.versions('cli'), ['0.4.9999'])
})

Deno.test('any request carrying Origin or Sec-Fetch-Site is refused', async () => {
    const { at, upstream } = harness()
    await publishCore(at)
    for (
        const path of [
            '/@lockness/core/meta.json',
            '/@lockness/core/0.4.0/mod.ts',
            '/@std/path/meta.json',
            '/api/scopes/lockness/packages/core',
        ]
    ) {
        for (
            const headers of <Record<string, string>[]> [
                { origin: 'https://evil.example' },
                { 'sec-fetch-site': 'cross-site' },
            ]
        ) {
            const response = await at(path, { headers })
            await response.body?.cancel()
            assertEquals(
                response.status,
                403,
                `${path} ${JSON.stringify(headers)}`,
            )
        }
    }
    assertEquals(upstream, [])
})

Deno.test('startLocalJsr hands out a fresh per-run token', async () => {
    const a = startLocalJsr()
    const b = startLocalJsr()
    try {
        assert(/^[0-9a-f-]{36}$/.test(a.token))
        assert(a.token !== b.token)
    } finally {
        await a.shutdown()
        await b.shutdown()
    }
})

Deno.test('startLocalJsr refuses a non-loopback bind address', () => {
    for (const hostname of ['0.0.0.0', 'localhost', '192.168.1.10']) {
        assertThrows(() => startLocalJsr({ hostname }), Error, 'refusing')
    }
})

Deno.test('startLocalJsr serves on an ephemeral loopback port', async () => {
    const jsr = startLocalJsr()
    try {
        const url = assertLoopbackUrl(jsr.url)
        assertEquals(url.hostname, '127.0.0.1')
        assert(Number(url.port) > 0)
        const response = await fetch(`${jsr.url}/@lockness/core/meta.json`)
        await response.body?.cancel()
        assertEquals(response.status, 404)
    } finally {
        await jsr.shutdown()
        await jsr.shutdown()
    }
})
