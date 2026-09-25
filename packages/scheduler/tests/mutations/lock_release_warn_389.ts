/**
 * @fileoverview #389's mutation battery — a failed lock release is warned
 * about, not swallowed.
 *
 * The release runs in the run's `finally`, after the outcome is recorded, so
 * nothing the task reports depends on it: `failureCount` and `lastError` are
 * the same whether the release succeeds or throws. That is exactly why its
 * warning is the only thing that makes a failing lock store visible, and why a
 * regression to the old empty `catch` would land in silence — every other
 * assertion in the suite would stay green. These rows are what notice.
 *
 * Runs under the shared harness: green baseline before anything is mutated, an
 * atomic per-file lock, anchors matched exactly once, a non-compiling mutant
 * reported DEAD, and every kill attributed to the test that claims it.
 *
 * ```bash
 * deno run -A packages/scheduler/tests/mutations/lock_release_warn_389.ts
 * ```
 *
 * @module @lockness/scheduler/tests/mutations/lock_release_warn_389
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const SCHEDULER = new URL('../../scheduler.ts', import.meta.url)
const SUITES = [
    new URL('../distributed_lock.test.ts', import.meta.url).pathname,
]

const MUTATIONS: Mutation[] = [
    {
        // The defect #389 fixed: the catch around the release said nothing.
        label: 'the release warning is deleted — a failed release is ' +
            'swallowed again',
        file: SCHEDULER,
        edits: [[
            '                    this.#warn(\n' +
            "                        'Scheduled task lock release failed; the claim stands until its TTL expires.',",
            // `void` first: a line opening with `(` would continue the
            // destructuring call above it and never type-check.
            '                    void ((..._dropped: unknown[]) => {})(\n' +
            "                        'Scheduled task lock release failed; the claim stands until its TTL expires.',",
        ]],
        killedBy: 'a failed release does not mask the outcome, and is ' +
            'reported once',
    },
    {
        // The same defect one level down: with no reporter installed, the
        // three pre-#389 warnings were silent too.
        label: 'the console fallback is deleted — a scheduler with no ' +
            'reporter warns nobody',
        file: SCHEDULER,
        edits: [[
            'console.warn(`⚠️  ${message}`, fields)',
            'void [message, fields]',
        ]],
        killedBy: 'falls back to console.warn',
    },
    {
        // The warning names the error; it must never carry the error. A
        // driver error's stack or `cause` can hold a connection string.
        label: 'the raw rejection reaches the log line instead of its name',
        file: SCHEDULER,
        edits: [[
            '                            error: errorName,\n',
            '                            error,\n',
        ]],
        killedBy: 'a failed release does not mask the outcome, and is ' +
            'reported once',
    },
    {
        // Review finding: `String()` throws on a value with no usable
        // `toString`. Unguarded, that throw leaves the release catch from
        // inside `finally` and rejects a run that succeeded.
        label: 'the String() guard is removed — an unprintable rejection ' +
            'escapes the release catch',
        file: SCHEDULER,
        edits: [[
            '    let message: string\n' +
            '    try {\n' +
            '        message = String(caught)\n' +
            '    } catch (_unprintable) {\n' +
            '        // Not swallowed: the placeholder IS the report of this failure, and it\n' +
            '        // reaches the log line the caller is about to write.\n' +
            '        message = UNPRINTABLE\n' +
            '    }\n',
            '    const message = String(caught)\n',
        ]],
        killedBy: 'unprintable value is still contained and reported once',
    },
    {
        // Review finding: a reporter REPLACES the console. Without the
        // `return`, every warning is written twice — once to the
        // application's logger, once to stdout around it.
        label: "the reporter branch's return is deleted — the console " +
            'echoes every reported warning',
        file: SCHEDULER,
        edits: [[
            '            this.#reporter.warn(message, fields)\n' +
            '            return\n',
            '            this.#reporter.warn(message, fields)\n',
        ]],
        killedBy: 'a failed release does not mask the outcome, and is ' +
            'reported once',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#389 — the lock release is warned about, not swallowed',
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
