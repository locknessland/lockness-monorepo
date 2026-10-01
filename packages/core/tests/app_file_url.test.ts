/**
 * Every core site that imports an app file loads it from a path holding `#`
 * and a space (#474).
 *
 * The sites import through `importAppFile` from `@lockness/contract`, whose own
 * suite pins the URL it builds and that it loads from a module served over
 * HTTP (`packages/contract/tests/app_file.test.ts`). These tests pin that each
 * site really goes through it: a hand-built `` `file://${path}` `` makes the
 * `#` a fragment and silently loads a different, truncated path. The source
 * scan at the end guards the two shapes `deno publish` rewrites.
 */

import { assert, assertEquals, assertNotStrictEquals } from '@std/assert'
import { fromFileUrl, join } from '@std/path'
import { ErrorHandlerRegistry } from '../exceptions/handler.ts'
import { defaultErrorHandler } from '../exceptions/default_view.ts'
import { discoverMiddlewares } from '../http/resolver.ts'
import { declaredMiddlewares } from '../routing/decorators.ts'
import { ControllerDiscovery } from '../routing/discovery.ts'
import { discoverListeners } from '../events/listener_discovery.ts'
import { loadControllers } from '../ssg/enumerate.ts'
import { loadKernel } from '../cli/ssg_command.ts'

/** A directory name holding both characters `file://${…}` mis-parses. */
const AWKWARD = 'app#dir with space'

/**
 * Create `<cwd>/tmp/<unique>/<AWKWARD>/` with `files` in it, hand its
 * cwd-relative and absolute paths to `run`, and remove it afterwards.
 */
async function withAwkwardDir(
    files: Record<string, string>,
    run: (dir: { rel: string; abs: string }) => Promise<void>,
): Promise<void> {
    const base = `tmp/app-file-url-${crypto.randomUUID().slice(0, 8)}`
    const rel = `${base}/${AWKWARD}`
    const abs = join(Deno.cwd(), rel)
    await Deno.mkdir(abs, { recursive: true })
    try {
        for (const [name, source] of Object.entries(files)) {
            await Deno.mkdir(join(abs, name, '..'), { recursive: true })
            await Deno.writeTextFile(join(abs, name), source)
        }
        await run({ rel, abs })
    } finally {
        await Deno.remove(join(Deno.cwd(), base), { recursive: true })
    }
}

/** A module that records, on `globalThis`, that it was evaluated. */
function markerSource(key: string): string {
    return `(globalThis as Record<string, unknown>)[${
        JSON.stringify(key)
    }] = true\nexport {}\n`
}

/** Whether the marker module for `key` was evaluated. */
function marked(key: string): boolean {
    return (globalThis as Record<string, unknown>)[key] === true
}

/** Run `body` with console output dropped, restored whatever happens. */
async function quietly<T>(body: () => Promise<T>): Promise<T> {
    const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    }
    console.log = console.warn = console.error = () => {}
    try {
        return await body()
    } finally {
        Object.assign(console, original)
    }
}

// ============================================================================
// Every site that imports an app file, from a path with '#' and a space
// ============================================================================

Deno.test("ErrorHandlerRegistry - loads a custom handler under a path with '#' and a space", async () => {
    await withAwkwardDir({
        'error_handler.tsx':
            'export const errorHandler = () => new Response("custom")\n',
    }, async ({ rel }) => {
        const registry = new ErrorHandlerRegistry()
        registry.setCustomHandlerPath(`${rel}/error_handler.tsx`)
        const handler = await quietly(() => registry.discover())
        assertNotStrictEquals(handler, defaultErrorHandler)
    })
})

Deno.test('ErrorHandlerRegistry - loads a custom handler given an absolute path', async () => {
    await withAwkwardDir({
        'error_handler.tsx':
            'export const errorHandler = () => new Response("custom")\n',
    }, async ({ abs }) => {
        const registry = new ErrorHandlerRegistry()
        registry.setCustomHandlerPath(join(abs, 'error_handler.tsx'))
        const handler = await quietly(() => registry.discover())
        assertNotStrictEquals(handler, defaultErrorHandler)
    })
})

Deno.test("discoverMiddlewares - registers a middleware under a path with '#' and a space", async () => {
    const name = `awkward-${crypto.randomUUID().slice(0, 8)}`
    const decorators = import.meta.resolve('../routing/decorators.ts')
    await withAwkwardDir({
        'awkward_middleware.ts': `
import { DeclareMiddleware } from '${decorators}'

@DeclareMiddleware('${name}')
export class AwkwardMiddleware {
    handle(_c: unknown, next: () => Promise<void>) {
        return next()
    }
}
`,
    }, async ({ rel }) => {
        await quietly(() => discoverMiddlewares(rel))
        assert(declaredMiddlewares.has(name), 'the middleware registered')
    })
})

Deno.test("ControllerDiscovery - imports a controller under a path with '#' and a space", async () => {
    const key = `__lockness_474_controller_${crypto.randomUUID()}`
    await withAwkwardDir({
        'awkward_controller.ts': `${
            markerSource(key)
        }export class AwkwardController { static _basePath = '/awkward' }\n`,
    }, async ({ rel }) => {
        const found = await quietly(() =>
            new ControllerDiscovery().discover(rel)
        )
        assert(marked(key), 'the controller file was imported')
        assertEquals(found.length, 1)
    })
})

Deno.test("discoverListeners - imports a listener under a path with '#' and a space", async () => {
    const key = `__lockness_474_listener_${crypto.randomUUID()}`
    await withAwkwardDir({ 'awkward_listener.ts': markerSource(key) }, async (
        { rel },
    ) => {
        await quietly(() => discoverListeners(rel))
        assert(marked(key), 'the listener file was imported')
    })
})

Deno.test("loadControllers (ssg) - imports a controller under a path with '#' and a space", async () => {
    await withAwkwardDir({
        'awkward_controller.ts':
            "export class AwkwardController { static _basePath = '/awkward' }\n",
    }, async ({ abs }) => {
        const found = await loadControllers(abs)
        assertEquals(found.length, 1)
    })
})

Deno.test("loadKernel (ssg) - imports the kernel under a path with '#' and a space", async () => {
    const decorators = import.meta.resolve('../kernel/kernel_decorators.ts')
    await withAwkwardDir({
        'app/kernel.ts': `
import { KERNEL_CONFIG } from '${decorators}'
export class AppKernel { static [KERNEL_CONFIG] = { staticDir: 'public' } }
`,
    }, async ({ abs }) => {
        const kernel = await loadKernel(abs)
        assertEquals(kernel?.config.staticDir, 'public')
    })
})

// ============================================================================
// The source shapes `deno publish` rewrites, or `#` truncates
// ============================================================================

Deno.test('core source - builds no app file specifier by hand', async () => {
    // A guard on the text, because the failure it prevents cannot be seen at
    // runtime here: `deno publish` rewrites an `import()` whose argument is a
    // template literal with a path-like prefix, and only a consumer loading
    // the published module meets the result. `file://` concatenation is the
    // `#`/`?` truncation. Comment lines are skipped: they describe the hazard.
    const coreRoot = fromFileUrl(new URL('..', import.meta.url))
    const forbidden: ReadonlyArray<readonly [RegExp, string]> = [
        [/import\(\s*`/, 'import() with a template literal'],
        [/file:\/\/\$\{/, '`file://${…}` string building'],
        [/['"`]file:\/\/['"`]\s*\+/, "'file://' + … string building"],
    ]
    const offences: string[] = []

    async function scan(dir: string): Promise<void> {
        for await (const entry of Deno.readDir(dir)) {
            const path = join(dir, entry.name)
            if (entry.isDirectory) {
                if (entry.name !== 'tests' && entry.name !== 'docs') {
                    await scan(path)
                }
                continue
            }
            if (!/\.(ts|tsx|js)$/.test(entry.name)) continue
            if (entry.name.endsWith('.test.ts')) continue
            const lines = (await Deno.readTextFile(path)).split('\n')
            lines.forEach((line, index) => {
                const code = line.trim()
                if (code.startsWith('//') || code.startsWith('*')) return
                for (const [pattern, label] of forbidden) {
                    if (pattern.test(code)) {
                        offences.push(
                            `${path.slice(coreRoot.length)}:${
                                index + 1
                            }: ${label}`,
                        )
                    }
                }
            })
        }
    }

    await scan(coreRoot)
    assertEquals(offences, [], 'use importAppFile() from @lockness/contract')
})
