/**
 * @fileoverview #418's mutation battery — the 3 traced catch sites this issue
 * routed through `#guardedWarn` stay guarded.
 *
 * Each row puts one site's direct `console.warn` call back, the pre-#418
 * shape:
 *
 * - M1: `onMessage`'s `#deliver`, malformed-Redis-payload catch — unguarded,
 *   `FakeRedis`'s `PUBLISH` fan-out throws before it ever returns a promise.
 * - M2: `onControl`'s `#verifyAndDecode`, malformed-control-payload catch —
 *   the control-topic twin of M1, same unwrapped call site.
 * - M3: the ghost sweep's `#announceSwept`, departure-handler catch —
 *   unguarded, the throw rejects `#announceSwept`, which `#sweepPage`'s loop
 *   awaits with no `try` of its own, so the well-formed departure right after
 *   the throwing one is never reported.
 *
 * The witness each row dies on:
 *
 * - M1: T1, `no synchronous throw`.
 * - M2: T2, `no synchronous throw`.
 * - M3: T3, either `no rejection reaches the runtime` or the "still reported"
 *   assertion — the mutant breaks both halves T3 checks.
 *
 * Every row was proven LIVE before it was trusted: with the mutant applied,
 * the killing witness was run alone and the stack of the escape it reported
 * was seen to pass through the row's mutated line.
 *
 * ```bash
 * deno task mutate redis_warn_trace_418
 * ```
 *
 * @module @lockness/realtime/tests/mutations/redis_warn_trace_418
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const REDIS = new URL('../../drivers/redis.ts', import.meta.url)
const SUITES = [
    new URL('../redis_warn_trace_418.test.ts', import.meta.url).pathname,
]

const MUTATIONS: Mutation[] = [
    {
        label:
            "M1 — onMessage's #deliver: the malformed-payload catch back to a bare console.warn",
        file: REDIS,
        edits: [[
            '            } catch {\n' +
            "                // #418: `#deliver` IS the subscriber's message handler — no\n" +
            '                // caller here wraps it in a `try`, so a throwing sink would\n' +
            "                // escape into whatever the port's concrete implementation\n" +
            "                // does with a handler fault, never this driver's own\n" +
            "                // containment. One marked line, through #guardedWarn's shared\n" +
            '                // #369 shape.\n' +
            '                this.#guardedWarn(\n' +
            '                    MESSAGE_DECODE_LOG_FAILED,\n' +
            "                    'realtime: dropped a malformed Redis payload',\n" +
            '                )\n' +
            '                return // a malformed payload is dropped, never a throw\n' +
            '            }\n',
            '            } catch {\n' +
            "                console.warn('realtime: dropped a malformed Redis payload')\n" +
            '                return // a malformed payload is dropped, never a throw\n' +
            '            }\n',
        ]],
        // Witness: `no synchronous throw` — FakeRedis's PUBLISH fan-out
        // throws before `command()` ever returns a promise to await.
        killedBy: '#418 T1 ',
    },
    {
        label:
            'M2 — #verifyAndDecode: the malformed-control-payload catch back to a bare console.warn',
        file: REDIS,
        edits: [[
            '        } catch {\n' +
            "            // #418: `onControl`'s `deliver` closure calls this method\n" +
            "            // directly as the subscriber's handler — no caller here wraps it\n" +
            '            // in a `try`, so a throwing sink would escape the same way\n' +
            "            // `onMessage`'s `#deliver` does. One marked line, through\n" +
            "            // #guardedWarn's shared #369 shape.\n" +
            '            this.#guardedWarn(\n' +
            '                CONTROL_DECODE_LOG_FAILED,\n' +
            "                'realtime: dropped a malformed control payload',\n" +
            '            )\n' +
            '            return undefined\n' +
            '        }\n',
            '        } catch {\n' +
            "            console.warn('realtime: dropped a malformed control payload')\n" +
            '            return undefined\n' +
            '        }\n',
        ]],
        // Witness: `no synchronous throw` — the control-topic twin of M1.
        killedBy: '#418 T2 ',
    },
    {
        label:
            'M3 — #announceSwept: the departure-handler catch back to a bare console.warn',
        file: REDIS,
        edits: [[
            '        } catch {\n' +
            "            // DELIBERATELY drops the error (#348 plan §11, S2): a handler's\n" +
            '            // message may carry the entry, and the entry is application data\n' +
            '            // — so neither the member nor the error.\n' +
            '            //\n' +
            "            // #418: this `await` sits inside #sweepPage's loop over one dead\n" +
            "            // instance's owned slots, with nothing between here and there\n" +
            '            // that catches a throw — so an unguarded `console.warn` failing\n' +
            '            // would reject THIS call, skipping every remaining slot on the\n' +
            '            // page (and every later page), not just losing this one line. One\n' +
            "            // marked line, through #guardedWarn's shared #369 shape.\n" +
            '            this.#guardedWarn(\n' +
            '                SWEEP_DEPARTURE_LOG_FAILED,\n' +
            '                `realtime: the roster departure handler failed for a ` +\n' +
            '                    `member swept from ${\n' +
            '                        safeForLog(channel)\n' +
            '                    } — the release is committed and the sweep goes on`,\n' +
            '            )\n' +
            '        }\n',
            '        } catch {\n' +
            "            // DELIBERATELY drops the error (#348 plan §11, S2): a handler's\n" +
            '            // message may carry the entry, and the entry is application data\n' +
            '            // — so neither the member nor the error.\n' +
            '            console.warn(\n' +
            '                `realtime: the roster departure handler failed for a ` +\n' +
            '                    `member swept from ${\n' +
            '                        safeForLog(channel)\n' +
            '                    } — the release is committed and the sweep goes on`,\n' +
            '            )\n' +
            '        }\n',
        ]],
        // Witness: T3 — either `no rejection reaches the runtime` or the
        // "still reported" assertion; the mutant breaks both.
        killedBy: '#418 T3 ',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#418 — the 3 traced catch sites stay guarded',
                SUITES,
                MUTATIONS,
            ) >
                0
            ? 1
            : 0,
    )
}
