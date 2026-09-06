/**
 * @fileoverview RedisClient connection discipline over a loopback fake.
 *
 * The behaviours extracted from the session driver (#145): a command round-trip,
 * single-flight connect, the AUTH/SELECT handshake without a re-entrancy
 * deadlock, both self-heal branches, and an idempotent close. `Deno.connect` is
 * stubbed via `Object.defineProperty` to count opens and to inject failures — no
 * live Redis, only a byte fake over 127.0.0.1.
 *
 * @module @lockness/redis/tests/client
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { drainDisposables } from '@lockness/contract/lifecycle/internal'
import { RedisClient } from '../mod.ts'
import { deadlineIn, exchange } from '../connection.ts'
import { RespFramingError } from '../resp.ts'
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

/** connect() is reachable at runtime for a unit test. */
type Connectable = { connect(): Promise<Deno.Conn> }

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

Deno.test('client - a SET then GET round-trips its value', async () => {
    const server = await startFakeServer()
    const client = new RedisClient({ hostname: '127.0.0.1', port: server.port })
    try {
        await client.command('SET', 'k', 'hello')
        const reply = await client.command('GET', 'k')
        assertEquals(reply, { type: 'bulk', value: 'hello' })
        const miss = await client.command('GET', 'absent')
        assertEquals(miss, { type: 'nil' })
    } finally {
        await client.close()
        server.stop()
    }
})

Deno.test('client - connect() is single-flighted: concurrent callers open ONE socket', async () => {
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
            const client = new RedisClient({
                hostname: '127.0.0.1',
                port: server.port,
            })
            const connectable = client as unknown as Connectable
            await Promise.all([connectable.connect(), connectable.connect()])
            assertEquals(opens, 1, 'two concurrent connect() opened one socket')
            await client.close()
        },
    )
    server.stop()
})

Deno.test('client - a burst of commands opens ONE connection and AUTHs once', async () => {
    const server = await startFakeServer()
    for (let i = 0; i < 6; i++) server.store.set(`k${i}`, `v${i}`)
    const real = Deno.connect
    let opens = 0
    await withConnectStub(
        (opts) => {
            opens++
            return real(opts)
        },
        async () => {
            const client = new RedisClient({
                hostname: '127.0.0.1',
                port: server.port,
                password: 's3cret',
                db: 3,
            })
            const replies = await Promise.all(
                Array.from(
                    { length: 6 },
                    (_, i) => client.command('GET', `k${i}`),
                ),
            )
            for (let i = 0; i < 6; i++) {
                assertEquals(replies[i], { type: 'bulk', value: `v${i}` })
            }
            assertEquals(
                opens,
                1,
                'the burst opened one socket (one AUTH/SELECT)',
            )
            await client.close()
        },
    )
    server.stop()
})

Deno.test('client - a connect rejection self-heals on the next command', async () => {
    const server = await startFakeServer()
    server.store.set('k', 'up')
    const real = Deno.connect
    let opens = 0
    await withConnectStub(
        (opts) => {
            opens++
            if (opens === 1) return Promise.reject(new Error('refused'))
            return real(opts)
        },
        async () => {
            const client = new RedisClient({
                hostname: '127.0.0.1',
                port: server.port,
            })
            let firstThrew = false
            try {
                await client.command('GET', 'k')
            } catch {
                firstThrew = true
            }
            assertEquals(
                firstThrew,
                true,
                'the rejection surfaced, not swallowed',
            )
            assertEquals(await client.command('GET', 'k'), {
                type: 'bulk',
                value: 'up',
            })
            assertEquals(opens, 2, 'exactly one retry; not cached forever')
            await client.close()
        },
    )
    server.stop()
})

Deno.test('client - a mid-stream read fault discards the desynced socket, next command reconnects', async () => {
    const server = await startFakeServer()
    server.store.set('k', 'recovered')
    const real = Deno.connect
    let opens = 0
    await withConnectStub(
        (opts) => {
            opens++
            if (opens === 1) {
                return Promise.resolve({
                    write: (p: Uint8Array) => Promise.resolve(p.byteLength),
                    read: () => Promise.reject(new Error('connection reset')),
                    close: () => {},
                } as unknown as Deno.Conn)
            }
            return real(opts)
        },
        async () => {
            const client = new RedisClient({
                hostname: '127.0.0.1',
                port: server.port,
            })
            let firstThrew = false
            try {
                await client.command('GET', 'k')
            } catch {
                firstThrew = true
            }
            assertEquals(firstThrew, true, 'the wire fault surfaced')
            assertEquals(await client.command('GET', 'k'), {
                type: 'bulk',
                value: 'recovered',
            })
            assertEquals(opens, 2, 'exactly one reconnect; not bricked')
            await client.close()
        },
    )
    server.stop()
})

Deno.test('client - close() is idempotent and does not reopen a socket', async () => {
    const server = await startFakeServer()
    const real = Deno.connect
    let opens = 0
    await withConnectStub(
        (opts) => {
            opens++
            return real(opts)
        },
        async () => {
            const client = new RedisClient({
                hostname: '127.0.0.1',
                port: server.port,
            })
            await client.command('PING')
            assertEquals(opens, 1, 'one socket opened')
            await client.close()
            await client.close()
            assertEquals(opens, 1, 'close() did not reopen a socket')
        },
    )
    server.stop()
})

Deno.test('client - password with tls:false warns ONCE about cleartext AUTH', async () => {
    const messages = await captureWarnings(() => {
        new RedisClient({
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
})

Deno.test('client - password with tls:true does NOT warn about cleartext AUTH', async () => {
    const messages = await captureWarnings(() => {
        new RedisClient({
            hostname: 'redis.internal',
            password: 's3cret',
            tls: true,
        })
    })
    assertEquals(
        cleartextWarnings(messages),
        0,
        'TLS encrypts the credential — no cleartext warning',
    )
})

Deno.test('client - no password does NOT warn about cleartext AUTH', async () => {
    const messages = await captureWarnings(() => {
        new RedisClient({ hostname: 'redis.internal', tls: false })
    })
    assertEquals(
        cleartextWarnings(messages),
        0,
        'no credential is sent, so there is nothing to warn about',
    )
})

Deno.test('client - the cleartext-AUTH warning does not repeat per connection', async () => {
    const server = await startFakeServer()
    const messages = await captureWarnings(async () => {
        const client = new RedisClient({
            hostname: '127.0.0.1',
            port: server.port,
            password: 's3cret',
            tls: false,
        })
        // Multiple commands drive one connect (and any self-heal reconnects)
        // through the same client; the warning must stay a one-time startup
        // notice, not per-connection spam.
        await client.command('PING')
        await client.command('PING')
        await client.close()
    })
    server.stop()
    assertEquals(
        cleartextWarnings(messages),
        1,
        'still exactly one warning after several commands (not per-connection)',
    )
})

Deno.test('client - the socket registers a shutdown disposable, drained at teardown', async () => {
    const server = await startFakeServer()
    const client = new RedisClient({
        hostname: '127.0.0.1',
        port: server.port,
        disposableName: 'redis:test',
    })
    try {
        await client.command('PING')
        const drained = drainDisposables()
        assertEquals(
            drained.some((d) => d.name === 'redis:test'),
            true,
            'the client enrolled a named shutdown disposable',
        )
        for (const d of drained) await d.dispose()
    } finally {
        await client.close()
        server.stop()
    }
})

/** A socket that dials and answers reads, but never accepts a byte. */
function wedgedWriteConn(): Deno.Conn {
    return {
        write: () => new Promise<number>(() => {}),
        read: () => new Promise<number | null>(() => {}),
        close: () => {},
        localAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
        remoteAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
    } as unknown as Deno.Conn
}

Deno.test('#297: a command against a wedged broker rejects instead of hanging', async () => {
    // The defect, on the path that reaches 92 call sites across session, queue,
    // core's scheduler locks and realtime. `exchange` passed its timeout to
    // `readReply` only, so `writeFrame` had none and a peer that accepts the
    // connection and then stops draining left the caller's promise unsettled
    // forever. A hung scheduler lock is a scheduler that never runs again.
    //
    // Exercised through `exchange` directly, with an injected deadline. Driven
    // through `RedisClient.command` the bound is real but it is
    // `READ_TIMEOUT_MS` — 30 seconds — because no per-command budget exists and
    // the plan deliberately declined to add one. A first version of this test
    // asserted the command finished in under 5s and failed after 30, which was
    // the code being right and the assertion being wrong.
    const conn = wedgedWriteConn()
    const started = Date.now()
    const error = await assertRejects(
        () => exchange(conn, ['GET', 'k'], deadlineIn(200)),
        RespFramingError,
    )
    const elapsed = Date.now() - started
    assert(elapsed < 3000, `it waited ${elapsed}ms against a 200ms budget`)
    assert(/timed out/i.test(error.message), error.message)
})

Deno.test('#297: exchange refuses a budget that is already spent, before either leg', async () => {
    // A `RespFramingError`, not a `RangeError`. The discard obligation is
    // carried by the type — `client.ts` routes negatively on `RespServerError`
    // and `subscriber.ts` routes POSITIVELY on `RespFramingError` — and the
    // comment at that second site records this exact gap as a defect already
    // found twice. Designing it back in a third time is what the plan audit
    // stopped.
    //
    // This is also the guard that only became reachable when `remaining` lost
    // its `Math.max(1, …)` clamp: with the clamp, an expired budget silently
    // became a 1ms allowance and this branch could never run.
    let wrote = false
    const conn = {
        write: () => {
            wrote = true
            return Promise.resolve(1)
        },
        read: () => new Promise<number | null>(() => {}),
        close: () => {},
        localAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
        remoteAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
    } as unknown as Deno.Conn
    const spent = (Date.now() - 1000) as unknown as Parameters<
        typeof exchange
    >[2]
    const error = await assertRejects(
        () => exchange(conn, ['GET', 'k'], spent),
        RespFramingError,
    )
    assert(!wrote, 'it wrote to the socket despite having no budget left')
    assert(
        /already spent/i.test(error.message) && /GET/.test(error.message),
        `the message must name the verb and the cause: ${error.message}`,
    )
    assert(
        !error.message.includes('k'),
        'the message must not name an argument',
    )
})

Deno.test('#297: a write-leg framing error discards the socket, through RedisClient', async () => {
    // The review gate's first HIGH, and it was right: both tests above call
    // `exchange` directly, so `client.ts`'s routing of a WRITE-leg
    // `RespFramingError` to `discard` had no witness at all — and T013/T014
    // were marked done on the strength of reading the code rather than
    // exercising it.
    //
    // The routing is negative (`!(error instanceof RespServerError)`), and
    // `RespFramingError` and `RespServerError` are siblings under `RespError`,
    // so a write-leg framing error SHOULD fall into the discard branch. This
    // is what turns "should" into a fact.
    let opens = 0
    const real = Deno.connect
    Object.defineProperty(Deno, 'connect', {
        value: () => {
            opens++
            return Promise.resolve(
                {
                    // Rejects the way a timed-out or zero-progress write does.
                    write: () =>
                        Promise.reject(
                            new RespFramingError(
                                'Redis write stalled after 0 bytes',
                            ),
                        ),
                    read: () => new Promise<number | null>(() => {}),
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
    const client = new RedisClient({ hostname: '127.0.0.1', port: 1 })
    try {
        await assertRejects(() => client.command('GET', 'k'), RespFramingError)
        assertEquals(opens, 1, 'the first command dialled once')
        await assertRejects(() => client.command('GET', 'k'), RespFramingError)
        assertEquals(
            opens,
            2,
            'the wedged socket was NOT discarded — the second command reused ' +
                'it, so a framing fault on the write leg leaves a desynced ' +
                'socket in place for every later command',
        )
    } finally {
        Object.defineProperty(Deno, 'connect', {
            value: real,
            configurable: true,
            writable: true,
        })
        await client.close()
    }
})
