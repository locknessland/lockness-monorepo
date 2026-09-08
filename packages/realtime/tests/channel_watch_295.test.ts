/**
 * @fileoverview #295 — the membership funnel and the per-channel watch seam.
 *
 * `ChannelManager` now declares to the driver which channels this instance
 * hosts, so the broker sends it those and nothing else. The whole failure class
 * here is SILENT: a channel hosted but never watched drops every message while
 * `subscribe` answers `{ ok: true }`, and a channel unwatched while a live
 * subscriber holds it goes deaf permanently, because the reconnect that heals
 * every other deafness is guaranteed not to re-issue it.
 *
 * @module @lockness/realtime/tests/channel_watch_295
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import {
    ChannelLimitError,
    ChannelManager,
    MAX_CHANNELS_PER_CONNECTION,
    MAX_WATCHED_CHANNELS,
} from '../manager.ts'
import type { BroadcastDriver } from '../driver.ts'
import type { Connection } from '../types.ts'
import { RedisBroadcastDriver } from '../drivers/redis.ts'
import { recordingPorts } from './recording_ports.ts'

/** A driver that records every watch/unwatch, in order. */
function watchingDriver(options: { failWatch?: boolean } = {}): {
    driver: BroadcastDriver
    ops: string[]
} {
    const ops: string[] = []
    const driver: BroadcastDriver = {
        publish: () => {},
        onMessage: () => {},
        watchChannel: (channel) => {
            ops.push(`watch:${channel}`)
            return options.failWatch
                ? Promise.reject(new Error('broker write failed'))
                : Promise.resolve()
        },
        unwatchChannel: (channel) => {
            ops.push(`unwatch:${channel}`)
            return Promise.resolve()
        },
    }
    return { driver, ops }
}

/** A driver offering `watchChannel` and NOT `unwatchChannel` (D-5). */
function halfCapableDriver(): { driver: BroadcastDriver; ops: string[] } {
    const ops: string[] = []
    return {
        driver: {
            publish: () => {},
            onMessage: () => {},
            watchChannel: (channel) => void ops.push(`watch:${channel}`),
        },
        ops,
    }
}

function conn(id: string): Connection<null> {
    return {
        id,
        identity: null,
        metadata: {},
        send: () => {},
        close: () => {},
    } as unknown as Connection<null>
}

Deno.test('#295/FR-003: the watch fires on 0→1 and the unwatch on 1→0, and at no other time', async () => {
    const { driver, ops } = watchingDriver()
    const m = new ChannelManager({ driver })
    await m.subscribe(conn('a'), 'news')
    await m.subscribe(conn('b'), 'news')
    await m.subscribe(conn('c'), 'sport')
    assertEquals(
        ops,
        ['watch:news', 'watch:sport'],
        'two clients on one channel produce ONE watch',
    )
    await m.unsubscribe('a', 'news')
    assertEquals(ops.length, 2, 'a non-last leaver produces no wire op')
    await m.unsubscribe('b', 'news')
    assertEquals(
        ops,
        ['watch:news', 'watch:sport', 'unwatch:news'],
        'the LAST leaver unwatches, exactly once',
    )
})

Deno.test('#295/FR-011: an emptied channel leaves no entry behind, so re-joining watches again', async () => {
    // "Not hosted" must have ONE spelling. An empty `Set` left in the map is a
    // second one, it grows without bound, and a re-join against it reads as
    // already-hosted so the wire op never fires.
    const { driver, ops } = watchingDriver()
    const m = new ChannelManager({ driver })
    await m.subscribe(conn('a'), 'news')
    await m.unsubscribe('a', 'news')
    await m.subscribe(conn('b'), 'news')
    assertEquals(ops, ['watch:news', 'unwatch:news', 'watch:news'])
})

Deno.test("#295/FR-012: disconnect unwatches THIS connection's channels, not every channel hosted", async () => {
    // `disconnect` used to iterate every channel this instance had ever hosted
    // and call `unsubscribe` for each. That was harmless only while a 1→0
    // transition had no wire op — it acquired one here. It was also O(channels
    // under the prefix) per disconnect.
    const { driver, ops } = watchingDriver()
    const m = new ChannelManager({ driver })
    await m.subscribe(conn('a'), 'alpha')
    await m.subscribe(conn('b'), 'beta')
    await m.subscribe(conn('b'), 'gamma')
    ops.length = 0
    await m.disconnect('b')
    assertEquals(
        ops.sort(),
        ['unwatch:beta', 'unwatch:gamma'],
        'alpha still has a live subscriber and must NOT be unwatched',
    )
})

Deno.test('#295/FR-002: a refused watch keeps the membership and warns', async () => {
    // A rejection means the frame did not reach the socket. It does NOT mean
    // the channel is unhosted: the driver re-issues from its own recorded set,
    // so dropping the membership here would turn a transient write failure into
    // permanent local deafness.
    const { driver } = watchingDriver({ failWatch: true })
    const m = new ChannelManager({ driver })
    const warnings: string[] = []
    const realWarn = console.warn
    console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(' '))
    }
    try {
        const result = await m.subscribe(conn('a'), 'news')
        assertEquals(
            result,
            { ok: true },
            "the join succeeded; delivery resumes on the driver's own retry",
        )
    } finally {
        console.warn = realWarn
    }
    assert(
        warnings.some((w) => w.includes('could not subscribe to')),
        'the refusal is reported, never silent',
    )
    // Still hosted, which is the half that matters: the leave must still find
    // a membership to remove.
    await m.unsubscribe('a', 'news')
})

Deno.test("#295/FR-025: a driver with watch and NO unwatch keeps today's behaviour", async () => {
    // Detected as a SET. Watching without unwatching makes the subscribed set
    // monotonic over the process lifetime — one permanent subscription per
    // channel ever hosted, strictly worse than the prefix-wide subscription it
    // replaces, and invisible because delivery stays correct.
    const { driver, ops } = halfCapableDriver()
    const m = new ChannelManager({ driver })
    await m.subscribe(conn('a'), 'news')
    await m.unsubscribe('a', 'news')
    assertEquals(ops, [], 'neither op fires: the pair is all-or-nothing')
})

Deno.test('#295: a driver with neither op is untouched — the memory driver stays single-glob', async () => {
    const plain: BroadcastDriver = { publish: () => {}, onMessage: () => {} }
    const m = new ChannelManager({ driver: plain })
    const r = await m.subscribe(conn('a'), 'news')
    assertEquals(r, { ok: true })
    await m.disconnect('a')
})

Deno.test('#295/SC-017: a cap breach WARNs with the actual count and admits the subscribe', async () => {
    // FR-017b's first release. The WARN has to carry the NUMBER, because the
    // whole reason the refusal waits a release is that nothing in the framework
    // measures channels-per-instance and no one — this plan included — can say
    // whether 1 000 is generous or tight. A WARN that only says "at the limit"
    // answers nothing and the release buys nothing.
    const { driver } = watchingDriver()
    const m = new ChannelManager({ driver })
    const warnings: string[] = []
    const realWarn = console.warn
    console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(' '))
    }
    try {
        // One connection, past the per-connection cap.
        const c = conn('greedy')
        for (let i = 0; i <= MAX_CHANNELS_PER_CONNECTION; i++) {
            const r = await m.subscribe(c, `ch${i}`)
            assertEquals(
                r,
                { ok: true },
                'this release ADMITS the subscribe; the next one refuses it',
            )
        }
    } finally {
        console.warn = realWarn
    }
    const breach = warnings.filter((w) => w.includes('watched channels'))
    assert(breach.length > 0, 'the breach was not reported at all')
    assertStringIncludes(
        breach[0],
        `holds ${MAX_CHANNELS_PER_CONNECTION} watched channels`,
        'the WARN must name the ACTUAL count, not just the limit — that ' +
            'number is the only thing the warning release exists to collect',
    )
    assertStringIncludes(
        breach[0],
        'ChannelLimitError',
        'the WARN must name what the next release will raise',
    )
})

Deno.test('#295/FR-017: a join that grows NO set is not charged against a cap', async () => {
    // A second client on a hosted channel adds no broker subscription, and a
    // client re-joining a channel it already holds adds nothing either.
    // Charging for those refuses work that costs the broker nothing — and it is
    // the easy mistake, because `subscribe` is called either way.
    const { driver } = watchingDriver()
    const m = new ChannelManager({ driver })
    const warnings: string[] = []
    const realWarn = console.warn
    console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(' '))
    }
    try {
        const c = conn('a')
        for (let i = 0; i < MAX_CHANNELS_PER_CONNECTION; i++) {
            await m.subscribe(c, `ch${i}`)
        }
        // AT the limit, not past it. Re-joining a channel already held must not
        // report a breach.
        await m.subscribe(c, 'ch0')
        // And a SECOND connection joining an already-hosted channel adds no
        // subscription to the instance's set.
        await m.subscribe(conn('b'), 'ch0')
    } finally {
        console.warn = realWarn
    }
    assertEquals(
        warnings.filter((w) => w.includes('watched channels')),
        [],
        'a join that grows no set was charged against a cap',
    )
})

Deno.test('#295/FR-019: the delivered TOPIC decides the channel, never the watched one', async () => {
    // The shape an implementer reaches for, because `channel` is right there in
    // scope: `watchChannel(ch)` closing over `ch` and handing it to the
    // handler. It looks correct. It also makes `onMessage`'s deny-by-default
    // `topic.startsWith(marker)` check and its fixed-offset slice dead code,
    // and a later tidy-up removes dead code with a clean conscience.
    //
    // The witness feeds the recorded handler a topic for a DIFFERENT channel
    // than the one watched. A closure-carried channel answers `alpha`; the
    // topic-derived one answers `beta`, which is what the broker actually said.
    const { command, subscriber, recording } = recordingPorts({})
    const driver = new RedisBroadcastDriver(command, subscriber, {
        prefix: 'app',
    })
    const got: string[] = []
    try {
        driver.onMessage((m) => got.push(m.channel))
        await driver.watchChannel('alpha')
        const sub = recording.subscriptions.find((s) =>
            s.pattern === 'app__event:alpha'
        )!
        assert(sub !== undefined, 'the watch reached the subscriber')
        sub.handler(
            'app__event:beta',
            JSON.stringify({ event: 'e', data: null }),
        )
        assertEquals(
            got,
            ['beta'],
            'the message was attributed to the WATCHED channel rather than the ' +
                'delivered topic — a closure is carrying the channel into ' +
                'delivery, and the topic check above it is now dead code',
        )
    } finally {
        await driver.close()
    }
})

Deno.test('#295/FR-019: a topic outside the marker is dropped, not renamed', async () => {
    // The other half, and the reason the first one matters. Deny by default:
    // a topic the subscription could not have produced must reach nothing, not
    // become a plausible channel name nobody chose.
    const { command, subscriber, recording } = recordingPorts({})
    const driver = new RedisBroadcastDriver(command, subscriber, {
        prefix: 'app',
    })
    const got: string[] = []
    const warnings: string[] = []
    const realWarn = console.warn
    console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(' '))
    }
    try {
        driver.onMessage((m) => got.push(m.channel))
        await driver.watchChannel('alpha')
        const sub = recording.subscriptions.find((s) =>
            s.pattern === 'app__event:alpha'
        )!
        sub.handler('app__control', JSON.stringify({ event: 'e', data: null }))
        assertEquals(
            got,
            [],
            'a topic outside the event marker reached fan-out',
        )
    } finally {
        console.warn = realWarn
        await driver.close()
    }
    assert(
        warnings.some((w) => w.includes('event marker')),
        'the drop was silent',
    )
})

Deno.test('#295/SC-017: the INSTANCE cap is a distinct branch, and it warns on its own', async () => {
    // The per-connection cap had a witness; this one had none. The only cap
    // test loops 101 channels on ONE connection, so `subscriptions.size` never
    // approached 1 000 — and its filter matched both WARN strings, so it could
    // not have told the branches apart even if it had reached this one.
    //
    // Driven with one connection per channel, so the per-connection cap stays
    // well clear and only the instance branch can fire.
    const { driver } = watchingDriver()
    const m = new ChannelManager({ driver })
    const warnings: string[] = []
    const realWarn = console.warn
    console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(' '))
    }
    try {
        for (let i = 0; i <= MAX_WATCHED_CHANNELS; i++) {
            const r = await m.subscribe(conn(`c${i}`), `ch${i}`)
            assertEquals(r, { ok: true }, 'this release admits the subscribe')
        }
    } finally {
        console.warn = realWarn
    }
    const instance = warnings.filter((w) => w.includes('this instance holds'))
    const perConn = warnings.filter((w) => w.includes('connection'))
    assert(
        instance.length > 0,
        'the instance-wide cap never warned, so its branch is unexecuted',
    )
    assertEquals(
        perConn.length,
        0,
        'the per-connection branch fired on a run that gives each channel its ' +
            'own connection — the two branches are not distinguishable',
    )
    assertStringIncludes(
        instance[0],
        `holds ${MAX_WATCHED_CHANNELS} watched channels`,
        'the WARN must name the ACTUAL count, which is what the warning ' +
            'release exists to collect',
    )
})

Deno.test('#295/FR-017: ChannelLimitError is a usable error today, before it is ever raised', async () => {
    // New exported public API that nothing constructs. It is deliberately
    // unraisable this release (FR-017b) and exported anyway, so an application
    // can catch it before it can be thrown — which is worth exactly nothing if
    // it is not an Error, does not carry its name, or is not instanceof-usable.
    // That is the contract `ConnectionIdError` was exported to establish.
    const error = new ChannelLimitError('connection', 100, 100)
    assert(error instanceof Error, 'it must be catchable as an Error')
    assert(
        error instanceof ChannelLimitError,
        'and narrowable to itself — an application catches on this',
    )
    assertEquals(error.name, 'ChannelLimitError')
    assertEquals(error.scope, 'connection')
    assertEquals(error.count, 100)
    assertEquals(error.limit, 100)
    assertStringIncludes(error.message, '100')
    assertStringIncludes(
        error.message,
        'reconnect',
        'the message must say WHY the set is bounded — each channel is a ' +
            'subscription re-issued on every reconnect — or an operator ' +
            'reading it just raises the limit',
    )
    // Exported from the package root, not only from the module.
    const mod = await import('../mod.ts')
    assertEquals(
        (mod as { ChannelLimitError?: unknown }).ChannelLimitError,
        ChannelLimitError,
        'an application imports from the package root',
    )
})
