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

/**
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
