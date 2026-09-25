/**
 * @fileoverview #362's mutation battery — the Redis revocation pass is
 * bounded: a timing the driver cannot enforce refuses to boot, and a broken
 * enforcement guarantee is never silent.
 *
 * The decisions live in these homes (plan §5):
 * - `drivers/redis.ts`: the constructor's range guard and relation (N1–N8,
 *   N21–N24), the deadline's `inFlight` getter (N9), the pass's end site
 *   (N11, N13–N15), `close()` (N16), the first-registration arm (N17, N20),
 *   and `#passClock` (N18);
 * - `drivers/enforcement_deadline.ts`: the one-shot fire (N10), the
 *   success re-arm (N12), the arm-time `MISSED` (N19), the broker-clock
 *   check (N25–N27), the #369 fallback (N28) and the arm after a `SKEWED`
 *   line (N30); the pass chain's final handler is in `redis.ts` (N29).
 *
 * N30–N34 are not in the plan's table. N30 and N31 pin the architect's
 * ruling on the fix cycle: a decided line (`SKEWED`, an overdue `MISSED`) is
 * carried through `arm()` — written on a 0 ms timer, then the remaining time
 * armed — and only `close()` drops it (D7 (iv), D7 (v)). N32–N34 are review
 * findings: the first-registration gate's `#closing` half, the `'failed'`
 * default of an unrecorded outcome, and `Deno.unrefTimer`.
 *
 * `killedBy` strings end in a space, or in a closing parenthesis, where a
 * shorter witness id is a prefix of a longer one (`D4 ` vs `D4b`).
 *
 * Every row was proven LIVE by the harness run that recorded it: the mutant
 * ran and turned its named witness red (`KILLED`, attributed).
 *
 * ```bash
 * deno task mutate revocation_pass_bound_362
 * ```
 *
 * @module @lockness/realtime/tests/mutations/revocation_pass_bound_362
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const REDIS = new URL('../../drivers/redis.ts', import.meta.url)
const DEADLINE = new URL(
    '../../drivers/enforcement_deadline.ts',
    import.meta.url,
)
const SUITES = [
    new URL('../revocation_pass_bound_362.test.ts', import.meta.url).pathname,
]

const RELATION =
    '        if (this.reconcileIntervalMs * 2 > this.revocationTtlSeconds * 1000) {\n'
// Re-anchored for #384: the gate reads the end site's clean-pass condition,
// which `outcome === 'ok'` joined. N11, N13 and N15 keep their meaning over it.
const END_GATE = '                if (clean && !this.#closing) {\n'
const FIRST_GATE = '        if (first && !this.#closing) {\n'
const SKEW_TEST = '            readAt - previous >= this.#ttlMs / 1000\n'

const MUTATIONS: Mutation[] = [
    {
        label: 'N1 the relation check removed',
        file: REDIS,
        edits: [[RELATION, '        if (false) {\n']],
        killedBy: '#362 B1 ',
    },
    {
        label: 'N2 the factor dropped',
        file: REDIS,
        edits: [[
            RELATION,
            '        if (this.reconcileIntervalMs > this.revocationTtlSeconds * 1000) {\n',
        ]],
        killedBy: '#362 B1 ',
    },
    {
        label: 'N3 the relation made inclusive (>=)',
        file: REDIS,
        edits: [[
            RELATION,
            '        if (this.reconcileIntervalMs * 2 >= this.revocationTtlSeconds * 1000) {\n',
        ]],
        killedBy: '#362 B2 ',
    },
    {
        label: 'N4 * 1000 dropped from the TTL side',
        file: REDIS,
        edits: [[
            RELATION,
            '        if (this.reconcileIntervalMs * 2 > this.revocationTtlSeconds) {\n',
        ]],
        killedBy: '#362 B3 ',
    },
    {
        label: "N5 the interval's finiteness clause dropped",
        file: REDIS,
        edits: [[
            '            !Number.isFinite(this.reconcileIntervalMs) ||\n',
            '',
        ]],
        killedBy: '#362 B4 ',
    },
    {
        label: "N6 the interval's < 1 clause dropped",
        file: REDIS,
        edits: [['            this.reconcileIntervalMs < 1 ||\n', '']],
        killedBy: '#362 B4 ',
    },
    {
        label: "N7 the TTL's safe-integer clause dropped",
        file: REDIS,
        edits: [[
            '            !Number.isSafeInteger(this.revocationTtlSeconds) ||\n',
            '',
        ]],
        killedBy: '#362 B5 ',
    },
    {
        label: "N8 the TTL's < 1 clause dropped",
        file: REDIS,
        edits: [['            this.revocationTtlSeconds < 1 ||\n', '']],
        killedBy: '#362 B5 ',
    },
    {
        label: 'N9 the fire abandons the pass (frees the slot, arms the timer)',
        file: REDIS,
        edits: [[
            '            inFlight: () => this.#revocationPass,\n',
            '            inFlight: () => {\n' +
            '                const pass = this.#revocationPass\n' +
            '                this.#revocationPass = undefined\n' +
            '                this.#armRevocationReconcile()\n' +
            '                return pass\n' +
            '            },\n',
        ]],
        killedBy: '#362 D1 ',
    },
    {
        label: 'N10 the fire re-arms itself (a WARN per TTL)',
        file: DEADLINE,
        edits: [[
            '            this.#setTimer(delayMs, () => this.#write(this.#expired()))\n',
            '            this.#setTimer(delayMs, () => {\n' +
            '                this.#write(this.#expired())\n' +
            '                this.arm(this.#ttlMs)\n' +
            '            })\n',
        ]],
        killedBy: '#362 D1 ',
    },
    {
        label: 'N11 a failed pass also re-arms the deadline',
        file: REDIS,
        edits: [[
            END_GATE,
            "                if (outcome !== 'closed' && !this.#closing) {\n",
        ]],
        killedBy: '#362 D2 ',
    },
    {
        label: 'N12 passSucceeded ignored once the deadline has fired',
        file: DEADLINE,
        edits: [[
            '        const previous = this.#previousReadAt\n',
            '        if (this.#timer === undefined) return\n' +
            '        const previous = this.#previousReadAt\n',
        ]],
        killedBy: '#362 D2 ',
    },
    {
        label: 'N13 the end site never calls passSucceeded',
        file: REDIS,
        edits: [[
            END_GATE,
            '                if (clean && !this.#closing && false) {\n',
        ]],
        killedBy: '#362 D3 ',
    },
    {
        label: 'N14 the deadline anchored at the end of the pass',
        file: REDIS,
        edits: [[
            '                        startedAt,\n' +
            '                        endedAt,\n' +
            '                        this.#lastReadAt,\n',
            '                        endedAt,\n' +
            '                        endedAt,\n' +
            '                        this.#lastReadAt,\n',
        ]],
        killedBy: '#362 D4 (a)',
    },
    {
        label: "N15 the end site's #closing gate dropped",
        file: REDIS,
        edits: [[END_GATE, '                if (clean) {\n']],
        killedBy: '#362 D5 (i)',
    },
    {
        label: 'N16 close() does not clear the deadline',
        file: REDIS,
        edits: [['        this.#deadline.close()\n', '']],
        killedBy: '#362 D5 (ii)',
    },
    {
        label: 'N17 onRevocationReconcile does not arm the deadline',
        file: REDIS,
        edits: [[
            '            this.#deadline.arm(this.revocationTtlSeconds * 1000)\n',
            '',
        ]],
        killedBy: '#362 D1 ',
    },
    {
        label: 'N18 #passClock reads the epoch clock',
        file: REDIS,
        edits: [[
            '        return performance.now()\n',
            '        return Date.now()\n',
        ]],
        killedBy: '#362 D6 ',
    },
    {
        label: 'N19 an overdue arm decides at fire, consulting inFlight()',
        file: DEADLINE,
        edits: [[
            '        this.#unwritten.push(this.#missed())\n' +
            '        this.#setTimer(0, () => this.#flush())\n',
            '        this.#setTimer(0, () => this.#write(this.#expired()))\n',
        ]],
        killedBy: '#362 D4b ',
    },
    {
        label: 'N20 every registration re-arms the deadline',
        file: REDIS,
        edits: [[
            FIRST_GATE,
            '        if ((first || true) && !this.#closing) {\n',
        ]],
        killedBy: '#362 D5 (iv)',
    },
    {
        label: "N21 the TTL's safe-integer clause weakened to isFinite",
        file: REDIS,
        edits: [[
            '            !Number.isSafeInteger(this.revocationTtlSeconds) ||\n',
            '            !Number.isFinite(this.revocationTtlSeconds) ||\n',
        ]],
        killedBy: '#362 B6 ',
    },
    {
        label: "N22 the TTL's upper bound dropped",
        file: REDIS,
        edits: [[
            '            this.revocationTtlSeconds < 1 ||\n' +
            '            this.revocationTtlSeconds > maxRevocationTtlSeconds\n',
            '            this.revocationTtlSeconds < 1\n',
        ]],
        killedBy: '#362 B6 ',
    },
    {
        label: "N23 the TTL's upper bound off by one (>=)",
        file: REDIS,
        edits: [[
            '            this.revocationTtlSeconds > maxRevocationTtlSeconds\n',
            '            this.revocationTtlSeconds >= maxRevocationTtlSeconds\n',
        ]],
        killedBy: '#362 B6 ',
    },
    {
        label: "N24 the interval's < 1 weakened to <= 0",
        file: REDIS,
        edits: [[
            '            this.reconcileIntervalMs < 1 ||\n',
            '            this.reconcileIntervalMs <= 0 ||\n',
        ]],
        killedBy: '#362 B6 ',
    },
    {
        label: 'N25 the broker-clock check removed',
        file: DEADLINE,
        edits: [[
            SKEW_TEST,
            '            readAt - previous >= this.#ttlMs / 1000 && false\n',
        ]],
        killedBy: '#362 D7 (i)',
    },
    {
        label: 'N26 the broker-clock check made strict (>)',
        file: DEADLINE,
        edits: [[
            SKEW_TEST,
            '            readAt - previous > this.#ttlMs / 1000\n',
        ]],
        killedBy: '#362 D7 (i)',
    },
    {
        label: "N27 the broker-clock check's pending condition dropped",
        file: DEADLINE,
        edits: [['            this.#timer !== undefined &&\n', '']],
        killedBy: '#362 D7 (iii)',
    },
    {
        label: "N28 the fire's #369 fallback removed (a bare console.warn)",
        file: DEADLINE,
        edits: [[
            '        try {\n' +
            '            console.warn(text)\n' +
            '        } catch (failure) {\n' +
            '            writeMarkedFallback(REVOCATION_LOG_FAILED, text, {\n' +
            "                label: 'sink failure',\n" +
            '                error: failure,\n' +
            '            })\n' +
            '        }\n',
            '        console.warn(text)\n',
        ]],
        killedBy: '#362 D8 (i)',
    },
    {
        label: "N29 the pass chain's final rejection handler removed",
        file: REDIS,
        edits: [[
            '            })\n' +
            '            .catch((error: unknown) => {\n' +
            '                // #369: nothing escapes the pass chain. A rejection reaches\n' +
            '                // here only when a log sink itself threw (#349); the marker\n' +
            '                // is the fixed prefix, the rejection is rendered, and the\n' +
            '                // line never throws past itself either (#391).\n' +
            '                writeMarkedFallback(REVOCATION_LOG_FAILED, error)\n' +
            '            })\n',
            '            })\n',
        ]],
        killedBy: '#362 D8 (ii)',
    },
    {
        label: 'N30 a carried line is not followed by the remaining arm',
        file: DEADLINE,
        edits: [[
            '                this.arm(delayMs - (this.#now() - armedAt))\n',
            '',
        ]],
        killedBy: '#362 D7 (iv)',
    },
    {
        label: 'N31 the carry dropped: arm() erases a decided line',
        file: DEADLINE,
        edits: [[
            '        if (this.#unwritten.length > 0) {\n',
            '        this.#unwritten = []\n' +
            '        if (this.#unwritten.length > 0) {\n',
        ]],
        killedBy: '#362 D7 (v)',
    },
    {
        label: "N32 the first-registration gate's #closing half dropped",
        file: REDIS,
        edits: [[FIRST_GATE, '        if (first) {\n']],
        killedBy: '#362 D5 (iii)',
    },
    {
        label: "N33 an unrecorded outcome defaults to 'ok'",
        file: REDIS,
        edits: [[
            // Re-anchored for #360: the alias became `PassOutcome`, and the
            // sweep's start site has the same line at 12 spaces — which
            // contains this one — so the anchor carries the record line above.
            '        this.#revocationPass = pass\n' +
            "        let outcome: PassOutcome = 'failed'\n",
            '        this.#revocationPass = pass\n' +
            "        let outcome: PassOutcome = 'ok'\n",
        ]],
        killedBy: '#362 D8 (ii)',
    },
    {
        label: "N34 the deadline timer is not unref'd",
        file: DEADLINE,
        edits: [['        Deno.unrefTimer(id)\n', '']],
        killedBy: '#362 D9 ',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#362 — the revocation pass is bounded, and a broken ' +
                    'enforcement guarantee is never silent',
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
