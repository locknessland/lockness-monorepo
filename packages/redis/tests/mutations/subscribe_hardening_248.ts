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
 * EVERY ROW RESOLVED as of #319. This battery carried one deliberate red for a
 * long time, and the reason it was kept is the reason it can now be closed
 * honestly: a red instrument that says exactly what is wrong beats a green one
 * that lies, and relabelling a row to whatever test happens to fail is
 * precisely what `killedBy` exists to prevent.
 *
 * Migrating this battery to the shared harness (#305) surfaced nine
 * misattributions. Before the migration every one of them reported KILLED.
 *
 * CLOSED BY A NEW WITNESS, not by a relabel — `#287 the promise is never
 * paired with its socket`. It was killed by roughly twenty tests across the
 * client, connection and subscriber suites and NOT by `#287: discard of a
 * STALE socket does not cancel an in-flight dial`, the control written for it.
 * The row was held open on the grounds that a mutation broad enough for
 * everything to fail is not the same as a mutation that is covered.
 *
 * That was right, and it also pointed at the wrong direction. The old control
 * proves the guard is not too BROAD — an unrelated discard must not cancel a
 * live dial. This mutation makes it too NARROW, so that control passes: with
 * `pending.conn` stuck at `null` the stale discard compares `null === stale`,
 * declines to cancel, and every assertion is satisfied for the wrong reason.
 *
 * What the mutation actually breaks had no test at all. `pending` is never
 * cleared on success, so without the pairing `discard` cannot recognise the
 * socket as its own dial's, the memo outlives its own socket, and every later
 * `connect()` re-awaits a settled promise holding a CLOSED socket — the
 * connection never recovers. `#287: discarding the socket a dial PRODUCED
 * frees that dial` (`tests/connection.test.ts`) is that witness, verified RED
 * under this row's mutation and green on `main`, with the old control passing
 * in the same run.
 *
 * **A control written for a guard tests ONE direction of it.** This row sat
 * open because the missing test was the mirror of the one that existed, and
 * nothing in the record said which direction the existing control covered.
 *
 * RESOLVED EARLIER, recorded because the reasoning is worth more than the
 * outcome:
 *
 * - Five rows named the wrong test and were retargeted to the on-point control
 *   that actually fires (`#286: the deadline is per FRAME, not per write` and
 *   siblings). A wrong guess at the killer is not a coverage gap.
 *
 * - `#296 the handler call is unguarded again` and `#296 an ASYNC handler
 *   rejection escapes containment` kill by taking the test FILE down: removing
 *   containment lets the fault escape the read loop, and Deno then reports
 *   `<file> (uncaught error)` with no `... FAILED` line anywhere. The harness
 *   now names that crash, so a row can DECLARE it dies that way
 *   (`killedBy: '(uncaught error)'`) instead of carrying a red it can never
 *   resolve — which is the pressure that gets a real gap relabelled into
 *   silence.
 *
 * - `#296 the pattern is logged unencoded` looked timing-dependent:
 *   MISATTRIBUTED on one run, SURVIVED on the next. Measured rather than
 *   inferred, the directory is 25/25 green at baseline and the mutant survives
 *   10 runs out of 10 — so that one `#299` failure was a coincidental flake,
 *   not a flaky control, and the row was a REAL uncovered gap all along. Every
 *   other test subscribes `app:*`, for which `safeForLog(p) === p`, so the
 *   encoder and its absence were indistinguishable. A control that cannot tell
 *   the two apart is not a control. `#296: the pattern in a handler-fault
 *   report is ENCODED, not raw` closes it with a hostile pattern.
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'
import { LIVE_BROKER } from '../live_broker.ts'

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
        // The MIRROR of the stale-discard control, which PASSES under this
        // mutation (see the header). This one fails: without the pairing the
        // memo survives its own socket's death.
        killedBy: 'discarding the socket a dial PRODUCED frees that dial',
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
        label: '#296 the handler call is unguarded again',
        file: SUB,
        edits: [[
            '} catch (error) {\n            this.#reportHandlerFault(pattern.value, error)\n        }',
            '} catch (error) {\n            throw error\n        }',
        ]],
        killedBy: '(uncaught error)',
    },
    {
        label: '#296 the pattern is logged unencoded',
        file: SUB,
        edits: [[
            'a handler for ${safeForLog(pattern)} threw',
            'a handler for ${pattern} threw',
        ]],
        killedBy: 'the pattern in a handler-fault report is ENCODED, not raw',
    },
    {
        label: '#296 an ASYNC handler rejection escapes containment',
        file: SUB,
        edits: [[
            'Promise.resolve(result).catch((error: unknown) =>\n                    this.#reportHandlerFault(pattern.value, error)\n                )',
            'void result',
        ]],
        killedBy: '(uncaught error)',
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

/**
 * The rows whose subject is a PROCESS EXIT — an unguarded handler throw
 * escaping the read loop — which no in-process double reproduces (#319).
 *
 * The other four live-broker batteries refuse to start at all without one.
 * This battery does not, because sixteen of its twenty rows are broker-free and
 * losing them offline would be a real cost. It runs those and **names the rows
 * it did not run**, then exits 2 — the code every battery here uses for "I
 * could not run everything", which `deno task mutate` reports as PARTIAL rather
 * than as a pass.
 *
 * Silence was the alternative and it is the one thing that must not happen:
 * without a broker these rows' suite is `ignored`, Deno reports `ok`, and the
 * harness reads that as green — so each would print SURVIVED, and a reader
 * would take four false coverage gaps for real ones.
 */
const NEEDS_BROKER = (m: Mutation) => m.label.startsWith('#296')

if (import.meta.main) {
    const skipped = LIVE_BROKER ? [] : MUTATIONS.filter(NEEDS_BROKER)
    const rows = LIVE_BROKER
        ? MUTATIONS
        : MUTATIONS.filter((m) => !NEEDS_BROKER(m))

    const unresolved = await runBattery(
        '#248 — subscribe hardening',
        SUITES,
        rows,
    )

    if (skipped.length > 0) {
        console.error(
            `\nPARTIAL — ${skipped.length} row(s) NOT run, they need a live ` +
                'broker (the defect is a process exit):',
        )
        for (const m of skipped) console.error(`  - ${m.label}`)
        console.error(
            '\n  LOCKNESS_REDIS_INTEGRATION=1 LOCKNESS_REDIS_PORT=<port> \\\n' +
                '    deno run -A packages/redis/tests/mutations/subscribe_hardening_248.ts',
        )
    }

    // Unresolved rows outrank partiality: a real red must not be reported as
    // "could not run".
    Deno.exit(unresolved > 0 ? 1 : skipped.length > 0 ? 2 : 0)
}
