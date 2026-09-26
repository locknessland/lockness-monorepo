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
// #394 moved `#warn`'s own two-channel fallback (reporter, else console) into
// the shared `report()` in `reporting.ts` — see `report_guard_394.ts`. Rows 2
// and 6 below repair their anchors to that new location rather than being
// deleted: the property each proves (console still fires with no reporter;
// a successful reporter is not ALSO echoed to console) is unchanged, only
// where the code lives moved.
const REPORTING = new URL('../../reporting.ts', import.meta.url)
// #398 moved the hostile-input normalisation itself (what used to be
// scheduler.ts's private `flatten`) into `errors.ts`'s `normalizeError`, so
// scheduler.ts, task_runner.ts and this one helper stop keeping three copies
// of the same `caught instanceof Error` pattern. Rows 4 and 5 below repair
// their anchors to that new location and new shape (the `instanceof`/`String()`
// check is now behind a `toError()` call) rather than being deleted: each still
// proves the same property — a hostile rejection cannot escape the guard — just
// reshaped for where the code lives now.
const ERRORS = new URL('../../errors.ts', import.meta.url)
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
        //
        // #394 re-anchor: this lived in scheduler.ts's own `#warn` as
        // `console.warn(...)`; it is now `console[level](...)` inside the
        // shared `report()`, reached by all four guarded call sites, not
        // only this one. The property is the same — console still fires
        // when there is no reporter to prefer.
        label: 'the console fallback is deleted — a scheduler with no ' +
            'reporter warns nobody',
        file: REPORTING,
        edits: [[
            '        console[level](`⚠️  ${message}`, fields)\n' +
            '        return\n',
            '        void [level, message, fields]\n',
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
        // `toString`, and a revoked Proxy throws on its own `instanceof`
        // check — both now live inside `toError()`. Unguarded, either throw
        // leaves the release catch from inside `finally` and rejects a run
        // that succeeded.
        //
        // #398 re-anchor: this lived in scheduler.ts's own `flatten` as an
        // inline `if (!(caught instanceof Error)) return { … String(caught) }`;
        // it is now the `toError(caught)` call inside `errors.ts`'s
        // `normalizeError`. Same property, moved with the code — the whole
        // function is the anchor, so the mutant's braces stay balanced.
        label: 'the toError() call is moved out of the try — an ' +
            'unprintable or hostile rejection escapes the guard',
        file: ERRORS,
        edits: [[
            'export function normalizeError(\n' +
            '    caught: unknown,\n' +
            '): { name: string; message: string } {\n' +
            '    try {\n' +
            '        const error = toError(caught)\n' +
            '        const { name, message } = error\n' +
            "        if (typeof name === 'string' && typeof message === 'string') {\n" +
            '            return { name, message }\n' +
            '        }\n' +
            "        return { name: 'Error', message: UNPRINTABLE }\n" +
            '    } catch (_hostile) {\n' +
            '        // Not swallowed: the placeholder IS the report of this failure, and it\n' +
            '        // reaches the log line the caller is about to write.\n' +
            "        return { name: 'Error', message: UNPRINTABLE }\n" +
            '    }\n' +
            '}\n',
            'export function normalizeError(\n' +
            '    caught: unknown,\n' +
            '): { name: string; message: string } {\n' +
            '    const error = toError(caught)\n' +
            '    try {\n' +
            '        const { name, message } = error\n' +
            "        if (typeof name === 'string' && typeof message === 'string') {\n" +
            '            return { name, message }\n' +
            '        }\n' +
            "        return { name: 'Error', message: UNPRINTABLE }\n" +
            '    } catch (_hostile) {\n' +
            "        return { name: 'Error', message: UNPRINTABLE }\n" +
            '    }\n' +
            '}\n',
        ]],
        killedBy: 'unprintable value is still contained and reported once',
    },
    {
        // Second review finding: guarding the `toError()` call alone was not
        // total. An Error's `name` and `message` may be throwing getters, and
        // reading them outside the `try` lets that throw leave `finally` — on
        // the cron path, an unhandled rejection that kills the process.
        //
        // #398 re-anchor: this lived in scheduler.ts's own `flatten` as the
        // bare `const { name, message } = caught` destructure; it is now the
        // equivalent destructure of `toError()`'s result inside `errors.ts`'s
        // `normalizeError`. Same property, moved with the code — the whole
        // function is the anchor, so the mutant's braces stay balanced.
        label: 'the name/message reads are moved out of the try — a ' +
            'throwing getter escapes the guard',
        file: ERRORS,
        edits: [[
            'export function normalizeError(\n' +
            '    caught: unknown,\n' +
            '): { name: string; message: string } {\n' +
            '    try {\n' +
            '        const error = toError(caught)\n' +
            '        const { name, message } = error\n' +
            "        if (typeof name === 'string' && typeof message === 'string') {\n" +
            '            return { name, message }\n' +
            '        }\n' +
            "        return { name: 'Error', message: UNPRINTABLE }\n" +
            '    } catch (_hostile) {\n' +
            '        // Not swallowed: the placeholder IS the report of this failure, and it\n' +
            '        // reaches the log line the caller is about to write.\n' +
            "        return { name: 'Error', message: UNPRINTABLE }\n" +
            '    }\n' +
            '}\n',
            'export function normalizeError(\n' +
            '    caught: unknown,\n' +
            '): { name: string; message: string } {\n' +
            '    let error: Error\n' +
            '    try {\n' +
            '        error = toError(caught)\n' +
            '    } catch (_hostile) {\n' +
            "        return { name: 'Error', message: UNPRINTABLE }\n" +
            '    }\n' +
            '    const { name, message } = error\n' +
            "    if (typeof name === 'string' && typeof message === 'string') {\n" +
            '        return { name, message }\n' +
            '    }\n' +
            "    return { name: 'Error', message: UNPRINTABLE }\n" +
            '}\n',
        ]],
        killedBy: 'a hostile value is contained and reported once',
    },
    {
        // Review finding: a reporter REPLACES the console. Without the
        // `return`, every warning is written twice — once to the
        // application's logger, once to stdout around it.
        //
        // #394 re-anchor: this lived in scheduler.ts as
        // `this.#reporter.warn(...)`; it is now `reporter[level](...)`
        // inside the shared `report()`. Same property: a reporter that
        // succeeds is not ALSO echoed to console.
        label: "the reporter branch's return is deleted — the console " +
            'echoes every reported warning',
        file: REPORTING,
        edits: [[
            '            reporter[level](message, fields)\n' +
            '            return\n',
            '            reporter[level](message, fields)\n',
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
