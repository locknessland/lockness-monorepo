/**
 * @fileoverview #323 — a presence join announces nothing it cannot back.
 *
 * `subscribe` committed the locally VISIBLE half of a presence join before the
 * authoritative one: the `joined` frame went out, the local set grew and the
 * `presence` map was written, and only then did `roster.addMember` run. A
 * rejection there propagated out — the caller saw a failed join — while every
 * local subscriber already held a `joined` for a member the authoritative
 * roster never received.
 *
 * The split does not heal. `#sweepInstance` reclaims ghosts by enumerating a
 * DEAD instance's owned set, so a member that was never written is invisible
 * to it, and a live instance never sweeps its own. The divergence lasts until
 * the member leaves — indefinitely, for a long-lived socket.
 *
 * The fix moves the ANNOUNCEMENT, not the bookkeeping. `#checkChannelCaps` and
 * `#joinLocal` stay one uninterrupted synchronous run, because the cap decision
 * and the counter it spends must not be separated by an await. The frame goes
 * out after the roster write, so a failed join compensates internal state only
 * — and needs no `left`, because nothing was ever announced.
 *
 * **Every assertion here reads what subscribers RECEIVED**, not what `subscribe`
 * returned. The return value was never the defect.
 *
 * @module @lockness/realtime/tests/presence_join_compensation_323
 */

import { assert, assertEquals } from '@std/assert'
import { ChannelManager } from '../manager.ts'
import type { BroadcastDriver } from '../driver.ts'
import type { PresenceMember } from '../channel.ts'
import type { Connection } from '../types.ts'

interface User {
    id: number
}

const CHANNEL = 'presence-room'

/** A connection that records every frame it received. */
function conn(
    id: string,
    userId: number,
): Connection<User> & { readonly received: Record<string, unknown>[] } {
    const received: Record<string, unknown>[] = []
    return {
        id,
        identity: { id: userId },
        metadata: {},
        send: (data) => void received.push(JSON.parse(data as string)),
        close: () => {},
        received,
    } as Connection<User> & { readonly received: Record<string, unknown>[] }
}

const joinedFor = (
    c: { readonly received: Record<string, unknown>[] },
    memberId: number,
) => c.received.filter((f) =>
    f.action === 'joined' &&
    (f.member as PresenceMember | undefined)?.id === memberId
)

/**
 * A driver whose roster works until armed, then rejects every add — and which
 * records the channel-watch pair so a released subscription is observable.
 */
function faultyRoster() {
    const roster = new Map<string, Map<string, PresenceMember>>()
    const watched = new Set<string>()
    const state = {
        rejectAdds: false,
        rejectControl: false,
        rejectList: false,
    }
    const driver: BroadcastDriver = {
        publish: () => {},
        onMessage: () => {},
        addMember(channel, member) {
            if (state.rejectAdds) return Promise.reject(new Error('NOPERM'))
            let members = roster.get(channel)
            if (!members) roster.set(channel, members = new Map())
            members.set(String(member.id), member)
            return Promise.resolve()
        },
        removeMember(channel, memberId) {
            roster.get(channel)?.delete(String(memberId))
        },
        listMembers(channel) {
            if (state.rejectList) return Promise.reject(new Error('LOADING'))
            return [...(roster.get(channel)?.values() ?? [])]
        },
        onControl: () => {},
        publishControl() {
            if (state.rejectControl) {
                return Promise.reject(new Error('broker gone'))
            }
            return Promise.resolve()
        },
        watchChannel(channel) {
            watched.add(channel)
        },
        unwatchChannel(channel) {
            watched.delete(channel)
        },
    }
    return { driver, roster, watched, state }
}

const authorize = (identity: User | null): PresenceMember | false =>
    identity ? { id: identity.id } : false

/** Drive a join that is going to fail, and hand back the rejection. */
async function failingJoin(
    m: ChannelManager<User>,
    c: Connection<User>,
): Promise<unknown> {
    try {
        await m.subscribe(c, CHANNEL)
        return null
    } catch (error) {
        return error
    }
}

Deno.test('#323/SC-001 a rejected roster write announces NOTHING', async () => {
    const { driver, state } = faultyRoster()
    const m = new ChannelManager<User>({ driver, authorize })
    const watcher = conn('c1', 1)
    assertEquals((await m.subscribe(watcher, CHANNEL)).ok, true)

    state.rejectAdds = true
    const newcomer = conn('c2', 2)
    assert(await failingJoin(m, newcomer) !== null, 'the join must reject')

    assertEquals(
        joinedFor(watcher, 2).length,
        0,
        'no subscriber may hold a `joined` for a member the authoritative ' +
            'roster never received — measured on what the socket RECEIVED',
    )
})

Deno.test('#323/FR-002 a rejected roster write leaves no local residue', async () => {
    const { driver, roster, state } = faultyRoster()
    const m = new ChannelManager<User>({ driver, authorize })
    const watcher = conn('c1', 1)
    await m.subscribe(watcher, CHANNEL)

    state.rejectAdds = true
    const newcomer = conn('c2', 2)
    await failingJoin(m, newcomer)
    state.rejectAdds = false

    assertEquals(
        [...(roster.get(CHANNEL)?.keys() ?? [])],
        ['1'],
        'the authoritative roster holds only the member that succeeded',
    )
    // The local view must agree. A leave for the failed joiner is the probe:
    // if the `presence` map still held it, unsubscribe would announce a `left`
    // for a member that never joined.
    await m.unsubscribe(newcomer.id, CHANNEL)
    assertEquals(
        watcher.received.filter((f) => f.action === 'left').length,
        0,
        'the local presence map kept no entry for the failed joiner',
    )
})

Deno.test('#323/SC-004 a failed first join releases the channel subscription', async () => {
    const { driver, watched, state } = faultyRoster()
    const m = new ChannelManager<User>({ driver, authorize })

    // The 0->1 transition takes a broker subscription. A join that then fails
    // must give it back, or the instance hosts a channel with no members.
    state.rejectAdds = true
    const first = conn('c1', 1)
    assert(await failingJoin(m, first) !== null, 'the join must reject')

    assertEquals(
        [...watched],
        [],
        'a failed join leaves the instance hosting zero channels',
    )
})

Deno.test('#323/SC-003 a failed join can be retried, and yields ONE member', async () => {
    const { driver, roster, state } = faultyRoster()
    const m = new ChannelManager<User>({ driver, authorize })
    const watcher = conn('c1', 1)
    await m.subscribe(watcher, CHANNEL)

    state.rejectAdds = true
    const newcomer = conn('c2', 2)
    await failingJoin(m, newcomer)

    state.rejectAdds = false
    const retried = await m.subscribe(newcomer, CHANNEL)

    assertEquals(retried.ok, true)
    assertEquals(
        retried.rosterSource,
        'authoritative',
        'a healthy join reports the authoritative roster',
    )
    assertEquals(
        [...(roster.get(CHANNEL)?.keys() ?? [])].sort(),
        ['1', '2'],
        'exactly one member, no duplicate from the failed attempt',
    )
    assertEquals(
        joinedFor(watcher, 2).length,
        1,
        'and exactly ONE `joined` in total across both attempts',
    )
})

Deno.test('#323 the joiner never receives its own `joined`', async () => {
    const { driver } = faultyRoster()
    const m = new ChannelManager<User>({ driver, authorize })
    const first = conn('c1', 1)
    await m.subscribe(first, CHANNEL)

    const newcomer = conn('c2', 2)
    await m.subscribe(newcomer, CHANNEL)

    assertEquals(
        joinedFor(newcomer, 2).length,
        0,
        'the exclusion survives the announcement moving after the roster write',
    )
    assertEquals(
        joinedFor(first, 2).length,
        1,
        'while the existing subscriber is still told',
    )
})

Deno.test('#323/FR-005 a failed control publish loses the announcement, not the join', async () => {
    const { driver, roster, state } = faultyRoster()
    const m = new ChannelManager<User>({ driver, authorize })
    const watcher = conn('c1', 1)
    await m.subscribe(watcher, CHANNEL)

    // The roster write has already committed by the time the control frame
    // goes out. Propagating this rejection tells the caller a join failed that
    // every other instance can see succeeded — the original defect, mirrored.
    state.rejectControl = true
    const newcomer = conn('c2', 2)
    const result = await m.subscribe(newcomer, CHANNEL)

    assertEquals(result.ok, true, 'the join committed and must report so')
    assertEquals(
        [...(roster.get(CHANNEL)?.keys() ?? [])].sort(),
        ['1', '2'],
        'the authoritative roster keeps the member',
    )
    assertEquals(
        joinedFor(watcher, 2).length,
        1,
        'and the LOCAL announcement still reached this instance',
    )
})

Deno.test('#323/FR-006 a failed roster read degrades to the local view', async () => {
    const { driver, state } = faultyRoster()
    const m = new ChannelManager<User>({ driver, authorize })
    const watcher = conn('c1', 1)
    await m.subscribe(watcher, CHANNEL)

    // Everything committed — roster, local view, both announcements. Only the
    // closing read of the roster fails. Throwing here leaves the caller
    // believing a fully committed join was rejected, and there is no residue
    // to compensate because there is nothing wrong.
    state.rejectList = true
    const newcomer = conn('c2', 2)
    const result = await m.subscribe(newcomer, CHANNEL)

    assertEquals(result.ok, true)
    assertEquals(
        result.members?.map((x) => x.id).sort(),
        [1, 2],
        'the here-roster falls back to what this instance knows',
    )
    assertEquals(
        result.rosterSource,
        'local',
        'and it SAYS so — a fragment and a whole roster are otherwise ' +
            'indistinguishable to the caller that has to act on them',
    )
})

// ── RETIRED by #327, with the reason, rather than deleted ────────────────────
//
// Two tests stood here: `a failed RE-join does not evict the membership it
// already had` and `a failed RE-join does NOT remove the roster entry it did
// not create`. Both drove a re-join whose roster write fails, and both asserted
// that the compensation restores rather than deletes.
//
// **They are unreachable by construction now, not merely redundant.** #327 put
// a guard at the top of the presence branch: a subscribe to a channel the
// connection already holds returns before `#joinLocal`, so a re-join never
// reaches the roster write and has nothing to fail at. `failingJoin` on a
// re-join now returns `{ ok: true }` instead of throwing, and both tests failed
// loudly on `re-join must reject` — which is the right way for a test to become
// obsolete. A test that quietly keeps passing against a path that no longer
// exists is the one to be afraid of.
//
// The asymmetry they guarded is GONE from the code, not merely untested: the
// `wasSubscribed` / `priorMember` capture, the restore-don't-delete branch, the
// conditional `#leaveLocal` and the conditional roster reclaim were all deleted
// with them, and the compensation is unconditional again because the only case
// that needed it cannot occur. A compensation you deleted cannot be got wrong.
//
// What replaced them, so this is a move and not a loss: the two mutation rows
// that killed them were RE-ANCHORED (they still guard the first-join
// compensation, which is untouched), and `presence_rejoin_327.test.ts` now
// holds four witnesses for the guard itself — including the one that dies when
// the membership claim moves below `#joinLocal`.

Deno.test('#323 a failed FIRST join best-effort removes a write that may have landed', async () => {
    // The EVAL is atomic, but its REPLY can still be lost — a dropped
    // connection after the write commits looks exactly like a write that never
    // happened. The manager cannot tell, so a first join that fails asks the
    // roster to remove the member it may have just added.
    const { driver, roster, state } = faultyRoster()
    const m = new ChannelManager<User>({ driver, authorize })
    // Model the lost reply: the write lands, the caller sees a rejection.
    const original = driver.addMember!.bind(driver)
    driver.addMember = async (channel, member) => {
        state.rejectAdds = false
        await original(channel, member)
        throw new Error('connection reset after the write committed')
    }

    const newcomer = conn('c1', 1)
    assert(await failingJoin(m, newcomer) !== null, 'the join must reject')

    assertEquals(
        [...(roster.get(CHANNEL)?.keys() ?? [])],
        [],
        'the orphan is reclaimed rather than left for the ghost sweep, which ' +
            'only reaches it once this instance is declared dead',
    )
})

Deno.test('#323 a failed join into an OCCUPIED channel leaves the incumbent alone', async () => {
    // SC-004 covers the 0→1 case: a failed FIRST join gives the broker
    // subscription back. The other half is that a failed join must take away
    // only its own membership — the channel stays watched for whoever was
    // already there, and the incumbent keeps receiving frames.
    //
    // This is a REGRESSION GUARD, not a failing witness: it is green because
    // `#leaveLocal` only unwatches on a 1→0 transition, which was already true.
    // It is committed because the compensation is the part of this branch most
    // likely to be edited next, and nothing else states this half.
    const { driver, watched, state } = faultyRoster()
    const m = new ChannelManager<User>({ driver, authorize })
    const incumbent = conn('c1', 1)
    await m.subscribe(incumbent, CHANNEL)

    state.rejectAdds = true
    assert(await failingJoin(m, conn('c2', 2)) !== null, 'the join must reject')

    assertEquals(
        [...watched],
        [CHANNEL],
        'the channel stays watched for the connection that was already there',
    )

    // And the incumbent is still a live subscriber: a later join reaches it.
    state.rejectAdds = false
    await m.subscribe(conn('c3', 3), CHANNEL)
    assertEquals(
        joinedFor(incumbent, 3).length,
        1,
        'the incumbent still receives presence frames on that channel',
    )
})
