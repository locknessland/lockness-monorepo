/**
 * End-to-end SSG (#54, US1) — a real `App`, `@Static` opt-in, enumerate → render
 * → write, against a temp `dist/`.
 *
 * Proves the pipeline the command wires: a booted app's `getRoutes()` + the
 * `@Static` metadata enumerate to the right targets, `App.fetch` renders them,
 * and only the `@Static` route is written — the dynamic route produces no file
 * (SC-002/SC-003).
 *
 * @module @lockness/core/ssg/tests/build_integration
 */

import { assertEquals } from '@std/assert'
import { join, resolve } from '@std/path'
import { App, type Context, Controller, Get, Static } from '../../mod.ts'
import { enumerateStaticTargets } from '../enumerate.ts'
import { runSsgBuild } from '../build.ts'
import type { StaticControllerRef } from '../enumerate.ts'

@Controller('/')
class HomeController {
    @Get('/')
    @Static()
    index(c: Context) {
        return c.html('<h1>HOME</h1>')
    }

    @Get('/dyn')
    dyn(c: Context) {
        return c.text('DYN')
    }
}

Deno.test('SSG end-to-end - only the @Static route is rendered and written', async () => {
    const dist = await Deno.makeTempDir()
    try {
        const app = new App()
        await app.init({ controllers: [HomeController] })

        const distRoot = resolve(dist)
        const targets = enumerateStaticTargets(
            app.getRoutes(),
            [HomeController as unknown as StaticControllerRef],
            { distRoot },
        )

        // Only the @Static '/' route is a target; '/dyn' is not.
        assertEquals(targets.map((t) => t.url), ['/'])

        const result = await runSsgBuild(app, targets)
        assertEquals(result.written.length, 1)

        // The static page was written and renders the handler's HTML.
        assertEquals(
            await Deno.readTextFile(join(distRoot, 'index.html')),
            '<h1>HOME</h1>',
        )

        // The dynamic route produced no file (SC-003).
        assertEquals(await exists(join(distRoot, 'dyn', 'index.html')), false)

        // The dynamic route still serves at runtime.
        const res = await app.fetch(new Request('http://localhost/dyn'))
        assertEquals(await res.text(), 'DYN')
    } finally {
        await Deno.remove(dist, { recursive: true })
    }
})

/** Local exists helper (avoids adding an @std/fs dependency to core). */
async function exists(path: string): Promise<boolean> {
    try {
        await Deno.stat(path)
        return true
    } catch {
        return false
    }
}
