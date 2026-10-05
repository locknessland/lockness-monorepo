/**
 * An app file that exists but cannot be loaded is reported, never skipped in
 * silence (#473).
 *
 * Core imports two kinds of app-local file at boot without the app naming
 * them: the custom error handler at `app/view/pages/errors/error_handler.tsx`,
 * and every module in `middlewaresDir`. Both used to sit behind bare `catch {}`
 * blocks, so a syntax error, a bad import or a wrong specifier made the app
 * lose its error pages or a named middleware with nothing in the log. An
 * *absent* file is expected and stays quiet; a *broken* one is a fault.
 *
 * Fixtures live under `<cwd>/tmp/`, because the handler path is resolved
 * against the working directory — the app root.
 */

import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertStringIncludes,
} from '@std/assert'
import { ErrorHandlerRegistry } from '../exceptions/handler.ts'
import { defaultErrorHandler } from '../exceptions/default_view.ts'
import { discoverMiddlewares } from '../http/resolver.ts'
import { declaredMiddlewares } from '../routing/decorators.ts'
import { App } from '../app.ts'
import { Controller, Get, UseMiddleware } from '../mod.ts'
import { Kernel } from '../kernel/kernel_decorators.ts'
import { createApp } from '../kernel/loader.ts'
import type { Context } from '../types.ts'

/** What one console method was called with, one entry per call. */
interface Captured {
    readonly error: string[]
    readonly warn: string[]
}

/**
 * Run `body` with `console.error` and `console.warn` captured instead of
 * printed, and restored whatever happens.
 */
async function captureConsole(
    body: () => Promise<void>,
): Promise<Captured> {
    const captured: Captured = { error: [], warn: [] }
    const original = { error: console.error, warn: console.warn }
    console.error = (...args: unknown[]) => {
        captured.error.push(args.map(String).join(' '))
    }
    console.warn = (...args: unknown[]) => {
        captured.warn.push(args.map(String).join(' '))
    }
    try {
        await body()
    } finally {
        console.error = original.error
        console.warn = original.warn
    }
    return captured
}

/**
 * Create a scratch directory under `<cwd>/tmp/`, hand its cwd-relative path
 * to `run`, and remove it afterwards.
 */
async function withAppDir(
    files: Record<string, string>,
    run: (relativeDir: string) => Promise<void>,
): Promise<void> {
    const rel = `tmp/app-file-failures-${crypto.randomUUID().slice(0, 8)}`
    const abs = `${Deno.cwd()}/${rel}`
    await Deno.mkdir(abs, { recursive: true })
    try {
        for (const [name, source] of Object.entries(files)) {
            await Deno.writeTextFile(`${abs}/${name}`, source)
        }
        await run(rel)
    } finally {
        await Deno.remove(abs, { recursive: true })
    }
}

/** Source of a module that fails at import: it does not parse. */
const BROKEN_SOURCE = 'export const errorHandler = (\n'

// ============================================================================
// ErrorHandlerRegistry.loadCustomHandler
// ============================================================================

Deno.test('ErrorHandlerRegistry - an absent handler file is silent and falls back', async () => {
    const registry = new ErrorHandlerRegistry()
    registry.setCustomHandlerPath(
        `tmp/absent-${crypto.randomUUID()}/error_handler.tsx`,
    )
    let handler: unknown
    const captured = await captureConsole(async () => {
        handler = await registry.discover()
    })
    assertEquals(handler, defaultErrorHandler)
    assertEquals(captured.error, [])
    assertEquals(captured.warn, [])
})

Deno.test('ErrorHandlerRegistry - a handler file that fails to import logs at ERROR and falls back', async () => {
    await withAppDir({ 'error_handler.tsx': BROKEN_SOURCE }, async (dir) => {
        const registry = new ErrorHandlerRegistry()
        registry.setCustomHandlerPath(`${dir}/error_handler.tsx`)
        let handler: unknown
        const captured = await captureConsole(async () => {
            handler = await registry.discover()
        })
        assertEquals(handler, defaultErrorHandler)
        assertEquals(captured.error.length, 1)
        assertStringIncludes(captured.error[0], `${dir}/error_handler.tsx`)
        // The reason, not just the fact: the error's name and message.
        assertStringIncludes(captured.error[0], 'SyntaxError')
        assertEquals(captured.warn, [])
    })
})

Deno.test('ErrorHandlerRegistry - a stat failure other than NotFound logs at WARN', async () => {
    // A path component that is a regular file makes stat fail with
    // NotADirectory, not NotFound — deterministic, unlike a permission error,
    // which root ignores.
    await withAppDir({ 'blocker': 'not a directory' }, async (dir) => {
        const registry = new ErrorHandlerRegistry()
        registry.setCustomHandlerPath(`${dir}/blocker/error_handler.tsx`)
        let handler: unknown
        const captured = await captureConsole(async () => {
            handler = await registry.discover()
        })
        assertEquals(handler, defaultErrorHandler)
        assertEquals(captured.warn.length, 1)
        assertStringIncludes(
            captured.warn[0],
            `${dir}/blocker/error_handler.tsx`,
        )
        assertEquals(captured.error, [])
    })
})

Deno.test('ErrorHandlerRegistry - a handler file without an errorHandler export warns', async () => {
    await withAppDir(
        { 'error_handler.tsx': 'export const somethingElse = 1\n' },
        async (dir) => {
            const registry = new ErrorHandlerRegistry()
            registry.setCustomHandlerPath(`${dir}/error_handler.tsx`)
            let handler: unknown
            const captured = await captureConsole(async () => {
                handler = await registry.discover()
            })
            assertEquals(handler, defaultErrorHandler)
            assertEquals(captured.warn.length, 1)
            assertStringIncludes(captured.warn[0], 'errorHandler')
            assertStringIncludes(captured.warn[0], `${dir}/error_handler.tsx`)
            assertEquals(captured.error, [])
        },
    )
})

Deno.test('ErrorHandlerRegistry - a valid handler file is used, with nothing logged', async () => {
    await withAppDir(
        {
            'error_handler.tsx':
                'export const errorHandler = () => new Response("custom")\n',
        },
        async (dir) => {
            const registry = new ErrorHandlerRegistry()
            registry.setCustomHandlerPath(`${dir}/error_handler.tsx`)
            let handler: unknown
            const original = console.log
            console.log = () => {}
            try {
                const captured = await captureConsole(async () => {
                    handler = await registry.discover()
                })
                assertEquals(captured.error, [])
                assertEquals(captured.warn, [])
            } finally {
                console.log = original
            }
            assertNotStrictEquals(handler, defaultErrorHandler)
            assert(typeof handler === 'function')
        },
    )
})

Deno.test('ErrorHandlerRegistry - the error log never carries a raw control character', async () => {
    // The path reaches the log through safeForLog: a newline in it must not
    // forge a second log line.
    await withAppDir({ 'error\nhandler.tsx': BROKEN_SOURCE }, async (dir) => {
        const registry = new ErrorHandlerRegistry()
        registry.setCustomHandlerPath(`${dir}/error\nhandler.tsx`)
        const captured = await captureConsole(async () => {
            await registry.discover()
        })
        assertEquals(captured.error.length, 1)
        assert(!captured.error[0].includes('\n'), captured.error[0])
    })
})

// ============================================================================
// discoverMiddlewares
// ============================================================================

/** A middleware module registering `name`, importing core by absolute URL. */
function middlewareSource(name: string, className: string): string {
    const decorators = import.meta.resolve('../routing/decorators.ts')
    return `
import { DeclareMiddleware } from '${decorators}'

@DeclareMiddleware('${name}')
export class ${className} {
    handle(_c: unknown, next: () => Promise<void>) {
        return next()
    }
}
`
}

Deno.test('discoverMiddlewares - a missing middlewaresDir is silent', async () => {
    let count = -1
    const captured = await captureConsole(async () => {
        count = await discoverMiddlewares(
            `tmp/absent-middleware-${crypto.randomUUID()}`,
        )
    })
    assertEquals(count, 0)
    assertEquals(captured.error, [])
    assertEquals(captured.warn, [])
})

Deno.test('discoverMiddlewares - a middlewaresDir that exists but cannot be read logs at WARN', async () => {
    // A regular file where the directory should be: readDir fails with
    // something other than NotFound, which is a misconfiguration.
    await withAppDir({ 'not_a_dir': 'plain file' }, async (dir) => {
        let count = -1
        const captured = await captureConsole(async () => {
            count = await discoverMiddlewares(`${dir}/not_a_dir`)
        })
        assertEquals(count, 0)
        assertEquals(captured.warn.length, 1)
        assertStringIncludes(captured.warn[0], `${dir}/not_a_dir`)
        assertEquals(captured.error, [])
    })
})

Deno.test('discoverMiddlewares - a file that fails to import logs at ERROR, and the others still register', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const good = `good-${suffix}`
    await withAppDir({
        'a_broken_middleware.ts': BROKEN_SOURCE,
        'b_good_middleware.ts': middlewareSource(good, 'GoodMiddleware'),
    }, async (dir) => {
        const captured = await captureConsole(async () => {
            await discoverMiddlewares(dir)
        })
        assert(declaredMiddlewares.has(good), 'the good middleware registered')
        assertEquals(captured.error.length, 1)
        assertStringIncludes(captured.error[0], 'a_broken_middleware.ts')
        assertStringIncludes(captured.error[0], 'SyntaxError')
    })
})

// ============================================================================
// Middleware discovery runs once per boot (#479)
// ============================================================================

Deno.test('createApp - a broken middleware file is imported and logged once per boot', async () => {
    // Each discovery run imports the broken file and logs it once, so the
    // number of log lines is the number of runs. A module-evaluation counter
    // could not observe this: the module cache evaluates a module once per
    // process however often it is imported.
    const suffix = crypto.randomUUID().slice(0, 8)
    const good = `boot-good-${suffix}`
    await withAppDir({
        'a_broken_middleware.ts': BROKEN_SOURCE,
        'b_good_middleware.ts': middlewareSource(good, 'BootGoodMiddleware'),
    }, async (dir) => {
        @Kernel({
            controllers: [],
            middlewaresDir: dir,
            shutdown: { signals: false },
        })
        class AppKernel {}

        const original = console.log
        console.log = () => {}
        let captured: Captured
        try {
            captured = await captureConsole(async () => {
                await createApp(AppKernel)
            })
        } finally {
            console.log = original
        }
        const broken = captured.error.filter((line) =>
            line.includes('a_broken_middleware.ts')
        )
        assertEquals(broken.length, 1, captured.error.join('\n'))
        assert(declaredMiddlewares.has(good), 'the good middleware registered')
    })
})

Deno.test('App.init - middlewaresDir registers a declared middleware a route can name, without a kernel', async () => {
    const name = `init-mw-${crypto.randomUUID().slice(0, 8)}`
    const decorators = import.meta.resolve('../routing/decorators.ts')
    await withAppDir({
        'stamp_middleware.ts': `
import { DeclareMiddleware } from '${decorators}'

@DeclareMiddleware('${name}')
export class StampMiddleware {
    async handle(
        c: { header(name: string, value: string): void },
        next: () => Promise<void>,
    ) {
        await next()
        c.header('x-stamp', '${name}')
    }
}
`,
    }, async (dir) => {
        @Controller('/stamped')
        class StampedController {
            @Get('/')
            @UseMiddleware(name)
            index(c: Context) {
                return c.text('ok')
            }
        }

        const app = new App()
        await app.init({
            middlewaresDir: dir,
            controllers: [StampedController],
        })

        assert(declaredMiddlewares.has(name), 'the middleware registered')
        const response = await app.fetch(
            new Request('http://localhost/stamped'),
        )
        assertEquals(await response.text(), 'ok')
        assertEquals(response.headers.get('x-stamp'), name)
    })
})
