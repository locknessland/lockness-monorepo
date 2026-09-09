/**
 * @fileoverview #327 — a re-join is not a join, and costs what a read costs.
 *
 * A connection that subscribed to a presence channel it **already held** was
 * charged by neither channel cap — both meter set *growth*, and a re-join grows
 * no set — and still paid a full join: a `joined` frame to every local
 * subscriber, an `EVAL` roster write, and a `presence-join` control publish
 * that `handleControl` re-emits as another `joined` on **every other
 * instance**. One inbound frame, work proportional to the room's cluster-wide
 * population, metered by nothing.
 *
 * **The missing meter was the smaller half.** `joined` is a domain event and
 * must record a transition. Membership is a set, so a re-join transitions
 * nothing — and the manager announced one anyway. Every client maintaining a
 * roster from frames was told a member already in the room had joined it, for
 * the second, hundredth, thousandth time. A budget bounds how often a wrong
 * event is produced; it cannot make it right. So the work is deleted rather
 * than metered, and the re-join becomes what it always was: an authorized
 * roster read.
 *
 * **Most assertions here count what left the manager** — frames subscribers
 * received and calls the driver saw. A return value cannot tell you whether the
 * room was told something false.
 *
 * Two witnesses pin the return value deliberately, and they are the exception
 * that proves the rule: the constraint-2 case and the degraded-read case exist
 * *because* the return value is the thing that must not change. A client
 * re-subscribing after a network blip has to be unable to tell its re-join from
 * a first join, and the return value is the only place it could.
 *
 * The disposition, its rejected alternatives and what it does NOT solve are
 * recorded on the issue; the seat that decided it is `architect-expert`, under
 * hard rule #11.
 *
 * @module @lockness/realtime/tests/presence_rejoin_327
 */

import { assertEquals } from '@std/assert'
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

/**
 * A working driver that COUNTS every call. The counts are the test: "bounded"
 * was the language a budget would have needed, and this issue's answer is
 * exact — zero writes, zero announcements, one read.
 */
function countingDriver() {
    const roster = new Map<string, Map<string, PresenceMember>>()
    const calls = { addMember: 0, removeMember: 0, listMembers: 0, control: 0 }
    const driver: BroadcastDriver = {
        publish: () => {},
        onMessage: () => {},
        addMember(channel, member) {
            calls.addMember++
            let members = roster.get(channel)
            if (!members) roster.set(channel, members = new Map())
            members.set(String(member.id), member)
            return Promise.resolve()
        },
        removeMember(channel, memberId) {
            calls.removeMember++
            roster.get(channel)?.delete(String(memberId))
        },
        listMembers(channel) {
            calls.listMembers++
            return [...(roster.get(channel)?.values() ?? [])]
        },
        onControl: () => {},
        publishControl() {
            calls.control++
            return Promise.resolve()
        },
        watchChannel: () => {},
        unwatchChannel: () => {},
    }
    return { driver, roster, calls }
}

/** Authorizes everyone, carrying `info` so the discard case has something to see. */
const authorize = (
    identity: User | null,
    _channel: string,
    info?: Record<string, unknown>,
): PresenceMember | false =>
    identity ? { id: identity.id, info: info ?? { seat: 'original' } } : false

Deno.test('#327 a re-join announces NOTHING and writes NOTHING', async () => {
    const { driver, calls } = countingDriver()
    const m = new ChannelManager<User>({ driver, authorize })
    const holder = conn('c1', 1)
    const observer = conn('c2', 2)
    await m.subscribe(holder, CHANNEL)
    await m.subscribe(observer, CHANNEL)

    // Baseline AFTER both first joins, so the re-join's cost is isolated
    // rather than inferred by subtracting a number nobody measured.
    const before = { ...calls }
    const observerFrames = observer.received.length
    const holderFrames =
        holder.received.filter((f) => f.action === 'joined').length

    await m.subscribe(holder, CHANNEL)
    await m.subscribe(holder, CHANNEL)
    await m.subscribe(holder, CHANNEL)

    assertEquals(
        calls.addMember - before.addMember,
        0,
        'three re-joins perform EXACTLY zero roster writes',
    )
    assertEquals(
        calls.control - before.control,
        0,
        'and publish EXACTLY zero control frames — this is the term that ' +
            'reached every other instance, and it is the whole amplification',
    )
    assertEquals(
        observer.received.length - observerFrames,
        0,
        'a subscriber already in the room is told NOTHING: no member joined',
    )
    assertEquals(
        calls.listMembers - before.listMembers,
        3,
        'what remains is one authoritative READ per call — the same read a ' +
            "first join performs, on the caller's own socket",
    )

    // LAST, and outside every count above, because this one JOINS. Asserting
    // that the re-joiner hears nothing about ITSELF would be free — the
    // `except` on `emitPresence` already guarantees it, so that assertion
    // passed before the fix and read as if it guarded something. A third party
    // arriving after the re-joins is a frame the re-joiner MUST still receive:
    // it proves the guard bought its silence by doing nothing, rather than by
    // breaking this connection's delivery.
    await m.subscribe(conn('c9', 9), CHANNEL)
    assertEquals(
        holder.received.filter((f) => f.action === 'joined').length -
            holderFrames,
        1,
        'and the re-joiner is still routed — silence is not deafness',
    )
})

Deno.test('#327 a re-join still returns the authoritative roster', async () => {
    // Constraint 2, and the reason the work is deleted rather than refused: a
    // client re-subscribing after a network blip is legitimate traffic and
    // must not be able to tell its re-join from a first join.
    const { driver } = countingDriver()
    const m = new ChannelManager<User>({ driver, authorize })
    await m.subscribe(conn('c1', 1), CHANNEL)
    await m.subscribe(conn('c2', 2), CHANNEL)

    const again = await m.subscribe(conn('c1', 1), CHANNEL)

    assertEquals(again.ok, true, 'a re-join is never refused')
    assertEquals(
        again.members?.map((x) => x.id).sort(),
        [1, 2],
        'and it answers with the whole room, not a fragment',
    )
    assertEquals(
        again.rosterSource,
        'authoritative',
        "from the roster, not from this instance's local view",
    )
})

Deno.test('#327 K pipelined subscribe frames produce exactly ONE join', async () => {
    // The window the guard would leave if it checked AFTER `#joinLocal`:
    // `#joinLocal` awaits `#watch`, and `onMessage` is dispatched as
    // `void guard(...)`, so nothing serializes these. All K would read
    // "not a member" and all K would perform a full join.
    //
    // NOT AWAITED INDIVIDUALLY — awaiting each one in turn is the sequential
    // case, which the guard passes trivially and which proves nothing about
    // the race it exists to close.
    const { driver, calls } = countingDriver()
    const m = new ChannelManager<User>({ driver, authorize })
    const observer = conn('c2', 2)
    await m.subscribe(observer, CHANNEL)
    const before = { ...calls }
    const observerFrames = observer.received.length

    const joiner = conn('c1', 1)
    const K = 8
    const results = await Promise.all(
        Array.from({ length: K }, () => m.subscribe(joiner, CHANNEL)),
    )

    assertEquals(
        results.every((r) => r.ok),
        true,
        'every frame is answered — none is refused',
    )
    assertEquals(
        calls.addMember - before.addMember,
        1,
        `${K} pipelined frames perform ONE roster write, not ${K}`,
    )
    assertEquals(
        calls.control - before.control,
        1,
        'and publish ONE control frame, not K — the cluster-wide term',
    )
    assertEquals(
        observer.received.length - observerFrames,
        1,
        'the room is told the member joined exactly once',
    )
})

Deno.test('#327 a re-join DISCARDS its payload rather than broadcasting an update', async () => {
    // A deliberate behaviour change, tested so it is documented rather than
    // discovered. Detecting a changed `info` means deep-equality over
    // unbounded application data (#326) — per-frame cost proportional to what
    // an attacker controls. The domain has no "member updated" event, and
    // `joined` must not be pressed into service as one.
    const { driver, roster, calls } = countingDriver()
    let seatToHandOut = 'original'
    const m = new ChannelManager<User>({
        driver,
        authorize: (identity, channel) =>
            authorize(identity, channel, { seat: seatToHandOut }),
    })
    const holder = conn('c1', 1)
    const observer = conn('c2', 2)
    await m.subscribe(holder, CHANNEL)
    await m.subscribe(observer, CHANNEL)
    const before = { ...calls }
    const observerFrames = observer.received.length

    seatToHandOut = 'rewritten'
    await m.subscribe(holder, CHANNEL)

    assertEquals(
        roster.get(CHANNEL)?.get('1')?.info,
        { seat: 'original' },
        'the authoritative entry the first join wrote still stands',
    )
    assertEquals(
        calls.addMember - before.addMember,
        0,
        'and no write was attempted to change it',
    )
    assertEquals(
        observer.received.length - observerFrames,
        0,
        'the room is not told a member "joined" carrying new metadata',
    )
})

Deno.test('#327 a reconnect re-binds the socket, and frames follow the NEW one', async () => {
    // The case the whole disposition exists to protect: a client whose socket
    // dropped re-subscribes to everything it held. The re-join returns early
    // — so this pins that `connections.set` (which re-binds the id to the new
    // socket) runs BEFORE the guard returns, not inside the branch it skips.
    // Get that wrong and every reconnect is answered `ok` while the frames
    // keep going to a dead socket.
    const { driver } = countingDriver()
    const m = new ChannelManager<User>({ driver, authorize })
    const dropped = conn('c1', 1)
    await m.subscribe(dropped, CHANNEL)

    const reconnected = conn('c1', 1)
    const again = await m.subscribe(reconnected, CHANNEL)
    assertEquals(again.ok, true, 'the reconnect is answered, not refused')

    await m.subscribe(conn('c2', 2), CHANNEL)

    assertEquals(
        reconnected.received.filter((f) => f.action === 'joined').length,
        1,
        'the live socket receives the third party joining',
    )
    assertEquals(
        dropped.received.filter((f) => f.action === 'joined').length,
        0,
        'and the socket it replaced receives nothing',
    )
})

Deno.test('#327 a re-join degrades like a first join when the roster read fails', async () => {
    // `#closingRead` is shared by both exits precisely so a re-join cannot
    // answer differently from a first join — including when it answers badly.
    // Without this the re-join exit was witnessed happy-path only, and the
    // shared implementation's whole point is what happens off it.
    const { driver } = countingDriver()
    const failing: BroadcastDriver = {
        ...driver,
        listMembers: () => Promise.reject(new Error('LOADING')),
    }
    const m = new ChannelManager<User>({ driver: failing, authorize })
    const holder = conn('c1', 1)
    await m.subscribe(holder, CHANNEL)

    const again = await m.subscribe(holder, CHANNEL)

    assertEquals(again.ok, true, 'a failed READ never fails a committed join')
    assertEquals(
        again.rosterSource,
        'local',
        'and it SAYS the answer is this instance only — the same degradation ' +
            'a first join reports, from the same code',
    )
    assertEquals(again.members?.map((x) => x.id), [1])
})
