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
    assert(
        warnings.some((m) => m.includes('no further reconnect')),
        'the terminal state is named in the WARN (FR-009)',
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
