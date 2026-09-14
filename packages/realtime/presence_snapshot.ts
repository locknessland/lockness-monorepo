/**
 * @fileoverview How a presence roster is cut to the snapshot one `subscribe`
 * returns (#339) — internal, and the single home of that rule.
 *
 * Kept out of `manager.ts` so the rule is a pure function a unit test can pin
 * and a mutation battery can break, and kept out of `mod.ts` because nothing
 * outside the manager has a roster to cut. This module imports nothing from
 * `manager.ts`: the edge runs `manager.ts → presence_snapshot.ts` only, which is
 * also why the default bound is passed in rather than imported.
 *
 * @module @lockness/realtime/presence_snapshot
 */

import type { PresenceMember, PresenceSnapshot } from './channel.ts'

/**
 * Whether two presence member ids name the same member.
 *
 * Ids compare as `String(id)`: the roster is a hash keyed by the string form,
 * so `1` and `'1'` are one slot there and must be one member here.
 *
 * @param a - One member id.
 * @param b - The other.
 * @returns `true` when both ids have the same string form.
 */
export function sameMemberId(a: string | number, b: string | number): boolean {
    return String(a) === String(b)
}

/**
 * Cut a roster to at most `limit` members, keeping the caller's own member.
 *
 * - **Fits:** the roster is returned unchanged, same array, same order.
 * - **Does not fit:** the first `limit` in driver order, except that `selfId`'s
 *   member — when the roster holds it and it is not already among them —
 *   replaces the last slot. The snapshot is still exactly `limit`.
 * - `total` is `roster.length`, taken **before** the cut, from the read the
 *   caller already made. Counting costs no driver command.
 *
 * Rules this function carries, each of which has been proposed and each of
 * which is wrong:
 *
 * - **No sort.** Driver order is kept. A sort here is O(N log N) per caller on
 *   a read the barrier shares between callers, and no caller asks for an order.
 * - **No mutation.** The input may be shared; the manager's `rosterSnapshot`
 *   spread is what gives each caller its own array, and this function must not
 *   be the reason that spread "can go" — it returns its input when it fits.
 * - **Silent.** Cutting is the designed reply, not a fault: no log, no meter,
 *   no error. Nothing here can reach a logger.
 * - **Not in the barrier or a driver.** Cutting a shared read would hand one
 *   caller's self to another; the cut happens per caller, after the read.
 *
 * @param roster - The roster a source reported, in driver order. Not mutated.
 * @param selfId - The subscribing connection's member id, or `undefined` when
 *   it holds none (a superseded join).
 * @param limit - The bound, a positive integer validated by the manager.
 * @returns The members to return and the pre-cut `total`.
 *
 * @example
 * ```ts
 * boundPresenceSnapshot([{ id: 1 }, { id: 2 }, { id: 3 }], 3, 2)
 * // { members: [{ id: 1 }, { id: 3 }], total: 3 }
 * ```
 */
export function boundPresenceSnapshot(
    roster: PresenceMember[],
    selfId: string | number | undefined,
    limit: number,
): Omit<PresenceSnapshot, 'source'> {
    const total = roster.length
    if (total <= limit) return { members: roster, total }
    const members = roster.slice(0, limit)
    if (
        selfId !== undefined &&
        !members.some((member) => sameMemberId(member.id, selfId))
    ) {
        for (let index = limit; index < total; index++) {
            if (sameMemberId(roster[index].id, selfId)) {
                members[limit - 1] = roster[index]
                break
            }
        }
    }
    return { members, total }
}
