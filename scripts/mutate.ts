/**
 * @fileoverview `deno task mutate` — run every mutation battery, serially.
 *
 * Batteries are `.ts`, not `.test.ts`, so `deno test` never discovered them and
 * for twelve batteries' lifetime nothing ran them together. The first full
 * sweep, done by hand while documenting the convention (#317), found four
 * rotted rows in the two batteries it happened to expose — three of them broken
 * by later, unrelated merges. This script is what makes that sweep repeatable
 * and, in CI, automatic (#319).
 *
 * **`DEAD MUTANT` and `MISATTRIBUTED` are failures here, not diagnostics.** A
 * `DEAD` row's anchor no longer matches, so it proves nothing; a
 * `MISATTRIBUTED` row was killed by a test other than the one it names, so it
 * proves something else. Both still print as rows, which is exactly how four of
 * them survived unnoticed. The shared harness already counts them toward its
 * exit code; this runner's job is to never soften that.
 *
 * **Serial, always.** A battery edits source files on disk and then runs a test
 * suite over them. Two batteries at once corrupt each other's runs even when
 * they mutate different files, because the suite one of them runs reads the
 * file the other is holding mutated. The lock below makes that a refusal rather
 * than a silently wrong result — the author of this script nearly produced one.
 *
 * The lock guards **runner against runner**. A battery launched directly with
 * `deno run -A <file>` does not take it, and the harness's own lock is
 * per-file, so a direct run alongside this one is still unprotected. Stated
 * rather than implied, because a guard whose reach is assumed wider than it is
 * is worse than no guard.
 *
 * Since #320 the lock also **reclaims itself**. It records the owning pid, and
 * a lock whose owner is gone is removed — loudly, naming the pid and when it
 * was taken — so a `SIGKILL` no longer leaves a refusal that outlives its
 * reason. A lock held by a LIVE process still refuses, unchanged, and a lock
 * this runner cannot safely judge is left alone rather than broken.
 *
 * ```bash
 * deno task mutate                 # every battery
 * deno task mutate redis           # one package
 * deno task mutate prefix_288      # one battery, by path substring
 * deno task mutate --require-all   # a skipped battery is a FAILURE
 * ```
 *
 * Exit codes: `0` every battery clean, `1` at least one battery reported
 * unresolved rows, `2` a battery could not run and `--require-all` was passed.
 *
 * @module scripts/mutate
 */

import { reclaimStaleLock } from '@mutations/harness.ts'
import { walk } from '@std/fs'
import { relative } from '@std/path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const LOCK = `${ROOT}/tests/mutations/.runner-lock`

/** How one battery finished. */
interface Outcome {
    path: string
    /** Process exit code. */
    code: number
    /** Wall-clock seconds. */
    seconds: number
    /** Rows the battery could not resolve — survivors, dead anchors, misattributions. */
    unresolved: number
    /** The unresolved rows' own lines, for the summary. */
    lines: string[]
    /**
     * True when the battery could not run EVERY row — it refused to start for
     * want of a prerequisite, or ran the rows it could and named the rest.
     */
    partial: boolean
}

/** Every battery in the repo, sorted by path. */
async function discover(): Promise<string[]> {
    const found: string[] = []
    for await (
        const entry of walk(`${ROOT}/packages`, {
            includeDirs: false,
            exts: ['.ts'],
            match: [/\/tests\/mutations\/[^/]+\.ts$/],
        })
    ) {
        found.push(entry.path)
    }
    return found.sort()
}

/**
 * Run one battery to completion.
 *
 * @param path - Absolute path to the battery.
 * @returns What it reported.
 */
async function runBatteryFile(path: string): Promise<Outcome> {
    const started = performance.now()
    const run = await new Deno.Command(Deno.execPath(), {
        args: ['run', '-A', path],
        env: Deno.env.toObject(),
    }).output()
    const out = new TextDecoder().decode(run.stdout) +
        new TextDecoder().decode(run.stderr)
    // deno-lint-ignore no-control-regex
    const clean = out.replace(/\x1b\[[0-9;]*m/g, '')
    const lines = clean.split('\n')
    // `SURVIVED ` with the space excludes `SURVIVED*`, which is a RECORDED
    // equivalent mutant and deliberately not a failure.
    const unresolvedLines = lines.filter((line) =>
        line.startsWith('DEAD MUTANT') ||
        line.startsWith('MISATTRIBUTED') ||
        line.startsWith('SURVIVED ')
    )
    return {
        path: relative(ROOT, path),
        code: run.code,
        seconds: (performance.now() - started) / 1000,
        unresolved: unresolvedLines.length,
        lines: unresolvedLines.map((line) => line.trim()),
        // Exit 2 is the batteries' agreed "I could not run every row" code —
        // a live broker is the only prerequisite today. Some refuse to start
        // at all; one runs its offline rows and names the rest. Neither is a
        // pass, and a battery can be partial AND have a real red among the
        // rows it did run, so the two are tracked separately below.
        partial: run.code === 2,
    }
}

/** Take the runner lock, or explain who holds it and stop. */
async function lock(): Promise<void> {
    // A SIGKILL runs neither the `finally` nor the signal handlers, so this
    // lock outlives its owner and every later run refuses (#320). Survivable
    // by hand; fatal on the nightly job, which has no hand.
    const stale = await reclaimStaleLock(LOCK)
    if (stale.outcome === 'reclaimed') {
        console.warn(
            `Reclaimed a stale runner lock — pid ${stale.pid} is gone ` +
                `(locked at ${stale.since ?? 'an unrecorded time'}).`,
        )
    } else if (stale.outcome === 'unsafe') {
        console.error(`Refusing to reclaim ${LOCK} — ${stale.reason}`)
        Deno.exit(1)
    }
    try {
        await Deno.writeTextFile(
            LOCK,
            `${Deno.pid} ${new Date().toISOString()}\n`,
            { createNew: true },
        )
    } catch (error) {
        if (!(error instanceof Deno.errors.AlreadyExists)) throw error
        const holder = await Deno.readTextFile(LOCK).catch(() => '?')
        console.error(
            `A mutation run is already in progress (${holder.trim()}).\n` +
                'Batteries edit source files on disk, so two runs corrupt each ' +
                "other's results rather than merely racing.\n" +
                'A lock left by a KILLED run is reclaimed automatically, so ' +
                'seeing this means the owning process is alive — or its pid ' +
                `has been reused. Check, then remove ${relative(ROOT, LOCK)}.`,
        )
        Deno.exit(1)
    }
}

async function unlock(): Promise<void> {
    await Deno.remove(LOCK).catch(() => {})
}

if (import.meta.main) {
    const args = Deno.args.filter((a) => a !== '--require-all')
    const requireAll = Deno.args.includes('--require-all')
    const filter = args[0]

    const all = await discover()
    const batteries = filter
        ? all.filter((p) => relative(ROOT, p).includes(filter))
        : all

    if (batteries.length === 0) {
        console.error(
            filter
                ? `No battery matches ${JSON.stringify(filter)}. ` +
                    `${all.length} exist; try a package name or a filename part.`
                : 'No batteries found.',
        )
        Deno.exit(1)
    }

    await lock()
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        Deno.addSignalListener(signal, () => {
            void unlock()
            Deno.exit(130)
        })
    }

    const outcomes: Outcome[] = []
    try {
        console.log(
            `Mutation batteries — ${batteries.length} to run, serially.\n`,
        )
        for (const path of batteries) {
            const outcome = await runBatteryFile(path)
            outcomes.push(outcome)
            const mark = outcome.unresolved > 0 ||
                    (outcome.code !== 0 && outcome.code !== 2)
                ? 'FAIL'
                : outcome.partial
                ? 'PART'
                : '  ok'
            console.log(
                `${mark}  ${outcome.path}  (${outcome.seconds.toFixed(1)}s)`,
            )
            for (const line of outcome.lines) console.log(`        ${line}`)
            if (outcome.partial) {
                console.log(
                    '        did NOT run every row — a prerequisite is ' +
                        'missing (a live broker). NOT a pass.',
                )
            }
        }
    } finally {
        await unlock()
    }

    // A battery can be BOTH — partial on the rows it could not run, and red on
    // one it could. Counting them as mutually exclusive would hide the red
    // behind the excuse.
    const partial = outcomes.filter((o) => o.partial)
    const failed = outcomes.filter(
        (o) => o.unresolved > 0 || (o.code !== 0 && o.code !== 2),
    )
    const clean = outcomes.filter(
        (o) => !o.partial && !failed.includes(o),
    ).length

    console.log(
        `\n${outcomes.length} batter${outcomes.length === 1 ? 'y' : 'ies'}: ` +
            `${clean} clean, ${failed.length} failed, ${partial.length} partial.`,
    )

    // A partial run must never read as a full one. Naming them is the whole
    // point: "the batteries passed" is false when rows never executed.
    if (partial.length > 0) {
        console.log(
            `\nPARTIAL RUN — ${partial.length} batter${
                partial.length === 1 ? 'y' : 'ies'
            } did NOT run every row:`,
        )
        for (const o of partial) console.log(`  - ${o.path}`)
        console.log(
            '\nThese need a live broker. Provide one and re-run, or pass\n' +
                '--require-all to make a partial run a failure:\n' +
                '  LOCKNESS_REDIS_INTEGRATION=1 LOCKNESS_REDIS_PORT=<port> ' +
                'deno task mutate',
        )
    }

    if (failed.length > 0) Deno.exit(1)
    if (partial.length > 0 && requireAll) Deno.exit(2)
    Deno.exit(0)
}
