/**
 * @fileoverview The shared contract every mutation battery in this package runs
 * under.
 *
 * **A battery is an instrument, and an instrument is never itself tested.** Every
 * rule below was written after a battery in this repository reported a result it
 * had not measured:
 *
 * - An uncaught module error prints a summary reading `0 failed`, so a KILLED
 *   mutant read as SURVIVED. The uncaught check runs BEFORE the summary parse.
 * - A mutant that does not type-check runs no test at all, and "no failures"
 *   read as green. That is DEAD, not survived.
 * - A stale anchor silently patched nothing and the suite passed on unmutated
 *   source. Anchors must match exactly once, and the file is re-read to prove
 *   it changed.
 * - A reviewer aborted a run and left a live mutant in the tree, because
 *   `finally` does not run on a signal.
 * - **And the two this file exists for**: a battery that never checks the suite
 *   is green BEFORE mutating reports every row KILLED when the suite is already
 *   red, or when its own `SUITES` path stops resolving. And a battery that
 *   reads only a failure COUNT cannot tell which test did the killing — so a
 *   row can be killed by an unrelated control while the control it was written
 *   to prove is absent, and two batteries over the same file cannot notice each
 *   other's coverage disappearing.
 *
 * @module @lockness/contract/tests/mutations/harness
 */

/** What one run of the suites concluded. */
export type Outcome = 'killed' | 'survived' | 'did-not-compile'

/** One mutation: where it applies, what it replaces, and what must catch it. */
export interface Mutation {
    label: string
    file: URL
    edits: [string, string][]
    /**
     * A substring of the name of a test that MUST be among the failures.
     *
     * This is the attribution half. Without it a green-to-red transition is the
     * only evidence, and a row can pass on a kill from a test that has nothing
     * to do with what it claims to prove.
     */
    killedBy: string
    /** Set only for a mutant that provably cannot change behaviour. */
    expectSurvival?: string
}

/** The result of running the suites once. */
export interface RunResult {
    outcome: Outcome
    /** Names of the tests that failed, for attribution. */
    failed: string[]
}

/** Run the suites once and classify the outcome. */
export async function runSuites(suites: string[]): Promise<RunResult> {
    const run = await new Deno.Command(Deno.execPath(), {
        args: ['test', '--allow-all', ...suites],
        env: Deno.env.toObject(),
    }).output()
    const raw = new TextDecoder().decode(run.stdout) +
        new TextDecoder().decode(run.stderr)
    // deno-lint-ignore no-control-regex
    const out = raw.replace(/\x1b\[[0-9;]*m/g, '')
    const failed = [
        ...new Set(
            out.split('\n')
                .filter((line) => line.includes(' ... FAILED'))
                .map((line) => line.split(' ...')[0].trim()),
        ),
    ]
    if (/Type checking failed|TS\d+ \[ERROR\]/.test(out)) {
        return { outcome: 'did-not-compile', failed }
    }
    const uncaught = /uncaught error|error: Test failed/.test(out)
    const summary = out.match(/(\d+) passed[^|]*\| (\d+) failed/)
    if (!summary) {
        return { outcome: uncaught ? 'killed' : 'did-not-compile', failed }
    }
    const outcome: Outcome = uncaught || Number(summary[2]) > 0
        ? 'killed'
        : 'survived'
    // A KILL WITH NO NAME IS STILL A KILL, and it must stay attributable.
    // Some mutants do not fail a test — they take the test FILE down. Removing
    // a containment `catch` lets the fault escape the read loop, and Deno
    // reports `<file> (uncaught error)` with no `... FAILED` line anywhere, so
    // the name list comes back empty and every such row reads MISATTRIBUTED
    // however it is labelled. Naming the crash lets a row DECLARE that this is
    // how its mutant dies (`killedBy: '(uncaught error)'`) instead of the
    // battery carrying a permanent red it can never resolve — which is the
    // pressure that gets a real gap relabelled into silence.
    if (outcome === 'killed' && failed.length === 0 && uncaught) {
        failed.push('(uncaught error)')
    }
    return { outcome, failed }
}

/** What {@link reclaimStaleLock} decided about one lock file. */
export interface LockReclaim {
    /**
     * `absent` — no lock file. `held` — its owner is alive, so the refusal
     * stands. `reclaimed` — the owner is gone and the lock was removed.
     * `unsafe` — the owner is gone but the file it guarded is NOT pristine, so
     * the lock is left in place and a human must look.
     */
    outcome: 'absent' | 'held' | 'reclaimed' | 'unsafe'
    /** The PID recorded in the lock, when it could be read. */
    pid?: number
    /** The ISO timestamp recorded in the lock, when it could be read. */
    since?: string
    /** Why an `unsafe` lock was left alone. */
    reason?: string
}

/**
 * Whether `pid` is a live process.
 *
 * `ps -p` rather than `Deno.kill(pid, 0)`, which Deno's signal type does not
 * admit — and rather than `SIGCONT`, which is *nearly* a no-op and would resume
 * a stopped process that happened to inherit the pid.
 *
 * **PID reuse makes this conservative, deliberately.** A recycled pid reads as
 * alive, so a genuinely stale lock can still refuse; the timestamp in the lock
 * is what tells a human that. The error direction matters more than the
 * accuracy: refusing a run costs a message, breaking a live one corrupts a
 * source file.
 *
 * @param pid - The process id recorded in a lock file.
 * @returns Whether a process with that id currently exists.
 */
async function processIsAlive(pid: number): Promise<boolean> {
    try {
        const probe = await new Deno.Command('ps', {
            args: ['-p', String(pid)],
            stdout: 'null',
            stderr: 'null',
        }).output()
        return probe.code === 0
    } catch {
        // No `ps`, or no permission to spawn it. Treat the owner as alive —
        // the conservative direction, for the reason above.
        return true
    }
}

/**
 * Whether `git` reports `path` unchanged.
 *
 * @param path - An absolute path inside the repository.
 * @returns `true` when git reports no modification; `false` otherwise,
 *   including when git cannot answer, which is the conservative direction.
 */
async function isPristine(path: string): Promise<boolean> {
    try {
        const run = await new Deno.Command('git', {
            args: ['status', '--porcelain', '--', path],
            stdout: 'piped',
            stderr: 'null',
        }).output()
        if (run.code !== 0) return false
        return new TextDecoder().decode(run.stdout).trim() === ''
    } catch {
        return false
    }
}

/**
 * Reclaim a lock whose owning process is gone (#320).
 *
 * A `SIGKILL` — an OOM kill, a CI runner eviction, a `kill -9` — runs neither
 * the `Symbol.dispose` nor the signal handlers, so the lock file outlives its
 * reason. Every later run of any battery touching that source then refuses, and
 * only a human deleting the file clears it. Survivable on a laptop; fatal on
 * the nightly job, which has no hand to run the recovery.
 *
 * **The refusal itself is correct and is kept.** Two batteries over one file
 * snapshot each other's live mutant and "restore" it permanently. What this
 * removes is only the case where the holder is *dead*.
 *
 * **A reclaim never assumes the guarded file is pristine.** A killed run can
 * leave a mutant on disk, and mutating a mutant produces a source nobody wrote
 * plus a "restore" that writes it back. When git reports the file modified, the
 * lock stands and the file is named.
 *
 * @param lock - Path to the lock file.
 * @param subject - The file the lock guards, if any. Omitted for a lock that
 *   guards a whole run rather than one file.
 * @returns What was decided, for the caller to report.
 * @example
 * ```ts
 * const decision = await reclaimStaleLock(`${file}.mutation-lock`, file)
 * if (decision.outcome === 'reclaimed') console.warn('broke a stale lock')
 * ```
 */
export async function reclaimStaleLock(
    lock: string,
    subject?: string,
): Promise<LockReclaim> {
    let raw: string
    try {
        raw = await Deno.readTextFile(lock)
    } catch {
        return { outcome: 'absent' }
    }
    const [pidText, since] = raw.trim().split(/\s+/)
    const pid = Number(pidText)
    // An unreadable lock is not evidence of a dead owner. Leave it.
    if (!Number.isInteger(pid) || pid <= 0) {
        return {
            outcome: 'unsafe',
            reason: `the lock names no usable pid (${JSON.stringify(raw)})`,
        }
    }
    if (pid === Deno.pid || await processIsAlive(pid)) {
        return { outcome: 'held', pid, since }
    }
    if (subject && !await isPristine(subject)) {
        return {
            outcome: 'unsafe',
            pid,
            since,
            reason:
                `${subject} is not pristine — the killed run may have left a ` +
                'mutant on disk. Restore it, then delete the lock.',
        }
    }
    try {
        await Deno.remove(lock)
    } catch {
        // Removed by someone else between the read and the remove; gone either
        // way, which is the outcome we wanted.
    }
    return { outcome: 'reclaimed', pid, since }
}

/**
 * Refuse to start unless the suites are green, and take a lock on the files.
 *
 * **Green first.** This is the baseline the instrument had no way to state
 * before: run against an already-red suite, every row reports KILLED and no
 * control does any work.
 *
 * **Then a lock, not a clean working tree.** The hazard is two batteries over
 * one file at once — each snapshots the other's live mutant and "restores" it
 * permanently. The obvious guard, `git status --porcelain`, is wrong: it refuses
 * whenever the file has uncommitted changes, which is the normal
 * develop-then-verify state and is exactly when a battery is most worth running.
 * Measured — it blocked its own workflow on the first try. A lock names the
 * actual condition instead of a correlate of it.
 *
 * @param suites - Absolute paths of the test files this battery runs.
 * @param files - The source files it will mutate.
 * @returns A disposable holding the lock; drop it to release.
 * @throws If the suites are not green, or another battery holds the lock.
 */
export async function assertSafeToStart(
    suites: string[],
    files: URL[],
): Promise<Disposable> {
    const locks = files.map((f) => `${f.pathname}.mutation-lock`)
    // A killed run leaves its locks behind, and a lock whose owner is gone is
    // indistinguishable from one a live battery holds (#320). Reclaim those
    // first, LOUDLY, so the correct refusal below does not outlive its reason.
    for (const [index, lock] of locks.entries()) {
        const decision = await reclaimStaleLock(lock, files[index].pathname)
        if (decision.outcome === 'reclaimed') {
            console.warn(
                `mutation harness: reclaimed a stale lock — ${lock}, held by ` +
                    `pid ${decision.pid}, which is gone (locked at ` +
                    `${decision.since ?? 'an unrecorded time'}).`,
            )
        } else if (decision.outcome === 'unsafe') {
            console.warn(
                `mutation harness: NOT reclaiming ${lock} — ${decision.reason}`,
            )
        }
    }
    const held: string[] = []
    for (const lock of locks) {
        try {
            // `createNew` is the atomic half: two batteries racing here cannot
            // both succeed, which a stat-then-write check would allow.
            Deno.writeTextFileSync(
                lock,
                `${Deno.pid} ${new Date().toISOString()}`,
                {
                    createNew: true,
                },
            )
            held.push(lock)
        } catch (error) {
            for (const taken of held) {
                try {
                    Deno.removeSync(taken)
                } catch { /* releasing a lock we took; nothing to add */ }
            }
            if (error instanceof Deno.errors.AlreadyExists) {
                throw new Error(
                    `another mutation battery holds ${lock}.\n\n` +
                        "Two batteries over one file will snapshot each other's " +
                        'live mutant and "restore" it permanently. Wait for it, ' +
                        'or delete that file if a previous run was killed.',
                )
            }
            throw error
        }
    }

    const release = {
        [Symbol.dispose]() {
            for (const lock of held) {
                try {
                    Deno.removeSync(lock)
                } catch { /* already gone; the run is over either way */ }
            }
        },
    }

    const baseline = await runSuites(suites)
    if (baseline.outcome !== 'survived') {
        release[Symbol.dispose]()
        throw new Error(
            `the suites are not green before any mutation (${baseline.outcome})` +
                (baseline.failed.length > 0
                    ? `: ${baseline.failed.join(', ')}`
                    : '') +
                '\n\nEvery row would report KILLED and none of them would mean ' +
                'anything. Fix the suite first.',
        )
    }
    return release
}

/**
 * Run a battery end to end: mutate, measure, restore, report.
 *
 * @param name - Printed as the battery's title.
 * @param suites - Absolute paths of the test files to run.
 * @param mutations - The rows.
 * @returns The number of unexpected survivors, for use as an exit code.
 */
export async function runBattery(
    name: string,
    suites: string[],
    mutations: Mutation[],
): Promise<number> {
    const files = [...new Set(mutations.map((m) => m.file.pathname))]
        .map((p) => new URL(`file://${p}`))
    using _lock = await assertSafeToStart(suites, files)

    const inFlight = new Map<string, string>()
    const restoreAll = () => {
        const restored: string[] = []
        const failed: string[] = []
        for (const [path, original] of inFlight) {
            try {
                Deno.writeTextFileSync(path, original)
                restored.push(path)
            } catch (error) {
                // Never silent: a failed restore leaves a LIVE MUTANT, which is
                // the one outcome this handler exists to prevent.
                console.error(`FAILED to restore ${path}:`, error)
                failed.push(path)
            }
        }
        if (restored.length > 0) {
            console.error(`\nInterrupted — restored: ${restored.join(', ')}`)
        }
        if (failed.length > 0) {
            console.error(
                `\nSTILL MUTATED — these hold a live mutant right now: ${
                    failed.join(', ')
                }\nRun \`git checkout --\` on them before anything else.`,
            )
        }
        inFlight.clear()
    }
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        Deno.addSignalListener(signal, () => {
            restoreAll()
            Deno.exit(130)
        })
    }

    let unexpected = 0
    console.log(`${name}\n`)
    for (const mutation of mutations) {
        const original = await Deno.readTextFile(mutation.file)
        let mutated = original
        let ok = true
        for (const [from, to] of mutation.edits) {
            const hits = mutated.split(from).length - 1
            if (hits !== 1) {
                console.log(
                    `DEAD MUTANT  ${mutation.label} — an anchor matched ${hits} ` +
                        'times, expected 1. The source moved; fix the anchor.',
                )
                ok = false
                unexpected++
                break
            }
            mutated = mutated.replace(from, to)
        }
        if (!ok) continue
        inFlight.set(mutation.file.pathname, original)
        await Deno.writeTextFile(mutation.file, mutated)
        if (await Deno.readTextFile(mutation.file) === original) {
            await Deno.writeTextFile(mutation.file, original)
            inFlight.delete(mutation.file.pathname)
            console.log(`DEAD MUTANT  ${mutation.label} — file unchanged`)
            unexpected++
            continue
        }
        let result: RunResult
        try {
            result = await runSuites(suites)
        } finally {
            await Deno.writeTextFile(mutation.file, original)
            inFlight.delete(mutation.file.pathname)
        }
        if (result.outcome === 'did-not-compile') {
            console.log(
                `DEAD MUTANT  ${mutation.label} — the mutant does not type-check.`,
            )
            unexpected++
        } else if (result.outcome === 'killed') {
            const attributed = result.failed.some((n) =>
                n.includes(mutation.killedBy)
            )
            if (attributed) {
                console.log(`KILLED       ${mutation.label}`)
            } else {
                // A kill by the wrong test is not evidence for this row.
                console.log(
                    `MISATTRIBUTED ${mutation.label}\n              expected a ` +
                        `failure in a test matching "${mutation.killedBy}", got: ` +
                        `${result.failed.join(', ') || '(none named)'}`,
                )
                unexpected++
            }
        } else if (mutation.expectSurvival) {
            console.log(
                `SURVIVED*    ${mutation.label}\n             ${mutation.expectSurvival}`,
            )
        } else {
            console.log(`SURVIVED     ${mutation.label}`)
            unexpected++
        }
    }
    console.log(`\n${unexpected} unexpected survivor(s).`)
    return unexpected
}
