/**
 * @fileoverview #394's mutation battery — `report()`'s three-channel guard
 * (reporter, then console, then `Deno.stderr`) never lets a throw escape.
 *
 * `Scheduler#warn`, `TimerRegistry#warn`, and `task_runner.ts`'s `guard()` and
 * `report()` all go through `reporting.ts`'s `report()` now. Each of its three
 * channels is wrapped in its own `try`/`catch`; removing any one of them lets
 * a throwing channel escape past the last resort meant to contain it — an
 * unhandled rejection on the void'd cron path, or an uncaught exception on
 * `TimerRegistry.arm`'s synchronous clamp path. These rows are what notice.
 *
 * Runs under the shared harness: green baseline before anything is mutated, an
 * atomic per-file lock, anchors matched exactly once, a non-compiling mutant
 * reported DEAD, and every kill attributed to the test that claims it.
 *
 * ```bash
 * deno run -A packages/scheduler/tests/mutations/report_guard_394.ts
 * ```
 *
 * @module @lockness/scheduler/tests/mutations/report_guard_394
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const REPORTING = new URL('../../reporting.ts', import.meta.url)
const SUITES = [
    new URL('../reporting.test.ts', import.meta.url).pathname,
    new URL('../distributed_lock.test.ts', import.meta.url).pathname,
    new URL('../scheduler.test.ts', import.meta.url).pathname,
    new URL('../timer_registry.test.ts', import.meta.url).pathname,
    new URL('../task_runner.test.ts', import.meta.url).pathname,
]

const MUTATIONS: Mutation[] = [
    {
        // The reporter channel's try/catch is gone: a throwing reporter now
        // escapes report() instead of falling through to console.
        label: "the reporter's try/catch is deleted — a throwing reporter " +
            'escapes report()',
        file: REPORTING,
        edits: [[
            '    try {\n' +
            '        if (reporter) {\n' +
            '            reporter[level](message, fields)\n' +
            '            return\n' +
            '        }\n' +
            '    } catch {\n' +
            '        // The reporter threw: fall through to console.\n' +
            '    }\n',
            '    if (reporter) {\n' +
            '        reporter[level](message, fields)\n' +
            '        return\n' +
            '    }\n',
        ]],
        killedBy: 'a throwing reporter falls back to console',
    },
    {
        // The console channel's try/catch is gone: a throwing console now
        // escapes report() instead of falling through to Deno.stderr.
        label: "the console's try/catch is deleted — a throwing console " +
            'escapes report()',
        file: REPORTING,
        edits: [[
            '    try {\n' +
            '        console[level](`⚠️  ${message}`, fields)\n' +
            '        return\n' +
            '    } catch {\n' +
            '        // The console refused too: write past it.\n' +
            '    }\n',
            '    console[level](`⚠️  ${message}`, fields)\n' +
            '    return\n',
        ]],
        killedBy:
            'a throwing reporter AND a throwing console fall back to stderr',
    },
    {
        // The stderr channel's try/catch is gone — the last resort. A
        // throwing Deno.stderr.writeSync now escapes report() entirely,
        // reaching a caller that, on the cron path, has no handler left.
        label: 'the stderr try/catch is deleted — a throwing Deno.stderr ' +
            'escapes report()',
        file: REPORTING,
        edits: [[
            '    try {\n' +
            '        Deno.stderr.writeSync(\n' +
            '            new TextEncoder().encode(`${renderLine(message, fields)}\\n`),\n' +
            '        )\n' +
            '    } catch {\n' +
            '        // #394 THE LAST RESORT: the reporter, the console and stderr all\n' +
            '        // refused, so no channel is left to log this on, and a re-throw would\n' +
            '        // reach a caller that has none — an unhandled rejection on the cron\n' +
            "        // path, or an uncaught exception on TimerRegistry's synchronous clamp\n" +
            '        // path. Dropping one log line is the lesser harm.\n' +
            '    }\n',
            '    Deno.stderr.writeSync(\n' +
            '        new TextEncoder().encode(`${renderLine(message, fields)}\\n`),\n' +
            '    )\n',
        ]],
        killedBy:
            'reporter, console AND stderr all throwing drops the message without throwing',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                "#394 — report()'s three-channel guard never lets a throw escape",
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
