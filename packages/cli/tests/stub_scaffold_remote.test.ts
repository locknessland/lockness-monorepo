/**
 * @fileoverview The remote branch of `Stub.scaffoldFrom` reports a file it
 * could not fetch to its caller — after writing every file it could — instead
 * of warning and skipping it (#436, FR-010). A caller such as
 * `jsr:@lockness/init` runs the scaffold as one `runSteps` step, so a project
 * missing files no longer ends in a green terminal.
 *
 * Served by a local `Deno.serve` on an ephemeral port, so no network is used.
 *
 * @module @lockness/cli/tests/stub_scaffold_remote
 */

import {
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { join } from '@std/path'
import { Stub } from '../stubs.ts'
import { CommandFailedError } from '../command_failure.ts'

/** Serve `files` (path → body); any other path answers 404. */
function serveStubs(
    files: Record<string, string>,
): { url: string; close: () => Promise<void> } {
    const server = Deno.serve(
        { port: 0, hostname: '127.0.0.1', onListen: () => {} },
        (request) => {
            const path = new URL(request.url).pathname.slice(1)
            const body = files[path]
            return body === undefined
                ? new Response('missing', { status: 404 })
                : new Response(body)
        },
    )
    return {
        url: `http://127.0.0.1:${server.addr.port}`,
        close: () => server.shutdown(),
    }
}

Deno.test('Stub.scaffoldFrom (remote) - writes every file and resolves when all fetch', async () => {
    const server = serveStubs({ 'a.ts.stub': 'name={{ projectName }}' })
    const target = await Deno.makeTempDir()
    try {
        await Stub.scaffoldFrom(server.url, target, { projectName: 'demo' }, [
            'a.ts.stub',
        ])
        assertEquals(
            await Deno.readTextFile(join(target, 'a.ts')),
            'name=demo',
        )
    } finally {
        await server.close()
        await Deno.remove(target, { recursive: true })
    }
})

Deno.test('Stub.scaffoldFrom (remote) - finishes the other files, then rejects naming the ones it could not fetch', async () => {
    const server = serveStubs({
        'a.ts.stub': 'a',
        'c.ts.stub': 'c',
    })
    const target = await Deno.makeTempDir()
    const warn: unknown[][] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => void warn.push(args)
    try {
        const error = await assertRejects(
            () =>
                Stub.scaffoldFrom(server.url, target, {}, [
                    'a.ts.stub',
                    'b.ts.stub',
                    'c.ts.stub',
                    'd.ts.stub',
                ]),
            Error,
        )
        // Every file that could be fetched was written, before and after the
        // failed ones.
        assertEquals(await Deno.readTextFile(join(target, 'a.ts')), 'a')
        assertEquals(await Deno.readTextFile(join(target, 'c.ts')), 'c')
        // One `runSteps` failure naming each failed file; the first failure
        // is the cause.
        assertInstanceOf(error, CommandFailedError)
        assertEquals(error.message, '2 of 4 steps failed: b.ts.stub, d.ts.stub')
        assertInstanceOf(error.cause, Error)
        assertStringIncludes(error.cause.message, '404')
        // Reported once, by the throw — no warning on the side.
        assertEquals(warn, [])
    } finally {
        console.warn = original
        await server.close()
        await Deno.remove(target, { recursive: true })
    }
})
