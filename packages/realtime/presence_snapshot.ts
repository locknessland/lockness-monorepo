/**
 * @fileoverview How a presence roster is cut to the snapshot one `subscribe`
 * returns (#339), and how this instance's local members are made one entry per
 * member first (#343) — internal, and the single home of both rules.
 *
 * The two rules stay separate on purpose. `uniqueMembers` runs only on the
 * LOCAL view, which is keyed by connection and can repeat a member;
 * `boundPresenceSnapshot` runs on every roster and never deduplicates — the
 * authoritative roster is already one entry per member, and a pass there would
 * cost O(room) on every read and hide a driver that returned duplicates.
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
 * One entry per member, from a list that may hold a member more than once.
 *
 * The local `presence` map is keyed by CONNECTION id, so one member holding two
 * tabs on this instance is two values in it; the authoritative roster is keyed
 * by `String(member.id)`, so it is one slot. Every read of the map's values
 * goes through this rule (via the manager's `#localRoster`), so the local view
 * and the roster count the same thing (#343).
 *
 * - **Keyed by `String(id)`**, the key {@link sameMemberId} and the roster hash
 *   use: `1` and `'1'` are one member.
 * - **First occurrence wins, order kept.** The map never re-inserts on a
 *   re-join (#327), so first is the earliest-joined connection still
 *   subscribed — the one whose `info` the roster slot holds (#330).
 * - **One `Map` pass, no sort, no logging, input not mutated.**
 *
 * @param members - Members in insertion order, possibly repeating an id.
 * @returns A new array with one member per `String(id)`.
 *
 * @example
 * ```ts
 * uniqueMembers([
 *     { id: 7, info: { tab: 'a' } },
 *     { id: 8 },
 *     { id: '7', info: { tab: 'b' } },
 * ])
 * // [{ id: 7, info: { tab: 'a' } }, { id: 8 }]
 * ```
 */
export function uniqueMembers(
    members: Iterable<PresenceMember>,
): PresenceMember[] {
    const byId = new Map<string, PresenceMember>()
    for (const member of members) {
        const key = String(member.id)
        if (!byId.has(key)) byId.set(key, member)
    }
    return [...byId.values()]
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
