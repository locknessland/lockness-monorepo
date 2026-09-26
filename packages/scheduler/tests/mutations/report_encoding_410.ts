/**
 * @fileoverview #410's mutation battery — `report()`'s CR/LF encoding, and
 * who gets which half raw versus escaped.
 *
 * `report()` is the scheduler's one sink for a warning or an error (#394:
 * reporter, then console, then `Deno.stderr`). An unencoded `\r`/`\n` in
 * `message` or in a string-valued `fields` entry forges a second log line on
 * whichever channel actually receives it. These rows are what notice a
 * regression in that encoding, and in the one asymmetry the architect-expert
 * disposition requires: the reporter callback gets `message` encoded but
 * `fields` raw, because the application's own logger owns encoding for its
 * own sink.
 *
 * Runs under the shared harness: green baseline before anything is mutated, an
 * atomic per-file lock, anchors matched exactly once, a non-compiling mutant
 * reported DEAD, and every kill attributed to the test that claims it.
 *
 * ```bash
 * deno task mutate report_encoding_410
 * ```
 *
 * @module @lockness/scheduler/tests/mutations/report_encoding_410
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
        // The message encoding is gone — a CR/LF-bearing message now reaches
        // every channel (reporter, console, stderr) exactly as it arrived.
        label: 'the message encoding is deleted — a CR/LF in message reaches ' +
            'every channel unescaped',
        file: REPORTING,
        edits: [[
            '    message = escapeControlChars(message)\n',
            '',
        ]],
        killedBy: 'a CR/LF-bearing message is escaped before reaching console',
    },
    {
        // The shared fields encoding is gone — a CR/LF-bearing field value
        // now reaches console and stderr unescaped. Both channels read the one
        // reassigned `fields`, so this is one mutant, not two; the stderr
        // test fails on it too, and the console test is the one it is
        // attributed to.
        label: 'the field encoding is deleted — a CR/LF-bearing field ' +
            'reaches console unescaped',
        file: REPORTING,
        edits: [[
            '    fields = escapeStringFields(fields)\n',
            '',
        ]],
        killedBy:
            'a CR/LF-bearing field value is escaped before reaching console',
    },
    {
        // `fields` is encoded before it reaches the reporter, which is the
        // one thing #410's disposition says must NOT happen: the reporter
        // gets the escaped message but RAW, structured fields, because the
        // application's own logger owns encoding for its own sink.
        label: "the reporter's fields are encoded too — they should stay raw",
        file: REPORTING,
        edits: [[
            '        if (reporter) {\n' +
            '            reporter[level](message, fields)\n' +
            '            return\n' +
            '        }\n',
            '        if (reporter) {\n' +
            '            reporter[level](message, escapeStringFields(fields))\n' +
            '            return\n' +
            '        }\n',
        ]],
        killedBy:
            'the reporter receives the escaped message but raw, structured fields',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                "#410 — report()'s CR/LF encoding, and raw fields for the " +
                    'reporter',
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
