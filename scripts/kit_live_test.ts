/**
 * @fileoverview #450 — a live suite's cleanup releases everything it created
 * even when one step of it fails. A leaked database or temp directory poisons
 * the next run, and the run that most needs cleaning up is the failing one.
 *
 * @module
 */

import { assertEquals, assertRejects } from '@std/assert'
import { exists } from '@std/fs'
import { type AdminConnection, releaseDatabase } from './kit_live.ts'

/** An admin connection that records its calls and may fail the drop. */
function fakeAdmin(dropFails: boolean): AdminConnection & { calls: string[] } {
    const calls: string[] = []
    return {
        calls,
        unsafe(query: string): Promise<unknown> {
            calls.push(query)
            return dropFails
                ? Promise.reject(new Error('drop refused'))
                : Promise.resolve([])
        },
        end(): Promise<void> {
            calls.push('end')
            return Promise.resolve()
        },
    }
}

Deno.test('#450 releaseDatabase: drops, closes and removes the workdir', async () => {
    const admin = fakeAdmin(false)
    const workdir = await Deno.makeTempDir()
    await releaseDatabase(admin, 'lockness_kit_x', workdir)
    assertEquals(admin.calls, [
        'DROP DATABASE IF EXISTS "lockness_kit_x" WITH (FORCE)',
        'end',
    ])
    assertEquals(await exists(workdir), false)
})

Deno.test('#450 releaseDatabase: a failed drop still closes and removes, then throws', async () => {
    const admin = fakeAdmin(true)
    const workdir = await Deno.makeTempDir()
    await assertRejects(
        () => releaseDatabase(admin, 'lockness_kit_x', workdir),
        Error,
        'drop refused',
    )
    assertEquals(admin.calls.at(-1), 'end')
    assertEquals(await exists(workdir), false)
})

Deno.test('#450 releaseDatabase: the workdir is optional', async () => {
    const admin = fakeAdmin(false)
    await releaseDatabase(admin, 'lockness_kit_x')
    assertEquals(admin.calls.at(-1), 'end')
})
