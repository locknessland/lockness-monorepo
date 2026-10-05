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
    DOCKER_LABEL,
    INSPECT_FORMAT,
    judgeContainerHealth,
    judgeNotFound,
    judgeRouterList,
    missingFromRegistry,
    NOT_FOUND_ANSWER,
    parseContainerState,
    pollHealthy,
    publishableMembers,
    publishToRegistry,
    removeDockerObject,
    ROUTER_LIST_ROUTE,
    unexpectedInRegistry,
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

Deno.test('unexpectedInRegistry names every stored version beyond the expected members (#475)', () => {
    const store = new LocalJsrStore()
    const pkg = { files: new Map(), exports: { '.': './m.ts' } }
    store.add('core', '0.4.0', pkg)
    const expected = [{ name: '@lockness/core', version: '0.4.0' }]
    assertEquals(unexpectedInRegistry(expected, store), [])

    // A second version of a member, and a package that is no member at all.
    store.add('core', '9.9.9', pkg)
    store.add('evil', '0.4.0', pkg)
    assertEquals(unexpectedInRegistry(expected, store), [
        '@lockness/core@9.9.9',
        '@lockness/evil@0.4.0',
    ])
})

Deno.test('judgeNotFound passes only an HTML 404 from the default view', () => {
    const view = 'default-view'
    assert(judgeNotFound(404, 'text/html; charset=UTF-8', '<html>', view).ok)
    assert(!judgeNotFound(404, 'application/json', '{}', view).ok)
    assert(!judgeNotFound(500, 'text/html', 'boom', view).ok)
    assert(!judgeNotFound(200, 'text/html', '<html>', view).ok)
    assert(!judgeNotFound(404, null, '', view).ok)
})

Deno.test("judgeNotFound passes only the app handler's JSON 404 when one is shipped (#479)", () => {
    const handler = 'app-handler'
    const json = 'application/json'
    assert(
        judgeNotFound(404, json, '{"error":"Not Found","status":404}', handler)
            .ok,
    )
    // The handler failed to load: core's HTML page answered instead.
    assert(!judgeNotFound(404, 'text/html', '<html>', handler).ok)
    assert(!judgeNotFound(404, json, '{"error":"Nope"}', handler).ok)
    assert(!judgeNotFound(404, json, 'not json', handler).ok)
    assert(!judgeNotFound(404, json, 'null', handler).ok)
    assert(!judgeNotFound(500, json, '{"error":"Not Found"}', handler).ok)
})

Deno.test('judgeNotFound rejects a message in the app handler 404 under production (#479)', () => {
    const handler = 'app-handler'
    const json = 'application/json'
    const bare = '{"error":"Not Found","status":404}'
    const detailed = '{"error":"Not Found","status":404,"message":"Not Found"}'
    const production = { production: true }
    assert(judgeNotFound(404, json, bare, handler, production).ok)
    assert(!judgeNotFound(404, json, detailed, handler, production).ok)
    // Outside production the message is the developer's to see.
    assert(judgeNotFound(404, json, detailed, handler).ok)
})

Deno.test('NOT_FOUND_ANSWER expects the app handler exactly where a kit ships one (#479)', async () => {
    for (const kit of Object.keys(KITS) as KitName[]) {
        const stub = new URL(
            `../packages/init/stubs/kits/${kit}/app/view/pages/errors/error_handler.tsx.stub`,
            import.meta.url,
        )
        const ships = await Deno.stat(stub).then(() => true, (error) => {
            if (error instanceof Deno.errors.NotFound) return false
            throw error
        })
        assertEquals(
            NOT_FOUND_ANSWER[kit],
            ships ? 'app-handler' : 'default-view',
            kit,
        )
    }
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

Deno.test('appPathRequests matches the percent-encoded spelling of an app dir holding a space (#479)', () => {
    // The registry logs url.pathname, so a space arrives as %20.
    const lines = [
        '404 GET //tmp/run-1/slim%20app/app/middleware/example_middleware.ts (not served)',
        '404 GET //tmp/run-1/slim app/app/x.ts (not served)',
        '404 GET //tmp/run-1/slim%20app-2/app/x.ts (not served)',
    ]
    assertEquals(
        appPathRequests(lines, ['/tmp/run-1/slim app']),
        lines.slice(0, 2),
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

Deno.test('removeDockerObject warns, naming the object and the label, when removal fails', async () => {
    const warnings: string[] = []
    const removed = await removeDockerObject(
        ['rm', '-f', 'lockness-kit-smoke-web-1a2b3c4d'],
        () =>
            Promise.resolve({
                success: false,
                stderr: 'Error response from daemon: cannot remove: in use',
            }),
        (message) => warnings.push(message),
    )
    assertEquals(removed, false)
    assertEquals(warnings.length, 1)
    assert(warnings[0].includes('lockness-kit-smoke-web-1a2b3c4d'))
    assert(warnings[0].includes(DOCKER_LABEL))
    assert(warnings[0].includes('cannot remove: in use'))
})

Deno.test('removeDockerObject: success and "No such …" are removed, silently', async () => {
    const warnings: string[] = []
    const warn = (message: string) => warnings.push(message)
    for (
        const result of [
            { success: true, stderr: '' },
            { success: false, stderr: 'Error: No such container: x' },
            { success: false, stderr: 'Error: No such image: x:1' },
        ]
    ) {
        assert(
            await removeDockerObject(
                ['rm', '-f', 'x'],
                () => Promise.resolve(result),
                warn,
            ),
        )
    }
    assertEquals(warnings, [])
})

Deno.test('removeDockerObject swallows only a missing docker binary', async () => {
    const warn = () => {}
    assert(
        await removeDockerObject(
            ['rm', '-f', 'x'],
            () => Promise.reject(new Deno.errors.NotFound('docker')),
            warn,
        ),
    )
    await assertRejects(
        () =>
            removeDockerObject(
                ['rm', '-f', 'x'],
                () => Promise.reject(new Deno.errors.PermissionDenied('run')),
                warn,
            ),
        Deno.errors.PermissionDenied,
    )
    await assertRejects(
        () =>
            removeDockerObject(
                ['rm', '-f', 'x'],
                () => Promise.reject(new TypeError('bug')),
                warn,
            ),
        TypeError,
    )
})
