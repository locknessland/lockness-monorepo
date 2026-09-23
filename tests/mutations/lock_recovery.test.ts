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
 * #356 adds the refusal a reader can act on: a dead owner over a MODIFIED file
 * is almost always a leftover mutant, and "another battery holds the lock"
 * sent the reader after a process that does not exist. The subject tests run
 * in a throwaway git repository with the subject committed: outside one,
 * `git status` exits 128, and a test there measures "git failed", not
 * "modified". The refusal is also pinned from the other side — a live owner,
 * an unreadable lock, or a file git cannot answer for never gets it.
 *
 * @module tests/mutations/lock_recovery
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { toFileUrl } from '@std/path'
import {
    assertSafeToStart,
    gitEnvFromCwd,
    reclaimStaleLock,
} from './harness.ts'

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

Deno.test('#320 an absent lock is reported as absent, not as a reclaim', async () => {
    await withLock(async (lock) => {
        assertEquals((await reclaimStaleLock(lock)).outcome, 'absent')
    })
})

/** The pristine subject every git fixture commits. */
const PRISTINE = 'export const x = 1\n'

/** Paths of one git fixture: the repo, its committed subject, and its lock. */
interface Repo {
    dir: string
    subject: string
    lock: string
}

/** Run `git` in `cwd`, throwing with its stderr when it fails. */
async function git(cwd: string, ...args: string[]): Promise<void> {
    const run = await new Deno.Command('git', {
        args,
        cwd,
        clearEnv: true,
        env: gitEnvFromCwd(),
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    if (!run.success) {
        throw new Error(
            `git ${args.join(' ')} failed in the fixture:\n` +
                new TextDecoder().decode(run.stderr),
        )
    }
}

/**
 * A throwaway git repository with `subject.ts` committed, so git can give a
 * real answer about it. `prefix` may hold a space, to exercise quoting.
 */
async function withRepo(
    body: (repo: Repo) => Promise<void>,
    prefix = 'lockness-356-repo-',
): Promise<void> {
    const dir = await Deno.realPath(await Deno.makeTempDir({ prefix }))
    try {
        const subject = `${dir}/subject.ts`
        await Deno.writeTextFile(subject, PRISTINE)
        await git(dir, 'init', '-q')
        await git(dir, 'add', 'subject.ts')
        await git(
            dir,
            '-c',
            'user.name=lockness fixture',
            '-c',
            'user.email=fixture@example.invalid',
            '-c',
            'commit.gpgsign=false',
            '-c',
            'core.hooksPath=/dev/null',
            'commit',
            '-q',
            '-m',
            'fixture',
        )
        await body({ dir, subject, lock: `${subject}.mutation-lock` })
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
}

/** Write a lock naming `pid`, stamped now. */
async function writeLock(lock: string, pid: number): Promise<void> {
    await Deno.writeTextFile(lock, `${pid} ${new Date().toISOString()}`)
}

/** Text only the leftover-mutant refusal carries: its recovery command. */
const LEFTOVER_RECOVERY = 'git checkout --'

/**
 * Call `assertSafeToStart` over the fixture's subject and return its refusal.
 * The suite path is never reached: every case here refuses before the
 * baseline.
 */
async function refusal(repo: Repo): Promise<string> {
    const error = await assertRejects(
        () =>
            assertSafeToStart(
                [`${repo.dir}/never_run.test.ts`],
                [toFileUrl(repo.subject)],
            ),
        Error,
    )
    return error.message
}

Deno.test('#356 a DEAD owner over a PRISTINE committed file is reclaimed', async () => {
    await withRepo(async ({ subject, lock }) => {
        await writeLock(lock, DEAD_PID)
        const decision = await reclaimStaleLock(lock, subject)
        assertEquals(decision.outcome, 'reclaimed', decision.reason)
        assertEquals(decision.subject, 'pristine')
        await assertRejects(() => Deno.stat(lock))
    })
})

Deno.test('#356 a DEAD owner over a MODIFIED committed file is left alone, and says so', async () => {
    // A SIGKILL can leave a mutant on disk. Reclaiming then would mutate a
    // mutant and "restore" a source nobody wrote — so the pristine check is
    // part of the reclaim, not an afterthought.
    await withRepo(async ({ subject, lock }) => {
        await Deno.writeTextFile(subject, 'export const x = 2\n')
        await writeLock(lock, DEAD_PID)
        const decision = await reclaimStaleLock(lock, subject)
        assertEquals(decision.outcome, 'unsafe')
        assertEquals(decision.subject, 'modified')
        assertEquals(decision.pid, DEAD_PID)
        assertStringIncludes(decision.reason ?? '', subject)
        assertEquals((await Deno.stat(lock)).isFile, true)
    })
})

Deno.test('#356 a DEAD owner over a MODIFIED file refuses before mutating, naming the fix', async () => {
    // The harness cannot tell a leftover mutant from the developer's own
    // uncommitted edit, so it restores nothing: it stops, says what the state
    // is, and names the commands that fix each reading of it — quoted, so a
    // path with a space survives the paste.
    await withRepo(async (repo) => {
        const leftover = 'export const x = 2 // a leftover mutant\n'
        await Deno.writeTextFile(repo.subject, leftover)
        await writeLock(repo.lock, DEAD_PID)
        const message = await refusal(repo)
        assertStringIncludes(message, `pid ${DEAD_PID}`)
        assertStringIncludes(message, 'is not visible')
        assertStringIncludes(message, `git checkout -- '${repo.subject}'`)
        assertStringIncludes(message, `rm '${repo.lock}'`)
        assertStringIncludes(message, 'commit or stash')
        assert(
            !message.includes('another mutation battery holds'),
            `the refusal must not send the reader after a live battery: ${message}`,
        )
        assert(
            !message.includes('killed'),
            `an owner ps cannot see is not known to be killed: ${message}`,
        )
        assertEquals(
            await Deno.readTextFile(repo.subject),
            leftover,
            'the refusal restores nothing on its own',
        )
        assertEquals((await Deno.stat(repo.lock)).isFile, true)
    }, 'lockness 356 repo ')
})

Deno.test('#356 a DEAD owner over a file git cannot answer for is refused WITHOUT the leftover-mutant fix', async () => {
    // Outside any repository `git status` exits 128. That is "git could not
    // answer", not "modified", and the refusal must not prescribe a
    // `git checkout` it has no evidence for.
    await withLock(async (lock, dir) => {
        const subject = `${dir}/subject.ts`
        await Deno.writeTextFile(subject, PRISTINE)
        await writeLock(lock, DEAD_PID)
        const decision = await reclaimStaleLock(lock, subject)
        assertEquals(decision.outcome, 'unsafe')
        assertEquals(decision.subject, 'unknown')
        assertStringIncludes(decision.reason ?? '', 'git could not say')
        const message = await refusal({ dir, subject, lock })
        assertStringIncludes(message, `pid ${DEAD_PID}`)
        assertStringIncludes(message, 'git could not say')
        assert(
            !message.includes(LEFTOVER_RECOVERY),
            `git never reported the file modified: ${message}`,
        )
        assertEquals((await Deno.stat(lock)).isFile, true)
    })
})

Deno.test('#356 a LIVE owner over a modified file does NOT get the leftover-mutant refusal', async () => {
    await withRepo(async (repo) => {
        await Deno.writeTextFile(repo.subject, 'export const x = 2\n')
        await writeLock(repo.lock, Deno.pid)
        const message = await refusal(repo)
        assertStringIncludes(message, 'another mutation battery holds')
        assert(
            !message.includes(LEFTOVER_RECOVERY),
            `a live battery's mutant is not a leftover: ${message}`,
        )
        assertEquals((await Deno.stat(repo.lock)).isFile, true)
    })
})

Deno.test('#356 a lock naming no usable pid over a modified file does NOT get the leftover-mutant refusal', async () => {
    for (const content of ['', 'not-a-pid']) {
        await withRepo(async (repo) => {
            await Deno.writeTextFile(repo.subject, 'export const x = 2\n')
            await Deno.writeTextFile(repo.lock, content)
            const message = await refusal(repo)
            assertStringIncludes(message, 'names no usable pid')
            assert(
                !message.includes(LEFTOVER_RECOVERY),
                `content ${JSON.stringify(content)}: an unreadable lock is ` +
                    `not evidence of a dead owner: ${message}`,
            )
            assertEquals((await Deno.stat(repo.lock)).isFile, true)
        })
    }
})

Deno.test('#356 a git fixture and probe ignore an inherited GIT_DIR, as under a worktree hook', async () => {
    // A git hook exports GIT_DIR to every child. Before the fix this fixture
    // committed onto the pushing worktree's HEAD instead of its own repo.
    const prior = Deno.env.get('GIT_DIR')
    Deno.env.set('GIT_DIR', `${await Deno.makeTempDir()}/not-a-repo`)
    try {
        await withRepo(async ({ subject, lock }) => {
            await writeLock(lock, DEAD_PID)
            const decision = await reclaimStaleLock(lock, subject)
            assertEquals(decision.outcome, 'reclaimed', decision.reason)
            assertEquals(decision.subject, 'pristine')
        })
    } finally {
        if (prior === undefined) Deno.env.delete('GIT_DIR')
        else Deno.env.set('GIT_DIR', prior)
    }
})
