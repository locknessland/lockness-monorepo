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
import { type KitName, KITS } from '@lockness/init'
import {
    appPathRequests,
    INSPECT_FORMAT,
    judgeContainerHealth,
    judgeNotFound,
    judgeRouterList,
    missingFromRegistry,
    parseContainerState,
    pollHealthy,
    publishableMembers,
    publishToRegistry,
    ROUTER_LIST_ROUTE,
} from './kit_smoke.ts'
import { LocalJsrStore } from './local_jsr.ts'

Deno.test('judgeRouterList passes only a zero exit that lists the route', () => {
    const table =
        '┃ GET    ┃ /auth/login ┃ auth.login        ┃ AuthController ┃'
    assert(judgeRouterList(true, table, 'auth.login').ok)
    assert(!judgeRouterList(false, table, 'auth.login').ok)
    assert(!judgeRouterList(true, '⚠️  No controllers found', 'hello').ok)
    // A longer name the route prefixes is not the route.
    assert(!judgeRouterList(true, '┃ auth.login.submit ┃', 'auth.login').ok)
})

Deno.test('ROUTER_LIST_ROUTE names a route each kit stub defines', async () => {
    const stubs = new URL('../packages/init/stubs/kits/', import.meta.url)
    for (const [kit, route] of Object.entries(ROUTER_LIST_ROUTE)) {
        let found = false
        for (const stub of KITS[kit as KitName].overlay) {
            if (!stub.startsWith('app/controller/')) continue
            const source = await Deno.readTextFile(
                new URL(`${kit}/${stub}`, stubs),
            )
            if (source.includes(`name: '${route}'`)) found = true
        }
        assert(found, `${kit} defines no route named ${route}`)
    }
})

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

// ---------------------------------------------------------------------------
// `--docker` (#503): reading `docker inspect`, judging it, and polling it
// ---------------------------------------------------------------------------

Deno.test('parseContainerState reads the INSPECT_FORMAT line, none as no health check', () => {
    assertEquals(parseContainerState('running starting 0\n'), {
        status: 'running',
        health: 'starting',
        exitCode: 0,
    })
    assertEquals(parseContainerState('exited none 1'), {
        status: 'exited',
        health: null,
        exitCode: 1,
    })
    assertEquals(parseContainerState('Error: No such object: abc'), undefined)
    assertEquals(parseContainerState(''), undefined)
    // The template is what produces `none`; keep the two together.
    assert(INSPECT_FORMAT.includes('{{else}}none{{end}}'))
})

/** A container state, for the verdict tables below. */
function state(status: string, health: string | null, exitCode = 0) {
    return { status, health, exitCode }
}

Deno.test('judgeContainerHealth passes only healthy, waits only while starting', () => {
    assertEquals(judgeContainerHealth(state('running', 'healthy')), {
        done: true,
        result: { ok: true, detail: 'container healthy' },
    })
    assertEquals(judgeContainerHealth(state('running', 'starting')), {
        done: false,
    })
    assertEquals(judgeContainerHealth(state('created', 'starting')), {
        done: false,
    })
    // None of these can still become healthy: fail now, saying which.
    const final = [
        [state('running', 'unhealthy'), 'unhealthy'],
        [state('running', null), 'no HEALTHCHECK'],
        [state('exited', 'starting', 1), 'exited with code 1'],
        [state('dead', 'healthy', 137), 'dead with code 137'],
    ] as const
    for (const [reading, detail] of final) {
        const verdict = judgeContainerHealth(reading)
        assert(verdict.done, `${JSON.stringify(reading)} must be final`)
        assert(!verdict.result.ok, `${JSON.stringify(reading)} must fail`)
        assert(
            verdict.result.detail.includes(detail),
            `"${verdict.result.detail}" should say "${detail}"`,
        )
    }
})

/** A fake clock whose sleep advances it, so a poll takes no real time. */
function fakeClock() {
    let t = 0
    return {
        now: () => t,
        sleep: (ms: number) => {
            t += ms
            return Promise.resolve()
        },
    }
}

Deno.test('pollHealthy reads until healthy and says how long it took', async () => {
    const readings = ['starting', 'starting', 'healthy']
    const result = await pollHealthy(
        () => Promise.resolve(state('running', readings.shift()!)),
        { ...fakeClock(), intervalMs: 1_000, timeoutMs: 90_000 },
    )
    assertEquals(result, { ok: true, detail: 'container healthy in 2s' })
    assertEquals(readings, [])
})

Deno.test('pollHealthy fails at the timeout with the last status seen', async () => {
    let reads = 0
    const result = await pollHealthy(
        () => {
            reads++
            return Promise.resolve(state('running', 'starting'))
        },
        { ...fakeClock(), intervalMs: 1_000, timeoutMs: 5_000 },
    )
    assertEquals(result, {
        ok: false,
        detail: 'container still running/starting after 5s',
    })
    // Read at 0s through 5s: the timeout ends the poll, never a whole
    // interval past it.
    assertEquals(reads, 6)
})

Deno.test('pollHealthy stops at the first final reading, not at the timeout', async () => {
    let reads = 0
    const result = await pollHealthy(
        () => {
            reads++
            return Promise.resolve(
                reads < 2
                    ? state('running', 'starting')
                    : state('exited', 'starting', 1),
            )
        },
        { ...fakeClock(), intervalMs: 1_000, timeoutMs: 90_000 },
    )
    assertEquals(result, {
        ok: false,
        detail: 'container exited with code 1 before it was healthy in 1s',
    })
    assertEquals(reads, 2)
})

Deno.test('pollHealthy turns an inspect failure into a failed verdict', async () => {
    const result = await pollHealthy(
        () => Promise.reject(new Error('No such container: abc')),
        fakeClock(),
    )
    assertEquals(result, {
        ok: false,
        detail: 'docker inspect failed: No such container: abc',
    })
})
