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
 * - Closing a terminal delivered `SIGHUP`, which nothing listened for, and an
 *   async mutant write could land AFTER a signal's synchronous restore. Both
 *   left a live mutant; {@link MutantGuard} exists for them (#356).
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

import { dirname, fromFileUrl } from '@std/path'

/** What one run of the suites concluded. */
export type Outcome = 'killed' | 'survived' | 'did-not-compile'

/** One mutation: where it applies, what it replaces, and what must catch it. */
export interface Mutation {
    /** The row's name, printed beside its outcome. */
    label: string
    /** The source file the edits apply to. */
    file: URL
    /** `[from, to]` pairs; each `from` must match the source exactly once. */
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
    /** What the run concluded. */
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

/**
 * What git says about a guarded file. `unknown` is its own answer, never
 * folded into `modified`: git exits 128 outside a repository, and a refusal
 * built on that exit would prescribe a `git checkout` it has no evidence for.
 */
export type SubjectState = 'pristine' | 'modified' | 'unknown'

/** What {@link reclaimStaleLock} decided about one lock file. */
export interface LockReclaim {
    /**
     * `absent` — no lock file. `held` — its owner is alive, so the refusal
     * stands. `reclaimed` — the owner is not visible to `ps` and git reports
     * the guarded file pristine, so the lock was removed. `unsafe` — the lock
     * names no usable pid, or the guarded file is not known to be pristine, so
     * the lock is left in place and a human must look.
     */
    outcome: 'absent' | 'held' | 'reclaimed' | 'unsafe'
    /** The PID recorded in the lock, when it could be read. */
    pid?: number
    /** The ISO timestamp recorded in the lock, when it could be read. */
    since?: string
    /** What git said about the guarded file, when it was asked. */
    subject?: SubjectState
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
    } catch (error) {
        // No `ps`, or no permission to spawn it. Treat the owner as alive —
        // the conservative direction, for the reason above.
        console.warn(
            `mutation harness: cannot run ps, so pid ${pid} is treated as ` +
                'alive:',
            error,
        )
        return true
    }
}

/**
 * Ask git whether `path` is unchanged.
 *
 * Run from the file's own directory: from anywhere else a path outside the
 * current repository makes `git status` exit 128, which is a failure to
 * answer, not a modification.
 *
 * @param path - An absolute filesystem path.
 * @returns The state, plus git's own words when it could not answer.
 */
async function probeSubject(
    path: string,
): Promise<{ state: SubjectState; detail?: string }> {
    try {
        const run = await new Deno.Command('git', {
            args: ['status', '--porcelain', '--', path],
            cwd: dirname(path),
            stdout: 'piped',
            stderr: 'piped',
        }).output()
        if (run.code !== 0) {
            const stderr = new TextDecoder().decode(run.stderr).trim()
            return {
                state: 'unknown',
                detail: `git status exited ${run.code}: ${stderr}`,
            }
        }
        const porcelain = new TextDecoder().decode(run.stdout).trim()
        return { state: porcelain === '' ? 'pristine' : 'modified' }
    } catch (error) {
        return { state: 'unknown', detail: `git could not be run: ${error}` }
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
 * plus a "restore" that writes it back. Only git reporting the file pristine
 * reclaims; when it reports the file modified, or cannot answer at all, the
 * lock stands and the decision says which.
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
    let subjectState: SubjectState | undefined
    if (subject) {
        const probe = await probeSubject(subject)
        subjectState = probe.state
        if (probe.state === 'modified') {
            return {
                outcome: 'unsafe',
                pid,
                since,
                subject: probe.state,
                reason: `git reports ${subject} modified — a run that ended ` +
                    'without its restore may have left a mutant on disk.',
            }
        }
        if (probe.state === 'unknown') {
            return {
                outcome: 'unsafe',
                pid,
                since,
                subject: probe.state,
                reason: `git could not say whether ${subject} is pristine ` +
                    `(${probe.detail}).`,
            }
        }
    }
    try {
        await Deno.remove(lock)
    } catch (error) {
        // Removed by someone else between the read and the remove: gone either
        // way, which is the outcome we wanted. Anything else is not a reclaim.
        if (!(error instanceof Deno.errors.NotFound)) throw error
    }
    return { outcome: 'reclaimed', pid, since, subject: subjectState }
}

/**
 * Quote `text` for a POSIX shell, so a path with a space or a quote in it
 * survives being pasted from a refusal.
 *
 * @param text - Any string.
 * @returns `text` in single quotes, each embedded `'` spelled `'\''`.
 */
function shellQuote(text: string): string {
    return `'${text.replaceAll("'", `'\\''`)}'`
}

/**
 * The refusal for a lock whose owner is not visible to `ps`, over a file git
 * reports modified (#356).
 *
 * That state is almost always a leftover mutant — a `SIGKILL` mid-row runs
 * neither the restore nor the lock's disposal — but the harness cannot tell
 * one from the developer's own uncommitted edit, so it restores nothing. It
 * says what the state is and names the command for each reading of it. It is
 * the ONLY refusal that prescribes those commands: nothing else has git's word
 * that the file changed.
 *
 * @param lock - The lock file the unseen owner left.
 * @param path - The source file it guards.
 * @param decision - The `unsafe` decision, with `subject: 'modified'`.
 * @returns The message to throw.
 */
function leftoverMutantRefusal(
    lock: string,
    path: string,
    decision: LockReclaim,
): string {
    return `the owner of ${lock} (pid ${decision.pid}, locked at ` +
        `${decision.since ?? 'an unrecorded time'}) is not visible to ps, ` +
        `and ${decision.reason}\n\n` +
        'If the change is a leftover mutant, restore the file and drop the ' +
        'lock:\n\n' +
        `    git checkout -- ${shellQuote(path)}\n` +
        `    rm ${shellQuote(lock)}\n\n` +
        'If it is your own work, commit or stash it first, then drop the ' +
        'lock. This run mutated nothing.'
}

/**
 * The refusal for every other lock the harness will not reclaim: one naming
 * no usable pid, or one whose owner is not visible over a file git could not
 * answer for. Neither is evidence of a leftover mutant, so no command is
 * prescribed — only the reason, for a human to weigh.
 *
 * @param lock - The lock file left in place.
 * @param decision - The `unsafe` decision.
 * @returns The message to throw.
 */
function unreclaimedLockRefusal(lock: string, decision: LockReclaim): string {
    const owner = decision.pid === undefined
        ? ''
        : ` Its owner, pid ${decision.pid} (locked at ` +
            `${decision.since ?? 'an unrecorded time'}), is not visible to ps.`
    return `NOT reclaiming ${lock}: ${decision.reason}${owner}\n\n` +
        'Check that no battery is running and that the file it guards holds ' +
        'no mutant before removing the lock. This run mutated nothing.'
}

/**
 * What a guarded file holds, or `null` when it does not exist.
 *
 * @param path - The guarded file.
 * @returns Its text, or `null` for a missing file.
 * @throws Any read error other than `NotFound`.
 */
function readGuarded(path: string): string | null {
    try {
        return Deno.readTextFileSync(path)
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return null
        throw error
    }
}

/**
 * Remove one lock, unless the file it guards no longer holds `bytes`.
 *
 * A file that changed under the lock is, in every path this harness takes, a
 * restore that failed — so the lock stays, and the next run is refused rather
 * than reading a live mutant as the pristine source. Never throws: this runs
 * from a `using` disposal, where a throw would mask the run's own error.
 *
 * @param lock - The lock file this run took.
 * @param path - The file it guards.
 * @param bytes - What that file held when the lock was taken.
 */
function releaseLock(lock: string, path: string, bytes: string | null): void {
    let now: string | null
    try {
        now = readGuarded(path)
    } catch (error) {
        console.error(
            `mutation harness: KEEPING ${lock} — ${path} cannot be read back:`,
            error,
        )
        return
    }
    if (now !== bytes) {
        console.error(
            `mutation harness: KEEPING ${lock} — ${path} does not hold what it ` +
                'held when this run locked it, so a mutant may still be on ' +
                'disk. The next run refuses until the file is put back and ' +
                'the lock removed.',
        )
        return
    }
    try {
        Deno.removeSync(lock)
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
            console.error(`mutation harness: could not remove ${lock}:`, error)
        }
    }
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
 * **The lock is released only over the bytes it was taken on.** Each guarded
 * file is read when its lock is taken, and read again at release; a file that
 * differs — a restore that failed, on any path — keeps its lock, so the next
 * run is refused instead of reading the mutant as the pristine source.
 *
 * @param suites - Absolute paths of the test files this battery runs.
 * @param files - The source files it will mutate.
 * @returns A disposable holding the lock; drop it to release. Release never
 *   throws: a lock it keeps, or cannot remove, is reported on stderr.
 * @throws If the suites are not green, if another battery holds the lock, if
 *   a lock cannot be reclaimed — naming the `git checkout` that restores the
 *   file only when git reports it modified — or if a guarded file cannot be
 *   read. Every refusal comes before anything is mutated.
 */
export async function assertSafeToStart(
    suites: string[],
    files: URL[],
): Promise<Disposable> {
    const paths = files.map((f) => fromFileUrl(f))
    const locks = paths.map((p) => `${p}.mutation-lock`)
    // A killed run leaves its locks behind, and a lock whose owner is gone is
    // indistinguishable from one a live battery holds (#320). Reclaim those
    // first, LOUDLY, so the correct refusal below does not outlive its reason.
    for (const [index, lock] of locks.entries()) {
        const decision = await reclaimStaleLock(lock, paths[index])
        if (decision.outcome === 'reclaimed') {
            console.warn(
                `mutation harness: reclaimed a stale lock — ${lock}, held by ` +
                    `pid ${decision.pid}, which ps no longer sees (locked at ` +
                    `${decision.since ?? 'an unrecorded time'}).`,
            )
        } else if (
            decision.outcome === 'unsafe' && decision.subject === 'modified'
        ) {
            // Git's word that the file changed is the only ground for naming
            // `git checkout`. Refuse HERE, before a lock is taken: falling
            // through reports "another battery holds" it.
            throw new Error(leftoverMutantRefusal(lock, paths[index], decision))
        } else if (decision.outcome === 'unsafe') {
            throw new Error(unreclaimedLockRefusal(lock, decision))
        }
    }
    const held: { lock: string; path: string; bytes: string | null }[] = []
    const release = {
        [Symbol.dispose](): void {
            for (const { lock, path, bytes } of held) {
                releaseLock(lock, path, bytes)
            }
        },
    }
    for (const [index, lock] of locks.entries()) {
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
        } catch (error) {
            release[Symbol.dispose]()
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
        let bytes: string | null
        try {
            bytes = readGuarded(paths[index])
        } catch (error) {
            // Nothing is mutated yet, so every lock taken is safe to drop.
            try {
                Deno.removeSync(lock)
            } catch (removeError) {
                console.error(
                    `mutation harness: could not remove ${lock}:`,
                    removeError,
                )
            }
            release[Symbol.dispose]()
            throw error
        }
        held.push({ lock, path: paths[index], bytes })
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
 * Every catchable signal that ends a run, with its number. `SIGHUP` is how a
 * closed terminal ends one, and its default action exits without a restore.
 * `SIGKILL` cannot be caught at all: the stale-lock refusal in
 * {@link assertSafeToStart} is its only recovery.
 *
 * The numbers are the POSIX ones, the same on Linux and macOS. A handled
 * signal exits `128 + signo` — 130 for `SIGINT`, 143 for `SIGTERM`, 129 for
 * `SIGHUP` — the code a shell reports for a process that signal ended, so a
 * caller can still tell which one it was.
 */
const RESTORE_ON = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 } as const

/** A signal {@link MutantGuard} restores on. */
type RestoreSignal = keyof typeof RESTORE_ON

/**
 * The live mutants of one run, and the signal listeners that put them back.
 *
 * **Every write is synchronous, the mutant's as much as the restore's.** A
 * listener runs on the event loop, so with no async write pending it can only
 * fire between whole steps: the file on disk and the in-flight map always
 * agree. An async mutant write broke that — a signal landing while it was
 * pending restored first, then the late write put the mutant back (#356).
 *
 * **On a signal**, every file in flight is written back and the process exits
 * `128 + signo` (130 for `SIGINT`, 143 for `SIGTERM`, 129 for `SIGHUP`).
 * `Deno.exit` runs no disposal, so the lock from {@link assertSafeToStart}
 * stays behind; the next run reclaims it once git reports the file pristine.
 *
 * **Disposal removes the listeners.** They run in registration order, so a
 * stale one left by an earlier run exits first and skips a later run's
 * restore. Disposal also restores anything still in flight, which only an
 * exception between {@link MutantGuard.mutate} and
 * {@link MutantGuard.restore} can leave.
 *
 * Files are keyed by their decoded filesystem path, never by the URL's
 * percent-encoded `pathname`, which does not name a path holding a space.
 *
 * @example
 * ```ts
 * using guard = new MutantGuard()
 * try {
 *     guard.mutate(file, original, mutated)
 *     await check()
 * } finally {
 *     guard.restore(file)
 * }
 * ```
 */
export class MutantGuard implements Disposable {
    readonly #inFlight = new Map<string, string>()
    readonly #listeners: [RestoreSignal, () => void][] = []

    /**
     * Install the restore on `SIGINT`, `SIGTERM` and `SIGHUP`.
     *
     * @throws If a listener cannot be installed. Those already installed are
     *   removed first, so a guard that was never built leaves none behind.
     */
    constructor() {
        try {
            for (const signal of Object.keys(RESTORE_ON) as RestoreSignal[]) {
                const listener = (): void => {
                    this.#restoreAll(`Interrupted by ${signal}`)
                    Deno.exit(128 + RESTORE_ON[signal])
                }
                Deno.addSignalListener(signal, listener)
                this.#listeners.push([signal, listener])
            }
        } catch (error) {
            this.#removeListeners()
            throw error
        }
    }

    /**
     * Write a mutant over `file`, registered for restore BEFORE the write.
     *
     * @param file - The source file to mutate.
     * @param original - Its pristine bytes, which every restore writes back.
     * @param mutated - The mutant.
     * @throws If the write fails. The file stays registered, so a restore or
     *   disposal still writes the original over whatever part of the mutant
     *   landed.
     */
    mutate(file: URL, original: string, mutated: string): void {
        const path = fromFileUrl(file)
        this.#inFlight.set(path, original)
        Deno.writeTextFileSync(path, mutated)
    }

    /**
     * Write `file`'s original back and stop guarding it. A no-op for a file
     * that is not in flight.
     *
     * @param file - A file passed to {@link MutantGuard.mutate}.
     * @throws If the write fails; the file then stays in flight, so disposal
     *   and the signal listeners still try it.
     */
    restore(file: URL): void {
        const path = fromFileUrl(file)
        const original = this.#inFlight.get(path)
        if (original === undefined) return
        Deno.writeTextFileSync(path, original)
        this.#inFlight.delete(path)
    }

    /**
     * Restore anything still in flight, then remove the listeners.
     *
     * Never throws — it runs from a `using` disposal, where a throw would mask
     * the run's own error. A restore that fails here is only logged, as
     * `STILL MUTATED`, and the lock from {@link assertSafeToStart} is then
     * kept because the file no longer matches what it was locked on.
     */
    [Symbol.dispose](): void {
        this.#restoreAll('Unwinding')
        this.#removeListeners()
    }

    /** Remove every listener this guard installed. */
    #removeListeners(): void {
        for (const [signal, listener] of this.#listeners) {
            Deno.removeSignalListener(signal, listener)
        }
        this.#listeners.length = 0
    }

    /**
     * Restore every file in flight, reporting each outcome.
     *
     * @param why - What ended the run, for the report.
     */
    #restoreAll(why: string): void {
        const restored: string[] = []
        const failed: string[] = []
        for (const [path, original] of this.#inFlight) {
            try {
                Deno.writeTextFileSync(path, original)
                restored.push(path)
            } catch (error) {
                // Never silent: a failed restore leaves a LIVE MUTANT, which is
                // the one outcome this guard exists to prevent.
                console.error(`FAILED to restore ${path}:`, error)
                failed.push(path)
            }
        }
        if (restored.length > 0) {
            console.error(`\n${why} — restored: ${restored.join(', ')}`)
        }
        if (failed.length > 0) {
            console.error(
                `\nSTILL MUTATED — these hold a live mutant right now: ${
                    failed.join(', ')
                }\nPut each one back before anything else — ` +
                    '`git checkout --` it, if it had no uncommitted work.',
            )
        }
        this.#inFlight.clear()
    }
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
    const files = [...new Set(mutations.map((m) => m.file.href))]
        .map((href) => new URL(href))
    using _lock = await assertSafeToStart(suites, files)
    // Declared after the lock, so disposed before it: the listeners are gone
    // and every file restored by the time the lock is released.
    using guard = new MutantGuard()

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
        guard.mutate(mutation.file, original, mutated)
        if (await Deno.readTextFile(mutation.file) === original) {
            guard.restore(mutation.file)
            console.log(`DEAD MUTANT  ${mutation.label} — file unchanged`)
            unexpected++
            continue
        }
        let result: RunResult
        try {
            result = await runSuites(suites)
        } finally {
            guard.restore(mutation.file)
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
