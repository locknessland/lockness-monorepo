/**
 * @fileoverview #320 — a lock left by a killed run is reclaimed; a held one is not.
 *
 * The lock protocol is correct and stays: two batteries over one source file
 * snapshot each other's live mutant and "restore" it permanently. What was
 * missing is that a lock left by a **dead** process is indistinguishable from
 * one a live battery holds, so the correct refusal outlived its reason — and
 * only a human deleting the file cleared it. That is survivable on a laptop and
 * fatal on the nightly job, which has no hand to run the recovery.
 *
 * @module tests/mutations/lock_recovery
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { reclaimStaleLock } from './harness.ts'

/** A pid that is certainly not running: the kernel refuses to allocate it. */
const DEAD_PID = 2 ** 22

/** A temp dir plus a lock file inside it, cleaned up by the caller. */
async function withLock(
    body: (lock: string, dir: string) => Promise<void>,
): Promise<void> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness-320-' })
    try {
        await body(`${dir}/subject.ts.mutation-lock`, dir)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
}

Deno.test('#320 a lock owned by a DEAD pid is reclaimed', async () => {
    await withLock(async (lock) => {
        await Deno.writeTextFile(
            lock,
            `${DEAD_PID} ${new Date().toISOString()}`,
        )
        const decision = await reclaimStaleLock(lock)
        assertEquals(decision.outcome, 'reclaimed')
        assertEquals(decision.pid, DEAD_PID)
        assert(
            decision.since !== undefined,
            'the reclaim must report WHEN the dead run took it — a silent ' +
                'reclaim rebuilds the hazard the lock exists to prevent',
        )
        await assertRejects(() => Deno.stat(lock))
    })
})

Deno.test('#320 a lock owned by a LIVE pid still refuses', async () => {
    // The half that must not regress. `Deno.pid` is this very process, so it is
    // alive by construction — no sleep, no race.
    await withLock(async (lock) => {
        await Deno.writeTextFile(
            lock,
            `${Deno.pid} ${new Date().toISOString()}`,
        )
        const decision = await reclaimStaleLock(lock)
        assertEquals(decision.outcome, 'held')
        assertEquals(decision.pid, Deno.pid)
        assertEquals(
            (await Deno.stat(lock)).isFile,
            true,
            'a live holder’s lock must survive the probe',
        )
    })
})

Deno.test('#320 a lock naming no usable pid is left ALONE, not reclaimed', async () => {
    // An unreadable lock is not evidence of a dead owner. Reclaiming on a parse
    // failure would turn "I cannot tell" into "go ahead", which is the one
    // direction this must never take.
    for (const content of ['', 'not-a-pid', '-1 2026-01-01T00:00:00.000Z']) {
        await withLock(async (lock) => {
            await Deno.writeTextFile(lock, content)
            const decision = await reclaimStaleLock(lock)
            assertEquals(
                decision.outcome,
                'unsafe',
                `content ${JSON.stringify(content)} must not be reclaimed`,
            )
            assertEquals((await Deno.stat(lock)).isFile, true)
        })
    }
})

Deno.test('#320 a DEAD owner whose subject is dirty is left alone, and says so', async () => {
    // A SIGKILL can leave a mutant on disk. Reclaiming then would mutate a
    // mutant and "restore" a source nobody wrote — so the pristine check is
    // part of the reclaim, not an afterthought. An untracked temp file is
    // enough to make `git status --porcelain` non-empty.
    await withLock(async (lock, dir) => {
        const subject = `${dir}/subject.ts`
        await Deno.writeTextFile(subject, 'export const x = 1\n')
        await Deno.writeTextFile(
            lock,
            `${DEAD_PID} ${new Date().toISOString()}`,
        )
        const decision = await reclaimStaleLock(lock, subject)
        assertEquals(decision.outcome, 'unsafe')
        assertEquals(decision.pid, DEAD_PID)
        assert(
            decision.reason?.includes(subject),
            `the refusal must NAME the file: ${decision.reason}`,
        )
        assertEquals((await Deno.stat(lock)).isFile, true)
    })
})

Deno.test('#320 an absent lock is reported as absent, not as a reclaim', async () => {
    await withLock(async (lock) => {
        assertEquals((await reclaimStaleLock(lock)).outcome, 'absent')
    })
})
