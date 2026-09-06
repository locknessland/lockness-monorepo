/**
 * @fileoverview The shared authenticated-socket primitive over a loopback fake.
 *
 * The dial + TLS + `AUTH`/`SELECT` handshake + one-time cleartext-AUTH warning +
 * self-heal discipline extracted from `RedisClient.connect` (#268, FR-013),
 * exercised directly so `RedisClient` and the subscribe-mode connection can both
 * consume it without either re-implementing it. `Deno.connect`/`Deno.connectTls`
 * are stubbed via `Object.defineProperty` to count opens and capture options —
 * no live Redis, only a byte fake over 127.0.0.1.
 *
 * @module @lockness/redis/tests/connection
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { AuthenticatedConnection, deadlineIn, exchange } from '../connection.ts'
import {
    encodeCommand,
    readReply,
    RespFramingError,
    writeFrame,
} from '../resp.ts'
import { startFakeServer } from './fake_server.ts'

/**
 * Run `body` with `console.warn` captured, and return the messages it emitted.
 * Restores the real `console.warn` even if `body` throws.
 */
async function captureWarnings(
    body: () => void | Promise<void>,
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

/** Count the cleartext-AUTH warnings among captured messages. */
function cleartextWarnings(messages: string[]): number {
    return messages.filter((m) => m.includes('AUTH will be sent in cleartext'))
        .length
}

/** Replace `Deno.connect` with `value`, run `body`, and always restore it. */
async function withConnectStub(
    // deno-lint-ignore no-explicit-any
    value: (opts: any) => Promise<Deno.Conn>,
    body: () => Promise<void>,
): Promise<void> {
    const real = Deno.connect
    Object.defineProperty(Deno, 'connect', { configurable: true, value })
    try {
        await body()
    } finally {
        Object.defineProperty(Deno, 'connect', {
            configurable: true,
            value: real,
        })
    }
}

/** Replace `Deno.connectTls` with `value`, run `body`, and always restore it. */
async function withConnectTlsStub(
    // deno-lint-ignore no-explicit-any
    value: (opts: any) => Promise<Deno.Conn>,
    body: () => Promise<void>,
): Promise<void> {
    const real = Deno.connectTls
    Object.defineProperty(Deno, 'connectTls', { configurable: true, value })
    try {
        await body()
    } finally {
        Object.defineProperty(Deno, 'connectTls', {
            configurable: true,
            value: real,
        })
    }
}

Deno.test('connection - connect() dials and round-trips a PING over the socket', async () => {
    const server = await startFakeServer()
    const conn = new AuthenticatedConnection({
        hostname: '127.0.0.1',
        port: server.port,
    })
    try {
        const socket = await conn.connect()
        await writeFrame(socket, encodeCommand(['PING']))
        assertEquals(await readReply(socket), { type: 'simple', value: 'PONG' })
    } finally {
        const socket = conn.socket
        if (socket) conn.discard(socket)
        server.stop()
    }
})

Deno.test('connection - connect() runs AUTH then SELECT during the handshake', async () => {
    const server = await startFakeServer()
    const conn = new AuthenticatedConnection({
        hostname: '127.0.0.1',
        port: server.port,
        password: 's3cret',
        db: 3,
    })
    try {
        await conn.connect()
        const ops = server.commandLog.map((c) => c[0]?.toUpperCase())
        assertEquals(ops.slice(0, 2), ['AUTH', 'SELECT'])
        // The credential reached the wire as a bulk arg, not the log.
        assertEquals(server.commandLog[0], ['AUTH', 's3cret'])
        assertEquals(server.commandLog[1], ['SELECT', '3'])
    } finally {
        const socket = conn.socket
        if (socket) conn.discard(socket)
        server.stop()
    }
})

Deno.test('connection - connect() is single-flighted: concurrent callers open ONE socket', async () => {
    const server = await startFakeServer()
    const real = Deno.connect
    let opens = 0
    await withConnectStub(
        (opts) => {
            opens++
            return new Promise((resolve) =>
                setTimeout(() => resolve(real(opts)), 25)
            )
        },
        async () => {
            const conn = new AuthenticatedConnection({
                hostname: '127.0.0.1',
                port: server.port,
            })
            await Promise.all([conn.connect(), conn.connect()])
            assertEquals(opens, 1, 'two concurrent connect() opened one socket')
            const socket = conn.socket
            if (socket) conn.discard(socket)
        },
    )
    server.stop()
})

Deno.test('connection - TLS dials via connectTls with validation ON (no trust-all option)', async () => {
    let captured: Record<string, unknown> | undefined
    await withConnectTlsStub(
        (opts) => {
            captured = opts
            return Promise.resolve({
                write: (p: Uint8Array) => Promise.resolve(p.byteLength),
                read: () => Promise.resolve(null),
                close: () => {},
            } as unknown as Deno.Conn)
        },
        async () => {
            const conn = new AuthenticatedConnection({
                hostname: 'redis.internal',
                port: 6380,
                tls: true,
            })
            await conn.connect()
            const socket = conn.socket
            if (socket) conn.discard(socket)
        },
    )
    // Only hostname + port — no `caCerts`/insecure flag that would trust-all.
    assertEquals(captured, { hostname: 'redis.internal', port: 6380 })
})

Deno.test('connection - warns ONCE on cleartext AUTH and never logs the password', async () => {
    const messages = await captureWarnings(() => {
        new AuthenticatedConnection({
            hostname: 'redis.internal',
            password: 's3cret',
            tls: false,
        })
    })
    assertEquals(
        cleartextWarnings(messages),
        1,
        'exactly one cleartext-AUTH warning for password + tls:false',
    )
    assert(
        messages.every((m) => !m.includes('s3cret')),
        'the password is redacted from every warning',
    )
})

Deno.test('connection - TLS suppresses the cleartext-AUTH warning', async () => {
    const messages = await captureWarnings(() => {
        new AuthenticatedConnection({
            hostname: 'redis.internal',
            password: 's3cret',
            tls: true,
        })
    })
    assertEquals(cleartextWarnings(messages), 0)
})

Deno.test('connection - discard() self-heals: the next connect reconnects', async () => {
    const server = await startFakeServer()
    const real = Deno.connect
    let opens = 0
    await withConnectStub(
        (opts) => {
            opens++
            return real(opts)
        },
        async () => {
            const conn = new AuthenticatedConnection({
                hostname: '127.0.0.1',
                port: server.port,
            })
            const s1 = await conn.connect()
            assertEquals(opens, 1, 'one socket opened')
            conn.discard(s1)
            assertEquals(conn.socket, null, 'discard cleared the live socket')
            const s2 = await conn.connect()
            assertEquals(opens, 2, 'the next connect reconnected clean')
            assert(s1 !== s2, 'a fresh socket, not the discarded one')
            conn.discard(s2)
        },
    )
    server.stop()
})

Deno.test('connection - a failed handshake closes the socket and drops the memo', async () => {
    // A socket whose AUTH reply is a server error must not be published as live;
    // the next connect must retry rather than reuse a half-open socket.
    const real = Deno.connect
    let opens = 0
    await withConnectStub(
        (opts) => {
            opens++
            if (opens === 1) {
                return Promise.resolve({
                    write: (p: Uint8Array) => Promise.resolve(p.byteLength),
                    read: (p: Uint8Array) => {
                        const err = new TextEncoder().encode(
                            '-ERR bad auth\r\n',
                        )
                        p.set(err)
                        return Promise.resolve(err.byteLength)
                    },
                    close: () => {},
                } as unknown as Deno.Conn)
            }
            return real(opts)
        },
        async () => {
            const server = await startFakeServer()
            const conn = new AuthenticatedConnection({
                hostname: '127.0.0.1',
                port: server.port,
                password: 's3cret',
            })
            let threw = false
            try {
                await conn.connect()
            } catch {
                threw = true
            }
            assertEquals(threw, true, 'the handshake failure surfaced')
            assertEquals(conn.socket, null, 'no half-open socket was retained')
            const socket = await conn.connect()
            assertEquals(opens, 2, 'exactly one retry')
            conn.discard(socket)
            server.stop()
        },
    )
})

Deno.test('#287: discard of a STALE socket does not cancel an in-flight dial', async () => {
    // The guard that has no witness today. `discard` clears `connection`
    // CONDITIONALLY (`if (this.connection === conn)`) and then clears
    // `connectPromise` UNCONDITIONALLY on the very next line — so a discard of
    // any socket cancels whatever dial happens to be in flight.
    //
    // Unreachable before #245, which is why it shipped: nothing called
    // `discard` while a dial was running. #245's retry machinery makes
    // concurrent activation routine, and #286's write deadline makes a LATE
    // discard of an already-replaced socket routine on top of that — an
    // activation whose write times out discards the socket it was holding,
    // which by then may be two generations old.
    //
    // What the cancellation costs: the next `connect()` sees a null
    // `connectPromise`, dials AGAIN, and the single-flight invariant — N
    // concurrent callers open exactly ONE socket — is gone. With `tls`
    // defaulting to false, the extra dial re-sends AUTH in cleartext.
    const server = await startFakeServer()
    const real = Deno.connect
    let opens = 0
    await withConnectStub(
        (opts) => {
            opens++
            return new Promise((resolve) =>
                setTimeout(() => resolve(real(opts)), 40)
            )
        },
        async () => {
            const conn = new AuthenticatedConnection({
                hostname: '127.0.0.1',
                port: server.port,
            })
            // A socket from an earlier generation. It is discarded below while
            // a fresh dial is in flight — the exact interleaving #286 makes
            // routine.
            const stale = await real({
                hostname: '127.0.0.1',
                port: server.port,
            })

            const dialA = conn.connect()
            // Discard a socket this connection does not currently hold.
            conn.discard(stale)
            const dialB = conn.connect()

            const [a, b] = await Promise.all([dialA, dialB])
            assertEquals(
                opens,
                1,
                'a discard of an unrelated socket cancelled the in-flight ' +
                    'single-flight, so the second connect() dialled again',
            )
            assert(a === b, 'both callers must receive the same socket')

            const socket = conn.socket
            if (socket) conn.discard(socket)
        },
    )
    server.stop()
})

/** A socket that dials, answers reads, and never accepts a byte. */
function wedgedWriteConn(): Deno.Conn {
    return {
        write: () => new Promise<number>(() => {}),
        read: () => new Promise<number | null>(() => {}),
        close: () => {},
        localAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
        remoteAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
    } as unknown as Deno.Conn
}

Deno.test('#297: the handshake is bounded in TOTAL when its write leg stalls', async () => {
    // `exchange` passed its timeout to `readReply` only, so `writeFrame` ran
    // with no deadline and a peer that accepts the connection and then stops
    // draining hung the handshake forever — with `connect()`'s carefully
    // threaded budget doing nothing, because it only ever reached the read.
    //
    // The bound has to be on the TOTAL. Applied per step it multiplies, which
    // is the defect #274 removed and the one this must not reintroduce through
    // the leg nobody threaded.
    const real = Deno.connect
    Object.defineProperty(Deno, 'connect', {
        value: () => Promise.resolve(wedgedWriteConn()),
        configurable: true,
        writable: true,
    })
    const conn = new AuthenticatedConnection({
        hostname: '127.0.0.1',
        port: 1,
        password: 'secret-value',
        db: 3,
        handshakeTimeoutMs: 300,
    })
    const started = Date.now()
    try {
        await assertRejects(() => conn.connect(), Error)
        const elapsed = Date.now() - started
        assert(
            elapsed < 3000,
            `the handshake took ${elapsed}ms against a 300ms budget — the ` +
                'write leg is unbounded',
        )
    } finally {
        Object.defineProperty(Deno, 'connect', {
            value: real,
            configurable: true,
            writable: true,
        })
    }
})

Deno.test('#297: a stalled AUTH write discloses nothing about the password', async () => {
    // The disclosure this feature would otherwise CREATE. `writeTimeout`
    // interpolates `frame.byteLength`, and for `encodeCommand(['AUTH', pw])`
    // that is an invertible function of the password's byte length — 8/16/32/64
    // bytes give 28/37/53/85. The rendered message is 169 characters, so
    // `renderError`'s 200-char cap does not truncate it away, and consumers do
    // log `renderError(error)`.
    //
    // Unreachable before this feature, because the handshake's write could not
    // time out. That is exactly why the test belongs with it.
    const real = Deno.connect
    Object.defineProperty(Deno, 'connect', {
        value: () => Promise.resolve(wedgedWriteConn()),
        configurable: true,
        writable: true,
    })
    const password = 'a'.repeat(37)
    const conn = new AuthenticatedConnection({
        hostname: '127.0.0.1',
        port: 1,
        password,
        handshakeTimeoutMs: 200,
    })
    try {
        const error = await assertRejects(() => conn.connect(), Error)
        // THE POSITIVE CONTROL, and it is the whole difference between this
        // test and the one it replaces. A test that asserts only ABSENCES
        // passes when the write leg never ran at all — and the review gate
        // caught exactly that: the disclosure survived in the sibling branch
        // of the same function, guarded by a test structurally unable to see
        // it. Pin that the write leg DID time out first.
        assert(
            /timed out/i.test(error.message) &&
                /discard the socket/i.test(error.message),
            'the write leg did not time out, so every absence below is ' +
                `vacuous. Got: ${error.message}`,
        )
        assert(
            !error.message.includes(password),
            'the password itself reached the error',
        )
        // The frame for a 37-byte password is 58 bytes; its length must not be
        // recoverable from anything in the message.
        for (const leak of ['58', '37', String(password.length + 21)]) {
            assert(
                !error.message.includes(leak),
                `the message carries ${leak}, from which the password's byte ` +
                    `length is recoverable: ${error.message}`,
            )
        }
    } finally {
        Object.defineProperty(Deno, 'connect', {
            value: real,
            configurable: true,
            writable: true,
        })
    }
})

Deno.test('#297: a nonsense handshakeTimeoutMs is refused at construction', () => {
    // It reached `readReply` alone before this branch and now bounds the write
    // leg as well, so an unchecked value decides twice as much. `NaN` made
    // every handshake fail instantly with "after NaNms" — a misconfiguration
    // presenting as a broker outage, which is the hardest kind to diagnose.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        let threw = false
        try {
            new AuthenticatedConnection({
                hostname: '127.0.0.1',
                handshakeTimeoutMs: bad,
            })
        } catch (error) {
            threw = error instanceof RangeError
        }
        assert(threw, `handshakeTimeoutMs of ${bad} was accepted`)
    }
    // And a legitimate value still constructs.
    new AuthenticatedConnection({
        hostname: '127.0.0.1',
        handshakeTimeoutMs: 5000,
    })
})

Deno.test({
    name: '#297: the handshake write leg is capped, not given the whole window',
    // ~5s by construction. A cheaper fixture cannot tell `min(remaining,
    // ceiling)` from `remaining`, because with a small handshake budget the two
    // agree — which is exactly how this decision would have shipped untested.
    // The asymmetry it prevents: on a subscribe socket `handshakeTimeoutMs`
    // defaults to `livenessMs` (45s), so its ~40-byte AUTH write would get 45s
    // while its ~40-byte PSUBSCRIBE write gets 5s. Same socket, same frame,
    // nine times the tolerance — and the loose one carries the credential.
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
        const real = Deno.connect
        Object.defineProperty(Deno, 'connect', {
            value: () => Promise.resolve(wedgedWriteConn()),
            configurable: true,
            writable: true,
        })
        const conn = new AuthenticatedConnection({
            hostname: '127.0.0.1',
            port: 1,
            password: 'secret-value',
            handshakeTimeoutMs: 30_000,
        })
        const started = Date.now()
        try {
            const error = await assertRejects(() => conn.connect(), Error)
            const elapsed = Date.now() - started
            assert(
                elapsed < 15_000,
                `a 30s handshake budget became a ${elapsed}ms write stall — ` +
                    'the ceiling did nothing',
            )
            assert(
                /5000ms/.test(error.message),
                `the write leg must fail at the ceiling: ${error.message}`,
            )
        } finally {
            Object.defineProperty(Deno, 'connect', {
                value: real,
                configurable: true,
                writable: true,
            })
        }
    },
})

Deno.test('#297: the ZERO-PROGRESS write error names no total either', async () => {
    // The sibling branch of the same loop. #297 removed `frame.byteLength`
    // from the timeout error and left it here, which the review gate found —
    // the same disclosure, one branch away, and the disclosure test above could
    // not see it because it only ever drives the timeout path.
    //
    // A socket that RETURNS 0 takes this branch instead: exact offset, no
    // total.
    const zeroProgress = {
        write: () => Promise.resolve(0),
        read: () => new Promise<number | null>(() => {}),
        close: () => {},
        localAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
        remoteAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
    } as unknown as Deno.Conn
    const password = 'a'.repeat(37)
    const error = await assertRejects(
        () => exchange(zeroProgress, ['AUTH', password], deadlineIn(5000)),
        RespFramingError,
    )
    assert(
        /stalled/i.test(error.message),
        `the zero-progress branch must be the one that ran: ${error.message}`,
    )
    for (const leak of ['58', '37', password]) {
        assert(
            !error.message.includes(leak),
            `the message carries ${leak}: ${error.message}`,
        )
    }
})

Deno.test('#297: the write consumes the shared budget, leaving the read the remainder', async () => {
    // What the review gate asked for was a witness for the post-write guard at
    // `exchange`. Writing it showed the guard is near-unreachable by
    // construction, and that is worth recording rather than faking: `writeFrame`
    // is given exactly the remaining budget, so a write that consumes all of it
    // raises its OWN timeout first. The guard fires only if a write returns at
    // the same instant its deadline expires — a race, not a scenario. It stays
    // as a belt-and-braces check against ever handing `readReply` a
    // non-positive timeout, and the battery records it as a survivor with that
    // reason instead of a test pretending to cover it.
    //
    // What IS deterministic, and what SC-004 actually promises, is that the two
    // legs share one budget: a slow write leaves the read less. Before #297 the
    // read got a fresh full window no matter how long the write took, because
    // the write had no budget at all.
    const writeMs = 120
    const slowWrite = {
        write: (bytes: Uint8Array) =>
            new Promise<number>((resolve) =>
                setTimeout(() => resolve(bytes.byteLength), writeMs)
            ),
        read: () => new Promise<number | null>(() => {}),
        close: () => {},
        localAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
        remoteAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
    } as unknown as Deno.Conn
    const started = Date.now()
    await assertRejects(
        () => exchange(slowWrite, ['GET', 'k'], deadlineIn(300)),
        Error,
    )
    const elapsed = Date.now() - started
    // One budget: write (120ms) + read (the ~180ms left) ≈ 300ms total. Two
    // budgets would be 120 + 300 = 420ms, and an unbounded write would never
    // return at all.
    assert(
        elapsed < 380,
        `the exchange took ${elapsed}ms against a 300ms budget — the legs are ` +
            'not sharing it, so the read got a window of its own',
    )
    assert(
        elapsed >= writeMs,
        `it returned in ${elapsed}ms, before the write could have finished — ` +
            'this fixture is not exercising the path it claims',
    )
})
