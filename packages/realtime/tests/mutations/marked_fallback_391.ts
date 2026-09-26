/**
 * @fileoverview #391's mutation battery — no marked-fallback sink throws past
 * itself, even when every log channel refuses the line.
 *
 * Each row puts back one way the #391 containment can be wrong:
 *
 * - G1: `writeMarkedFallback`'s console guard removed — its `catch` turned into
 *   a `finally`, so a throwing `console.error` propagates (after the stderr
 *   write is still attempted, so ONLY the guard is gone).
 * - G2: the stderr guard removed — `Deno.stderr.writeSync` called bare, so a
 *   throwing stderr propagates out of the console's catch.
 * - S1–S7: one per sink, the inline, unguarded `console.error` put back in
 *   place of the helper — the shape #391 was filed against, one site at a
 *   time. Where the site's file no longer imports `renderError`, the row adds
 *   the import back too, so the mutant type-checks and a test actually runs.
 *
 * The witness each row dies on — the assertion that fails, not only the test:
 *
 * - G1: `#391 H2`, the throwing console — the helper itself throws.
 * - G2: `#391 H3`, console and stderr both throwing — the helper throws.
 * - S1–S7: `no rejection reaches the runtime` in the sink table's row of the
 *   same number, except S6, the deadline, whose sink runs in a timer callback
 *   and dies on `no synchronous throw` (FakeTime's `tickAsync` re-throws it).
 *
 * Each is named again on its row below.
 *
 * **S3 now `SURVIVED*` (#383, 2026-09-26).** Item 2's `#warnReconcileFailed`
 * self-guards `#runRevocationReconcile`'s own WARN, so nothing inside it can
 * reject the promise past the outer `.catch` any more — S3's fixture (the
 * handler throws, every channel throws) no longer reaches that `.catch` at
 * all. Recorded on the row, not silently dropped.
 *
 * Every row was proven LIVE before it was trusted: with the mutant applied,
 * the killing witness was run alone and the stack of the error it reported
 * was seen to pass through the row's mutated line. A row whose line never
 * runs reports a kill it did not cause.
 *
 * Runs under the shared harness: green baseline before anything is mutated, an
 * atomic per-file lock, anchors matched exactly once (a stale anchor reports
 * the row DEAD, never a silent survival), a non-compiling mutant reported DEAD,
 * and every kill attributed to the test that claims it.
 *
 * ```bash
 * deno run -A packages/realtime/tests/mutations/marked_fallback_391.ts
 * ```
 *
 * @module @lockness/realtime/tests/mutations/marked_fallback_391
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const HELPER = new URL('../../marked_fallback.ts', import.meta.url)
const WEBSOCKET = new URL('../../websocket.ts', import.meta.url)
const REDIS = new URL('../../drivers/redis.ts', import.meta.url)
const DEADLINE = new URL(
    '../../drivers/enforcement_deadline.ts',
    import.meta.url,
)
const MANAGER = new URL('../../manager.ts', import.meta.url)
const SUITES = [
    new URL('../marked_fallback_391.test.ts', import.meta.url).pathname,
    new URL('../marked_fallback_sinks_391.test.ts', import.meta.url).pathname,
]

/** The helper's import, where a row re-adds `renderError` beside it. */
const HELPER_IMPORT = (from: string) =>
    `import { writeMarkedFallback } from '${from}'\n`
const WITH_RENDER = (from: string) =>
    "import { renderError } from '@lockness/contract'\n" + HELPER_IMPORT(from)

const MUTATIONS: Mutation[] = [
    {
        label: "G1 — the helper's console guard removed (catch → finally)",
        file: HELPER,
        edits: [[
            '    } catch {\n' +
            '        // The console refused the ERROR line: write it past the console.\n',
            '    } finally {\n' +
            '        // The console refused the ERROR line: write it past the console.\n',
        ]],
        // Witness: H2 — a throwing console.error escapes the helper.
        killedBy: '#391 H2 (marker and subject)',
    },
    {
        label: "G2 — the helper's stderr guard removed (a bare writeSync)",
        file: HELPER,
        edits: [[
            '        try {\n' +
            '            Deno.stderr.writeSync(new TextEncoder().encode(`${line}\\n`))\n' +
            '        } catch {\n',
            '        Deno.stderr.writeSync(new TextEncoder().encode(`${line}\\n`))\n' +
            '        {\n',
        ]],
        // Witness: H3 — a throwing stderr escapes the helper.
        killedBy: '#391 H3 (marker and subject)',
    },
    {
        label: "S1 — websocket's #369 marked line back to a bare console.error",
        file: WEBSOCKET,
        edits: [
            [
                HELPER_IMPORT('./marked_fallback.ts'),
                WITH_RENDER('./marked_fallback.ts'),
            ],
            [
                '                writeMarkedFallback(HOOK_FAILED_TOO, error, {\n' +
                "                    label: 'hook failure',\n" +
                '                    error: failure,\n' +
                '                })\n',
                '                console.error(\n' +
                '                    `${HOOK_FAILED_TOO} ${renderError(error)}` +\n' +
                '                        `; hook failure: ${renderError(failure)}`,\n' +
                '                )\n',
            ],
        ],
        // Witness: `no rejection reaches the runtime` — reportError rejects.
        killedBy: '#391 S1 ',
    },
    {
        label: "S2 — websocket's default line back to a bare console.error",
        file: WEBSOCKET,
        edits: [
            [
                HELPER_IMPORT('./marked_fallback.ts'),
                WITH_RENDER('./marked_fallback.ts'),
            ],
            [
                '        writeMarkedFallback(UNHANDLED_WEBSOCKET_ERROR, error)\n',
                '        console.error(`${UNHANDLED_WEBSOCKET_ERROR} ${renderError(error)}`)\n',
            ],
        ],
        // Witness: `no rejection reaches the runtime` — reportError rejects.
        killedBy: '#391 S2 ',
    },
    {
        label:
            "S3 — redis revocation chain's last catch back to a bare console.error",
        file: REDIS,
        edits: [[
            '                writeMarkedFallback(REVOCATION_LOG_FAILED, error)\n',
            '                console.error(`${REVOCATION_LOG_FAILED} ${renderError(error)}`)\n',
        ]],
        // Witness: `no rejection reaches the runtime` — the chain's .catch
        // handler throws, and nothing is after it.
        killedBy: '#391 S3 ',
        expectSurvival:
            'SURVIVES since #383 item 2: #warnReconcileFailed self-guards ' +
            "#runRevocationReconcile's own WARN (S3's fixture is exactly a " +
            'thrown handler with every channel throwing), so nothing inside ' +
            'it can reject the promise past this outer .catch any more — ' +
            'true defence-in-depth now, unreachable from this suite.',
    },
    {
        label:
            "S4 — redis sweep chain's last catch back to a bare console.error",
        file: REDIS,
        edits: [[
            '                    writeMarkedFallback(SWEEP_LOG_FAILED, error)\n',
            '                    console.error(`${SWEEP_LOG_FAILED} ${renderError(error)}`)\n',
        ]],
        // Witness: `no rejection reaches the runtime`.
        killedBy: '#391 S4 ',
    },
    {
        label:
            "S5 — redis #guardedWarn's marked fallback back to a bare console.error",
        // Re-anchored for #409: #warnPassSample's own writeMarkedFallback
        // call moved into #guardedWarn, the one helper every self-guarded
        // WARN in the file now shares — so this mutates the shared call
        // itself, using #guardedWarn's own parameter names.
        file: REDIS,
        edits: [[
            '            writeMarkedFallback(marker, subject, {\n' +
            "                label: 'sink failure',\n" +
            '                error: sink,\n' +
            '            })\n',
            '            console.error(\n' +
            '                `${marker} ${renderError(subject)}; ` +\n' +
            '                    `sink failure: ${renderError(sink)}`,\n' +
            '            )\n',
        ]],
        // Witness: `no rejection reaches the runtime` — the rejection handler
        // on the handler's promise throws, and nothing is after it.
        killedBy: '#391 S5 ',
    },
    {
        label: "S6 — the deadline's #write back to a bare console.error",
        file: DEADLINE,
        edits: [
            [
                HELPER_IMPORT('../marked_fallback.ts'),
                WITH_RENDER('../marked_fallback.ts'),
            ],
            [
                '            writeMarkedFallback(REVOCATION_LOG_FAILED, text, {\n' +
                "                label: 'sink failure',\n" +
                '                error: failure,\n' +
                '            })\n',
                '            console.error(\n' +
                '                `${REVOCATION_LOG_FAILED} ${renderError(text)}; ` +\n' +
                '                    `sink failure: ${renderError(failure)}`,\n' +
                '            )\n',
            ],
        ],
        // Witness: `no synchronous throw` — the timer callback throws, and
        // FakeTime's tickAsync re-throws it.
        killedBy: '#391 S6 ',
    },
    {
        label:
            "S7 — the manager's #dispatchRevocation back to a bare console.error",
        file: MANAGER,
        edits: [[
            '            writeMarkedFallback(REVOCATION_APPLY_LOG_FAILED, error)\n',
            '            console.error(\n' +
            '                `${REVOCATION_APPLY_LOG_FAILED} ${renderError(error)}`,\n' +
            '            )\n',
        ]],
        // Witness: `no rejection reaches the runtime` — the apply's .catch
        // handler throws, and nothing is after it.
        killedBy: '#391 S7 ',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#391 — no marked-fallback sink throws past itself',
                SUITES,
                MUTATIONS,
            ) >
                0
            ? 1
            : 0,
    )
}
