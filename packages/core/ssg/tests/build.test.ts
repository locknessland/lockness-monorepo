/**
 * `runSsgBuild` — the render/emit loop for static-site generation (#54).
 *
 * Drives each {@link RenderTarget} through `App.fetch`, writes the body to its
 * output path, and reports per file (SC-006). It fails **loudly**: a target
 * whose render is not 2xx aborts the whole build naming the route (FR-009/SC-005),
 * and two targets on the same output path abort with a collision error (FR-011).
 * The loop is exercised with a stub app so it is isolated from controller wiring;
 * the end-to-end path is covered by the integration test.
 *
 * @module @lockness/core/ssg/tests/build
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { runSsgBuild } from '../build.ts'
import type { RenderTarget } from '../enumerate.ts'

/** A stub app: maps a URL path to a canned Response. */
function stubApp(map: Record<string, Response>) {
    return {
        fetch(request: Request): Response {
            const { pathname } = new URL(request.url)
            return map[pathname] ?? new Response('not found', { status: 404 })
        },
    }
}

const target = (url: string, outputPath: string): RenderTarget => ({
    url,
    outputPath,
    controller: 'C',
    action: 'a',
})

Deno.test('runSsgBuild - writes each target and reports it', async () => {
    const dist = await Deno.makeTempDir()
    try {
        const app = stubApp({
            '/': new Response('<h1>home</h1>'),
            '/docs': new Response('<h1>docs</h1>'),
        })
        const targets = [
            target('/', join(dist, 'index.html')),
            target('/docs', join(dist, 'docs', 'index.html')),
        ]
        const result = await runSsgBuild(app, targets)

        assertEquals(result.written.length, 2)
        assertEquals(
            await Deno.readTextFile(join(dist, 'index.html')),
            '<h1>home</h1>',
        )
        assertEquals(
            await Deno.readTextFile(join(dist, 'docs', 'index.html')),
            '<h1>docs</h1>',
        )
        // The report carries the url, output path, and bytes (SC-006).
        const docs = result.written.find((e) => e.url === '/docs')!
        assertEquals(docs.outputPath, join(dist, 'docs', 'index.html'))
        assert(docs.bytes > 0)
    } finally {
        await Deno.remove(dist, { recursive: true })
    }
})

Deno.test('runSsgBuild - aborts naming the route when a render is not 2xx (FR-009/SC-005)', async () => {
    const dist = await Deno.makeTempDir()
    try {
        const app = stubApp({
            '/': new Response('ok'),
            '/broken': new Response('boom', { status: 500 }),
        })
        const targets = [
            target('/', join(dist, 'index.html')),
            target('/broken', join(dist, 'broken', 'index.html')),
        ]
        await assertRejects(
            () => runSsgBuild(app, targets),
            Error,
            '/broken',
        )
    } finally {
        await Deno.remove(dist, { recursive: true })
    }
})

Deno.test('runSsgBuild - aborts naming the route when fetch throws (FR-009/SC-005)', async () => {
    const dist = await Deno.makeTempDir()
    try {
        const app = {
            fetch(_request: Request): Response {
                throw new Error('handler exploded')
            },
        }
        const targets = [target('/boom', join(dist, 'boom', 'index.html'))]
        await assertRejects(
            () => runSsgBuild(app, targets),
            Error,
            '/boom',
        )
    } finally {
        await Deno.remove(dist, { recursive: true })
    }
})

Deno.test('runSsgBuild - aborts on an output-path collision (FR-011)', async () => {
    const dist = await Deno.makeTempDir()
    try {
        const app = stubApp({
            '/a': new Response('a'),
            '/b': new Response('b'),
        })
        const collide = join(dist, 'same', 'index.html')
        const targets = [target('/a', collide), target('/b', collide)]
        await assertRejects(
            () => runSsgBuild(app, targets),
            Error,
            'collision',
        )
    } finally {
        await Deno.remove(dist, { recursive: true })
    }
})

Deno.test('runSsgBuild - an empty target list writes nothing', async () => {
    const dist = await Deno.makeTempDir()
    try {
        const result = await runSsgBuild(stubApp({}), [])
        assertEquals(result.written.length, 0)
    } finally {
        await Deno.remove(dist, { recursive: true })
    }
})
