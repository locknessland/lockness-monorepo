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

/**
 * Capture `console.warn` for the lifetime of a `using` binding.
 *
 * **The binding owns the restore; the caller cannot forget it** (#287). The
 * original shape handed back a `restore()` for the caller to call, so a test
 * that threw before reaching it left `console.warn` patched for every test
 * after it in this file — and every later assertion about log output then
 * passed for the wrong reason, silently. That is a test-integrity control, not
 * housekeeping: the assertions #286 and #296 depend on are exactly the kind
 * that would pass.
 *
 * A first attempt added a `restored` flag and kept the handback. The flag
 * guards a DOUBLE restore, which was never the failure mode — the failure mode
 * is never restoring at all — and the review gate measured its test passing
 * identically against the unfixed helper. `Symbol.dispose` is the fix: the
 * language runs it on scope exit, return or throw, and there is nothing left to
 * remember.
 *
 * @returns The live message array, plus the disposer `using` invokes.
 * @example
 * ```typescript
 * using warn = liveWarnings()
 * // ... drive the subject ...
 * assert(warn.messages.some((m) => /expected/.test(m)))
 * ```
 */
function liveWarnings(): { messages: string[]; [Symbol.dispose]: () => void } {
    const messages: string[] = []
    const real = console.warn
    console.warn = (...args: unknown[]) => {
        messages.push(args.map((a) => String(a)).join(' '))
    }
    return { messages, [Symbol.dispose]: () => void (console.warn = real) }
}

Deno.test('#287: a captured console.warn is restored even when the body throws', () => {
    // The test the first attempt got wrong: it called `restore()` itself inside
    // its own catch, so the mechanism it named was never exercised — and it
    // passed against the unfixed helper. Measured at the review gate.
    //
    // Here nothing restores the global except the `using` binding going out of
    // scope. Delete `[Symbol.dispose]` and this goes red.
    const before = console.warn
    let patchedInside = false
    try {
        using warn = liveWarnings()
        void warn.messages
        patchedInside = console.warn !== before
        throw new Error('the body threw')
    } catch {
        // Swallowed on purpose: the assertion is about the global, not the throw.
    }
    assert(patchedInside, 'the helper did patch the global')
    assertEquals(
        console.warn,
        before,
        'console.warn was left patched by a body that threw — every later ' +
            'assertion about log output in this file would now pass for the ' +
            'wrong reason',
    )
})

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
    using warn = liveWarnings()
    const messages = warn.messages
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
    using warn = liveWarnings()
    const messages = warn.messages
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
    using warn = liveWarnings()
    const messages = warn.messages
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
    using warn = liveWarnings()
    const messages = warn.messages
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
    using warn = liveWarnings()
    const messages = warn.messages
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
    using warn = liveWarnings()
    const messages = warn.messages
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
    using warn = liveWarnings()
    const messages = warn.messages
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
    using warn = liveWarnings()
    const messages = warn.messages
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
    using warn = liveWarnings()
    const messages = warn.messages
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
        using warn = liveWarnings()
        const warnings = warn.messages
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
            // Nothing to undo by hand: the `using` binding above restores
            // `console.warn` on scope exit, whichever way this block leaves.
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
    using warn = liveWarnings()
    const messages = warn.messages
    try {
        sub.onReconnect(() => void fires++)
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 1,
            'the first PSUBSCRIBE reached the wire',
        )
        server.unreachable()
        await waitFor(
            // `'reconnecting in'` is what the read-fault path logs; `'retrying
            // in'` belongs to a failed ACTIVATION. Waiting on the wrong one
            // waited for the retry timer to have fired and failed once — a rung
            // deeper into the chain than this step wants, and it then raced
            // `reachable()` against a chain already in flight (#290).
            () => messages.some((m) => m.includes('reconnecting in')),
            'the read loop faulted and scheduled a reconnect retry',
            4000,
        )
        // `false` arrives second, into the chain a reconnect already owns.
        //
        // PREMISE, and it leaves no trace: this dial must be REFUSED, which
        // holds only because `connect()` runs synchronously into `#dial` before
        // the next statement re-binds the port. `#scheduleRetry` returns at its
        // `#retryTimer !== undefined` guard BEFORE it logs or counts, so a
        // coalesced second failure is invisible — no line, no attempt count, no
        // server-side event. If an `await` ever appears ahead of `#dial` this
        // test silently degrades into a slower FR-022 and stays green under the
        // same name. The battery's row 4 attribution is the only other evidence
        // that the demotion path is exercised at all; treat it as load-bearing.
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
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-022: the activation that ENDS an outage is a reconnect, whichever caller drove it', async () => {
    // #290. The latch used to live only on the retry chain: `#scheduleRetry`
    // recorded the intent, and the timer callback CONSUMED it on the way into
    // `#activate`. So an ordinary `psubscribe()` — a user joining a new room —
    // that happened to be the call which re-dialled a healed broker restored
    // delivery while carrying `isReconnect: false`, and the seam did not fire.
    //
    // Not skipped, LATE: the pending retry still fired it up to `retryMaxMs`
    // (30s by default) later, by which point frames had been flowing for the
    // whole window. #271's whole point is that the seam is the FAST path.
    //
    // Reconnect intent is a property of the OUTAGE, not of the caller that
    // happens to drive the activation ending it — so the latch is now read at
    // activation time and cleared only by an activation that SUCCEEDS.
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        keepaliveMs: 40,
        livenessMs: 500,
        // Only to hold the retry chain pending across the window below. Full
        // jitter means the delay is uniform in [1, 3000), so a retry CAN still
        // land inside it — see the premise pin before the assertion.
        retryBaseMs: 3000,
        retryMaxMs: 3000,
    })
    let fires = 0
    using warn = liveWarnings()
    const messages = warn.messages
    try {
        sub.onReconnect(() => void fires++)
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 1,
            'the first PSUBSCRIBE reached the wire',
        )
        server.unreachable()
        await waitFor(
            // The message the read-fault path actually logs. `'retrying in'`
            // belongs to the failed-activation path, and waiting on it here
            // means waiting for the retry timer to have fired AND failed once —
            // one whole rung deeper into the chain than this step needs.
            () => messages.some((m) => m.includes('reconnecting in')),
            'the read loop faulted and scheduled a reconnect',
            4000,
        )
        // PIN THE PREMISE: nothing has fired yet, so a `1` below is this
        // activation's doing and not a leftover from the first connect.
        assertEquals(fires, 0, 'the seam has not fired during the outage')

        // Synchronous pair, deliberately: a `setTimeout` callback cannot
        // interleave between two statements in one tick, so the pending retry
        // cannot be the call that observes a healed broker first.
        server.reachable()
        sub.psubscribe('late:*', () => {})

        // Gate on the CLIENT-side event this test asserts. Waiting on the
        // server's command log instead gates on a different task in the same
        // event loop: the fake server can parse the frame before the client's
        // write-promise continuation resumes and reaches the latch, so the
        // assertion sampled `0` on correct code. Observed failing 1 run in 10
        // under concurrent load — the same wrong-event mistake the FR-017
        // predicate above was changed to fix.
        await waitFor(
            () => fires >= 1,
            'the activation that healed the broker fired the seam',
            4000,
        )
        // ATTRIBUTION, which the `fires === 0` pin above cannot give: full
        // jitter puts the pending retry anywhere in [1, 3000)ms, so it CAN
        // land in this window and heal the broker itself — passing this test
        // green while exercising the old path. A retry-timer activation
        // re-issues EVERY recorded pattern on the shared single-flight socket,
        // so it is visible on the wire: these counts would read 3 and 2.
        assertEquals(
            psubscribeCount(server, 'app:*'),
            2,
            'exactly one activation re-issued the patterns after the outage',
        )
        assertEquals(psubscribeCount(server, 'late:*'), 1)
        assertEquals(
            fires,
            1,
            'the seam fires with the activation that restored delivery, not ' +
                'up to retryMaxMs later. A consumer reconciling what the lost ' +
                'frames carried has not bounded the exposure if it runs after ' +
                'the frames are already flowing',
        )
    } finally {
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-023: the reconnect intent is consumed ONCE — a later psubscribe on a healthy socket fires nothing', async () => {
    // The other half of #290's latch: it is read at activation time, so it must
    // also be CLEARED there. Left set, every subsequent activation on a
    // perfectly healthy socket reports a reconnect that is not happening — and
    // `psubscribe()` is an activation, so an app adding rooms would run the
    // consumer's revocation reconciliation on every join, forever.
    //
    // Cheap on purpose: it needs a healed outage and one ordinary subscribe
    // afterwards, not a second outage.
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        keepaliveMs: 40,
        livenessMs: 500,
        retryBaseMs: 20,
        retryMaxMs: 20,
    })
    let fires = 0
    // Captured only to keep the retry chain's WARN lines off the test output;
    // nothing here asserts on them.
    using warn = liveWarnings()
    void warn
    try {
        sub.onReconnect(() => void fires++)
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 1,
            'the first PSUBSCRIBE reached the wire',
        )
        // Drop every socket while the listener stays bound: the read loop
        // faults, the retry chain re-dials straight away, and the seam fires
        // exactly once for that outage. (`unreachable()` + `reachable()` in one
        // tick cannot work here — the OS has not released the port yet.)
        server.dropConnections()
        await waitFor(() => fires >= 1, 'the outage was reconciled', 4000)
        const afterRecovery = fires
        // Pinned, not merely captured: asserting a zero DELTA below is blind to
        // an outage that fired twice, which is the very property the
        // clear-before-await ordering protects.
        assertEquals(afterRecovery, 1, 'one outage, one fire')

        // An ORDINARY subscribe now — a user joining a room on a socket that is
        // healthy and has nothing outstanding.
        sub.psubscribe('later:*', () => {})
        await waitFor(
            () => psubscribeCount(server, 'later:*') >= 1,
            'the later pattern reached the wire on the live socket',
        )
        await new Promise((r) => setTimeout(r, 200))
        assertEquals(
            fires,
            afterRecovery,
            'the intent was already consumed by the activation that ended the ' +
                'outage. Firing again means every future subscribe re-runs the ' +
                'consumer reconciliation on a connection that lost nothing',
        )
    } finally {
        await sub.close()
        server.stop()
    }
})

Deno.test('FR-025: two activations racing ONE outage fire the seam once, not twice', async () => {
    // The clear-before-await ordering at the consume site had a comment
    // claiming this guarantee and nothing exercising it (#290 review, MEDIUM).
    //
    // `connect()` is single-flight, so two `psubscribe()` calls in one tick
    // during an outage become two activations over ONE socket, and both reach
    // the latch. Clearing before the handler is awaited is what makes the
    // second read `false`. Move the clear below the `await` and the first
    // activation is still suspended inside the handler when the second reads
    // `true` — two reconciliations for one outage, on a consumer whose whole
    // point is that it runs once per lost-frame window.
    //
    // The 50ms handler is what makes this deterministic rather than lucky: the
    // second activation is guaranteed to reach the latch while the first is
    // suspended in `#fireReconnect`.
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
        keepaliveMs: 200,
        livenessMs: 500,
        // Long enough that the retry chain is a bystander here; the two
        // psubscribe activations are the subject.
        retryBaseMs: 5000,
        retryMaxMs: 5000,
    })
    let fires = 0
    using warn = liveWarnings()
    const messages = warn.messages
    try {
        sub.onReconnect(async () => {
            fires++
            await new Promise((r) => setTimeout(r, 50))
        })
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => psubscribeCount(server, 'app:*') >= 1,
            'the first PSUBSCRIBE reached the wire',
        )
        server.dropConnections()
        await waitFor(
            () => messages.some((m) => m.includes('reconnecting in')),
            'the read loop faulted and latched the intent',
            4000,
        )
        // ONE tick, two activations, one single-flight dial.
        sub.psubscribe('x:*', () => {})
        sub.psubscribe('y:*', () => {})
        await waitFor(
            () =>
                psubscribeCount(server, 'x:*') >= 1 &&
                psubscribeCount(server, 'y:*') >= 1,
            'both activations reached the wire over the shared socket',
            4000,
        )
        await new Promise((r) => setTimeout(r, 300))
        assertEquals(
            fires,
            1,
            'one outage, one reconciliation. Two activations sharing a socket ' +
                'must not each report the recovery',
        )
    } finally {
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
    using warn = liveWarnings()
    void warn
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
    // PIN THE JITTER. `#scheduleRetry` uses FULL jitter — the delay is uniform
    // in [1, ceiling), not anchored near it — so `retryBaseMs` is not the floor
    // the config below once called it. A low draw fires the retry before
    // `close()` reaches it, leaving no pending timer to cancel and failing this
    // test with nothing wrong in the subject. Observed at ~5% once #290 made
    // the file long enough to widen the window. Near-1 keeps the delay at the
    // top of the range, which is the premise this test needs and never had.
    const realRandom = Math.random
    Math.random = () => 0.999
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
    using warn = liveWarnings()
    const messages = warn.messages
    try {
        const sub = new RedisSubscribeConnection({
            hostname: '127.0.0.1',
            port: server.port,
            keepaliveMs: 50,
            livenessMs: 200,
            // The ceiling, not a floor — see the `Math.random` pin above, which
            // is what actually keeps the retry pending until close() runs.
            retryBaseMs: 150,
            retryMaxMs: 150,
        })
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => messages.some((m) => m.includes('retrying in')),
            'a retry is scheduled and still pending',
            4000,
        )
        await sub.close()
        // EVERY announced delay, not just the first, and scanned AFTER close().
        // Jitter can draw a 1ms delay, so the pending retry may fire and
        // re-schedule under a different delay at any moment — an earlier
        // version tracked only the first and failed intermittently for that
        // reason. Snapshotting the set BEFORE close() had the same defect one
        // step removed: a retry re-arming between the scan and the close left
        // the surviving timer's delay outside `announced`, so the only id
        // examined was one that had already fired and could never have been
        // cleared. Observed once in 96 concurrent runs, and the window is a
        // function of how long the whole file takes — #290 added three tests
        // and pushed it from 14s to 22s. Reading the live `messages` and
        // `byDelay` after the close closes the window instead of narrowing it.
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
        assert(
            retryIds.some((id) => cleared.includes(id)),
            'close() left the pending retry scheduled — harmless once, and ' +
                'one more per closed connection forever',
        )
    } finally {
        globalThis.setTimeout = realSetTimeout
        globalThis.clearTimeout = realClearTimeout
        Math.random = realRandom
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
        using warn = liveWarnings()
        const messages = warn.messages
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
    using warn = liveWarnings()
    const messages = warn.messages
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
    using warn = liveWarnings()
    const messages = warn.messages
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
    using warn = liveWarnings()
    const messages = warn.messages
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
        server.delayReply(0)
        await sub.close()
        server.stop()
    }
})

// ─────────────────────────────────────────────────────────────────────────────
// #286 — the write leg
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A socket that completes its dial and then never accepts a byte.
 *
 * The shape #286 is about, and the one no fake SERVER can produce: a listener
 * that stops reading still has a kernel receive buffer, so a 40-byte
 * `PSUBSCRIBE` lands in it and `conn.write` resolves. Stalling the write means
 * stalling it at the socket, so the socket is the fake.
 */
function stalledWriteConn(): Deno.Conn {
    return {
        write: () => new Promise<number>(() => {}),
        read: () => new Promise<number | null>(() => {}),
        close: () => {},
        localAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
        remoteAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
    } as unknown as Deno.Conn
}

Deno.test('#286: a PSUBSCRIBE write that never settles fails the activation instead of hanging it', async () => {
    // Before this, `#activate` awaited a write with no deadline: no error, no
    // retry, no log line. The `catch` that calls `#scheduleRetry` was never
    // entered, so every machine #245 built was bypassed by the one leg it did
    // not cover.
    const real = Deno.connect
    Object.defineProperty(Deno, 'connect', {
        value: () => Promise.resolve(stalledWriteConn()),
        configurable: true,
        writable: true,
    })
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: 1,
        keepaliveMs: 60,
        livenessMs: 200,
        retryBaseMs: 5000,
        retryMaxMs: 5000,
    })
    using warn = liveWarnings()
    const messages = warn.messages
    try {
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => messages.some((m) => /timed out/i.test(m)),
            'the stalled write surfaced as a failed activation',
            3000,
        )
        const line = messages.find((m) => /timed out/i.test(m))!
        // The DERIVED budget, not the liveness window and not a literal. With
        // livenessMs 200 the min() picks the window; the ceiling case is the
        // test below.
        assert(
            /200ms/.test(line),
            `the write budget must be min(livenessMs, ceiling) = 200ms here, ` +
                `got: ${line}`,
        )
        assert(
            /discard the socket/i.test(line),
            'the error must tell the caller bytes may remain on the wire',
        )
    } finally {
        Object.defineProperty(Deno, 'connect', {
            value: real,
            configurable: true,
            writable: true,
        })
        await sub.close()
    }
})

Deno.test({
    name: '#286: the write budget is CAPPED, not the liveness window raw',
    // ~5s by construction: the whole point is that a 20s liveness window does
    // NOT become a 20s write budget, and the only observable is the deadline
    // firing at the ceiling. A cheaper fixture cannot tell min() from identity,
    // because with a small window the two agree — which is exactly how this
    // decision would have shipped untested.
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        const real = Deno.connect
        Object.defineProperty(Deno, 'connect', {
            value: () => Promise.resolve(stalledWriteConn()),
            configurable: true,
            writable: true,
        })
        const sub = new RedisSubscribeConnection({
            hostname: '127.0.0.1',
            port: 1,
            keepaliveMs: 10_000,
            livenessMs: 20_000,
            retryBaseMs: 60_000,
            retryMaxMs: 60_000,
        })
        using warn = liveWarnings()
        const messages = warn.messages
        const started = Date.now()
        try {
            sub.psubscribe('app:*', () => {})
            await waitFor(
                () => messages.some((m) => /timed out/i.test(m)),
                'the write deadline fired at the ceiling, not the window',
                9000,
            )
            const elapsed = Date.now() - started
            const line = messages.find((m) => /timed out/i.test(m))!
            assert(
                /5000ms/.test(line),
                `a 20s liveness window must not become a 20s write budget. ` +
                    `Got: ${line}`,
            )
            assert(
                elapsed < 9000,
                `it waited ${elapsed}ms — the cap did nothing`,
            )
        } finally {
            Object.defineProperty(Deno, 'connect', {
                value: real,
                configurable: true,
                writable: true,
            })
            await sub.close()
        }
    },
})

/**
 * A socket whose writes take `writeMs`, and whose read can be faulted on demand.
 *
 * Slow writes are what let a SECOND write queue behind an in-flight one — the
 * only way to build a backlog, since `#activate` awaits its PSUBSCRIBEs one at
 * a time. The keepalive is the concurrent writer that supplies it.
 */
function slowWriteConn(writeMs: number): {
    conn: Deno.Conn
    faultRead: (error: Error) => void
} {
    let rejectRead: ((error: Error) => void) | undefined
    const conn = {
        write: (bytes: Uint8Array) =>
            new Promise<number>((resolve) =>
                setTimeout(() => resolve(bytes.byteLength), writeMs)
            ),
        read: () =>
            new Promise<number | null>((_, reject) => {
                rejectRead = reject
            }),
        close: () => {},
        localAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
        remoteAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
    } as unknown as Deno.Conn
    return { conn, faultRead: (error) => rejectRead?.(error) }
}

Deno.test('#286: a write queued against a socket that is then discarded REJECTS, and reaches no socket', async () => {
    // The half of #286 that is not the deadline. `#writeChain` was
    // per-CONNECTION and `#discardSocket` did not reset it, so a write queued
    // against a dead socket sat ahead of every later write — including the
    // recovered socket's re-PSUBSCRIBE. The recovery queued behind the thing it
    // was recovering from.
    //
    // Two mechanisms are needed and this covers both: rebasing the field does
    // not cancel a frame ALREADY chained behind an in-flight one, so the queued
    // closure re-checks its generation and rejects. Rejects, not resolves — a
    // silently-dropped write leaves the caller's await unsettled, which is
    // #286's own defect relocated into the queue reset.
    const { conn, faultRead } = slowWriteConn(200)
    const real = Deno.connect
    Object.defineProperty(Deno, 'connect', {
        value: () => Promise.resolve(conn),
        configurable: true,
        writable: true,
    })
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: 1,
        keepaliveMs: 40, // fires while the PSUBSCRIBE write is still in flight
        livenessMs: 5000, // long, so the deadline is not what ends this
        retryBaseMs: 60_000, // no re-dial: the point is the ABANDONED write
        retryMaxMs: 60_000,
    })
    using warn = liveWarnings()
    const messages = warn.messages
    try {
        sub.psubscribe('app:*', () => {})
        // Wait past activation. The keepalive is armed and the read loop
        // started only AFTER the PSUBSCRIBE writes — an earlier version of this
        // test faulted at 80ms, when neither existed yet, and timed out proving
        // nothing. With a 200ms write and a 40ms keepalive, PING #2 is queued
        // behind PING #1 by the time we fault.
        await new Promise((r) => setTimeout(r, 320))
        // Now the socket dies. The read loop faults, `#discardSocket` runs, and
        // the queued PING's closure has its generation pulled out from under it.
        faultRead(new Error('socket fault'))
        await waitFor(
            () => messages.some((m) => /abandoned/i.test(m)),
            'the queued write was abandoned rather than sent to a dead socket',
            3000,
        )
        const line = messages.find((m) => /abandoned/i.test(m))!
        assert(
            /socket generation changed/i.test(line),
            `it must say WHY it was abandoned, got: ${line}`,
        )
        assert(
            /Bad resource ID|BadResource/i.test(line) === false,
            'a Deno resource error means the frame reached the dead socket ' +
                `and the guard did not fire: ${line}`,
        )
    } finally {
        Object.defineProperty(Deno, 'connect', {
            value: real,
            configurable: true,
            writable: true,
        })
        await sub.close()
    }
})

Deno.test('#286: a keepalive write that times out DISCARDS the socket', async () => {
    // The obligation the keepalive used to owe and not pay. Its `.catch` logs
    // and deliberately does not schedule a recovery, on the reasoning that "the
    // read loop on this same socket is about to fault". Sound while every write
    // failure was a socket error the read loop would also see — and false for a
    // TIMEOUT, which is what #286 introduces: the socket is alive, the read
    // loop keeps draining, and a partial PING sits mid-frame waiting for the
    // next PSUBSCRIBE to be spliced onto it.
    //
    // Scheduling stays where it was. Only the discard moved.
    let dials = 0
    let writes = 0
    const real = Deno.connect
    Object.defineProperty(Deno, 'connect', {
        value: () => {
            dials++
            const first = dials === 1
            return Promise.resolve(
                {
                    // Generation 1 accepts the PSUBSCRIBE and then wedges, so
                    // the KEEPALIVE is the write that times out. Generation 2
                    // behaves, so the test ends on a live socket rather than a
                    // loop.
                    write: (bytes: Uint8Array) => {
                        writes++
                        return first && writes > 1
                            ? new Promise<number>(() => {})
                            : Promise.resolve(bytes.byteLength)
                    },
                    // The socket KEEPS ANSWERING. Without this the read
                    // deadline (`livenessMs`) always fires before the write
                    // deadline, which is `min(livenessMs, ceiling)` and so can
                    // never be longer — the first version of this test proved a
                    // re-dial that the READ loop had caused, not the keepalive.
                    // A reply every 50ms resets the read window and leaves the
                    // wedged write as the only thing that can end this.
                    read: (buf: Uint8Array) =>
                        new Promise<number | null>((resolve) =>
                            setTimeout(() => {
                                const pong = new TextEncoder().encode(
                                    '+PONG\r\n',
                                )
                                buf.set(pong)
                                resolve(pong.byteLength)
                            }, 50)
                        ),
                    close: () => {},
                    localAddr: {
                        transport: 'tcp',
                        hostname: '127.0.0.1',
                        port: 0,
                    },
                    remoteAddr: {
                        transport: 'tcp',
                        hostname: '127.0.0.1',
                        port: 0,
                    },
                } as unknown as Deno.Conn,
            )
        },
        configurable: true,
        writable: true,
    })
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: 1,
        keepaliveMs: 60,
        livenessMs: 200,
        retryBaseMs: 40,
        retryMaxMs: 80,
    })
    using warn = liveWarnings()
    const messages = warn.messages
    try {
        sub.psubscribe('app:*', () => {})
        await waitFor(
            () => dials >= 2,
            'the wedged socket was discarded and re-dialled — without the ' +
                'discard the keepalive just logs and the dead socket is kept',
            4000,
        )
        assert(
            messages.some((m) => /keepalive PING failed/.test(m)),
            'the keepalive still logs its own failure; only the discard moved',
        )
    } finally {
        Object.defineProperty(Deno, 'connect', {
            value: real,
            configurable: true,
            writable: true,
        })
        await sub.close()
    }
})

Deno.test('#296: a SYNCHRONOUS handler throw is contained, without a live broker', async () => {
    // #296's only test was live-env-gated, so the default `deno task test`
    // gate carried no coverage of it at all — the review gate's point. The
    // PROCESS-EXIT half genuinely needs a real broker (no in-process double
    // reproduces one), but the containment half does not, and that is the half
    // a regression would break first.
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
    })
    const seen: string[] = []
    using warn = liveWarnings()
    void warn
    const realError = console.error
    const errors: string[] = []
    console.error = (...args: unknown[]) => {
        errors.push(args.map((a) => String(a)).join(' '))
    }
    try {
        sub.psubscribe('app:*', (_topic, payload) => {
            seen.push(payload)
            if (payload === 'boom') throw new Error('handler exploded')
        })
        await waitFor(
            () =>
                server.commandLog.some((c) =>
                    c[0]?.toUpperCase() === 'PSUBSCRIBE'
                ),
            'the subscription reached the server',
        )
        server.publish('app:*', 'app:a', 'first')
        server.publish('app:*', 'app:a', 'boom')
        server.publish('app:*', 'app:a', 'after')
        await waitFor(
            () => seen.includes('after'),
            'delivery continued past the throw — the read loop survived it',
        )
        assertEquals(seen, ['first', 'boom', 'after'])
        assert(
            errors.some((e) => /handler exploded/.test(e)),
            'the fault was reported, not swallowed',
        )
    } finally {
        console.error = realError
        await sub.close()
        server.stop()
    }
})

Deno.test('#296: an ASYNC handler rejection is contained too', async () => {
    // The gap the review gate found. `try/catch` sees a synchronous throw and
    // nothing else, so an `async` handler hands back a REJECTED promise that
    // nothing awaits — the unobserved rejection #296 is about, reached by
    // writing the natural thing. The port's handler type returns `void`, and
    // TypeScript assigns a `Promise<void>` to that without complaint, so an
    // application arrives here with no warning at all.
    const server = await startFakeServer()
    const sub = new RedisSubscribeConnection({
        hostname: '127.0.0.1',
        port: server.port,
    })
    const seen: string[] = []
    using warn = liveWarnings()
    void warn
    const realError = console.error
    const errors: string[] = []
    console.error = (...args: unknown[]) => {
        errors.push(args.map((a) => String(a)).join(' '))
    }
    try {
        sub.psubscribe(
            'app:*',
            ((_topic: string, payload: string) => {
                seen.push(payload)
                // eslint-disable-next-line — an async handler, which the `void`
                // return type of the port permits by assignment.
                return payload === 'boom'
                    ? Promise.reject(new Error('async handler exploded'))
                    : Promise.resolve()
            }) as unknown as (topic: string, payload: string) => void,
        )
        await waitFor(
            () =>
                server.commandLog.some((c) =>
                    c[0]?.toUpperCase() === 'PSUBSCRIBE'
                ),
            'the subscription reached the server',
        )
        server.publish('app:*', 'app:a', 'boom')
        await waitFor(
            () => errors.some((e) => /async handler exploded/.test(e)),
            'the rejected promise was contained and reported, not left ' +
                'unobserved for the runtime to turn into a process exit',
        )
        server.publish('app:*', 'app:a', 'after')
        await waitFor(
            () => seen.includes('after'),
            'delivery continued past the rejection',
        )
    } finally {
        console.error = realError
        await sub.close()
        server.stop()
    }
})
