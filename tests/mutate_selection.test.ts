/**
 * @fileoverview The mutation runner's battery SELECTION, which is the part that
 * can be silently wrong.
 *
 * `deno task mutate a b` used to read only `args[0]`, discard the rest, run one
 * battery, print `1 battery: 1 clean` and **exit 0**. Nothing in the run's own
 * output distinguished that from having run both — and the caller who names two
 * batteries does so precisely because one change touches both, which is the
 * caller for whom the failure is invisible.
 *
 * The run itself cannot be unit-tested cheaply (it forks a full `deno test` per
 * mutation), so the selection was extracted to a pure function. These are the
 * cases that would have caught the original defect.
 *
 * @module tests/mutate_selection
 */

import { assertEquals } from '@std/assert'
import { selectBatteries } from '../scripts/mutate.ts'

const ALL = [
    '/repo/packages/realtime/tests/mutations/presence_join_323.ts',
    '/repo/packages/realtime/tests/mutations/roster_sync_330.ts',
    '/repo/packages/redis/tests/mutations/fake_redis_280.ts',
]

Deno.test('mutate: EVERY argument is a filter, not just the first', () => {
    const { selected, unmatched } = selectBatteries(ALL, [
        'presence_join_323',
        'roster_sync_330',
    ])
    assertEquals(
        selected.length,
        2,
        'two named batteries select two — the defect this replaces selected one ' +
            'and reported success',
    )
    assertEquals(unmatched, [])
})

Deno.test('mutate: a filter matching nothing is reported even when its siblings match', () => {
    const { selected, unmatched } = selectBatteries(ALL, [
        'presence_join_323',
        'no_such_battery',
    ])
    assertEquals(selected.length, 1, 'the valid filter still selects')
    assertEquals(
        unmatched,
        ['no_such_battery'],
        'and the typo is NAMED — reporting only a non-empty total would let a ' +
            'mistyped argument pass as a successful run of the others, which ' +
            'is the same defect one level up',
    )
})

Deno.test('mutate: no filters selects everything', () => {
    const { selected, unmatched } = selectBatteries(ALL, [])
    assertEquals(selected, ALL)
    assertEquals(unmatched, [])
})

Deno.test('mutate: a partial-path filter selects the batteries under it', () => {
    const { selected, unmatched } = selectBatteries(ALL, ['packages/realtime'])
    assertEquals(selected.length, 2, 'a package name selects its batteries')
    assertEquals(unmatched, [])
})

Deno.test('mutate: one filter matching several is not double-counted', () => {
    const { selected } = selectBatteries(ALL, ['mutations', 'realtime'])
    assertEquals(
        selected.length,
        3,
        'overlapping filters select the union, never a duplicate — the runner ' +
            'would otherwise mutate the same file twice in one pass',
    )
})
