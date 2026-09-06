/**
 * @fileoverview #282 — every name the Redis driver derives from `prefix` is
 * anchored under it, proved at the port boundary.
 *
 * **Two mechanisms were designed for this and both were shown blind before a
 * line was written.** `SCAN MATCH ${prefix}*` returns only keys already under
 * the prefix, so it cannot observe an unanchored one. A whole-keyspace diff
 * observes a name only if that name *becomes a key* — and five of the driver's
 * ten never do: `topic` is a `PUBLISH` argument, `controlTopic` a
 * `PSUBSCRIBE`/`PUBLISH` argument, `${prefix}:*` is a subscription, and the two
 * legacy names are documented at `drivers/redis.ts:889` as "read, never reaped
 * and never written".
 *
 * The port sees all ten. Both dependencies are constructor-injected
 * (`drivers/redis.ts:450-453`), so a recorder over them needs no broker.
 *
 * **Which strings count as prefix-derived is decided differentially**, not by a
 * table of key positions per command: the same exercise runs under two distinct
 * prefixes, and every captured string that differs between the runs is derived
 * from the prefix by construction. There is no model of Redis here to drift.
 *
 * ## Mutations run against this file (#282 FR-007)
 *
 * Re-derived after the review gate, not extended. The first table attributed
 * the `ownedKey`/`aliveKey` mutations to `SC-001`, and the gate proved `SC-001`
 * did not catch them — a mutation table listing a test that does not fail is
 * worse than no table, because it is read as evidence.
 *
 * Each was applied, observed RED, and reverted:
 *
 * | Mutation | Caught by |
 * | :--- | :--- |
 * | `isAnchored` weakened to `startsWith` | `FR-003` |
 * | Each of the nine members un-anchored, in turn | `SC-001` (count pinned) |
 * | The `:634` subscribe pattern un-anchored | `SC-001`, `FR-001` |
 * | A `psubscribe` site dropped from the recorder | `FR-001` |
 * | A member removed from the pinned roster | `SC-004` |
 * | The glob guard removed | `SC-005` |
 * | Each of the five guard characters dropped in turn | `SC-005` |
 * | `globMatches` neutered to `return true` | `globMatches models the broker` |
 *
 * Sixteen mutations, sixteen red. Three of them were GREEN before the review
 * gate: `ownedKey` and `aliveKey` embed a per-driver `crypto.randomUUID()`, so
 * the differential's normalise-match dropped them and `SC-001` covered eight of
 * ten while appearing to cover all; and `globMatches` had never executed at all,
 * because its only caller was an ignored test.
 *
 * @module @lockness/realtime/tests/prefix_anchoring
 */

import { assert, assertEquals } from '@std/assert'
import { RedisBroadcastDriver } from '../drivers/redis.ts'
import { isAnchored, recordingPorts } from './recording_ports.ts'

/**
 * The nine members of `RedisBroadcastDriver` whose body interpolates
 * `this.prefix`, plus the inline pattern.
 *
 * **Names, not a count.** A count moves when a harmless refactor reads the
 * prefix into a local, and fails to move when a new getter does the same — the
 * exact slip-past this list exists to prevent. `SC-004` diffs this against the
 * source, so a getter added later fails by name.
 */
const PREFIX_MEMBERS: readonly string[] = [
    'topic',
    'controlTopic',
    'presenceKey',
    'ownedKey',
    'aliveKey',
    'instancesKey',
    'revocationIndexKey',
    'legacyRevokedIndexKey',
    'legacyRevokedKey',
]

/**
 * Canned replies that reach the read-only legacy paths without a store.
 *
 * They are `RespReply`-shaped, not raw JS values — the driver narrows every
 * reply through `asArray`/`asBulk`/`asInteger`, and a plain array is rejected by
 * all three. A first draft returned raw arrays and `legacyRevokedKey` was simply
 * never reached; `FR-006` is the test that said so, which is the whole reason it
 * asserts reach separately from anchoring.
 */
const CANNED = {
    // `legacyRevokedIndexKey` is read by SMEMBERS, and only a NON-EMPTY reply
    // makes the driver go on to derive `legacyRevokedKey(id)`.
    SMEMBERS: {
        type: 'array',
        value: [{ type: 'bulk', value: 'conn-legacy' }],
    },
    EXISTS: { type: 'integer', value: 1 },
    HGETALL: { type: 'array', value: [] },
    ZRANGEBYSCORE: { type: 'array', value: [] },
    EVAL: { type: 'array', value: [] },
    TIME: {
        type: 'array',
        value: [
            { type: 'bulk', value: '1757000000' },
            { type: 'bulk', value: '0' },
        ],
    },
}

/**
 * Drive every prefix-deriving path in the driver and return what crossed the
 * ports.
 *
 * No timer and no `FakeTime`: `addMember` awaits `#ensureSweepStarted()`, which
 * awaits `#heartbeat()` before installing either interval
 * (`drivers/redis.ts:733`, `:1116`), so the instance and liveness keys are
 * created synchronously on the first join.
 */
async function exercise(prefix: string) {
    const { command, subscriber, recording } = recordingPorts(CANNED)
    const driver = new RedisBroadcastDriver(command, subscriber, {
        prefix,
        control: { secret: 'a-secret-long-enough-for-the-32-byte-floor!!' },
    })
    try {
        driver.onMessage(() => {})
        driver.onControl(() => {})
        driver.onRevocationReconcile(() => {})
        await driver.publish({ channel: 'room', event: 'e', data: {} })
        await driver.publishControl({ kind: 'evict', target: 'conn-1' })
        // addMember reaches instancesKey and aliveKey too: it awaits
        // #ensureSweepStarted() -> #heartbeat() before any interval exists.
        await driver.addMember('presence-room', { id: 'u1', info: {} })
        await driver.listMembers('presence-room')
        await driver.removeMember('presence-room', 'u1')
        await driver.markRevoked('conn-1')
        // listRevoked is what reaches BOTH read-only legacy names.
        await driver.listRevoked()
    } finally {
        await driver.close()
    }
    return recording
}

Deno.test('FR-001: BOTH psubscribe sites are captured, by count', async () => {
    // A recorder that catches only the events subscription would satisfy every
    // "is it anchored" assertion below while missing `controlTopic` — the one
    // name US3 exists for, and the only one that uses no `:` separator.
    const recording = await exercise('app')
    assertEquals(
        recording.subscriptions.length,
        2,
        'the driver subscribes twice — events (drivers/redis.ts:635) and ' +
            'control (:671). Capturing one and asserting on it proves half.',
    )
    const patterns = recording.subscriptions.map((s) => s.pattern).sort()
    assertEquals(patterns, ['app:*', 'app__control'])
})

Deno.test('FR-003: anchoring is prefix PLUS a separator, not startsWith', () => {
    assert(isAnchored('app', 'app'), 'the prefix itself')
    assert(isAnchored('app:room', 'app'), 'the `:` separator')
    assert(isAnchored('app__control', 'app'), 'the `__` separator, no colon')

    // The case that makes this predicate worth having. `appx` "begins with"
    // `app`, and a `startsWith` definition would call it contained.
    assert(
        !isAnchored('appx', 'app'),
        'appx continues the prefix without a separator and is NOT anchored',
    )
    assert(
        !isAnchored('other:app:room', 'app'),
        'a prefix appearing anywhere but the start is not an anchor',
    )
    assert(!isAnchored('ap', 'app'), 'a truncation is not an anchor')
})

Deno.test('SC-001: every prefix-derived name is anchored', async () => {
    // The differential: run the same exercise under two prefixes, and take the
    // strings that CHANGED. Those are prefix-derived by construction — no
    // per-command key-position table, and nothing to drift from Redis.
    const alpha = await exercise('alpha')
    const beta = await exercise('beta')

    // A raw "differs between runs" filter OVER-captures: a signed control frame
    // carries a fresh `origin`, `ts`, `nonce` and `mac` every time.
    //
    // But normalising only the PREFIX under-captures, and that is worse. Two of
    // the ten names embed `instanceId` — a `crypto.randomUUID()` fixed per
    // driver (`drivers/redis.ts:470`) — so `alpha:owned:<uuid-A>` and
    // `beta:owned:<uuid-B>` never match however the prefix is normalised, and
    // both were silently dropped from the assertion. The review gate proved it:
    // an unanchored `ownedKey` left this whole suite green.
    //
    // That is this plan's own invariant 2 — "the observation must be capable of
    // seeing its violation" — failing for the THIRD time on this branch, after
    // the namespaced scan and the keyspace diff. So the count is now pinned:
    // under-capture cannot hide again.
    const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
    const normalise = (value: string, prefix: string) =>
        value.replaceAll(prefix, '\u0000P\u0000').replace(
            UUID,
            '\u0000ID\u0000',
        )
    const betaNormalised = new Set(
        beta.strings().map((value) => normalise(value, 'beta')),
    )
    const derived = alpha.strings().filter((value) =>
        value.includes('alpha') &&
        betaNormalised.has(normalise(value, 'alpha'))
    )

    // The exact SET, not `> 0` and not a count.
    //
    // `> 0` let two names vanish. A pinned COUNT then let them vanish in pairs:
    // dropping `topic` from the exercise while a second `listMembers` call adds
    // one more `presenceKey` shape keeps the total at ten, and the assertion
    // stays green with `topic` asserted by nothing. Verified — that mutation was
    // GREEN against the count and is RED against this set.
    //
    // Three instruments, three blind spots, same class each time: an
    // observation that cannot see its own violation. The set is the first one
    // that can.
    const distinct = [...new Set(derived.map((d) => d.replace(UUID, '<id>')))]
    assertEquals(
        distinct.sort(),
        [
            'alpha:*',
            'alpha:alive:<id>',
            'alpha:instances',
            'alpha:owned:<id>',
            'alpha:presence:presence-room',
            'alpha:revocations',
            'alpha:revoked',
            'alpha:revoked:conn-legacy',
            'alpha:room',
            'alpha__control',
        ],
        'the differential captured a different set of derived names than the ' +
            'nine members plus the inline pattern. A name missing here is a ' +
            'name this test says nothing about; a name added here is one the ' +
            'roster does not know about.',
    )
    for (const name of derived) {
        assert(
            isAnchored(name, 'alpha'),
            `"${name}" crossed the port unanchored. On a shared broker that is ` +
                'residue #273 teardown cannot reap, or a subscription reading ' +
                "another deployment's traffic.",
        )
    }
})

Deno.test('SC-004: the pinned roster matches the driver source', async () => {
    // Completeness is a SOURCE fact and exercise is a RUNTIME fact; one
    // criterion cannot carry both. This is the source half.
    const source = await Deno.readTextFile(
        new URL('../drivers/redis.ts', import.meta.url),
    )
    // Members whose body interpolates the prefix — the shape, not a count.
    const found = [
        ...source.matchAll(
            /(?:private |protected )?(\w+)\([^)]*\)(?::[^{]+)?\{\s*return `\$\{this\.prefix\}/g,
        ),
    ].map((m) => m[1]).sort()

    assertEquals(
        found,
        [...PREFIX_MEMBERS].sort(),
        'the driver gained or lost a prefix-deriving member. Update ' +
            'PREFIX_MEMBERS **and** confirm the exercise drives the new one — ' +
            'a roster that is edited to go green is a roster that tracks nothing.',
    )
})

Deno.test('FR-006: every pinned member is actually driven by the exercise', async () => {
    // A name can exist, be anchored, and never be reached. Then the containment
    // claim covers a smaller set than it appears to.
    const recording = await exercise('alpha')
    // EXACT strings, not a joined blob. A substring search over the join looks
    // right and is not: `alpha:revoked` is contained in
    // `alpha:revoked:conn-legacy`, so a legacyRevokedIndexKey that was never
    // driven would still "be found" inside the other name. This guard is the
    // one that caught the first recorder bug; it would not have caught a second.
    const seen = new Set(recording.strings())
    const seenList = [...seen]

    const shapes: Record<string, string> = {
        topic: 'alpha:room',
        controlTopic: 'alpha__control',
        presenceKey: 'alpha:presence:presence-room',
        ownedKey: 'alpha:owned:',
        aliveKey: 'alpha:alive:',
        instancesKey: 'alpha:instances',
        revocationIndexKey: 'alpha:revocations',
        legacyRevokedIndexKey: 'alpha:revoked',
        legacyRevokedKey: 'alpha:revoked:',
    }
    assertEquals(
        Object.keys(shapes).sort(),
        [...PREFIX_MEMBERS].sort(),
        'every pinned member has a shape to look for',
    )
    for (const [member, shape] of Object.entries(shapes)) {
        // A name with a variable tail (`owned:<uuid>`) is matched by prefix
        // against a WHOLE captured string; a fixed name must be present whole.
        const hit = shape.endsWith(':')
            ? seenList.some((value) => value.startsWith(shape))
            : seen.has(shape)
        assert(
            hit,
            `${member} was never driven — the exercise does not reach it, so ` +
                'SC-001 says nothing about it',
        )
    }
})

/**
 * Redis glob matching, for the shapes this driver produces.
 *
 * Hand-rolled because the assertion below is about what a broker WOULD deliver,
 * and no broker is involved. It handles `*` (any run, `:` included), `?` (one
 * character) and `\` (escape) — an earlier version let `?` through unescaped, so
 * it reached the regex as a quantifier and meant something else entirely, and
 * inverted `\`. It does not model `[…]` classes; the driver emits none, and
 * `assertUsablePrefix` refuses a prefix that could introduce one.
 */
function globMatches(pattern: string, topic: string): boolean {
    let out = ''
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i]
        if (c === '\\' && i + 1 < pattern.length) {
            out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        } else if (c === '*') out += '.*'
        else if (c === '?') out += '.'
        else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    return new RegExp(`^${out}$`).test(topic)
}

Deno.test('globMatches models the broker well enough to be trusted', () => {
    // This helper is #288's evidence. If it is wrong, the P0 is misfiled — which
    // is worse than not filing it. It ran nowhere until the review gate pointed
    // out that its only caller was an ignored test.
    assert(globMatches('app:*', 'app:room'))
    assert(globMatches('app:*', 'app:eu:orders'), '`*` spans `:` — the leak')
    assert(!globMatches('app:*', 'other:room'))
    assert(
        globMatches('app?x', 'appzx'),
        '`?` is one character, not a quantifier',
    )
    assert(!globMatches('app?x', 'appx'), '`?` requires a character')
    assert(globMatches('a\\*b', 'a*b'), 'an escaped star is a literal star')
    assert(!globMatches('a\\*b', 'azzb'), 'and matches nothing else')
    assert(!globMatches('app__control', 'app:eu__control'))
    // The trailing-escape branch, which nothing reached: flipping its bound to
    // `<=` left the suite green even though the branch is correct.
    assert(globMatches('a\\', 'a\\'), 'a trailing backslash is a literal')
})

Deno.test('SC-002: the nested-prefix disclosure, asserted as it behaves TODAY', async () => {
    // #288 is REAL and is landed unfixed on purpose — the fix is a wire-format
    // change with a rolling-upgrade story, which #282 did not cost.
    //
    // An `ignore`d test was the first attempt at recording that, and it was the
    // wrong instrument: nothing ran, so `globMatches` was dead code and a
    // neutered version left the suite green. This asserts the CURRENT behaviour
    // instead. It passes today, it documents the defect precisely, and it goes
    // RED the moment #288 is fixed — at which point invert it and delete this
    // comment.
    const outer = await exercise('app')
    const inner = await exercise('app:eu')

    const outerPatterns = outer.subscriptions.map((s) => s.pattern)
    const innerTopics = inner.subscriptions
        .map((s) => s.pattern)
        .map((pattern) => pattern.replace('*', 'orders'))

    const reached: string[] = []
    for (const pattern of outerPatterns) {
        for (const topic of innerTopics) {
            if (globMatches(pattern, topic)) {
                reached.push(`${pattern} -> ${topic}`)
            }
        }
    }

    assertEquals(
        reached.sort(),
        [
            'app:* -> app:eu:orders',
            'app:* -> app:eu__control',
        ],
        'the exact reach of #288. Both topics are DELIVERED to the outer ' +
            'deployment by the broker — but only the first is disclosed: a ' +
            'control wire carries no `event` field, so drivers/redis.ts:712-714 ' +
            'drops it. The MAC is NOT bypassed; the original #288 body said it ' +
            'was and has been corrected. If this list changes, #288 changed.',
    )
})

Deno.test('SC-005: a prefix that would widen a subscription is refused', () => {
    // Not hygiene. Such a prefix is trivially "anchored" under ANY definition —
    // every name it derives begins with it — so SC-001 passes while the driver
    // subscribes to traffic it does not own. The containment test and this
    // guard cover different halves of the same property.
    // `app\\` is the one a first version missed: Redis reads `app\\:*` as the
    // literal `app:*`, so the deployment reads another's whole stream while its
    // own traffic stays invisible to that deployment.
    // ONE metacharacter each. A fixture of 'app[1]' carries both `[` and `]`, so
    // dropping `[` from the guard still threw on `]` and the whole suite stayed
    // green — the same blind spot the `\` fix had just closed, one character
    // over. A fixture that can be satisfied for the wrong reason tests nothing.
    for (const bad of ['app*', 'ap?p', 'app[x', 'appx]', 'app\\', '']) {
        let threw = false
        try {
            const { command, subscriber } = recordingPorts()
            new RedisBroadcastDriver(command, subscriber, { prefix: bad })
        } catch {
            threw = true
        }
        assert(
            threw,
            `a prefix of ${JSON.stringify(bad)} was accepted; it reaches ` +
                'PSUBSCRIBE at drivers/redis.ts:634 and :671, both pattern ' +
                'contexts',
        )
    }
})

Deno.test('SC-005: an ordinary prefix is still accepted', async () => {
    // The negative control. Without it, a guard that rejected EVERYTHING would
    // satisfy the test above.
    const recording = await exercise('lockness:realtime')
    assert(recording.subscriptions.length === 2, 'a normal prefix still works')
})
