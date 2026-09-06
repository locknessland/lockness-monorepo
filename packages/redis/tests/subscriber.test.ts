/**
 * @fileoverview The subscribe-mode connection over a loopback pub/sub fake.
 *
 * The exclusive-mode socket for `@lockness/realtime`'s `RedisSubscriber` port
 * (#268, FR-001/002/003): it opens its OWN socket (never a `RedisClient`'s
 * serialized-command socket), issues `PSUBSCRIBE`, dispatches each pushed
 * `pmessage` frame through the bounded `resp.ts` reader, and on a forced wire
 * fault reconnects and re-issues every active `PSUBSCRIBE` — logged at WARN,
 * never silent. Exercised against the byte fake in `fake_server.ts`; no live
 * Redis.
 *
 * @module @lockness/redis/tests/subscriber
 */

import { assert, assertEquals } from '@std/assert'
import { RedisSubscribeConnection } from '../subscriber.ts'
import { type FakeServer, startFakeServer } from './fake_server.ts'

/** Poll `cond` until it holds or the deadline passes (a fake-socket race gate). */
async function waitFor(
    cond: () => boolean,
    message: string,
    timeoutMs = 2000,
): Promise<void> {
    const start = Date.now()
    while (!cond()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error(`waitFor timed out: ${message}`)
        }
        await new Promise((r) => setTimeout(r, 5))
    }
}

/** How many PSUBSCRIBE commands the server has seen for `pattern`. */
function psubscribeCount(server: FakeServer, pattern: string): number {
    return server.commandLog.filter(
        (c) => c[0]?.toUpperCase() === 'PSUBSCRIBE' && c[1] === pattern,
    ).length
}

/**
 * Run `body` with `console.warn` captured; restores it even if `body` throws.
 */
async function captureWarnings(
    body: () => Promise<void>,
): Promise<string[]> {
    const messages: string[] = []
    const real = console.warn
    console.warn = (...args: unknown[]) => {
        messages.push(args.map((a) => String(a)).join(' '))
    }
    try {
        await body()
    } finally {
        console.warn = real
    }
    return messages
}

Deno.test('subscriber - opens its own socket, PSUBSCRIBEs, and delivers pushed messages', async () => {
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
    })
    const got: Array<[string, string]> = []
    try {
        sub.psubscribe('app:*', (topic, payload) => got.push([topic, payload]))
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 1,
            'the PSUBSCRIBE reached the wire',
        )
        assert(server.accepts() >= 1, 'the subscriber dialled its own socket')
        server.publish('app:*', 'app:room', '{"event":"msg"}')
        await waitFor(() => got.length >= 1, 'the pushed message was delivered')
        assertEquals(got[0], ['app:room', '{"event":"msg"}'])
    } finally {
        await sub.close()
        server.stop()
    }
})

Deno.test('subscriber - on a wire fault it reconnects and re-issues every PSUBSCRIBE', async () => {
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
    })
    const got: Array<[string, string]> = []
    const warnings = await captureWarnings(async () => {
        try {
            sub.psubscribe(
                'app:*',
                (topic, payload) => got.push([topic, payload]),
            )
            await waitFor(
                () => psubscribeCount(server, 'app:*') >= 1,
                'the first PSUBSCRIBE reached the wire',
            )
            const acceptsBefore = server.accepts()

            // Force a wire fault: the server drops the live socket.
            server.dropConnections()

            await waitFor(
                () => server.accepts() > acceptsBefore,
                'the subscriber reconnected',
            )
            await waitFor(
                () => psubscribeCount(server, 'app:*') >= 2,
                'the subscription was re-issued after reconnect',
            )

            // Delivery resumes on the healed socket.
            server.publish('app:*', 'app:room', '{"event":"after"}')
            await waitFor(
                () => got.length >= 1,
                'delivery resumed after the reconnect',
            )
            assertEquals(got[0], ['app:room', '{"event":"after"}'])
        } finally {
            await sub.close()
            server.stop()
        }
    })
    assert(
        warnings.some((m) => m.includes('reconnect')),
        'the reconnect was logged at WARN, never silent',
    )
})

Deno.test('subscriber - re-issues ALL active patterns after a reconnect', async () => {
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
    })
    try {
        await captureWarnings(async () => {
            sub.psubscribe('a:*', () => {})
            sub.psubscribe('b:*', () => {})
            await waitFor(
                () =>
                    psubscribeCount(server, 'a:*') >= 1 &&
                    psubscribeCount(server, 'b:*') >= 1,
                'both patterns subscribed',
            )
            const before = server.accepts()
            server.dropConnections()
            await waitFor(
                () => server.accepts() > before,
                'reconnected',
            )
            await waitFor(
                () =>
                    psubscribeCount(server, 'a:*') >= 2 &&
                    psubscribeCount(server, 'b:*') >= 2,
                'both patterns were re-issued on the healed socket',
            )
        })
    } finally {
        await sub.close()
        server.stop()
    }
})

Deno.test('subscriber - authenticates via the shared primitive before subscribing', async () => {
    const server = await startFakeServer()
    let sub: RedisSubscribeConnection | undefined
    const warnings = await captureWarnings(async () => {
        // Construct inside the capture: the one-time cleartext-AUTH warning fires
        // from the shared primitive at construction.
        sub = new RedisSubscribeConnection({
            hostname: '127.0.0.1',
            port: server.port,
            password: 's3cret',
            db: 2,
            tls: false,
        })
        try {
            sub.psubscribe('app:*', () => {})
            await waitFor(
                () => psubscribeCount(server, 'app:*') >= 1,
                'subscribed after the handshake',
            )
            const ops = server.commandLog.map((c) => c[0]?.toUpperCase())
            const authIdx = ops.indexOf('AUTH')
            const psubIdx = ops.indexOf('PSUBSCRIBE')
            assert(authIdx >= 0, 'AUTH ran')
            assert(
                authIdx < psubIdx,
                'AUTH/SELECT precede PSUBSCRIBE (shared handshake)',
            )
        } finally {
            await sub?.close()
            server.stop()
        }
    })
    // The cleartext-AUTH warning still flows from the shared primitive.
    assert(
        warnings.some((m) => m.includes('AUTH will be sent in cleartext')),
        'the shared primitive raised the one-time cleartext-AUTH warning',
    )
    assert(
        warnings.every((m) => !m.includes('s3cret')),
        'the password is never logged in cleartext',
    )
})

Deno.test('subscriber - onReconnect fires once after a reconnect re-issues its patterns', async () => {
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
    })
    let fires = 0
    await captureWarnings(async () => {
        try {
            sub.onReconnect(() => {
                fires++
            })
            sub.psubscribe('app:*', () => {})
            await waitFor(
                () => psubscribeCount(server, 'app:*') >= 1,
                'the first PSUBSCRIBE reached the wire',
            )
            // FR-002: the first connect is NOT a reconnect.
            assertEquals(fires, 0, 'no fire on the first connect')

            const acceptsBefore = server.accepts()
            server.dropConnections()
            await waitFor(
                () => psubscribeCount(server, 'app:*') >= 2,
                'the subscription was re-issued after reconnect',
            )
            assert(
                server.accepts() > acceptsBefore,
                'the socket was re-dialled',
            )
            await waitFor(() => fires >= 1, 'the reconnect handler fired')
            // Fired exactly once for one reconnect.
            assertEquals(fires, 1)
        } finally {
            await sub.close()
            server.stop()
        }
    })
})

Deno.test('subscriber - onReconnect does not fire when the re-dial itself fails', async () => {
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
    })
    let fires = 0
    // Captured inline rather than via `captureWarnings`, because the test has
    // to POLL the warnings while the body is still running.
    const warnings: string[] = []
    const realWarn = console.warn
    console.warn = (...args: unknown[]) => {
        warnings.push(args.map((a) => String(a)).join(' '))
    }
    try {
        sub.onReconnect(() => {
            fires++
        })
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 1,
            'the first PSUBSCRIBE reached the wire',
        )
        // Closing the listener AND the live socket forces the wire fault and
        // makes the re-dial fail: a failed reconnect is not a reconnect.
        server.stop()
        await waitFor(
            () => warnings.some((m) => m.includes('PSUBSCRIBE failed')),
            'the failed re-activation was logged',
        )
    } finally {
        await sub.close()
        console.warn = realWarn
    }
    assertEquals(fires, 0, 'no fire when the re-subscribe never succeeded')
    // #245 corrected this assertion rather than deleting it. It used to require
    // the WARN to say `no further reconnect`, which was true when a failed
    // re-dial was terminal and is now false: the whole point of #275 is that a
    // retry IS scheduled. The PROPERTY the test guards — a failed re-dial is not
    // a reconnect, so the seam stays silent — is unchanged and still asserted
    // above.
    assert(
        warnings.some((m) => /attempt \d+, retrying in \d+ms/.test(m)),
        'the WARN names the attempt and the next delay (FR-005)',
    )
    assert(
        !warnings.some((m) => m.includes('no further reconnect')),
        'the terminal wording is gone — abandoning is no longer an outcome',
    )
})

Deno.test('subscriber - a throwing onReconnect handler neither kills the read loop nor disarms the seam', async () => {
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
    })
    const got: Array<[string, string]> = []
    let fires = 0
    const warnings = await captureWarnings(async () => {
        try {
            sub.onReconnect(() => {
                fires++
                // Throws on the FIRST reconnect only. The second fire is what
                // proves the containment did not unregister the handler —
                // without it, an `undefined`-ing catch would ship green and the
                // seam would be permanently, silently dead (plan §9 risk 3).
                if (fires === 1) throw new Error('handler exploded')
            })
            sub.psubscribe(
                'app:*',
                (topic, payload) => got.push([topic, payload]),
            )
            await waitFor(
                () => psubscribeCount(server, 'app:*') >= 1,
                'the first PSUBSCRIBE reached the wire',
            )

            server.dropConnections()
            await waitFor(
                () => psubscribeCount(server, 'app:*') >= 2,
                'the subscription was re-issued after the first reconnect',
            )
            await waitFor(() => fires >= 1, 'the handler fired and threw')

            // A SECOND reconnect, after the handler threw on the first.
            server.dropConnections()
            await waitFor(
                () => psubscribeCount(server, 'app:*') >= 3,
                'the subscription was re-issued after the second reconnect',
            )
            await waitFor(
                () => fires >= 2,
                'the seam is still armed after its handler threw',
            )

            // The read loop survived both: delivery resumes. Published ONCE,
            // outside the poll predicate — a predicate with a side effect fires
            // on every tick and hides how many frames it actually took.
            server.publish('app:*', 'app:room', '{"event":"after"}')
            await waitFor(
                () => got.length >= 1,
                'delivery resumed despite the throwing handler',
            )
        } finally {
            await sub.close()
            server.stop()
        }
    })
    assertEquals(fires, 2, 'the handler fired on BOTH reconnects')
    assert(
        warnings.some((m) => m.includes('handler exploded')),
        'the handler fault was logged at WARN, never swallowed',
    )
})

Deno.test('subscriber - onReconnect replaces the previous handler rather than stacking one', async () => {
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
    })
    const fired: string[] = []
    await captureWarnings(async () => {
        try {
            sub.onReconnect(() => void fired.push('first'))
            sub.onReconnect(() => void fired.push('second'))
            sub.psubscribe('app:*', () => {})
            await waitFor(
                () => psubscribeCount(server, 'app:*') >= 1,
                'the first PSUBSCRIBE reached the wire',
            )
            server.dropConnections()
            await waitFor(
                () => psubscribeCount(server, 'app:*') >= 2,
                'the subscription was re-issued after reconnect',
            )
            await waitFor(() => fired.length >= 1, 'a handler fired')
        } finally {
            await sub.close()
            server.stop()
        }
    })
    assertEquals(fired, ['second'], 'only the last-registered handler runs')
})

// ─────────────────────────────────────────────────────────────────────────────
// #245 — liveness (#274) and retry (#275)
//
// Cadences are injected in MILLISECONDS throughout. That is the whole reason
// they are constructor options: the production window is 45 seconds, and a suite
// that waited it out would be a suite nobody runs. `FakeTime` is not an option
// here — it cannot advance a real socket's `conn.read`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fast cadences: a 10x ratio, three orders of magnitude below production.
 *
 * `livenessMs` was 60ms and that was too tight. It is a REAL-CLOCK window, so
 * any GC pause or CI stall longer than it reads as a dead peer — three tests
 * failed exactly once under load here, and nothing about the subjects was wrong.
 * The tests that genuinely need a tight bound assert against `FAST.livenessMs`
 * multiples and scale with it; the rest only need the keepalive to be faster
 * than the window, which a wider ratio guarantees more of, not less.
 */
const FAST = {
    keepaliveMs: 20,
    livenessMs: 200,
    retryBaseMs: 5,
    retryMaxMs: 40,
} as const

/** Capture `console.warn` while the body runs, so a test can POLL the output. */
function liveWarnings(): { messages: string[]; restore: () => void } {
    const messages: string[] = []
    const real = console.warn
    console.warn = (...args: unknown[]) => {
        messages.push(args.map((a) => String(a)).join(' '))
    }
    return { messages, restore: () => void (console.warn = real) }
}

/** How many times `op` appears in the server's command log. */
function countOp(server: FakeServer, op: string): number {
    return server.commandLog.filter((c) => c[0]?.toUpperCase() === op).length
}

Deno.test('FR-018: a cadence set that cannot behave is refused at construction', () => {
    type Cadences = Partial<
        Record<
            'keepaliveMs' | 'livenessMs' | 'retryBaseMs' | 'retryMaxMs',
            number
        >
    >
    const bad: ReadonlyArray<[string, Cadences]> = [
        ['keepaliveMs zero', { keepaliveMs: 0 }],
        ['keepaliveMs negative', { keepaliveMs: -1 }],
        ['livenessMs NaN', { livenessMs: Number.NaN }],
        ['retryBaseMs Infinity', { retryBaseMs: Number.POSITIVE_INFINITY }],
        ['retryMax below retryBase', { retryBaseMs: 100, retryMaxMs: 10 }],
        ['liveness equal to keepalive', { keepaliveMs: 60, livenessMs: 60 }],
        // The one a strict `>` would let through, and the reason the check is a
        // ratio: at keepalive + 1 the pong can never arrive in time on any
        // broker with non-zero RTT, so the fix inverts into permanent churn.
        ['liveness one over keepalive', { keepaliveMs: 60, livenessMs: 61 }],
    ]
    for (const [label, override] of bad) {
        let threw = false
        try {
            new RedisSubscribeConnection({
                hostname: '127.0.0.1',
                ...FAST,
                ...override,
            })
        } catch (error) {
            threw = error instanceof RangeError
        }
        assert(threw, `${label} must throw a RangeError at construction`)
    }
})

Deno.test('FR-018: the production defaults satisfy their own invariant', () => {
    // Guards the constants against a future edit that lowers the ratio: the
    // class would then be unconstructable with no argument at all.
    const sub = new RedisSubscribeConnection({ hostname: '127.0.0.1' })
    return sub.close()
})

Deno.test('FR-001/SC-001: an idle socket is NOT torn down (#274)', async () => {
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        ...FAST,
    })
    const { messages, restore } = liveWarnings()
    try {
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 1,
            'the first PSUBSCRIBE reached the wire',
        )
        // Eight liveness windows of complete silence on the bus. Before #274
        // this produced a teardown and a re-dial every window.
        await new Promise((r) => setTimeout(r, FAST.livenessMs * 4))
        assertEquals(server.accepts(), 1, 'exactly one socket was ever opened')
        assertEquals(
            psubscribeCount(server, 'app:*'),
            1,
            'the pattern was issued once, never re-issued',
        )
        assertEquals(
            messages,
            [],
            'an idle bus is not a fault and logs nothing',
        )
        assert(
            countOp(server, 'PING') > 0,
            'the keepalive is what kept it alive — without a PING this test ' +
                'would pass for the wrong reason (the deadline simply being long)',
        )
    } finally {
        restore()
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-008: no timer outlives the connection that armed it', async () => {
    // A first draft asserted "no PING is written after close" — which is
    // satisfied by the interval callback's own `closed` guard, so deleting the
    // clear from close() left it green. The timer is unref'd, so --trace-leaks
    // cannot back-stop it either. What the CLEAR buys is not silence, it is
    // that the interval stops being scheduled at all: without it a long-lived
    // process accumulates one live interval per closed connection forever.
    //
    // So the witness is the timer itself. Counting arm-vs-clear is a resource
    // property (invariant 1 and 3), not an implementation detail.
    //
    // Note for whoever mutates this next: TWO paths clear the keepalive on close
    // — the explicit `#clearKeepalive()` and the `#discardSocket()` that follows
    // it — so removing either one alone leaves this test green. That is
    // redundancy, not a hole. Remove BOTH and it goes red, which is the property
    // being asserted: armed implies cleared, by whatever route.
    const realSetInterval = globalThis.setInterval
    const realClearInterval = globalThis.clearInterval
    const armed: unknown[] = []
    const cleared: unknown[] = []
    // deno-lint-ignore no-explicit-any
    globalThis.setInterval = ((...args: any[]) => {
        // deno-lint-ignore no-explicit-any
        const id = (realSetInterval as any)(...args)
        armed.push(id)
        return id
        // deno-lint-ignore no-explicit-any
    }) as any
    // deno-lint-ignore no-explicit-any
    globalThis.clearInterval = ((id: any) => {
        cleared.push(id)
        return realClearInterval(id)
        // deno-lint-ignore no-explicit-any
    }) as any

    const server = await startFakeServer()
    try {
        const sub = new RedisSubscribeConnection({
            hostname: '127.0.0.1',
            port: server.port,
            ...FAST,
        })
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => countOp(server, 'PING') >= 1,
            'the keepalive was armed and is firing',
        )
        assert(armed.length >= 1, 'an interval was armed')
        await sub.close()
        for (const id of armed) {
            assert(
                cleared.includes(id),
                `interval ${String(id)} was armed and never cleared — every ` +
                    'closed connection would leave one scheduled forever',
            )
        }
    } finally {
        globalThis.setInterval = realSetInterval
        globalThis.clearInterval = realClearInterval
        server.stop()
    }
})

Deno.test('FR-011/SC-007: a RETRIED activation issues every recorded pattern', async () => {
    // The regression test for the plan audit's CRITICAL finding. A first draft
    // simply psubscribed two patterns and asserted both reached the wire — and
    // it passed identically against the pre-change one-pattern code, because
    // without a failure each psubscribe call issued its own pattern. It proved
    // nothing about the defect it was written for.
    //
    // The defect only appears on a RETRY: the realtime driver psubscribes twice
    // back-to-back over one single-flight dial, a blip rejects both, and one
    // retry slot means the survivor used to re-issue only the pattern that
    // triggered it. The other stayed recorded-but-unsubscribed for the life of
    // the process — deaf on the control topic, with a quiet log.
    const server = await startFakeServer()
    server.unreachable()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        ...FAST,
    })
    const got: string[] = []
    const { messages, restore } = liveWarnings()
    try {
        // Both recorded while nothing can dial — exactly the boot race.
        sub.psubscribe('events:*', (topic) => void got.push(`events ${topic}`))
        sub.psubscribe('control', (topic) => void got.push(`control ${topic}`))
        await waitFor(
            () => messages.some((m) => m.includes('retrying in')),
            'both activations failed and one retry was scheduled',
            4000,
        )
        server.reachable()
        await waitFor(
            () =>
                psubscribeCount(server, 'events:*') >= 1 &&
                psubscribeCount(server, 'control') >= 1,
            'the surviving retry issued BOTH patterns, not just its own',
            8000,
        )
        server.publish('events:*', 'events:a', 'x')
        server.publish('control', 'control', 'y')
        await waitFor(() => got.length === 2, 'both handlers received', 4000)
        assertEquals(got.sort(), ['control control', 'events events:a'])
    } finally {
        restore()
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-013: concurrent writers never interleave on the socket', async () => {
    // This test was written twice. The first version psubscribed 25 small
    // patterns and asserted every logged command was a known op — and it stayed
    // GREEN with the write queue bypassed entirely, because a frame of tens of
    // bytes never short-writes and so never interleaves. It proved nothing,
    // which is precisely the defect class this whole feature exists to remove.
    //
    // The rewrite forces the condition instead of hoping for it: a pattern large
    // enough that `conn.write` returns short (resp.ts:212-216 records a measured
    // 320 KB short write on an 8 MiB frame), with the keepalive firing every few
    // milliseconds throughout. Without the queue, PING bytes land in the middle
    // of the PSUBSCRIBE frame and the pattern arrives corrupted.
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        // A fast keepalive with a GENEROUS window: the 2x rule is a minimum,
        // not a ratio to hit. At livenessMs: 2 the read deadline expired while
        // twelve megabytes were still being written, so the socket churned and
        // the test measured nothing.
        keepaliveMs: 1,
        livenessMs: 10_000,
        retryBaseMs: 5,
        retryMaxMs: 40,
    })
    // A PING every MILLISECOND during the big write. At the original 2ms the
    // mutation was caught on roughly two runs in three — whether the OS
    // short-writes at all is a scheduling accident, and a test that only
    // sometimes sees its defect is not a test. Hundreds of interleaving
    // opportunities removes the luck. Three large frames were tried and were
    // worse: twelve megabytes plus a PING per millisecond starves the read loop
    // itself, and the socket churns instead of measuring anything.
    const huge = 'h'.repeat(4 * 1024 * 1024)
    const patterns = [`a${huge}`]
    try {
        // A small pattern FIRST, and wait for the keepalive to be firing. The
        // keepalive is armed at the END of an activation, so during the very
        // first one there is no second writer and nothing to interleave — an
        // earlier draft of this test missed that and could not have failed.
        sub.psubscribe('small:*', () => {})
        await waitFor(
            () => countOp(server, 'PING') >= 2,
            'the keepalive is firing, so a second writer is live',
        )
        for (const pattern of patterns) sub.psubscribe(pattern, () => {})
        await waitFor(
            () =>
                patterns.every((p) =>
                    server.commandLog.some(
                        (c) =>
                            c[0]?.toUpperCase() === 'PSUBSCRIBE' && c[1] === p,
                    )
                ),
            'every oversized PSUBSCRIBE reached the wire intact',
            20_000,
        )
        const issued = server.commandLog.filter(
            (c) =>
                c[0]?.toUpperCase() === 'PSUBSCRIBE' &&
                (c[1]?.length ?? 0) > 1024,
        )
        assertEquals(
            issued.length,
            patterns.length,
            'every large pattern was parsed as its own complete frame',
        )
        for (const command of issued) {
            assertEquals(
                command[1]?.length,
                huge.length + 1,
                'the pattern arrived at its full length — a short byte count ' +
                    'means another writer spliced itself into the frame',
            )
            assert(
                patterns.includes(command[1]),
                'and arrived byte-identical, with no PING spliced through it',
            )
        }
        const known = new Set(['PSUBSCRIBE', 'PING', 'AUTH', 'SELECT'])
        for (const command of server.commandLog) {
            assert(
                known.has((command[0] ?? '').toUpperCase()),
                `interleaving produced the unknown command ${
                    JSON.stringify(command[0])
                }`,
            )
        }
        assert(
            countOp(server, 'PING') > 0,
            'the second writer was actually active during the big write — ' +
                'without a concurrent PING this test is a solo write and ' +
                'passes for the wrong reason',
        )
    } finally {
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-002/SC-002: a peer that answers nothing is detected inside the window', async () => {
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        ...FAST,
    })
    const { messages, restore } = liveWarnings()
    try {
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 1,
            'the first PSUBSCRIBE reached the wire',
        )
        // mute(), NOT unreachable(): a refused dial is a different failure, and
        // a test that used it would prove the connect path instead of liveness.
        server.mute()
        const start = Date.now()
        await waitFor(
            () => messages.some((m) => m.includes('read fault')),
            'the hung peer was detected',
            FAST.livenessMs * 20,
        )
        const took = Date.now() - start
        assert(
            took < FAST.livenessMs * 10,
            `detected in ${took}ms, which must be a small multiple of the ` +
                `${FAST.livenessMs}ms window and not the 30s command default`,
        )
        // A BEHAVIOURAL witness alongside the log one. Matching only the string
        // means a reworded WARN turns this red while a re-dial that stopped
        // happening entirely stays green — the log is evidence of detection,
        // the re-dial is the detection.
        await waitFor(
            () => server.accepts() >= 2,
            'the connection actually re-dialled, not merely logged',
            FAST.livenessMs * 20,
        )
    } finally {
        restore()
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-014/SC-010: the HANDSHAKE is bounded by the liveness window too', async () => {
    // With a password and a non-zero db, an activation runs AUTH and SELECT
    // through `exchange` before any liveness logic exists. Those took
    // readReply's 30s command-path default, so against a peer that accepts and
    // answers nothing the detection window was 30 seconds regardless of what
    // livenessMs said. The plan audit found this claim stated backwards in #274.
    const server = await startFakeServer()
    server.mute()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        password: 'secret',
        db: 2,
        ...FAST,
    })
    const { messages, restore } = liveWarnings()
    try {
        const start = Date.now()
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => messages.some((m) => m.includes('PSUBSCRIBE failed')),
            'the stalled handshake failed inside the liveness window',
            FAST.livenessMs * 30,
        )
        const took = Date.now() - start
        assert(
            took < FAST.livenessMs * 20,
            `the handshake stalled for ${took}ms; it must be bounded by ` +
                `livenessMs (${FAST.livenessMs}ms), not by the 30s default`,
        )
        // `messages.some(m => !m.includes('secret'))` was here and has been
        // removed: it passes whenever ANY single line lacks the password, so it
        // was `messages.length > 0` wearing the costume of a security check.
        // The loop below is the real property, and it was already carrying it.
        assert(messages.length > 0, 'the failure was reported at all')
        for (const message of messages) {
            assert(!message.includes('secret'), 'no password byte, in any line')
        }
    } finally {
        restore()
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-004/SC-003: a re-dial that fails is retried until it succeeds (#275)', async () => {
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        ...FAST,
    })
    const delivered: string[] = []
    const { messages, restore } = liveWarnings()
    try {
        sub.psubscribe(
            'app:*',
            (_topic, payload) => void delivered.push(payload),
        )
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 1,
            'the first PSUBSCRIBE reached the wire',
        )
        // unreachable(), NOT mute(): this proves the CONNECT path. A bound
        // listener that stops accepting still completes the TCP handshake into
        // the backlog, so the dial would resolve and prove nothing.
        server.unreachable()
        await waitFor(
            () => messages.filter((m) => m.includes('retrying in')).length >= 2,
            'at least two attempts failed and were retried',
            4000,
        )
        server.reachable()
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 2,
            'the pattern was re-issued on the recovered socket',
            4000,
        )
        server.publish('app:*', 'app:x', 'after-recovery')
        await waitFor(() => delivered.length === 1, 'delivery resumed', 4000)
        assertEquals(delivered, ['after-recovery'])
        // The recovery line now waits for the socket to SURVIVE a keepalive
        // interval, not merely to deliver once: a peer that answers and then
        // drops delivers on every cycle, and calling that a recovery is what
        // let the backoff reset itself forever.
        await waitFor(
            () =>
                messages.some((m) =>
                    /recovered at .* after \d+ failed attempt/.test(m)
                ),
            'the recovery is logged — an outage that ends must be as visible ' +
                'as one that starts (FR-016)',
            4000,
        )
    } finally {
        restore()
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-012/SC-008: a socket that failed an activation is never re-used', async () => {
    // The failure the read loop cannot back-stop: on a FIRST activation the
    // PSUBSCRIBE writes run before `loopConn` is assigned, so nothing else will
    // ever discard that socket. Without the discard, `connect()` hands the same
    // corpse to every retry and the loop runs forever while logging "retrying".
    //
    // The pattern is deliberately large. A first draft used a short one and was
    // FLAKY: against a peer that has just closed, a small write often lands in
    // the socket buffer and succeeds, so the activation did not fail and the
    // test timed out waiting for a retry that was never scheduled. A megabyte
    // cannot finish before the RST arrives.
    const server = await startFakeServer()
    server.closeAfter('AUTH')
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        password: 'secret',
        ...FAST,
    })
    const { messages, restore } = liveWarnings()
    try {
        sub.psubscribe('m'.repeat(1024 * 1024), () => {})
        await waitFor(
            () => messages.some((m) => m.includes('retrying in')),
            'the activation failed on the published socket',
            10_000,
        )
        server.closeAfter(null)
        await waitFor(
            () => countOp(server, 'PSUBSCRIBE') >= 1,
            'a LATER attempt reached the wire on a fresh socket',
            10_000,
        )
        assert(
            server.accepts() >= 2,
            'the retry dialled again rather than re-using the dead socket',
        )
    } finally {
        restore()
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-007/SC-005: a multi-attempt recovery fires the seam EXACTLY once', async () => {
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        ...FAST,
    })
    let fires = 0
    const { messages, restore } = liveWarnings()
    try {
        sub.onReconnect(() => void fires++)
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 1,
            'the first PSUBSCRIBE reached the wire',
        )
        assertEquals(fires, 0, 'a first connect is not a reconnect')
        server.unreachable()
        await waitFor(
            () => messages.filter((m) => m.includes('retrying in')).length >= 3,
            'several attempts failed',
            4000,
        )
        server.reachable()
        await waitFor(() => fires >= 1, 'the seam fired on recovery', 4000)
        await new Promise((r) => setTimeout(r, FAST.livenessMs * 4))
        assertEquals(
            fires,
            1,
            'once for the whole recovery — not once per failed attempt',
        )
    } finally {
        restore()
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-007: a retried FIRST connect fires nothing — there is nothing to reconcile', async () => {
    const server = await startFakeServer()
    server.unreachable()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        ...FAST,
    })
    let fires = 0
    const { messages, restore } = liveWarnings()
    try {
        sub.onReconnect(() => void fires++)
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => messages.filter((m) => m.includes('retrying in')).length >= 2,
            'the first connect failed and was retried',
            4000,
        )
        server.reachable()
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 1,
            'the retried first connect eventually succeeded',
            4000,
        )
        await new Promise((r) => setTimeout(r, FAST.livenessMs * 4))
        assertEquals(
            fires,
            0,
            'a retried first connect is still a first connect — firing here ' +
                'would run a consumer reconciliation for a connection that ' +
                'never had state to lose',
        )
    } finally {
        restore()
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-005: the cleartext-AUTH exposure is named, and only when it is real', async () => {
    const server = await startFakeServer()
    server.unreachable()
    const withPassword = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        password: 'secret',
        ...FAST,
    })
    const without = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        ...FAST,
    })
    const { messages, restore } = liveWarnings()
    try {
        withPassword.psubscribe('a:*', () => {})
        await waitFor(
            () => messages.some((m) => m.includes('cleartext')),
            'a retry against a cleartext-AUTH peer says so — the constructor ' +
                'warning fired once, at boot, and scrolled away long ago',
            4000,
        )
        for (const message of messages) {
            assert(
                !message.includes('secret'),
                'kind and location, never a value',
            )
        }
        await withPassword.close()
        messages.length = 0
        without.psubscribe('b:*', () => {})
        await waitFor(
            () => messages.some((m) => m.includes('retrying in')),
            'the passwordless connection also retried',
            4000,
        )
        assert(
            !messages.some((m) => m.includes('cleartext')),
            'no notice when there is no credential to expose',
        )
    } finally {
        restore()
        await withPassword.close()
        await without.close()
        server.stop()
    }
})

Deno.test({
    name: 'FR-020/SC-009: close() does not wait out an in-flight dial',
    // The dangling dial IS the subject: a connect to an unroutable address hangs
    // until the OS SYN budget expires (~75s macOS, ~130s Linux). Sanitizers off
    // because that op is deliberately still pending when the test ends — which
    // is exactly the state close() must not block on.
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
        // RFC 5737 TEST-NET-1: guaranteed unroutable, so the dial blackholes
        // rather than being refused. Loopback cannot prove this — ECONNREFUSED
        // on 127.0.0.1 is instant, which is why the defect survived until now.
        const sub = new RedisSubscribeConnection({
            hostname: '192.0.2.1',
            port: 6379,
            ...FAST,
        })
        const { messages: warnings, restore } = liveWarnings()
        try {
            sub.psubscribe('app:*', () => {})
            await new Promise((r) => setTimeout(r, 50))
            // PIN THE PREMISE. Without this the test passes when the dial never
            // started or already settled — observed green under
            // `--deny-net=192.0.2.1`, where connect() rejects instantly and
            // there is nothing for close() to have waited on. A no-op that
            // reports success is worse than a missing test.
            assert(
                warnings.length === 0,
                'the dial must still be IN FLIGHT when close() is called; the ' +
                    `connection has already reported: ${warnings.join(' | ')}`,
            )
            const start = Date.now()
            await sub.close()
            const took = Date.now() - start
            assert(
                took < 2000,
                `close() took ${took}ms. It must not await the dial — an ` +
                    'operator restarting during an outage waits out the OS SYN ' +
                    'budget otherwise',
            )
        } finally {
            restore()
        }
    },
})

Deno.test('FR-017: a coalesced retry chain latches toward "reconnect", never away', async () => {
    // Two activations can fail into ONE retry slot with opposite identities: the
    // read loop's fault carries `true`, and a `psubscribe()` racing the same
    // broken socket carries `false`. Whichever lands last used to win, and when
    // `false` won the consumer's post-reconnect revocation re-check was silently
    // skipped — invisible in the log, and untestable after the fact.
    //
    // The order here is deliberate: let the read loop schedule `true` first,
    // THEN add a subscription so `false` arrives second. Last-wins fails; a
    // monotonic latch holds.
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        keepaliveMs: 40,
        livenessMs: 500,
        retryBaseMs: 400,
        retryMaxMs: 400,
    })
    let fires = 0
    const { messages, restore } = liveWarnings()
    try {
        sub.onReconnect(() => void fires++)
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 1,
            'the first PSUBSCRIBE reached the wire',
        )
        server.unreachable()
        await waitFor(
            () => messages.some((m) => m.includes('retrying in')),
            'the read loop faulted and scheduled a reconnect retry',
            4000,
        )
        // `false` arrives second, into the chain a reconnect already owns.
        sub.psubscribe('late:*', () => {})
        server.reachable()
        await waitFor(
            () => psubscribeCount(server, 'late:*') >= 1,
            'the chain recovered and issued every pattern',
            8000,
        )
        assertEquals(
            fires,
            1,
            'the recovery is still a reconnect. A demoted chain fires nothing ' +
                'and the consumer never runs its post-reconnect reconciliation',
        )
    } finally {
        restore()
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-004: a socket that faults IMMEDIATELY after subscribing backs off too', async () => {
    // The review gate's HIGH, and the one no single seat could see: decision
    // row 3 governs a FAILED activation, and this is a SUCCESSFUL activation
    // that faults a moment later. The read loop's fault path re-dialled with no
    // attempt count and no delay, so a peer that accepts, answers PSUBSCRIBE and
    // then drops — a Redis ACL denial, `maxclients`, a broker shedding load —
    // put the client in a hot reconnect loop. Reproduced at ~12 900 connects per
    // second, in the default no-password config, with no attacker involved.
    const server = await startFakeServer()
    server.closeAfter('PSUBSCRIBE')
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        keepaliveMs: 20,
        livenessMs: 60,
        retryBaseMs: 40,
        retryMaxMs: 200,
    })
    const { restore } = liveWarnings()
    try {
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => server.accepts() >= 2,
            'the socket faulted and re-dialled at least once',
            4000,
        )
        await new Promise((r) => setTimeout(r, 1000))
        // One second at a 40ms floor rising to a 200ms cap. Unbounded, the same
        // second buys thousands. The bound is deliberately generous — this test
        // is about the difference between "throttled" and "hot", not about the
        // exact curve.
        assert(
            server.accepts() < 40,
            `${server.accepts()} dials in one second — the fault path is not ` +
                'backing off, so a peer that drops after PSUBSCRIBE spins the ' +
                'client at the speed of the loopback',
        )
    } finally {
        restore()
        server.closeAfter(null)
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-006: close() cancels a PENDING retry', async () => {
    // Untested until the review gate said so, and unfalsifiable by the obvious
    // route: the retry timer is unref'd (so --trace-leaks cannot see it) and
    // `#activate` returns early when `closed`, so a missing `#clearRetry()`
    // produces no observable misbehaviour at all — just a timer that stays
    // scheduled for the life of the process, once per closed connection.
    //
    // The witness is therefore the timer itself, same as FR-008.
    const realSetTimeout = globalThis.setTimeout
    const realClearTimeout = globalThis.clearTimeout
    const cleared: unknown[] = []
    // Keyed on the EXACT delay the WARN reports, not a range. A first draft
    // captured every timer between 1 and 200ms and stayed green under mutation,
    // because `resp.ts` arms a read deadline in that same range and clears it on
    // every successful read — so `armed` and `cleared` overlapped on timers that
    // had nothing to do with the retry.
    const byDelay = new Map<number, unknown[]>()
    // deno-lint-ignore no-explicit-any
    globalThis.setTimeout = ((...args: any[]) => {
        // deno-lint-ignore no-explicit-any
        const id = (realSetTimeout as any)(...args)
        const delay = args[1]
        if (typeof delay === 'number') {
            const ids = byDelay.get(delay) ?? []
            ids.push(id)
            byDelay.set(delay, ids)
        }
        return id
        // deno-lint-ignore no-explicit-any
    }) as any
    // deno-lint-ignore no-explicit-any
    globalThis.clearTimeout = ((id: any) => {
        cleared.push(id)
        return realClearTimeout(id)
        // deno-lint-ignore no-explicit-any
    }) as any

    const server = await startFakeServer()
    server.unreachable()
    const { messages, restore } = liveWarnings()
    try {
        const sub = new RedisSubscribeConnection({
            hostname: '127.0.0.1',
            port: server.port,
            keepaliveMs: 50,
            livenessMs: 200,
            // A floor well above the poll interval so the pending retry is
            // still pending when close() runs.
            retryBaseMs: 150,
            retryMaxMs: 150,
        })
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => messages.some((m) => m.includes('retrying in')),
            'a retry is scheduled and still pending',
            4000,
        )
        // EVERY announced delay, not just the first. Jitter can draw a 1ms
        // delay, so the first retry may already have fired and re-scheduled
        // under a different delay before close() lands — an earlier version
        // tracked only the first and failed intermittently for that reason,
        // with nothing wrong in the subject.
        const announced = messages
            .flatMap((m) => {
                const hit = /retrying in (\d+)ms/.exec(m)
                return hit ? [Number(hit[1])] : []
            })
        assert(announced.length >= 1, 'the retry announced its delay')
        const retryIds = announced.flatMap((d) => byDelay.get(d) ?? [])
        assert(
            retryIds.length >= 1,
            `no timer was armed with any announced delay (${announced})`,
        )
        await sub.close()
        assert(
            retryIds.some((id) => cleared.includes(id)),
            'close() left the pending retry scheduled — harmless once, and ' +
                'one more per closed connection forever',
        )
    } finally {
        globalThis.setTimeout = realSetTimeout
        globalThis.clearTimeout = realClearTimeout
        restore()
        server.stop()
    }
})

Deno.test({
    name: 'FR-014: the DIAL is bounded too, not only the handshake exchanges',
    // Same reason as SC-009: the blackholed dial is deliberately still pending.
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
        // The review gate's MEDIUM, and it made a claim in this file's own
        // documentation false. `AUTH` and `SELECT` were bounded; the connect
        // that precedes them was not. A peer that completes TCP and then stalls
        // the TLS handshake wedged the socket permanently and silently — no
        // error, no retry, no log — which is the same shape as the defect the
        // liveness window exists to remove.
        //
        // RFC 5737 TEST-NET-1: the SYN is never answered, so without a bound
        // this waits out the OS budget (~75s macOS, ~130s Linux).
        const sub = new RedisSubscribeConnection({
            hostname: '192.0.2.1',
            port: 6379,
            keepaliveMs: 40,
            livenessMs: 120,
            retryBaseMs: 5,
            retryMaxMs: 40,
        })
        const { messages, restore } = liveWarnings()
        try {
            const start = Date.now()
            sub.psubscribe('app:*', () => {})
            await waitFor(
                () => messages.some((m) => m.includes('did not complete')),
                'the dial itself was abandoned inside the liveness window',
                8000,
            )
            const took = Date.now() - start
            assert(
                took < 4000,
                `the dial ran for ${took}ms; it must be bounded by livenessMs ` +
                    '(120ms) and a few retries, not by the OS SYN budget',
            )
        } finally {
            restore()
            await sub.close()
        }
    },
})

Deno.test('FR-014: a caller-supplied handshakeTimeoutMs is honoured, not overwritten', async () => {
    // `handshakeTimeoutMs` is inherited from AuthenticatedConnectionConfig and
    // is therefore part of this class's public surface. The constructor used to
    // overwrite it with livenessMs unconditionally, so a caller who set it was
    // silently ignored — a documented option that did nothing.
    const server = await startFakeServer()
    server.mute()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        password: 'secret',
        db: 2,
        keepaliveMs: 1000,
        // Deliberately far apart: if the caller's value is ignored, the failure
        // takes livenessMs and this test's bound catches it.
        livenessMs: 6000,
        handshakeTimeoutMs: 40,
        retryBaseMs: 5,
        retryMaxMs: 40,
    })
    const { messages, restore } = liveWarnings()
    try {
        const start = Date.now()
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => messages.some((m) => m.includes('PSUBSCRIBE failed')),
            "the stalled handshake failed on the CALLER's deadline",
            5000,
        )
        const took = Date.now() - start
        assert(
            took < 2000,
            `the handshake stalled for ${took}ms — the caller asked for 40ms ` +
                'and would have been given the 6000ms livenessMs instead',
        )
    } finally {
        restore()
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-015: the backoff carries full jitter and respects its cap', async () => {
    // The review gate's MEDIUM: the backoff policy itself was asserted nowhere.
    // Without jitter, N instances that lose a broker at the same instant compute
    // identical schedules and re-dial it in lockstep forever, holding a
    // recovering broker in the state that caused the herd. The per-instance rate
    // is trivial; the synchronisation is the defect, and it is invisible to any
    // test that only checks "a retry eventually happened".
    const server = await startFakeServer()
    server.unreachable()
    const CEILING = 60
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        keepaliveMs: 100,
        livenessMs: 1000,
        // base === max, so the ceiling is CEILING from the very first attempt
        // and every delay is drawn from the same range. Any spread is jitter and
        // nothing else.
        retryBaseMs: CEILING,
        retryMaxMs: CEILING,
    })
    const { messages, restore } = liveWarnings()
    try {
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () =>
                messages.filter((m) => /retrying in \d+ms/.test(m)).length >= 8,
            'enough attempts to see the distribution',
            8000,
        )
        const delays = messages
            .map((m) => /retrying in (\d+)ms/.exec(m)?.[1])
            .filter((d): d is string => d !== undefined)
            .map(Number)

        for (const delay of delays) {
            assert(
                delay >= 1 && delay <= CEILING,
                `a delay of ${delay}ms escaped the ${CEILING}ms cap`,
            )
        }
        assert(
            new Set(delays).size > 1,
            `all ${delays.length} delays were identical (${delays[0]}ms) — ` +
                'that is a deterministic schedule, and a fleet computing it ' +
                'together re-dials a recovering broker in lockstep',
        )
    } finally {
        restore()
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-020: close() during an in-flight activation leaves no timer armed', async () => {
    // WHAT THIS PROVES, precisely: closing mid-activation leaves no interval
    // armed. It does NOT discriminate `#activate`'s second `closed` re-check,
    // and saying so is the point.
    //
    // The review gate verified that guard is untested, and two attempts to test
    // it failed for the same reason: `close()` discards the socket, so an
    // in-flight write FAILS and the catch returns before the re-arm is reached.
    // The guard covers an interleaving at one specific `await` boundary — real,
    // since the boundary exists, but not reachable from this class's public
    // surface. It is kept as defence, and it is honestly untested.
    //
    // Manufacturing a test that went green here and calling the guard covered
    // would be the exact defect this branch exists to remove.
    const realSetInterval = globalThis.setInterval
    const realClearInterval = globalThis.clearInterval
    const armed: unknown[] = []
    const cleared: unknown[] = []
    // deno-lint-ignore no-explicit-any
    globalThis.setInterval = ((...args: any[]) => {
        // deno-lint-ignore no-explicit-any
        const id = (realSetInterval as any)(...args)
        armed.push(id)
        return id
        // deno-lint-ignore no-explicit-any
    }) as any
    // deno-lint-ignore no-explicit-any
    globalThis.clearInterval = ((id: any) => {
        cleared.push(id)
        return realClearInterval(id)
        // deno-lint-ignore no-explicit-any
    }) as any

    const server = await startFakeServer()
    try {
        const sub = new RedisSubscribeConnection({
            hostname: '127.0.0.1',
            port: server.port,
            ...FAST,
        })
        // Eight megabytes, and several of them: the write has to still be in
        // flight when close() lands, and a single megabyte finished first.
        for (let i = 0; i < 4; i++) {
            sub.psubscribe(`p${i}` + 'm'.repeat(8 * 1024 * 1024), () => {})
        }
        // Long enough for the dial to resolve, short enough that the writes are
        // still going.
        await new Promise((r) => setTimeout(r, 1))
        await sub.close()
        await new Promise((r) => setTimeout(r, FAST.keepaliveMs * 3))
        for (const id of armed) {
            assert(
                cleared.includes(id),
                'an activation resolving during close() re-armed the keepalive ' +
                    'that close() had already cleared, and nothing clears it again',
            )
        }
    } finally {
        globalThis.setInterval = realSetInterval
        globalThis.clearInterval = realClearInterval
        server.stop()
    }
})

Deno.test('FR-014: the activation budget is SHARED across its steps, not per step', async () => {
    // The review gate's HIGH, and the sharpest thing it found: `livenessMs` was
    // applied independently to the dial, `AUTH` and `SELECT`, so a peer that
    // answered each step just inside the window still cost three windows — 135
    // seconds at the defaults — before the read loop's own deadline began. The
    // branch claimed in four places that the window bounded "the whole
    // activation". It did not.
    //
    // Timing alone cannot separate the two designs on loopback, because a
    // stalled step throws and the later steps never run. A peer that is SLOW but
    // alive can: at 60% of the budget per reply, a per-step budget lets both
    // AUTH and SELECT through and the activation SUCCEEDS, while a shared one
    // has 40% left when SELECT starts and the activation FAILS. Different
    // outcome, not a tighter stopwatch.
    const BUDGET = 300
    const server = await startFakeServer()
    server.delayReply(Math.floor(BUDGET * 0.6))
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        password: 'secret',
        db: 2,
        keepaliveMs: 1000,
        livenessMs: 5000,
        handshakeTimeoutMs: BUDGET,
        retryBaseMs: 2000,
        retryMaxMs: 2000,
    })
    const { messages, restore } = liveWarnings()
    try {
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => messages.some((m) => m.includes('PSUBSCRIBE failed')),
            'the activation was refused because its STEPS together outran the ' +
                'budget — with a per-step budget each step fits and it succeeds',
            4000,
        )
        assert(
            !server.commandLog.some((c) =>
                c[0]?.toUpperCase() === 'PSUBSCRIBE'
            ),
            'the activation never reached PSUBSCRIBE, which is what a shared ' +
                'budget running out during the handshake looks like',
        )
    } finally {
        restore()
        server.delayReply(0)
        await sub.close()
        server.stop()
    }
})
