/**
 * @fileoverview #418's mutation battery — the 5 traced catch sites this issue
 * routed through `#guardedWarn` stay guarded (3 from the original trace, 2
 * more from the security review of the same issue).
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
 * - M4: `#sweepInstance`'s own "sweep … failed" WARN — unguarded, its throw
 *   escapes `#sweepInstance` and reaches `#reconcile`'s `for` loop, so a
 *   SECOND dead instance is never swept in the same pass.
 * - M5: `#reconcile`'s own outer catch — unguarded, its throw escapes
 *   `#reconcile()` and is caught only by the generic top-of-chain fallback
 *   (`SWEEP_LOG_FAILED`), losing this site's own, more specific marker.
 *
 * The witness each row dies on:
 *
 * - M1: T1, `no synchronous throw`.
 * - M2: T2, `no synchronous throw`.
 * - M3: T3, either `no rejection reaches the runtime` or the "still reported"
 *   assertion — the mutant breaks both halves T3 checks.
 * - M4: T4, either `no rejection reaches the runtime` or the "still swept"
 *   assertion.
 * - M5: T5, either `no rejection reaches the runtime` or the "OWN marker
 *   fires, not the generic fallback" assertion.
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
    {
        label:
            'M4 — #sweepInstance: the sweep-failed WARN back to a bare console.warn',
        file: REDIS,
        edits: [[
            '            // Counted BEFORE the WARN, so a sink that throws cannot skip it.\n' +
            '            if (this.#sweepPass) this.#sweepPass.failures++\n' +
            "            // #418 (security review): nothing between here and #reconcile's\n" +
            '            // `for` loop catches a throw — an unguarded WARN that ALSO threw\n' +
            '            // used to escape this method and abort the loop, skipping every\n' +
            '            // id still left in `ids` (#355 A3). One marked line, through\n' +
            "            // #guardedWarn's shared #369 shape.\n" +
            '            this.#guardedWarn(\n' +
            '                SWEEP_INSTANCE_LOG_FAILED,\n' +
            '                `realtime: sweep of dead instance ${id} failed after ` +\n' +
            '                    `${released} hold(s) released (${emptied} emptied): ` +\n' +
            '                    renderError(end.failed),\n' +
            '            )\n',
            '            // Counted BEFORE the WARN, so a sink that throws cannot skip it.\n' +
            '            if (this.#sweepPass) this.#sweepPass.failures++\n' +
            '            console.warn(\n' +
            '                `realtime: sweep of dead instance ${id} failed after ` +\n' +
            '                    `${released} hold(s) released (${emptied} emptied): ` +\n' +
            '                    renderError(end.failed),\n' +
            '            )\n',
        ]],
        // Witness: T4 — either `no rejection reaches the runtime` or the
        // "still swept" assertion; the mutant breaks both.
        killedBy: '#418 T4 ',
    },
    {
        label:
            "M5 — #reconcile: the outer catch's WARN back to a bare console.warn",
        file: REDIS,
        edits: [[
            '        } catch (error) {\n' +
            '            // #418 (security review): this catch wraps the whole pass, with\n' +
            '            // no per-id try inside the loop — so an unguarded WARN here that\n' +
            '            // ALSO throws would escape `#reconcile()` itself, skipping every\n' +
            '            // id still left in `ids` this pass (#355 A3). One marked line,\n' +
            "            // through #guardedWarn's shared #369 shape.\n" +
            '            this.#guardedWarn(\n' +
            '                RECONCILE_LOG_FAILED,\n' +
            '                `realtime: roster reconcile failed: ${renderError(error)}`,\n' +
            '            )\n' +
            "            return 'failed'\n" +
            '        }\n',
            '        } catch (error) {\n' +
            '            console.warn(\n' +
            '                `realtime: roster reconcile failed: ${renderError(error)}`,\n' +
            '            )\n' +
            "            return 'failed'\n" +
            '        }\n',
        ]],
        // Witness: T5 — either `no rejection reaches the runtime` or the
        // "OWN marker fires" assertion; the mutant breaks both (it also makes
        // the generic SWEEP_LOG_FAILED fallback fire instead).
        killedBy: '#418 T5 ',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#418 — the 5 traced catch sites stay guarded',
                SUITES,
                MUTATIONS,
            ) >
                0
            ? 1
            : 0,
    )
}
