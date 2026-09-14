/**
 * @fileoverview #339 — the cutting rule, as a pure function.
 *
 * `presence_snapshot_bound_339.test.ts` proves the manager applies the rule on
 * every exit and both roster sources. This pins the rule itself: fits
 * unchanged, cut to K, self replaces the last slot, input never mutated, and
 * `total` taken before the cut.
 *
 * @module @lockness/realtime/tests/presence_snapshot_unit_339
 */

import { assertEquals, assertStrictEquals } from '@std/assert'
import { boundPresenceSnapshot, sameMemberId } from '../presence_snapshot.ts'
import type { PresenceMember } from '../channel.ts'

const roster = (...ids: (string | number)[]): PresenceMember[] =>
    ids.map((id) => ({ id }))
const idsOf = (members: PresenceMember[]) => members.map((m) => m.id)

Deno.test('#339 unit: a roster within the bound is returned unchanged', () => {
    const input = roster(1, 2, 3)
    const out = boundPresenceSnapshot(input, 2, 3)
    assertStrictEquals(out.members, input, 'the same array, not a copy')
    assertEquals(out.total, 3)
})

Deno.test('#339 unit: an oversized roster is cut to the first K in driver order', () => {
    const out = boundPresenceSnapshot(roster(5, 4, 3, 2, 1), undefined, 3)
    assertEquals(idsOf(out.members), [5, 4, 3], 'driver order kept, no sort')
    assertEquals(out.total, 5, '`total` is the pre-cut roster size')
})

Deno.test('#339 unit: self outside the first K replaces the LAST slot', () => {
    const out = boundPresenceSnapshot(roster(1, 2, 3, 4, 5), 5, 3)
    assertEquals(idsOf(out.members), [1, 2, 5], 'still exactly K')
    assertEquals(out.total, 5)
})

Deno.test('#339 unit: self already inside the first K changes nothing', () => {
    const out = boundPresenceSnapshot(roster(1, 2, 3, 4, 5), 2, 3)
    assertEquals(idsOf(out.members), [1, 2, 3])
})

Deno.test('#339 unit: a self the roster does not hold is not invented', () => {
    const out = boundPresenceSnapshot(roster(1, 2, 3, 4), 9, 2)
    assertEquals(idsOf(out.members), [1, 2])
})

Deno.test('#339 unit: self is matched by String(id)', () => {
    const out = boundPresenceSnapshot(roster('1', '2', '3', '42'), 42, 2)
    assertEquals(idsOf(out.members), ['1', '42'])
    assertEquals(sameMemberId(42, '42'), true)
    assertEquals(sameMemberId('a', 'b'), false)
})

Deno.test('#339 unit: the input roster is never mutated', () => {
    const input = roster(1, 2, 3, 4, 5)
    const before = [...input]
    const out = boundPresenceSnapshot(input, 5, 2)
    assertEquals(input, before, 'the shared read is left exactly as it came')
    assertEquals(idsOf(out.members), [1, 5])
})
