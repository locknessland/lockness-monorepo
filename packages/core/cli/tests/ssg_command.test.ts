/**
 * The `ssg:build` command orchestration (#54) — kernel discovery, the FR-013
 * secret-free warning, the enumerate→render→write pipeline, and the
 * empty-targets notice.
 *
 * Exercises the exported testable units (`findKernel`, `loadKernel`,
 * `buildStaticSite`) against a real `App`, so the orchestrator is witnessed
 * without the CLI runtime. Also pins FR-012's instantiation half: a controller
 * whose constructor throws aborts the boot (which the command relies on).
 *
 * @module @lockness/core/cli/tests/ssg_command
 */

import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { join, resolve } from '@std/path'
import {
    App,
    type Context,
    Controller,
    Get,
    Kernel,
    Static,
} from '../../mod.ts'
import {
    buildStaticSite,
    findKernel,
    loadKernel,
    SSG_SECRET_WARNING,
    type SsgApp,
} from '../ssg_command.ts'

/** Run `fn` with `console.warn` captured; returns everything it emitted. */
async function captureWarn(fn: () => Promise<void>): Promise<string> {
    const original = console.warn
    let out = ''
    console.warn = (...args: unknown[]) => {
        out += args.map(String).join(' ') + '\n'
    }
    try {
        await fn()
    } finally {
        console.warn = original
    }
    return out
}

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

@Controller('/plain')
class PlainController {
    @Get('/')
    index(c: Context) {
        return c.text('plain')
    }
}

// --- findKernel / loadKernel ------------------------------------------------

Deno.test('findKernel - finds the @Kernel-decorated class in a module', () => {
    @Kernel({ controllersDir: './app/controller' })
    class AppKernel {}

    assertEquals(findKernel({ AppKernel, other: {} })?.KernelClass, AppKernel)
})

Deno.test('findKernel - returns undefined when no class is decorated', () => {
    assertEquals(findKernel({ x: {}, y: class {} }), undefined)
})

Deno.test('loadKernel - returns undefined when no kernel file exists', async () => {
    const empty = await Deno.makeTempDir()
    try {
        assertEquals(await loadKernel(empty), undefined)
    } finally {
        await Deno.remove(empty, { recursive: true })
    }
})

// --- buildStaticSite --------------------------------------------------------

Deno.test('buildStaticSite - warns (FR-013), renders the @Static page, reports it', async () => {
    const dist = await Deno.makeTempDir()
    try {
        const app = new App()
        await app.init({ controllers: [HomeController] })

        let outcome!: Awaited<ReturnType<typeof buildStaticSite>>
        const warned = await captureWarn(async () => {
            outcome = await buildStaticSite(
                app as unknown as SsgApp,
                [HomeController as never],
                {},
                resolve(dist),
            )
        })

        // FR-013 warning fired.
        assertStringIncludes(warned, SSG_SECRET_WARNING)
        // The @Static page was rendered and written; the report carries the path.
        assertEquals(outcome.empty, false)
        assertEquals(outcome.result.written.length, 1)
        assertEquals(
            outcome.result.written[0].outputPath,
            join(resolve(dist), 'index.html'),
        )
        assertEquals(
            await Deno.readTextFile(join(dist, 'index.html')),
            '<h1>HOME</h1>',
        )
    } finally {
        await Deno.remove(dist, { recursive: true })
    }
})

Deno.test('buildStaticSite - a controller with no @Static yields empty (nothing to render), still warns', async () => {
    const dist = await Deno.makeTempDir()
    try {
        const app = new App()
        await app.init({ controllers: [PlainController] })

        let outcome!: Awaited<ReturnType<typeof buildStaticSite>>
        const warned = await captureWarn(async () => {
            outcome = await buildStaticSite(
                app as unknown as SsgApp,
                [PlainController as never],
                {},
                resolve(dist),
            )
        })

        assertStringIncludes(warned, SSG_SECRET_WARNING)
        assertEquals(outcome.empty, true)
        assertEquals(outcome.result.written.length, 0)
    } finally {
        await Deno.remove(dist, { recursive: true })
    }
})

// --- FR-012 instantiation half ----------------------------------------------

Deno.test('boot aborts when a controller constructor throws (FR-012/SC-008)', async () => {
    @Controller('/boom')
    class BoomController {
        constructor() {
            throw new Error('constructor exploded')
        }
        @Get('/')
        @Static()
        index(c: Context) {
            return c.text('never')
        }
    }

    const app = new App()
    await assertRejects(
        () => app.init({ controllers: [BoomController] }),
        Error,
    )
})
