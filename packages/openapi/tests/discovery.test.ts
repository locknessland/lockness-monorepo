/**
 * `loadDocumentedControllers` imports the app's controllers through
 * `importAppFile` (#477), for `docs:generate` and for the scaffolded docs
 * controller (#483).
 *
 * Both built `` import(`file://${Deno.cwd()}/${path}`) ``, a template literal
 * `deno publish` rewrites into a relative path — from JSR, a request to the
 * registry for the app's own path. That half cannot fail here, where openapi
 * loads from disk; `kits:smoke --registry` covers the registry. These tests pin
 * the other half: the scan imports from a directory whose path holds a `#` and
 * a space, and a controller that fails to load is named.
 *
 * @module @lockness/openapi/tests/discovery
 */

import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
    assertStringIncludes,
} from '@std/assert'
import { join } from '@std/path'
import { loadDocumentedControllers } from '../discovery.ts'
import * as openapi from '../mod.ts'

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
    const base = `tmp/openapi-app-file-${crypto.randomUUID().slice(0, 8)}`
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

Deno.test("loadDocumentedControllers - imports a controller under a path with '#' and a space", async () => {
    await withAwkwardDir({
        'awkward_controller.ts':
            "export class AwkwardController { static _basePath = '/awkward' }\n",
        'notes.ts': 'export class NotAController {}\n',
    }, async ({ rel }) => {
        const controllers = await loadDocumentedControllers(rel)
        assertEquals(controllers.map((c) => c.name), ['AwkwardController'])
    })
})

Deno.test('loadDocumentedControllers - names a controller file that fails to load', async () => {
    await withAwkwardDir({
        'broken_controller.ts':
            'throw new Error("broken at load")\nexport {}\n',
    }, async ({ abs }) => {
        const error = await assertRejects(() => loadDocumentedControllers(abs))
        assertStringIncludes(String(error), 'broken_controller.ts')
    })
})

Deno.test('loadDocumentedControllers - is exported from the package root, for the scaffolded docs controller', () => {
    assertStrictEquals(
        (openapi as Record<string, unknown>).loadDocumentedControllers,
        loadDocumentedControllers,
    )
})
