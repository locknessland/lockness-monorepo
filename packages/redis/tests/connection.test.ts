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

import { assert, assertEquals } from '@std/assert'
import { AuthenticatedConnection } from '../connection.ts'
import { encodeCommand, readReply, writeFrame } from '../resp.ts'
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
