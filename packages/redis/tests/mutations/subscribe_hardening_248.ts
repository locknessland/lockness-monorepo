/**
 * @fileoverview #248's mutation battery (#286, #287, #296), runnable.
 *
 * A table in a comment is a claim; this is what checks it. Every row asserts
 * its anchor matches **exactly once**, writes, re-reads to prove the file
 * changed, and only then reads the suite summary — a mutation that never
 * executed reads as a result, and this repo has recorded that happening.
 *
 * ```bash
 * deno run -A packages/redis/tests/mutations/subscribe_hardening_248.ts
 * # add LOCKNESS_REDIS_INTEGRATION=1 LOCKNESS_REDIS_PORT=<port> for the
 * # #296 rows, which need a real broker: the defect is a PROCESS EXIT and no
 * # in-process double can reproduce one.
 * ```
 *
 * Exit code is the number of **unexpected** survivors. Rows marked
 * `expectSurvival` are guards with no witness, recorded rather than hidden —
 * see the notes on each.
 *
 * @module @lockness/redis/tests/mutations/subscribe_hardening_248
 */

/**
 * UNRESOLVED AS OF THE #305 MIGRATION — four rows, and the battery exits
 * non-zero because of them. That is deliberate: a red instrument that says
 * exactly what is wrong beats a green one that lies, and relabelling a row to
 * whatever test happens to fail is the thing `killedBy` exists to prevent.
 *
 * Migrating this battery surfaced them; before it, every one reported KILLED.
 *
 * 1. `#287 the promise is never paired with its socket` — killed by roughly
 *    twenty tests across the client, connection and subscriber suites, and NOT
 *    by `#287: discard of a STALE socket does not cancel an in-flight dial`,
 *    which is the control written for it. The mutation is so broad that
 *    everything fails, which is not the same as being covered: the specific
 *    claim has no witness.
 *
 * 2/3. `#296 the handler call is unguarded again` and `#296 an ASYNC handler
 *    rejection escapes containment` — killed with `(none named)`. Removing
 *    containment lets the fault escape and take the test PROCESS down, so the
 *    run dies before any test name is printed. The harness reads an uncaught
 *    error as a kill, correctly, but nothing attributes it. Pinning these needs
 *    a control that survives the crash.
 *
 * 4. `#296 the pattern is logged unencoded` — NOT STABLE. It reported
 *    MISATTRIBUTED (killed by `#299: a peer answering one command per cycle
 *    cannot pin the ceiling`) on one run and SURVIVED on the next, with no
 *    change in between; `#286 no rebase on a generation change` flipped the
 *    same way. Two identical runs, two verdicts — so some `#299` control in
 *    this directory is timing-dependent, and any row it happens to kill is
 *    recorded by a coin flip. That is a defect in the suite, not in the rows,
 *    and it has to be fixed before either row's verdict means anything.
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const SUB = new URL('../../subscriber.ts', import.meta.url)
const RESP = new URL('../../resp.ts', import.meta.url)
const CONN = new URL('../../connection.ts', import.meta.url)
const TESTS = new URL('../subscriber.test.ts', import.meta.url)
const SUITES = [new URL('../', import.meta.url).pathname]

/** One mutation, and what it is expected to prove. */
const MUTATIONS: Mutation[] = [
    // ── #287: the single-flight guard ──────────────────────────────────────
    {
        label: '#287 discard clears the dial unconditionally (the defect)',
        file: CONN,
        edits: [[
            'if (this.pending?.conn === conn) this.pending = null',
            'this.pending = null',
        ]],
        killedBy: 'discard of a STALE socket does not cancel an in-flight dial',
    },
    {
        label: '#287 the promise is never paired with its socket',
        file: CONN,
        edits: [[
            'if (this.pending) this.pending.conn = conn',
            'if (false) this.pending!.conn = conn',
        ]],
        killedBy: 'discard of a STALE socket does not cancel an in-flight dial',
    },
    // ── #286: the write deadline ───────────────────────────────────────────
    {
        label: '#286 the write deadline is not passed to writeFrame',
        file: SUB,
        edits: [[
            'return writeFrame(conn, frame, this.#writeDeadlineMs)',
            'return writeFrame(conn, frame)',
        ]],
        killedBy: 'a PSUBSCRIBE write that never settles fails the activation',
    },
    {
        label: '#286 the ceiling is removed (raw liveness window)',
        file: SUB,
        edits: [[
            'this.#writeDeadlineMs = Math.min(\n            this.#livenessMs,\n            WRITE_STALL_CEILING_MS,\n        )',
            'this.#writeDeadlineMs = this.#livenessMs',
        ]],
        killedBy: 'the write budget is CAPPED, not the liveness window raw',
    },
    {
        label: '#286 the deadline is per-write rather than per-frame',
        file: RESP,
        edits: [[
            'const remaining = deadline - Date.now()',
            'const remaining = timeoutMs',
        ]],
        killedBy: '#286: the deadline is per FRAME, not per write',
    },
    {
        label: '#286 writeFrame accepts a nonsense deadline',
        file: RESP,
        edits: [[
            'if (\n        timeoutMs !== undefined &&\n        (!Number.isFinite(timeoutMs) || timeoutMs <= 0)\n    ) {',
            'if (false) {',
        ]],
        killedBy: '#286: writeFrame refuses a nonsense deadline',
    },
    // ── #286: the write chain ──────────────────────────────────────────────
    {
        label:
            '#286 no in-closure generation check (a queued write reaches a dead socket)',
        file: SUB,
        edits: [[
            'if (this.#writeChainConn !== conn) {\n                throw new Error(',
            'if (false) {\n                throw new Error(',
        ]],
        killedBy:
            'a write queued against a socket that is then discarded REJECTS',
    },
    {
        label: '#286 no rebase on a generation change',
        file: SUB,
        edits: [[
            'if (this.#writeChainConn !== conn) {\n            this.#writeChain = Promise.resolve()\n            this.#writeChainConn = conn\n        }',
            'this.#writeChainConn = conn',
        ]],
        killedBy:
            'a write queued against a socket that is then discarded REJECTS',
        expectSurvival:
            'Redundant with the conditional clear in `#discardSocket`, given ' +
            'that every current path discards a socket before replacing it — ' +
            'so no reachable sequence distinguishes them. Kept because that ' +
            'is a property of the CALLERS, not of this method, and the file ' +
            'already records the cost of depending on it: the `#keepaliveConn` ' +
            'comment describes the same assumption holding until it did not.',
    },
    {
        label: '#286 the discard clear is made unconditional',
        file: SUB,
        edits: [[
            'if (this.#writeChainConn === conn) {\n            this.#writeChain = Promise.resolve()\n            this.#writeChainConn = null\n        }',
            'this.#writeChain = Promise.resolve()\n        this.#writeChainConn = null',
        ]],
        killedBy: 'an idle socket is NOT torn down',
        expectSurvival:
            'Reaching it needs a STALE discard while a newer generation is ' +
            'live, which needs two generations plus a late-firing deadline — ' +
            'constructible in principle (the plan audit wrote the sequence ' +
            'out) and not constructed here. This is the highest-value ' +
            'uncovered guard in the branch and it is named as such rather ' +
            'than left to look covered.',
    },
    // ── #286: the keepalive's discard obligation ───────────────────────────
    {
        label: '#286 the keepalive no longer discards and schedules',
        file: SUB,
        edits: [[
            "if (error instanceof RespFramingError) {\n                    this.#discardSocket(conn)\n                    this.#scheduleRetry(true, error, 'keepalive write stalled')\n                }",
            'if (false) {\n                    this.#discardSocket(conn)\n                }',
        ]],
        killedBy: 'a keepalive write that times out DISCARDS the socket',
    },
    // ── #287: the strict parser ────────────────────────────────────────────
    {
        label: '#287 length prefixes go back to Number()',
        file: RESP,
        edits: [[
            "function parseLength(line: string): number | null {\n    if (line === '-1') return -1\n    if (!/^[0-9]+$/.test(line)) return null",
            "function parseLength(line: string): number | null {\n    if (line === '-1') return -1\n    if (false) return null",
        ]],
        killedBy:
            '#287: a length prefix is decimal digits or -1, and nothing else',
    },
    {
        label: '#287 the bulk terminator is consumed without being checked',
        file: RESP,
        edits: [[
            'if (terminator[0] !== 0x0d || terminator[1] !== 0x0a) {',
            'if (false) {',
        ]],
        killedBy:
            '#287: a bulk body must be followed by CRLF, not merely two bytes',
    },
    {
        label:
            '#297 the legs stop sharing one budget (read gets its own window)',
        file: CONN,
        edits: [[
            'const forRead = remaining(budget)!',
            'const forRead = READ_TIMEOUT_MS',
        ]],
        killedBy:
            'the write consumes the shared budget, leaving the read the remainder',
    },
    {
        label: '#297 the post-write budget guard removed',
        file: CONN,
        edits: [['    if (forRead <= 0) {', '    if (false) {']],
        killedBy:
            'the write consumes the shared budget, leaving the read the remainder',
        expectSurvival:
            'Near-unreachable by construction, and that is why it is recorded ' +
            'rather than tested: `writeFrame` is handed exactly the remaining ' +
            'budget, so a write that consumes all of it raises its own timeout ' +
            'first. The guard fires only if a write returns at the same instant ' +
            'its deadline expires — a race, not a scenario. Kept as a ' +
            'belt-and-braces check against ever handing `readReply` a ' +
            'non-positive timeout. An earlier test claimed to cover it and ' +
            'failed, which is how the unreachability was found.',
    },
    // ── #296: containment ──────────────────────────────────────────────────
    {
        label: '#296 the handler call is unguarded again (needs a live broker)',
        file: SUB,
        edits: [[
            '} catch (error) {\n            this.#reportHandlerFault(pattern.value, error)\n        }',
            '} catch (error) {\n            throw error\n        }',
        ]],
        killedBy:
            'a SYNCHRONOUS handler throw is contained, without a live broker',
    },
    {
        label: '#296 the pattern is logged unencoded (needs a live broker)',
        file: SUB,
        edits: [[
            'a handler for ${safeForLog(pattern)} threw',
            'a handler for ${pattern} threw',
        ]],
        killedBy:
            'a SYNCHRONOUS handler throw is contained, without a live broker',
    },
    {
        label: '#296 an ASYNC handler rejection escapes containment',
        file: SUB,
        edits: [[
            'Promise.resolve(result).catch((error: unknown) =>\n                    this.#reportHandlerFault(pattern.value, error)\n                )',
            'void result',
        ]],
        killedBy: 'an ASYNC handler rejection is contained too',
    },
    {
        label: '#287 the warn helper stops restoring on scope exit',
        file: TESTS,
        edits: [[
            'return { messages, [Symbol.dispose]: () => void (console.warn = real) }',
            'return { messages, [Symbol.dispose]: () => {} }',
        ]],
        killedBy:
            'a captured console.warn is restored even when the body throws',
    },
    {
        label: '#286 the zero-progress stall is a bare Error again',
        file: RESP,
        edits: [[
            'throw new RespFramingError(\n                `Redis write stalled after ${offset} bytes`,\n            )',
            'throw new Error(\n                `Redis write stalled after ${offset} bytes`,\n            )',
        ]],
        killedBy: 'the ZERO-PROGRESS write error names no total either',
    },
    {
        label: '#296 the per-generation fault counter never resets',
        file: SUB,
        edits: [[
            '        this.#handlerFaults.clear()',
            '        // reset removed',
        ]],
        killedBy:
            'a SYNCHRONOUS handler throw is contained, without a live broker',
        expectSurvival:
            'Reaching it needs a reconnect plus repeated throws on both ' +
            'generations. It degrades reporting only — a suppressed count ' +
            'rather than a dropped message — which is why it is the one row ' +
            'here left uncovered on purpose rather than for want of a fixture.',
    },
]

/** What a run of the suite under a mutation actually told us. */
type Outcome = 'killed' | 'survived' | 'did-not-compile'

if (import.meta.main) {
    Deno.exit(
        await runBattery('#248 — subscribe hardening', SUITES, MUTATIONS) > 0
            ? 1
            : 0,
    )
}
