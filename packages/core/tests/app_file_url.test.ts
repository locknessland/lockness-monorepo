/**
 * App-local files are imported through a `file:` URL built by `toFileUrl`,
 * whatever URL core itself was loaded from (#474).
 *
 * Three ways of naming an app file broke for a published consumer, and none of
 * them can fail inside this monorepo, where core is loaded from disk:
 *
 * - **A bare absolute path** (`import('/app/x.ts')`) resolves against the
 *   *referrer*. From JSR the referrer is an `https:` module, so the import
 *   becomes a request to the registry for the app's path — the custom error
 *   handler never loaded from a published core.
 * - **`` import(`file://${path}`) ``** is rewritten by `deno publish`. It
 *   treats the template's static prefix as a local path and unfurls it into
 *   `` import(`../../../../../../../../../../../${path}`) ``, which from the
 *   registry resolves to `<registry>//<abs path>`. That is the request the
 *   #470 kit boot gate saw for the slim kit's middleware.
 * - **`` `file://${path}` `` as a string** survives publishing, but a `#` in
 *   the path starts a fragment and a `?` a query, so the file is silently
 *   truncated to a different one.
 *
 * The tests below pin each one: the helper against a module served over HTTP,
 * every discovery site against a path containing `#` and a space, and the
 * source tree against the two shapes `deno publish` rewrites.
 */

import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertStringIncludes,
} from '@std/assert'
import { fromFileUrl, join, resolve, toFileUrl } from '@std/path'
import { appFileUrl } from '../app_file_url.ts'
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
// appFileUrl
// ============================================================================

Deno.test('appFileUrl - builds a file: URL anchored at the app root', () => {
    const root = resolve('/srv/my-app')
    const url = new URL(appFileUrl('app/middleware/auth.ts', root))
    assertEquals(url.protocol, 'file:')
    assertEquals(
        fromFileUrl(url),
        join(root, 'app', 'middleware', 'auth.ts'),
    )
})

Deno.test('appFileUrl - keeps an absolute path, and normalises ./', () => {
    const root = resolve('/srv/my-app')
    const elsewhere = resolve('/opt/shared/x.ts')
    assertEquals(fromFileUrl(appFileUrl(elsewhere, root)), elsewhere)
    assertEquals(
        fromFileUrl(appFileUrl('./app/x.ts', root)),
        join(root, 'app', 'x.ts'),
    )
})

Deno.test("appFileUrl - escapes '#', '?' and a space instead of truncating", () => {
    const root = resolve('/srv/my app#1')
    const url = new URL(appFileUrl('app/odd?name.ts', root))
    assertEquals(url.hash, '')
    assertEquals(url.search, '')
    assertEquals(fromFileUrl(url), join(root, 'app', 'odd?name.ts'))
})

Deno.test('appFileUrl - defaults the root to the working directory', () => {
    assertEquals(
        appFileUrl('app/kernel.ts'),
        toFileUrl(join(Deno.cwd(), 'app', 'kernel.ts')).href,
    )
})

// ============================================================================
// From a referrer that is not a file: URL
// ============================================================================

Deno.test('appFileUrl - loads an app file from a module served over HTTP, where a bare path reaches the server', async () => {
    // The referrer is what decides how a specifier resolves. Core is a file:
    // module in this repository and an https: one for every consumer, so the
    // only honest test serves the importing module over HTTP. The child gets a
    // fresh DENO_DIR and no config: nothing it resolves comes from this repo.
    const requests: string[] = []
    const server = Deno.serve(
        { hostname: '127.0.0.1', port: 0, onListen() {} },
        (request) => {
            const path = decodeURIComponent(new URL(request.url).pathname)
            requests.push(path)
            if (path !== '/loader.ts') {
                return new Response('not served', { status: 404 })
            }
            return new Response(
                'export function load(specifier: string) { return import(specifier) }\n',
                { headers: { 'content-type': 'application/typescript' } },
            )
        },
    )
    const denoDir = await Deno.makeTempDir()
    try {
        await withAwkwardDir({
            'good.ts': 'export const loaded = "good"\n',
            'plain/bare.ts': 'export const loaded = "bare"\n',
        }, async ({ abs }) => {
            const loader = `http://127.0.0.1:${server.addr.port}/loader.ts`
            const good = appFileUrl(join(abs, 'good.ts'))
            // No '#' or space here, so the contrast is about the specifier
            // form alone.
            const plainDir = await Deno.makeTempDir()
            const bare = join(plainDir, 'bare.ts')
            await Deno.copyFile(join(abs, 'plain', 'bare.ts'), bare)
            try {
                const code = `
const { load } = await import(${JSON.stringify(loader)})
const out = {}
for (const [name, spec] of Object.entries(${JSON.stringify({ good, bare })})) {
    try { out[name] = (await load(spec)).loaded }
    catch (e) { out[name] = 'FAILED: ' + String(e).split('\\n')[0] }
}
console.log(JSON.stringify(out))
`
                const result = await new Deno.Command(Deno.execPath(), {
                    args: ['eval', '--no-config', code],
                    env: { DENO_DIR: denoDir, NO_COLOR: '1' },
                    stdout: 'piped',
                    stderr: 'piped',
                }).output()
                const stdout = new TextDecoder().decode(result.stdout).trim()
                const stderr = new TextDecoder().decode(result.stderr)
                assert(result.success, stderr)
                const out = JSON.parse(stdout) as Record<string, string>

                assertEquals(out.good, 'good')
                assertStringIncludes(out.bare, 'FAILED')
                // The file: URL never touched the server; the bare path did,
                // asking it for the app's own absolute path.
                assertEquals(requests, ['/loader.ts', bare])
            } finally {
                await Deno.remove(plainDir, { recursive: true })
            }
        })
    } finally {
        await server.shutdown()
        await Deno.remove(denoDir, { recursive: true })
    }
})

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
    assertEquals(offences, [], 'use appFileUrl() from app_file_url.ts')
})
