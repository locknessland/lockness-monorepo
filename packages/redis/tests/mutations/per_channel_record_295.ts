/**
 * @fileoverview #295's mutation battery — the per-generation subscription
 * record, runnable.
 *
 * A table in a comment is a claim; this is what checks it. Every row asserts its
 * anchor matches **exactly once**, writes, re-reads to prove the file changed,
 * and only then reads the suite summary — a mutation that never executed reads
 * as a result, and this repo has recorded that happening.
 *
 * ```bash
 * deno run -A packages/redis/tests/mutations/per_channel_record_295.ts
 * ```
 *
 * No row needs a live broker: the record is in-process state and the fake
 * server already answers `+psubscribe` / `+punsubscribe` with the real 3-element
 * frame shape.
 *
 * Exit code is the number of **unexpected** survivors. The one
 * `expectSurvival` row is a design fact recorded rather than hidden — see its
 * note, and see the plan's FR-009.
 *
 * **Two rows exist because a witness passed for the wrong reason first.** The
 * burst witness was originally written on `psubscribeOne`, which hands
 * `#activate` a single pattern and is therefore linear by construction — it
 * passed against a mutant with the delta guard removed. It now drives
 * `psubscribe`, the path that re-issues the whole recorded set. And the
 * `retire`-clears-only-`issued` row was first checked against SC-015, which
 * lets the acknowledgement land before muting, so the pattern is confirmed
 * rather than claimed and clearing one set is sufficient. Both were reported
 * SURVIVED, both were real gaps in the witnesses rather than in the code, and
 * both are why every row below names the test it actually dies to.
 *
 * @module @lockness/redis/tests/mutations/per_channel_record_295
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const SUB = new URL('../../subscriber.ts', import.meta.url)
const SUITES = [new URL('../', import.meta.url).pathname]

/** One mutation, and what it is expected to prove. */
const MUTATIONS: Mutation[] = [
    // ── the erasure: both halves, at the enqueue ───────────────────────────
    {
        label: '#295 retire() clears only the acknowledged half',
        file: SUB,
        edits: [[
            '        this.#pending.delete(pattern)\n' +
            '        this.#issued.delete(pattern)',
            '        this.#issued.delete(pattern)',
        ]],
        // A pattern retired while still only CLAIMED stays claimed, so the
        // re-watch's delta skips it and the socket is deaf on that channel for
        // its whole life. SC-010 and SC-015 both let the acknowledgement land
        // first, which leaves nothing in `#pending` for this mutation to
        // strand — SC-016 is the one that mutes BEFORE the subscribe.
        killedBy: 'a STALE +psubscribe, landing after its retire, records',
    },
    {
        label: '#295 retire() clears only the claimed half',
        file: SUB,
        edits: [[
            '        this.#pending.delete(pattern)\n' +
            '        this.#issued.delete(pattern)\n    }',
            '        this.#pending.delete(pattern)\n    }',
        ]],
        killedBy: 'watch, unwatch, re-watch on ONE generation delivers again',
    },
    // ── the acknowledgement: dropped when its claim is gone ────────────────
    {
        label: '#295 confirm() records an acknowledgement unconditionally',
        file: SUB,
        edits: [[
            '        if (!this.#pending.delete(pattern)) return\n' +
            '        this.#issued.add(pattern)',
            '        this.#pending.delete(pattern)\n' +
            '        this.#issued.add(pattern)',
        ]],
        // Redis answers in order, so the acknowledgement for a subscribe that
        // was unwatched meanwhile lands after the erasure. Recording it there
        // re-asserts a pattern the broker no longer holds.
        killedBy: 'a STALE +psubscribe, landing after its retire, records',
    },
    // ── the delta ──────────────────────────────────────────────────────────
    {
        label: '#295 the delta guard is removed (re-issue everything)',
        file: SUB,
        edits: [['                if (gen.has(pattern)) continue\n', '']],
        // This is the original CRITICAL, restored: watch #k writes k frames.
        // Measured at 36 / 528 / 8256 for N = 8 / 32 / 128 in `baseline.md`.
        killedBy: 'a BURST of N watches puts N frames on the wire',
    },
    {
        label: '#295 the in-loop re-read of the desired set is removed',
        file: SUB,
        edits: [[
            '                if (!this.patterns.has(pattern)) continue\n',
            '',
        ]],
        // A `punsubscribe` landing while the activation is suspended between
        // awaits leaves a live subscription whose handler is gone.
        killedBy: 'a pattern unwatched MID-activation is not issued by it',
    },
    // ── FR-023: the control subscription leads, and the seam waits on it ───
    {
        label: '#295 the priority partition is removed (recorded order wins)',
        file: SUB,
        edits: [[
            'const ordered = this.#priority.size > 0',
            'const ordered = false',
        ]],
        // Neutralised rather than deleted: `ordered` becomes `toIssue`, which
        // COMPILES and restores the old behaviour exactly. A mutation that
        // fails to compile is recorded as dead and proves nothing about the
        // suite. Which subscription survives a re-issue that throws half way
        // goes back to being decided by Map insertion — the accidental ordering
        // FR-023 replaced, and one that INVERTS when `onMessage` stops
        // subscribing.
        // RE-ATTRIBUTED after the review gate's H-1 fix. SC-012 is the sharper
        // witness now: with the partition gone the control topic is no longer
        // first, so the partial-failure rig leaves the WRONG subscription
        // behind — which is the harm, where SC-011 measured only the timing.
        killedBy:
            'a re-issue that fails part way still leaves the control topic',
    },
    {
        label: '#295 the seam waits for the whole re-issue again',
        file: SUB,
        edits: [[
            'if (feedsTheSeam && this.#reconnectIntent) {',
            'if (!feedsTheSeam && this.#reconnectIntent) {',
        ]],
        // NEGATED rather than disabled: the seam fires on every pattern that
        // is NOT the one feeding it, which is the pre-FR-023 defect in its
        // sharpest form — the latch is consumed by a write that left the
        // control topic unsubscribed. Written this way rather than as
        // `if (false && …)`, which Deno rejects as an uncaught error and which
        // the harness then reports as misattributed rather than as a kill.
        // NAMED, not a crash disposition. This row used to declare
        // `killedBy: '(uncaught error)'` because the old mutation took the test
        // file down on teardown and Deno printed no parseable failure. The
        // review gate's H-1 fix made the guard nameable — `feedsTheSeam` — so
        // the negation now fails cleanly by test name. A crash disposition kept
        // past the point where a clean one is available is a row that says less
        // than it could.
        killedBy: 'the reconnect seam fires after ONE write, not after N',
    },
    // ── recorded survivor ──────────────────────────────────────────────────
    {
        label: '#295 the +psubscribe branch never records (two sets collapse)',
        file: SUB,
        edits: [[
            '                generation.confirm(name.value)',
            '                // mutated: the acknowledgement is discarded',
        ]],
        // Required alongside `expectSurvival`: if this row ever starts dying,
        // the harness checks it died to the right thing rather than to noise.
        killedBy: 'a STALE +psubscribe, landing after its retire, records',
        expectSurvival:
            'NOTHING READS THE pending/issued DISTINCTION TODAY, and this row ' +
            'is how that stays visible rather than becoming folklore. `has` ORs ' +
            'the two sets and is their only reader, so a claim alone answers ' +
            'every question the delta asks; with this branch gone `#pending` ' +
            'simply never drains and behaviour is identical. Verified by ' +
            'running SC-005, SC-010 and SC-016 against it — all three green.\n\n' +
            'The second set is carried for ONE stated reason (plan §12 Q2): ' +
            'once acknowledgements are recorded, awaiting `+psubscribe` rather ' +
            'than the write becomes reachable with no second port break, ' +
            'because `psubscribeOne` already returns a promise. It also creates ' +
            "the hazard `confirm`'s stale-claim drop exists to close — with a " +
            'single set there would be no stale acknowledgement to drop.\n\n' +
            'IF THAT DOOR IS NEVER WALKED THROUGH, DELETE `#issued` and fold ' +
            '`confirm` away. A second set nothing reads is state, and state ' +
            'nothing reads is where the next defect hides. This row is the ' +
            'reminder, and it should be re-read whenever Q2 is revisited.',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#295 — the per-generation subscription record',
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
