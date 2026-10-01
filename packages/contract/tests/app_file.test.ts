/**
 * App files are imported through `importAppFile`, whatever URL the importing
 * package itself was loaded from (#474, #477).
 *
 * Three ways of naming an app file broke for a published consumer, and none of
 * them can fail inside this monorepo, where every package is loaded from disk:
 *
 * - **A bare absolute path** (`import('/app/x.ts')`) resolves against the
 *   *referrer*. From JSR the referrer is an `https:` module, so the import
 *   becomes a request to the registry for the app's path.
 * - **`` import(`file://${path}`) ``** is rewritten by `deno publish`. It
 *   treats the template's static prefix as a local path and unfurls it into a
 *   relative one, which from the registry resolves to `<registry>//<abs path>`.
 * - **`` `file://${path}` `` as a string** survives publishing, but a `#` in
 *   the path starts a fragment and a `?` a query, so the file is silently
 *   truncated to a different one.
 *
 * The tests below pin the URL the helper builds, that it loads from a module
 * served over HTTP, and that it loads from a path holding `#` and a space —
 * and that it swallows nothing.
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { fromFileUrl, join, resolve, toFileUrl } from '@std/path'
import { appFileUrl, importAppFile } from '../app_file.ts'

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
    const base = `tmp/app-file-${crypto.randomUUID().slice(0, 8)}`
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
// importAppFile
// ============================================================================

Deno.test("importAppFile - loads a file under a path with '#' and a space", async () => {
    await withAwkwardDir({
        'job.ts': 'export const loaded = "awkward"\n',
    }, async ({ rel, abs }) => {
        const relative = await importAppFile(`${rel}/job.ts`)
        assertEquals(relative.loaded, 'awkward')
        const absolute = await importAppFile(join(abs, 'job.ts'))
        assertEquals(absolute.loaded, 'awkward')
    })
})

Deno.test('importAppFile - anchors a relative path at the root it is given', async () => {
    await withAwkwardDir({
        'app/kernel.ts': 'export const loaded = "kernel"\n',
    }, async ({ abs }) => {
        const module = await importAppFile('app/kernel.ts', abs)
        assertEquals(module.loaded, 'kernel')
    })
})

Deno.test('importAppFile - rejects for a file that does not exist', async () => {
    await withAwkwardDir({}, async ({ abs }) => {
        await assertRejects(() => importAppFile(join(abs, 'missing.ts')))
    })
})

Deno.test('importAppFile - rejects for a file that throws while it evaluates', async () => {
    await withAwkwardDir({
        'broken.ts': 'throw new Error("broken at load")\nexport {}\n',
    }, async ({ abs }) => {
        const error = await assertRejects(() =>
            importAppFile(join(abs, 'broken.ts'))
        )
        assertStringIncludes(String(error), 'broken at load')
    })
})

// ============================================================================
// From a referrer that is not a file: URL
// ============================================================================

Deno.test('appFileUrl - loads an app file from a module served over HTTP, where a bare path reaches the server', async () => {
    // The referrer is what decides how a specifier resolves. Every package is
    // a file: module in this repository and an https: one for every consumer,
    // so the only honest test serves the importing module over HTTP. The child
    // gets a fresh DENO_DIR and no config: nothing it resolves comes from this
    // repo.
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
