/**
 * @fileoverview #332 — a fleet running two releases at once never widens a room
 * revocation into a session kill.
 *
 * `@lockness/realtime` is **published**, so a rolling deploy is a real scenario
 * rather than a hypothetical one, and both directions of it are load-bearing.
 * Two mechanisms carry the whole safety argument, and each has exactly one
 * witness here because neither is visible from any same-version test:
 *
 * 1. **The space delimiter.** A connection id is asserted against
 *    `/^[A-Za-z0-9:._-]+$/` before it is ever minted, so it can never contain a
 *    space. A reader of the previous release therefore looks up
 *    `"c1 private-orders"` in its connection map, finds nothing **structurally**,
 *    and skips the record. Move the delimiter to a `:` or a `.` "for
 *    readability" and a composite can collide with a real id — at which point
 *    that reader applies a room revocation as a hard-close 4403 of the whole
 *    session. Every same-version test still passes.
 *
 * 2. **A new KIND, never a new FIELD.** The control MAC covers a fixed field
 *    list. `revoke-channel` reuses `target` and `channel`, both already on it,
 *    so a peer on the previous release verifies the frame, admits it, and falls
 *    off the end of a `switch` with no `default`. A field added to the wire but
 *    not to the canonical form would ship **unauthenticated**; added to both on
 *    one side only, every older peer would drop the frame as an invalid MAC.
 *
 * **The honest cost is asserted too**, not glossed: a revoke aimed at a socket
 * an older instance owns does **not** land, and no reconcile can rescue it —
 * the record is only ever applied by the owner, and the owner is the instance
 * that cannot read it. That is bounded by the deploy, and `evict` is the verb
 * every release obeys.
 *
 * @module @lockness/realtime/tests/mixed_fleet_332
 */

import { assert, assertEquals } from '@std/assert'
import { hmacSha256Hex } from '../../redis/mod.ts'
import { RedisBroadcastDriver } from '../drivers/redis.ts'
import { ChannelManager } from '../manager.ts'
import { isValidName } from '../protocol.ts'
import type { PresenceMember } from '../channel.ts'
import type { BroadcastDriver, ControlMessage } from '../driver.ts'
import type { Connection } from '../types.ts'
import { FakeRedis } from './fake_redis.ts'

interface User {
    id: number
}

const SECRET = 'a-deployment-secret-with-more-than-enough-entropy'
const KEY = new TextEncoder().encode(SECRET)
const PREFIX = 'app:rt'
const INDEX = `${PREFIX}__revocations`
const ROOM = 'presence-room'

/**
 * How an instance of the PREVIOUS release read the revocation index.
 *
 * Transcribed from the shipped `listRevoked`, deliberately as a second copy —
 * it returned bare connection ids, filtered on the charset, and the reconcile
 * handed each straight to a whole-connection revoke. Being a copy is the point:
 * the current driver can no longer produce this behaviour, and the question is
 * what the code that still exists in the fleet does with what we now write.
 */
function readAsPreviousRelease(members: string[]): string[] {
    const live = new Set<string>()
    for (const id of members) {
        if (id && isValidName(id)) live.add(id)
    }
    return [...live]
}

function conn(id: string, userId: number): Connection<User> {
    return {
        id,
        identity: { id: userId },
        metadata: {},
        send: () => {},
        close: () => {},
    } as Connection<User>
}

Deno.test('#332 row 1+2: a previous-release reader is INERT on a channel-scoped record', async () => {
    const redis = new FakeRedis()
    redis.setTime(1_000)
    const driver = new RedisBroadcastDriver(
        { command: redis.command },
        redis.subscriberFor(),
        { prefix: PREFIX, revocationTtlSeconds: 300 },
    )
    try {
        await driver.markRevocation({ target: 'c1' })
        await driver.markRevocation({ target: 'c2', channel: ROOM })

        const raw = await redis.command('ZRANGEBYSCORE', INDEX, '-inf', '+inf')
        const members = (raw as { value: { value: string }[] }).value
            .map((entry) => entry.value)

        assertEquals(
            readAsPreviousRelease(members).sort(),
            ['c1'],
            'ROW 1: a bare record is read unchanged, so a connection ' +
                'revocation written by either release still works. ROW 2: the ' +
                'composite is SKIPPED — and skipped structurally, because a ' +
                'connection id can never contain a space, not because anything ' +
                'recognised the new format',
        )

        // The dangerous alternative, spelled out so the assertion above cannot
        // be read as a formality: had the composite survived that filter, the
        // previous release's reconcile would have passed the whole string to
        // its connection-scoped revoke.
        assert(
            !isValidName('c2 presence-room'),
            'the delimiter must stay OUTSIDE the name charset. Inside it, a ' +
                'composite is indistinguishable from a real connection id and ' +
                'a room ban becomes a 4403 session kill',
        )
    } finally {
        await driver.close()
    }
})

Deno.test('#332 row 3+4: the current reader handles both shapes, with no index migration', async () => {
    const redis = new FakeRedis()
    redis.setTime(1_000)
    const driver = new RedisBroadcastDriver(
        { command: redis.command },
        redis.subscriberFor(),
        { prefix: PREFIX, revocationTtlSeconds: 300 },
    )
    try {
        // A bare member as the PREVIOUS release would have written it, planted
        // directly — the current driver would write the same bytes, which is
        // exactly why no migration is owed.
        await redis.command('ZADD', INDEX, '9999999999', 'c1')
        await driver.markRevocation({ target: 'c2', channel: ROOM })

        const live = await driver.listRevocations()
        assertEquals(
            live.sort((a, b) => a.target.localeCompare(b.target)),
            [{ target: 'c1' }, { target: 'c2', channel: ROOM }],
            'ROW 3: a bare member written by the previous release parses as ' +
                'connection scope. ROW 4: a composite parses as channel scope. ' +
                'One index, both shapes, no dual-write and nothing to migrate',
        )
    } finally {
        await driver.close()
    }
})

Deno.test('#332 the new control kind is MAC-compatible in BOTH directions', async () => {
    // The canonical form is transcribed as a SECOND COPY, exactly as
    // `control_mac_coverage.test.ts` does and for the same reason: asking the
    // driver to sign twice cannot detect a field on the wire that the driver
    // forgot to cover.
    const payloads: string[] = []
    const driver = new RedisBroadcastDriver(
        {
            command: (...args: string[]) => {
                if (args[0] === 'PUBLISH') payloads.push(args[2])
                return Promise.resolve({ type: 'integer' as const, value: 1 })
            },
        },
        { psubscribe: () => {} },
        {
            prefix: 'mixed-fleet',
            control: { secret: SECRET },
        },
    )
    await driver.publishControl({
        kind: 'revoke-channel',
        target: 'c1',
        channel: ROOM,
    })
    await driver.close()

    assertEquals(payloads.length, 1)
    const wire = JSON.parse(payloads[0]) as Record<string, unknown>

    // The field set an instance of EITHER release canonicalises.
    const canonical = new TextEncoder().encode(JSON.stringify({
        kind: wire.kind,
        target: wire.target,
        channel: wire.channel,
        member: wire.member,
        origin: wire.origin,
        ts: wire.ts,
        nonce: wire.nonce,
    }))
    assertEquals(
        hmacSha256Hex(KEY, canonical),
        wire.mac,
        'a peer on the previous release computes this exact byte string and ' +
            'must reach the same MAC. If it does not, either the frame grew a ' +
            'field the canonical form omits — shipping it UNAUTHENTICATED — or ' +
            'it grew one the older peer cannot know about, and every frame is ' +
            'dropped as a forgery during the deploy',
    )
    assertEquals(
        Object.keys(wire).filter((k) => k !== 'mac').sort(),
        ['channel', 'kind', 'nonce', 'origin', 'target', 'ts'],
        'and the frame carries NO NEW FIELD. This is the assertion that makes ' +
            'the one above meaningful: a new field added to both the wire and ' +
            'the canonical form would keep the MACs matching here while ' +
            'breaking every peer that has not been upgraded',
    )
})

Deno.test('#332 a previous-release peer receiving the new kind does NOTHING', async () => {
    // `handleControl`'s switch has three arms and no `default`, so an unknown
    // kind falls off the end. Modelled by handing a manager a frame it does
    // not know: the `evict` arm must not fire, and nothing may be torn down.
    let deliver: ((control: ControlMessage) => void) | undefined
    const roster = new Map<string, Map<string, PresenceMember>>()
    const driver: BroadcastDriver = {
        publish: () => {},
        onMessage: () => {},
        onControl(handler) {
            deliver = handler
        },
        publishControl: () => Promise.resolve(),
        addMember(channel, member) {
            let members = roster.get(channel)
            if (!members) roster.set(channel, members = new Map())
            members.set(String(member.id), member)
            return Promise.resolve()
        },
        removeMember(channel, memberId) {
            roster.get(channel)?.delete(String(memberId))
        },
        listMembers(channel) {
            return [...(roster.get(channel)?.values() ?? [])]
        },
        watchChannel: () => {},
        unwatchChannel: () => {},
    }
    const m = new ChannelManager<User>({
        driver,
        authorize: (identity: User | null) =>
            identity ? { id: identity.id } : false,
    })
    const holder = conn('c1', 1)
    await m.subscribe(holder, ROOM)

    // NARROWED, not optional-chained. `deliver?.(...)` on a seam that was
    // never registered is a silent no-op, and every assertion below would then
    // pass having delivered nothing — the frame arriving IS half of what this
    // test claims.
    assert(deliver !== undefined, 'the control seam was registered')
    const send = deliver as (control: ControlMessage) => void

    // A kind this manager's switch does not carry — the shape a peer running
    // an older release sees when the new one publishes.
    send({ kind: 'no-such-kind' as never, target: 'c1', channel: ROOM })
    for (let i = 0; i < 50; i++) await Promise.resolve()

    assertEquals(
        [...(roster.get(ROOM)?.keys() ?? [])],
        ['1'],
        'inert: an unknown kind removes nothing. A `default` arm that threw ' +
            'or warned would turn a forward-compatible frame into noise on ' +
            'every peer for the length of a rolling deploy',
    )
    assertEquals(await m.unsubscribe('c1', ROOM), 'left', 'still subscribed')
})

Deno.test('#332 the accepted cost: a revoke aimed at a previous-release owner does not land', async () => {
    // Stated rather than skipped. The record is only ever applied by the
    // instance that owns the socket, and that instance is precisely the one
    // that cannot read a channel-scoped record — so the reconcile cannot
    // rescue this and no design change here would make it.
    const redis = new FakeRedis()
    redis.setTime(1_000)
    const driver = new RedisBroadcastDriver(
        { command: redis.command },
        redis.subscriberFor(),
        { prefix: PREFIX, revocationTtlSeconds: 300 },
    )
    try {
        await driver.markRevocation({ target: 'owned-by-old', channel: ROOM })
        const raw = await redis.command('ZRANGEBYSCORE', INDEX, '-inf', '+inf')
        const members = (raw as { value: { value: string }[] }).value
            .map((entry) => entry.value)

        assertEquals(
            readAsPreviousRelease(members),
            [],
            'the owner sees nothing to apply — bounded by the deploy, and ' +
                '`evict` is the verb every release obeys if certainty is ' +
                'needed mid-deploy',
        )
        assertEquals(
            redis.zcard(INDEX),
            1,
            'and the record is NOT destroyed by that reader, so the instant ' +
                'the socket moves to an upgraded instance it is applied',
        )
    } finally {
        await driver.close()
    }
})
