/**
 * @fileoverview #342's mutation battery — "no roster" is not "superseded".
 *
 * The defect was one return value carrying two meanings: `#syncRosterMember`
 * answered `undefined` for a driver without roster ops, and the join reads
 * `undefined` as an `unsubscribe` having overtaken it. Nothing in a signature
 * separates those, so the only thing that holds them apart is a witness that
 * dies when they collapse again — from either side.
 *
 * - M1 and M2 collapse "no roster" back into "superseded", once inside the tail
 *   and once as the original early return. Both die to W1.
 * - M3 goes the other way: it makes a roster-less join skip the superseded
 *   check, which is the tempting wrong fix — W1 would pass under it. It dies to
 *   W2, and that is the reason W2 exists.
 *
 * Every row was proven LIVE before it was trusted: the edited line was probed
 * and seen to execute under its killing witness. A row whose line never runs
 * reports a kill it did not cause.
 *
 * ```bash
 * deno task mutate presence_join_rosterless_342
 * ```
 *
 * @module @lockness/realtime/tests/mutations/presence_join_rosterless_342
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const MANAGER = new URL('../../manager.ts', import.meta.url)
const SUITES = [
    new URL('../presence_join_rosterless_342.test.ts', import.meta.url)
        .pathname,
    new URL('../subscribe_unsubscribe_race_330.test.ts', import.meta.url)
        .pathname,
]

const MUTATIONS: Mutation[] = [
    {
        label: '#342 M1 the roster-less projection answers "superseded"',
        file: MANAGER,
        edits: [[
            '            if (!roster) return desired\n',
            '            if (!roster) return undefined\n',
        ]],
        // The tail still runs and the slot still serializes; only the answer
        // is lost. Every roster-less join then reads as overtaken.
        killedBy: 'a roster-less first join announces joined exactly once',
    },
    {
        label: '#342 M2 the early "no roster" return is restored',
        file: MANAGER,
        edits: [[
            '        const roster = this.roster\n' +
            '        const field = String(memberId)\n',
            '        const roster = this.roster\n' +
            '        if (!roster) return Promise.resolve(undefined)\n' +
            '        const field = String(memberId)\n',
        ]],
        // The shipped defect, byte for byte.
        killedBy: 'a roster-less first join announces joined exactly once',
    },
    {
        label: '#342 M3 a roster-less join skips the superseded check',
        file: MANAGER,
        edits: [[
            '                if (applied === undefined) {',
            '                if (applied === undefined && this.roster) {',
        ]],
        // The wrong fix: W1 goes green under it, and a join an `unsubscribe`
        // overtook announces `joined` for a member the local map no longer
        // holds — #330's rule broken on the drivers #330 never exercised.
        killedBy:
            'a roster-less join overtaken by an unsubscribe announces nothing',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#342 — "no roster" is not "superseded"',
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
