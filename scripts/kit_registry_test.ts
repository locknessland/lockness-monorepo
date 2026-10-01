/**
 * @fileoverview The offline pieces of `kits:smoke --registry` (#470): which
 * members must reach the registry, how the 404 probe is judged, and the
 * loopback refusal that stands before `deno publish`. No test here reaches
 * the network; the full gate is a CI job of its own.
 *
 * @module
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { fromFileUrl } from '@std/path'
import {
    appPathRequests,
    judgeNotFound,
    missingFromRegistry,
    publishableMembers,
    publishToRegistry,
} from './kit_smoke.ts'
import { LocalJsrStore } from './local_jsr.ts'

const ROOT = fromFileUrl(new URL('..', import.meta.url))

Deno.test('publishableMembers lists named, exported @lockness members only', async () => {
    const members = await publishableMembers(ROOT)
    const names = members.map((m) => m.name)
    assert(names.includes('@lockness/core'))
    assert(names.includes('@lockness/init'))
    assert(names.every((n) => n.startsWith('@lockness/')))
    // The vite demo is a workspace member without `exports`.
    assertEquals(new Set(names).size, names.length)
    assert(!names.some((n) => n.includes('demo')))
})

Deno.test('missingFromRegistry names every member that never arrived', () => {
    const store = new LocalJsrStore()
    store.add('core', '0.4.0', { files: new Map(), exports: { '.': './m.ts' } })
    assertEquals(
        missingFromRegistry([
            { name: '@lockness/core', version: '0.4.0' },
            { name: '@lockness/core', version: '0.4.1' },
            { name: '@lockness/auth', version: '0.4.0' },
        ], store),
        ['@lockness/core@0.4.1', '@lockness/auth@0.4.0'],
    )
})

Deno.test('judgeNotFound passes only an HTML 404', () => {
    assert(judgeNotFound(404, 'text/html; charset=UTF-8', '<html>').ok)
    assert(!judgeNotFound(404, 'application/json', '{}').ok)
    assert(!judgeNotFound(500, 'text/html', 'boom').ok)
    assert(!judgeNotFound(200, 'text/html', '<html>').ok)
    assert(!judgeNotFound(404, null, '').ok)
})

Deno.test('appPathRequests flags a registry line naming a path inside the app (#474)', () => {
    // The line the #470 slim boot logged and nobody acted on: an app file
    // requested from the registry, which means core resolved it against its
    // own URL instead of the app root. On macOS the app's cwd is the
    // realpath, so both spellings of the directory are given.
    const lines = [
        '404 GET /@lockness/nope/meta.json (not received; never fetched from jsr.io)',
        '404 GET //private/var/folders/x/T/run-1/slim-app/app/middleware/example_middleware.ts (not served)',
        '404 GET //tmp/run-1/other-app/app/x.ts (not served)',
    ]
    assertEquals(
        appPathRequests(lines, [
            '/var/folders/x/T/run-1/slim-app',
            '/private/var/folders/x/T/run-1/slim-app',
        ]),
        [lines[1]],
    )
    assertEquals(
        appPathRequests(lines.slice(0, 1), ['/tmp/run-1/slim-app']),
        [],
    )
})

Deno.test('appPathRequests does not match a sibling directory sharing a prefix', () => {
    assertEquals(
        appPathRequests(['404 GET //tmp/slim-app-2/app/x.ts (not served)'], [
            '/tmp/slim-app',
        ]),
        [],
    )
})

Deno.test('publishToRegistry refuses a non-loopback registry before spawning', async () => {
    for (
        const url of [
            'https://jsr.io',
            'http://jsr.io',
            'http://localhost:4507',
        ]
    ) {
        await assertRejects(
            () => publishToRegistry('/nonexistent', url, '/nonexistent', 'x'),
            Error,
            'refusing',
            url,
        )
    }
})
