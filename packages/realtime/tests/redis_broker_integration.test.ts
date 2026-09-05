/**
 * @fileoverview #273 — the realtime bus against a **live Redis broker**.
 *
 * Distinct from `driver_redis_live.test.ts`, which is named for a live *socket*:
 * that suite talks to the in-process RESP fake and proves the subscribe-mode
 * push path end-to-end over TCP. It cannot prove anything else, because the fake
 * answers ten commands of which exactly two (`SET`, `DEL`) are ones the driver's
 * command connection issues. Presence, eviction and the durable revocation index
 * have, until this file, only ever been checked against `fake_redis.ts` — an
 * in-process model of Redis written by the same hand as the code it validates.
 *
 * That is not a theoretical gap. During #276 the revocation index's `EXPIRE`
 * line was wrong twice in a row — first unconditional (deleting live
 * revocations), then `GT` alone (inert, because Redis reads a key with no TTL as
 * infinite) — and the full suite was green both times, because the fake modelled
 * the option flags wrongly in the same place.
 *
 * **What this suite is, and is not.** `fake_redis.ts` was corrected in the same
 * change that fixed the driver, so it now catches that specific mutation too —
 * this suite is not "the only thing that catches it". What it is, is the only
 * check that does not depend on the fake being right. Both were wrong together
 * twice, and nothing inside the repository could tell. Reverting the driver's
 * `EXPIRE … NX` line and watching *this* file go red is a statement about
 * Redis; watching the fake go red is a statement about the fake.
 *
 * Gated behind `LOCKNESS_REDIS_INTEGRATION=1`; see
 * `packages/redis/tests/live_broker.ts` for the gate, the connection contract
 * and the preflight, and `live_realtime.ts` for the key layout and read-backs.
 *
 * @module @lockness/realtime/tests/redis_broker_integration
 */

import { assert, assertEquals } from '@std/assert'
import {
    brokerConfig,
    LIVE_BROKER,
    preflight,
    runNamespace,
} from '../../redis/tests/live_broker.ts'
import { hmacSha256Hex } from '../../redis/mod.ts'
import {
    awaitSubscribers,
    connection,
    controlSecret,
    keys,
    type Reader,
    waitFor,
    withInstances,
    withReader,
} from './live_realtime.ts'

/** Register a gated `[integration]` test that owns a fresh namespace. */
function integrationTest(
    name: string,
    fn: (namespace: string, reader: Reader) => Promise<void>,
): void {
    Deno.test({
        name: `[integration] ${name}`,
        ignore: !LIVE_BROKER,
        async fn() {
            await preflight(brokerConfig())
            const namespace = runNamespace()
            await withReader(namespace, (reader) => fn(namespace, reader))
        },
    })
}

// ---------------------------------------------------------------------------
// US1 — cross-process delivery (SC-001)
// ---------------------------------------------------------------------------

integrationTest(
    'US1: a broadcast on one instance reaches an authorized subscriber on another',
    async (namespace, reader) => {
        await withInstances(2, namespace, async ([a, b]) => {
            await awaitSubscribers(reader, namespace, 2)

            const listener = connection('b-listener', { id: 1, name: 'Bea' })
            await b.manager.subscribe(listener, 'private-orders')

            a.manager.broadcast('private-orders', 'created', { id: 42 })

            await waitFor(
                () => listener.sawEvent('created'),
                'the event to cross the broker to instance B',
            )
            assert(
                listener.frames.some((f) => f.includes('42')),
                'the payload crossed intact, not just the event name',
            )
        })
    },
)
integrationTest(
    'US1: a connection B’s OWN authorizer rejects receives nothing from the bus',
    async (namespace, reader) => {
        // B refuses user 99 outright. A knows nothing about that refusal — the
        // point of S6 is that authorization is re-applied by the RECEIVING
        // instance, so a message crossing the bus carries no authority with it.
        await withInstances(2, namespace, async ([a, b]) => {
            await awaitSubscribers(reader, namespace, 2)

            const rejected = connection('b-rejected', { id: 99, name: 'Mal' })
            await b.manager.subscribe(rejected, 'private-orders')
            const allowed = connection('b-allowed', { id: 3, name: 'Dee' })
            await b.manager.subscribe(allowed, 'private-orders')

            a.manager.broadcast('private-orders', 'created', { id: 7 })
            await waitFor(
                () => allowed.sawEvent('created'),
                'delivery to the connection B authorized',
            )

            assertEquals(
                rejected.frames.some((frame) => frame.includes('created')),
                false,
                'B’s authorizer rejected this connection, so no bus message ' +
                    'reaches it — A’s broadcast carries no authority of its own',
            )
        }, {
            authorize: (index) => (identity) => {
                if (index === 1 && identity?.id === 99) return false
                return identity
                    ? { id: identity.id, info: { name: identity.name } }
                    : false
            },
        })
    },
)

// ---------------------------------------------------------------------------
// US2 — authoritative presence (SC-002)
// ---------------------------------------------------------------------------

integrationTest(
    'US2: the roster read OUT OF REDIS lists both instances’ members',
    async (namespace, reader) => {
        await withInstances(2, namespace, async ([a, b]) => {
            await awaitSubscribers(reader, namespace, 2)

            const onA = connection('a-1', { id: 11, name: 'Ana' })
            const onB = connection('b-1', { id: 22, name: 'Bo' })
            await a.manager.subscribe(onA, 'presence-lobby')
            await b.manager.subscribe(onB, 'presence-lobby')

            // Read back with a RAW HGETALL on a client the suite owns — never
            // through driver.listMembers(), which would route the assertion
            // back through the parsing layer under test (FR-008).
            await waitFor(
                async () =>
                    (await reader.roster(namespace, 'presence-lobby')).size >=
                        2,
                'both members to reach the authoritative roster',
            )
            const roster = await reader.roster(namespace, 'presence-lobby')

            assertEquals(
                [...roster.keys()].sort(),
                ['11', '22'],
                'both instances’ members are in the Redis roster',
            )

            // Each entry is tagged with its OWNING instance, which is what the
            // ghost sweep keys off. Two members on two instances must carry two
            // distinct owners — a single owner would mean the roster cannot
            // tell whose socket died.
            const owners = [...roster.values()].map((entry) =>
                (entry as { owner?: string }).owner
            )
            assert(
                owners.every((owner) => typeof owner === 'string' && owner),
                `every roster entry is owner-tagged: ${JSON.stringify(owners)}`,
            )
            assertEquals(
                new Set(owners).size,
                2,
                'the two members are tagged to two DIFFERENT instances',
            )
        })
    },
)

integrationTest(
    'US2: each client observed a joined for the other, across the broker',
    async (namespace, reader) => {
        await withInstances(2, namespace, async ([a, b]) => {
            await awaitSubscribers(reader, namespace, 2)

            const onA = connection('a-2', { id: 33, name: 'Cai' })
            await a.manager.subscribe(onA, 'presence-lobby')
            const onB = connection('b-2', { id: 44, name: 'Di' })
            await b.manager.subscribe(onB, 'presence-lobby')

            // Asserted on the ACTION, not a bare id: a `left` frame carries the
            // same member id, so `includes('44')` alone would have been
            // satisfied by the opposite event.
            //
            // One direction only, and that is correct rather than a gap. A
            // `joined` is announced at the moment of joining; A was already
            // subscribed when B joined, so A receives it across the broker. B
            // subscribed second and there is no replay of past joins — a later
            // joiner learns who is already here from the AUTHORITATIVE ROSTER,
            // which US2's first test asserts by reading Redis directly. Plan §2
            // says "each observed a joined for the other", which is idealised:
            // it only holds if both joined after both were subscribed.
            await waitFor(
                () =>
                    onA.frames.some((f) =>
                        f.includes('"joined"') && f.includes('44')
                    ),
                'A to observe B’s member JOINING across the broker',
            )
            assertEquals(
                onB.frames.some((f) =>
                    f.includes('"joined"') && f.includes('33')
                ),
                false,
                'and B does NOT get a replayed join for the member that was ' +
                    'already there — it reads the roster instead',
            )
        })
    },
)

// ---------------------------------------------------------------------------
// US3 — cross-process eviction (SC-003)
// ---------------------------------------------------------------------------

integrationTest(
    'US3: an evict issued on the instance that does NOT own the socket closes it',
    async (namespace, reader) => {
        await withInstances(2, namespace, async ([a, b]) => {
            await awaitSubscribers(reader, namespace, 2)

            const watcherOnA = connection('watch-a', { id: 51, name: 'Wa' })
            const watcherOnB = connection('watch-b', { id: 52, name: 'Wb' })
            await a.manager.subscribe(watcherOnA, 'presence-lobby')
            await b.manager.subscribe(watcherOnB, 'presence-lobby')

            const target = connection('owned-by-a', { id: 55, name: 'Eli' })
            await a.manager.subscribe(target, 'presence-lobby')

            // Positive read FIRST, so the absence assertion below cannot pass
            // vacuously against a mistyped key (FR-009).
            await waitFor(
                async () =>
                    (await reader.roster(namespace, 'presence-lobby')).has(
                        '55',
                    ),
                'the member to appear in the roster before it is evicted',
            )
            const before = await reader.roster(namespace, 'presence-lobby')
            assert(
                before.has('55'),
                'the member IS in the roster to begin with',
            )

            // B evicts a socket it does not own.
            await b.manager.evict('owned-by-a')

            await waitFor(
                () => target.closed() > 0,
                'the owning instance to close the evicted socket',
            )
            await waitFor(
                async () =>
                    !(await reader.roster(namespace, 'presence-lobby')).has(
                        '55',
                    ),
                'the member to leave the authoritative roster',
            )

            // The third clause of US3, which had no assertion at all: presence
            // subscribers on BOTH instances see the `left`. On B that frame can
            // only have arrived over the bus, as a presence-leave control frame
            // from the owning instance — there is no local path to it.
            await waitFor(
                () =>
                    watcherOnA.frames.some((f) => f.includes('"left"')) &&
                    watcherOnB.frames.some((f) => f.includes('"left"')),
                'both instances’ presence subscribers to observe the `left`',
            )
            const after = await reader.roster(namespace, 'presence-lobby')
            assertEquals(
                after.has('55'),
                false,
                'the evicted member is gone from the Redis roster',
            )
        })
    },
)

// ---------------------------------------------------------------------------
// US4 — the durable revocation index under REAL Redis semantics
// ---------------------------------------------------------------------------

integrationTest(
    'US4: markRevoked ARMS a TTL on the index — the inert EXPIRE GT would not',
    async (namespace, reader) => {
        await withInstances(1, namespace, async ([a]) => {
            await a.driver.markRevoked('victim-1')

            const ttl = await reader.ttlOf(keys(namespace).revocations)
            assert(
                ttl > 0,
                'the revocation index carries a TTL. A -1 here is the exact ' +
                    'defect shipped mid-#276: EXPIRE ... GT alone can never arm ' +
                    'a TTL, because Redis reads a key with no TTL as infinite. ' +
                    `Got ${ttl}.`,
            )
        })
    },
)

integrationTest(
    'US4: the index TTL extends but never shrinks',
    async (namespace, reader) => {
        const key = keys(namespace).revocations
        await withInstances(1, namespace, async ([short]) => {
            await short.driver.markRevoked('victim-2')
            const armed = await reader.ttlOf(key)
            assert(armed > 0, `armed on first write, got ${armed}`)

            await withInstances(1, namespace, async ([long]) => {
                await long.driver.markRevoked('victim-3')
                const extended = await reader.ttlOf(key)
                // A numeric FLOOR, not `>=`. Reviewed and confirmed by
                // mutation: with `extended >= armed`, deleting the driver's
                // `EXPIRE ... GT` line — whose only job is extension — left
                // every test in this suite green, because an unmoved TTL
                // satisfies `>=` perfectly.
                assert(
                    extended > armed + 300,
                    'a 900s write must actually EXTEND a 300s TTL, not merely ' +
                        `fail to shrink it: ${armed} -> ${extended}`,
                )
            }, { revocationTtlSeconds: 900 })

            const afterLong = await reader.ttlOf(key)
            await withInstances(1, namespace, async ([shorter]) => {
                await shorter.driver.markRevoked('victim-4')
                const afterShort = await reader.ttlOf(key)
                assert(
                    afterShort >= afterLong - 5,
                    'a SHORTER-TTL instance never shrinks the index TTL ' +
                        `(EXPIRE ... GT): ${afterLong} -> ${afterShort}`,
                )
            }, { revocationTtlSeconds: 30 })
        }, { revocationTtlSeconds: 300 })
    },
)

integrationTest(
    'US4: listRevoked returns live entries, read back raw',
    async (namespace, reader) => {
        await withInstances(1, namespace, async ([a]) => {
            await a.driver.markRevoked('victim-5')
            await a.driver.markRevoked('victim-6')

            const live = await reader.revoked(namespace)
            assertEquals(
                live.sort(),
                ['victim-5', 'victim-6'],
                'both revocations are in the index, read via a raw ' +
                    'ZRANGEBYSCORE rather than through driver.listRevoked()',
            )
        })
    },
)

integrationTest(
    'US4: listRevoked REAPS expired entries and keeps live ones',
    async (namespace, reader) => {
        // The only test that makes LIST_REVOKED_SCRIPT actually execute against
        // a real Redis. `listRevoked()` is the ACTION here, not the assertion —
        // every claim below is read back raw (FR-008).
        await withInstances(1, namespace, async ([a]) => {
            const index = keys(namespace).revocations
            const now = await reader.now()

            // One entry already expired, planted directly at a past score.
            await reader.command('ZADD', index, String(now - 60), 'stale-one')
            // One live entry, written by the driver itself.
            await a.driver.markRevoked('live-one')

            assertEquals(
                (await reader.revokedAtAnyScore(namespace)).sort(),
                ['live-one', 'stale-one'],
                'both are present before the reaper runs',
            )

            await a.driver.listRevoked?.()

            assertEquals(
                (await reader.revokedAtAnyScore(namespace)).sort(),
                ['live-one'],
                'the expired entry is REAPED from the index, not merely ' +
                    'filtered out of the reply',
            )
            assertEquals(
                await reader.revoked(namespace),
                ['live-one'],
                'and the live entry’s score is genuinely in the future — a ' +
                    '-inf read cannot tell these two cases apart, which is how ' +
                    'a revocation scored into the past would ship green',
            )
        })
    },
)

integrationTest(
    'US4: the index is bounded — re-revoking the same target adds no member',
    async (namespace, reader) => {
        await withInstances(1, namespace, async ([a]) => {
            await a.driver.markRevoked('victim-7')
            await a.driver.markRevoked('victim-7')
            await a.driver.markRevoked('victim-7')

            assertEquals(
                await reader.zcard(keys(namespace).revocations),
                1,
                'ZADD ... GT updates the score in place; it never appends',
            )
        })
    },
)

integrationTest(
    'US4: the legacy revoked SET is never written (dual-read only)',
    async (namespace, reader) => {
        await withInstances(1, namespace, async ([a]) => {
            await a.driver.markRevoked('victim-8')

            // Enumerate what the driver ACTUALLY created, rather than probing a
            // key name this file supplies. A seed-and-re-read probe on the same
            // helper constant proves only that the key is writable: mistype the
            // constant and the probe still passes, because both halves are
            // mistyped together. The driver never writes this key, so there is
            // nothing to observe its spelling from — the honest assertion is
            // over the whole namespace.
            const created = await reader.scanKeys(namespace)
            assert(
                created.length > 0,
                'the driver created SOMETHING — otherwise every absence ' +
                    `assertion below is vacuous. Found: ${created.join(', ')}`,
            )
            assert(
                created.includes(`${namespace}:revocations`),
                'the sorted-set index is the key that WAS written: ' +
                    created.join(', '),
            )
            assertEquals(
                created.filter((key) => key.endsWith(':revoked')),
                [],
                'the legacy SET is read during rollout but never written — ' +
                    `keys under the run: ${created.join(', ')}`,
            )
        })
    },
)

// ---------------------------------------------------------------------------
// #272 FR-010 — anti-replay, against a live broker
// ---------------------------------------------------------------------------

integrationTest(
    '#272: a control frame replayed on a LIVE broker is obeyed once, not twice',
    async (namespace, reader) => {
        // Deliberately a presence-join and NOT an evict. A replayed evict is a
        // no-op on its own merits — the target is already gone, so the socket
        // stays closed whether anti-replay works or not — and an earlier draft
        // of this test asserted exactly that. It passed with the replay check
        // fully disabled. A presence-join re-emits to every subscriber on every
        // delivery, so the count is a real signal.
        const secret = controlSecret()
        await withInstances(1, namespace, async ([a]) => {
            await awaitSubscribers(reader, namespace, 1)

            const watcher = connection('watcher', { id: 1, name: 'Wat' })
            await a.manager.subscribe(watcher, 'presence-lobby')
            const joinsSeen = () =>
                watcher.frames.filter((f) =>
                    f.includes('"joined"') && f.includes('4242')
                ).length

            const wire = {
                kind: 'presence-join',
                target: 'peer-conn',
                channel: 'presence-lobby',
                member: { id: 4242, info: { name: 'Ghost' } },
                origin: 'peer-instance',
                ts: Date.now(),
                nonce: Array.from(
                    crypto.getRandomValues(new Uint8Array(16)),
                    (b) => b.toString(16).padStart(2, '0'),
                ).join(''),
            }
            const mac = hmacSha256Hex(
                new TextEncoder().encode(secret),
                new TextEncoder().encode(JSON.stringify(wire)),
            )
            const frame = JSON.stringify({ ...wire, mac })
            const topic = keys(namespace).controlTopic

            // First delivery: a legitimate frame from a peer, obeyed.
            await reader.command('PUBLISH', topic, frame)
            await waitFor(
                () => joinsSeen() === 1,
                'the legitimate join to land',
            )

            // The attacker's entire capability: the same bytes, again.
            await reader.command('PUBLISH', topic, frame)
            await reader.command('PUBLISH', topic, frame)
            await new Promise((resolve) => setTimeout(resolve, 150))

            assertEquals(
                joinsSeen(),
                1,
                'two replays of the exact frame over a real broker are refused ' +
                    '— without the check this would be 3',
            )
        }, { secret })
    },
)
