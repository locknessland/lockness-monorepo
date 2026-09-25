/**
 * @fileoverview #395's mutation battery — four log lines that no caller awaits
 * never turn a throwing sink into an unhandled rejection.
 *
 * Each row puts one site's direct `console.*` call back, the shape #395 was
 * filed against, one site at a time:
 *
 * - R1: `LapseRun.#invoke`'s WARN, unguarded — the run rejects, and nothing
 *   awaits it.
 * - R2: the manager's default `onPublishError` as a bare `console.error` —
 *   `broadcast` discards the publish promise.
 * - R3: the Redis control subscription's `.catch` as a bare `console.warn` —
 *   the promise is `void`ed.
 * - R4: the Redis heartbeat's WARN, unguarded — the interval discards the
 *   promise.
 *
 * The witness each row dies on — the assertion that fails, not only the test
 * (`escaping_sinks_395.test.ts`):
 *
 * - R1: E1, `no rejection reaches the runtime` (E2 dies on it too).
 * - R2: E3, `no rejection reaches the runtime` (E4 dies on `no synchronous
 *   throw`).
 * - R3: E5, `no rejection reaches the runtime`.
 * - R4: E6, `no rejection reaches the runtime`.
 *
 * Every row was proven LIVE before it was trusted: with the mutant applied,
 * the killing witness was run alone and the stack of the rejection it
 * reported was seen to pass through the row's mutated line.
 *
 * ```bash
 * deno run -A packages/realtime/tests/mutations/escaping_sinks_395.ts
 * ```
 *
 * @module @lockness/realtime/tests/mutations/escaping_sinks_395
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const LAPSE_RUN = new URL('../../drivers/lapse_run.ts', import.meta.url)
const MANAGER = new URL('../../manager.ts', import.meta.url)
const REDIS = new URL('../../drivers/redis.ts', import.meta.url)
const SUITES = [
    new URL('../escaping_sinks_395.test.ts', import.meta.url).pathname,
]

const MUTATIONS: Mutation[] = [
    {
        label: "R1 — LapseRun.#invoke's WARN back to a bare console.warn",
        file: LAPSE_RUN,
        edits: [[
            '            try {\n' +
            '                console.warn(\n' +
            '                    "realtime: re-asserting this instance\'s presence holds " +\n' +
            "                        'after a liveness lapse failed — the next successful ' +\n" +
            '                        `heartbeat retries: ${renderError(error)}`,\n' +
            '                )\n' +
            '            } catch (sink) {\n' +
            '                // #395: `trigger()` never awaits this run, so a throwing sink\n' +
            '                // would escape as an unhandled rejection. One marked line.\n' +
            '                writeMarkedFallback(LAPSE_RUN_LOG_FAILED, error, {\n' +
            "                    label: 'sink failure',\n" +
            '                    error: sink,\n' +
            '                })\n' +
            '            }\n',
            '            console.warn(\n' +
            '                "realtime: re-asserting this instance\'s presence holds " +\n' +
            "                    'after a liveness lapse failed — the next successful ' +\n" +
            '                    `heartbeat retries: ${renderError(error)}`,\n' +
            '            )\n',
        ]],
        // Witness: `no rejection reaches the runtime` — the run rejects.
        killedBy: '#395 E1 ',
    },
    {
        label: 'R2 — the default onPublishError back to a bare console.error',
        file: MANAGER,
        edits: [[
            '            ((error) => writeMarkedFallback(PUBLISH_FAILED, error))\n',
            '            ((error) =>\n' +
            '                console.error(`${PUBLISH_FAILED} ${renderError(error)}`))\n',
        ]],
        // Witness: `no rejection reaches the runtime` — the publish promise's
        // `.catch` handler throws, and nothing is after it.
        killedBy: '#395 E3 ',
    },
    {
        label:
            "R3 — the redis control subscription's catch back to a bare console.warn",
        file: REDIS,
        edits: [[
            '            ).catch((error: unknown) => {\n' +
            '                try {\n' +
            '                    console.warn(\n' +
            "                        'realtime: the control subscription could not be ' +\n" +
            '                            "issued — the driver\'s own retry is what restores " +\n' +
            '                            `it: ${renderError(error)}`,\n' +
            '                    )\n' +
            '                } catch (sink) {\n' +
            '                    // #395: this promise is `void`ed, so a throwing sink would\n' +
            '                    // escape as an unhandled rejection. One marked line.\n' +
            '                    writeMarkedFallback(CONTROL_SUBSCRIBE_LOG_FAILED, error, {\n' +
            "                        label: 'sink failure',\n" +
            '                        error: sink,\n' +
            '                    })\n' +
            '                }\n' +
            '            })\n',
            '            ).catch((error: unknown) =>\n' +
            '                console.warn(\n' +
            "                    'realtime: the control subscription could not be ' +\n" +
            '                        "issued — the driver\'s own retry is what restores " +\n' +
            '                        `it: ${renderError(error)}`,\n' +
            '                )\n' +
            '            )\n',
        ]],
        // Witness: `no rejection reaches the runtime` — the `.catch` handler
        // throws, and the promise is `void`ed.
        killedBy: '#395 E5 ',
    },
    {
        label: "R4 — the redis heartbeat's WARN back to a bare console.warn",
        file: REDIS,
        edits: [[
            '            try {\n' +
            '                console.warn(\n' +
            '                    `realtime: instance-liveness heartbeat failed: ${\n' +
            '                        renderError(failure.error)\n' +
            '                    }`,\n' +
            '                )\n' +
            '            } catch (sink) {\n' +
            '                // #395: the interval discards this promise, so a throwing sink\n' +
            '                // would escape as an unhandled rejection — and would skip the\n' +
            '                // lapse decision below. One marked line, then on.\n' +
            '                writeMarkedFallback(HEARTBEAT_LOG_FAILED, failure.error, {\n' +
            "                    label: 'sink failure',\n" +
            '                    error: sink,\n' +
            '                })\n' +
            '            }\n',
            '            console.warn(\n' +
            '                `realtime: instance-liveness heartbeat failed: ${\n' +
            '                    renderError(failure.error)\n' +
            '                }`,\n' +
            '            )\n',
        ]],
        // Witness: `no rejection reaches the runtime` — the interval's
        // heartbeat promise rejects, and nothing holds it.
        killedBy: '#395 E6 ',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#395 — no unawaited log line throws past itself',
                SUITES,
                MUTATIONS,
            ) >
                0
            ? 1
            : 0,
    )
}
