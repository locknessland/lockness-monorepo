/**
 * Path-traversal containment tests for the real LocalStorageDriver (H2, #166).
 *
 * The rest of the local suite exercises the in-memory mock; these tests
 * instantiate the actual filesystem driver against a temp root and prove that
 * a user-influenced path cannot escape that root on any operation.
 *
 * @module @lockness/storage/tests/local_path_traversal
 */

import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { LocalStorageDriver } from '../mod.ts'

/**
 * Run `fn` with a fresh LocalStorageDriver rooted at `<base>/root`. Anything a
 * traversal manages to write lands under `base`, which is removed wholesale.
 */
async function withDriver(
    fn: (
        driver: LocalStorageDriver,
        root: string,
        base: string,
    ) => Promise<void>,
): Promise<void> {
    const base = await Deno.makeTempDir({ prefix: 'lockness-storage-' })
    const root = join(base, 'root')
    await Deno.mkdir(root)
    try {
        await fn(new LocalStorageDriver({ driver: 'local', root }), root, base)
    } finally {
        await Deno.remove(base, { recursive: true })
    }
}

Deno.test('LocalStorageDriver - rejects reading through parent traversal (#166)', async () => {
    await withDriver(async (driver, _root, base) => {
        await Deno.writeTextFile(join(base, 'secret.txt'), 'topsecret')
        await assertRejects(() => driver.get('../secret.txt'), Error)
        await assertRejects(() => driver.getBytes('../../secret.txt'), Error)
    })
})

Deno.test('LocalStorageDriver - rejects writing/deleting through parent traversal (#166)', async () => {
    await withDriver(async (driver, _root, base) => {
        await assertRejects(() => driver.put('../escape.txt', 'x'), Error)
        await assertRejects(
            () => Deno.stat(join(base, 'escape.txt')),
            Deno.errors.NotFound,
        )
        await assertRejects(() => driver.delete('../../secret.txt'), Error)
    })
})

Deno.test('LocalStorageDriver - rejects traversal in copy/move destination or source (#166)', async () => {
    await withDriver(async (driver) => {
        await driver.put('safe.txt', 'ok')
        await assertRejects(
            () => driver.copy('safe.txt', '../escape.txt'),
            Error,
        )
        await assertRejects(
            () => driver.move('../../secret.txt', 'safe2.txt'),
            Error,
        )
    })
})

Deno.test('LocalStorageDriver - allows and round-trips a path that normalises inside root (#166)', async () => {
    await withDriver(async (driver) => {
        // `nested/a/../b.txt` resolves to `nested/b.txt` — still inside root, so
        // the guard must NOT reject legitimate `..` that stays contained.
        await driver.put('nested/a/../b.txt', 'inside')
        assertEquals(await driver.get('nested/b.txt'), 'inside')
    })
})
