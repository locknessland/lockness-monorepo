/**
 * @fileoverview Child-process tracking behind `kits:smoke`'s signal cleanup
 * (#470 review): once aborted, nothing new may be spawned, and every live
 * child is killed. Each test owns its own {@link ChildTracker}, so the
 * module's shared one is never touched.
 *
 * @module
 */

import { assert, assertEquals, assertMatch } from '@std/assert'
import { boots, ChildTracker } from './kit_smoke.ts'

/** A child that would live for a minute unless killed. */
function sleeper(): Deno.Command {
    return new Deno.Command(Deno.execPath(), {
        args: ['eval', 'await new Promise((r) => setTimeout(r, 60_000))'],
        stdout: 'null',
        stderr: 'null',
    })
}

Deno.test('abort() kills every live child', async () => {
    const tracker = new ChildTracker()
    const child = tracker.spawn(sleeper())
    assert(child !== undefined)
    tracker.abort()
    const status = await child.status
    assert(!status.success)
    assertEquals(status.signal, 'SIGKILL')
})

Deno.test('an aborted tracker refuses to spawn', () => {
    const tracker = new ChildTracker()
    tracker.abort()
    assertEquals(tracker.spawn(sleeper()), undefined)
})

Deno.test('boots() starts no server once aborted', async () => {
    const tracker = new ChildTracker()
    tracker.abort()
    const dir = await Deno.makeTempDir()
    try {
        const started = Date.now()
        const result = await boots(dir, 1, { tracker, timeoutMs: 10_000 })
        assertEquals(result.ok, false)
        assertMatch(result.detail, /aborted/)
        assert(Date.now() - started < 2_000, 'it must not wait for a server')
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
