/**
 * The real LocalStorageDriver's `publicUrl` without a configured public URL:
 * a `file:` URL of the stored file (#477).
 *
 * It was built as `` `file://${path}` ``, so a `#` in the storage root or the
 * file name became a fragment, a `?` a query, and a space was left unescaped —
 * the URL named a different, truncated file.
 */

import { assertEquals } from '@std/assert'
import { fromFileUrl, join } from '@std/path'
import { LocalStorageDriver } from '../mod.ts'

Deno.test("LocalStorageDriver - publicUrl escapes '#', '?' and a space in a file: URL", async () => {
    const base = await Deno.makeTempDir()
    try {
        const root = join(base, 'app#dir with space')
        const driver = new LocalStorageDriver({ driver: 'local', root })
        const url = new URL(driver.publicUrl('odd?name #1.txt'))
        assertEquals(url.protocol, 'file:')
        assertEquals(url.hash, '')
        assertEquals(url.search, '')
        assertEquals(fromFileUrl(url), join(root, 'odd?name #1.txt'))
    } finally {
        await Deno.remove(base, { recursive: true })
    }
})

Deno.test('LocalStorageDriver - publicUrl uses the configured public URL when there is one', () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: '/srv/storage',
        publicUrl: 'https://cdn.example.test',
    })
    assertEquals(
        driver.publicUrl('a.txt'),
        'https://cdn.example.test/a.txt',
    )
})
