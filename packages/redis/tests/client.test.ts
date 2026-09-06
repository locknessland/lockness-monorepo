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
import {
    MAX_COMMAND_FRAME_BYTES,
    RespCommandTooLargeError,
    RespFramingError,
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
                // A negligible refusal window (#299). This test is about the
                // DISCARD and the reconnect after it; the backoff would
                // otherwise refuse the second command — which is its job, and
                // is asserted on its own below.
                retryBaseMs: 1,
                retryMaxMs: 1,
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
            await new Promise((r) => setTimeout(r, 8))
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
    const client = new RedisClient({
        retryBaseMs: 1,
        retryMaxMs: 1,
        hostname: '127.0.0.1',
        port: 1,
    })
    try {
        await assertRejects(() => client.command('GET', 'k'), RespFramingError)
        assertEquals(opens, 1, 'the first command dialled once')
        // Past the (deliberately negligible) refusal window, so this asserts
        // the discard rather than the backoff.
        await new Promise((r) => setTimeout(r, 8))
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

Deno.test('#300: an oversized command does NOT discard the socket', async () => {
    // The half a throw cannot deliver. `#serializedExchange`'s rule is
    // "everything that is not a RespServerError is a desync", so a new error
    // type is a desync by construction — and the refusal would close a healthy
    // authenticated socket over a caller-side input error, which with #299's
    // backoff then refuses every consumer sharing this client.
    //
    // Nothing was written: the frame was refused inside `encodeCommand`.
    let opens = 0
    const real = Deno.connect
    const server = await startFakeServer()
    Object.defineProperty(Deno, 'connect', {
        value: (opts: Deno.ConnectOptions) => {
            opens++
            return real(opts)
        },
        configurable: true,
        writable: true,
    })
    const client = new RedisClient({
        hostname: '127.0.0.1',
        port: server.port,
    })
    try {
        await client.command('SET', 'warm', 'v')
        assertEquals(opens, 1, 'the connection is established')
        await assertRejects(
            () =>
                client.command(
                    'SET',
                    'k',
                    'x'.repeat(MAX_COMMAND_FRAME_BYTES + 1),
                ),
            RespCommandTooLargeError,
        )
        // The socket must be the SAME one, and the next command must not dial.
        await client.command('SET', 'still', 'here')
        assertEquals(
            opens,
            1,
            'the oversized command discarded a healthy socket — the next ' +
                'command had to re-dial, and the caller-side input error ' +
                'became a shared-state reconnect',
        )
    } finally {
        Object.defineProperty(Deno, 'connect', {
            value: real,
            configurable: true,
            writable: true,
        })
        await client.close()
        server.stop()
    }
})

/** A socket that fails every command, so every exchange faults. */
function faultingConn(): Deno.Conn {
    return {
        write: (bytes: Uint8Array) => Promise.resolve(bytes.byteLength),
        read: () => Promise.reject(new Error('connection reset')),
        close: () => {},
        localAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
        remoteAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 0 },
    } as unknown as Deno.Conn
}

Deno.test('#299: a wedged broker cannot be driven into a dial per command', async () => {
    // Before this, a forced discard re-dialled on the very next command with no
    // backoff and no circuit breaker — so a wedged or hostile peer drove the
    // loop at the application's command rate, re-sending AUTH in cleartext on
    // every cycle since `tls` defaults to false.
    let opens = 0
    const real = Deno.connect
    Object.defineProperty(Deno, 'connect', {
        value: () => {
            opens++
            return Promise.resolve(faultingConn())
        },
        configurable: true,
        writable: true,
    })
    const client = new RedisClient({
        hostname: '127.0.0.1',
        port: 1,
        retryBaseMs: 2000,
        retryMaxMs: 2000,
    })
    try {
        for (let i = 0; i < 40; i++) {
            await assertRejects(() => client.command('GET', 'k'), Error)
        }
        assertEquals(
            opens,
            2,
            `40 commands produced ${opens} dials. Two is the design: the first ` +
                'fault re-dials immediately so a transient blip costs nothing, ' +
                'and the second opens the window. Unbounded, this is 40 — and ' +
                '40 cleartext AUTH frames on the wire.',
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

Deno.test('#299: a refused command REJECTS rather than waiting out the window', async () => {
    // The one place this must differ from the subscribe path. There, a retry is
    // scheduled and nobody is waiting; here a caller holds the promise, and
    // parking it would turn a fast failure back into a slow one.
    const real = Deno.connect
    Object.defineProperty(Deno, 'connect', {
        value: () => Promise.resolve(faultingConn()),
        configurable: true,
        writable: true,
    })
    const client = new RedisClient({
        hostname: '127.0.0.1',
        port: 1,
        retryBaseMs: 5000,
        retryMaxMs: 5000,
    })
    try {
        // Two faults: the first re-dials immediately, the second opens the
        // window that the third command below must be refused by.
        await assertRejects(() => client.command('GET', 'k'), Error)
        await assertRejects(() => client.command('GET', 'k'), Error)
        const started = Date.now()
        const error = await assertRejects(
            () => client.command('GET', 'k'),
            Error,
        )
        const elapsed = Date.now() - started
        assert(
            elapsed < 100,
            `the refusal took ${elapsed}ms against a 5000ms window — it slept`,
        )
        assert(
            /backing off/i.test(error.message),
            `it must say why: ${error.message}`,
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

Deno.test('#299: a peer answering one command per cycle cannot pin the ceiling', async () => {
    // THE FINDING THE PLAN AUDIT CAUGHT. "Proved healthy" as "one completed
    // exchange" is defeated by a broker that answers once and then faults: the
    // streak zeroes every cycle, the ceiling never leaves its floor, and the
    // client re-dials several times a second forever — re-sending AUTH in
    // cleartext each time. `subscriber.ts` records the same correction on its
    // own path: a throttle that resets itself is not a throttle.
    //
    // The fix is survival, not arrival: the socket must have been live longer
    // than the delay that produced it.
    let opens = 0
    let answered = 0
    const real = Deno.connect
    Object.defineProperty(Deno, 'connect', {
        value: () => {
            opens++
            return Promise.resolve(
                {
                    write: (bytes: Uint8Array) =>
                        Promise.resolve(bytes.byteLength),
                    read: (buf: Uint8Array) => {
                        // One good reply per socket, SLOWLY, then faults.
                        //
                        // The delay is what makes this fixture discriminating:
                        // the socket is comfortably older than the survival
                        // threshold by the time it answers, so an age check
                        // alone is satisfied and only "more than one exchange
                        // on this socket" can refuse the reset. Without the
                        // delay the age check masks the count check and neither
                        // is individually necessary — which a mutation run
                        // showed, with both surviving.
                        if (answered++ % 2 === 0) {
                            return new Promise<number>((resolve) =>
                                setTimeout(() => {
                                    const ok = new TextEncoder().encode(
                                        '+OK\r\n',
                                    )
                                    buf.set(ok)
                                    resolve(ok.byteLength)
                                }, 12)
                            )
                        }
                        return Promise.reject(new Error('connection reset'))
                    },
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
    const client = new RedisClient({
        hostname: '127.0.0.1',
        port: 1,
        retryBaseMs: 10,
        retryMaxMs: 10,
    })
    try {
        for (let i = 0; i < 30; i++) {
            try {
                await client.command('GET', 'k')
            } catch {
                // Alternating success and fault is the point.
            }
        }
        assert(
            opens <= 2,
            `${opens} dials. A peer that answers one command per socket reset ` +
                'the streak on every cycle, so the ceiling stayed at its floor.',
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

Deno.test('#299: a nonsense cadence is refused at construction', () => {
    // Unvalidated, `NaN` makes the ceiling NaN, the delay NaN, the window
    // instant NaN, and `Date.now() < NaN` is FALSE — the guard never fires and
    // the backoff silently does not exist, with every test green. The same NaN
    // on the subscribe path reaches setTimeout and produces a LOUD hot loop;
    // here it produces silence indistinguishable from health.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        let threw = false
        try {
            new RedisClient({ hostname: '127.0.0.1', retryBaseMs: bad })
        } catch (error) {
            threw = error instanceof RangeError
        }
        assert(threw, `retryBaseMs of ${bad} was accepted`)
    }
    let inverted = false
    try {
        new RedisClient({
            hostname: '127.0.0.1',
            retryBaseMs: 1000,
            retryMaxMs: 500,
        })
    } catch (error) {
        inverted = error instanceof RangeError
    }
    assert(inverted, 'retryMaxMs below retryBaseMs was accepted')
})

Deno.test('#299: the client RECOVERS — a healthy socket clears the streak', async () => {
    // The test whose absence let a dead branch ship. Nothing asserted the
    // client ever comes back, so a survival check that could never be satisfied
    // — it timed one exchange's round-trip instead of the socket's age, and a
    // fast broker answers in a millisecond against a 250ms threshold — passed
    // every existing test while `#attempts` grew monotonically for the life of
    // the process.
    //
    // Recovery is asserted BEHAVIOURALLY: after a real recovery a fresh fault
    // must re-dial immediately (streak back to 1, no window), which is only
    // true if the streak actually reset.
    const server = await startFakeServer()
    let opens = 0
    let faulting = true
    const real = Deno.connect
    Object.defineProperty(Deno, 'connect', {
        value: (opts: Deno.ConnectOptions) => {
            opens++
            if (faulting) {
                return Promise.resolve(
                    {
                        write: (b: Uint8Array) => Promise.resolve(b.byteLength),
                        read: () => Promise.reject(new Error('reset')),
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
            }
            return real(opts)
        },
        configurable: true,
        writable: true,
    })
    const client = new RedisClient({
        hostname: '127.0.0.1',
        port: server.port,
        retryBaseMs: 30,
        retryMaxMs: 30,
    })
    try {
        // Two faults open a window.
        await assertRejects(() => client.command('GET', 'k'), Error)
        await assertRejects(() => client.command('GET', 'k'), Error)
        // Let it close, then let the broker behave.
        await new Promise((r) => setTimeout(r, 60))
        faulting = false
        // TWO exchanges on one socket, and past the survival threshold — one is
        // deliberately not proof, because a peer answering once per socket
        // would otherwise reset the throttle on every cycle.
        await client.command('SET', 'k', 'v')
        await new Promise((r) => setTimeout(r, 40))
        await client.command('GET', 'k')

        // The streak is clear, so ONE fault must not be enough to refuse the
        // next command — the first fault re-dials, only the second opens a
        // window. If the streak never reset it is already at 2, and the very
        // next command after a single fault is refused. That difference is
        // observable without reaching into private state.
        server.dropConnections()
        await assertRejects(() => client.command('GET', 'k'), Error)
        const dialsBefore = opens
        await client.command('GET', 'k')
        assertEquals(
            opens,
            dialsBefore + 1,
            'after a recovery, a single fault refused the next command ' +
                'instead of re-dialling — so the streak never reset, and the ' +
                'survival check is unsatisfiable',
        )
    } finally {
        Object.defineProperty(Deno, 'connect', {
            value: real,
            configurable: true,
            writable: true,
        })
        await client.close()
        server.stop()
    }
})

Deno.test('#299: two FAST exchanges on a YOUNG socket do not clear the streak', async () => {
    // The age half of the survival rule, and the fixture that makes it
    // individually necessary — a mutation run showed the count check alone
    // satisfied every earlier fixture, so removing the age check changed
    // nothing and it read as covered.
    //
    // A peer can serve two commands in under a millisecond and then wedge.
    // Resetting on the count alone would clear the throttle for exactly that
    // peer. Here the socket answers twice instantly and then faults: with the
    // age check the streak survives, so the NEXT fault opens a window and the
    // command after it is refused. Without it the streak zeroes and that
    // command dials instead.
    let opens = 0
    let mode: 'fault' | 'fast' = 'fault'
    const real = Deno.connect
    Object.defineProperty(Deno, 'connect', {
        value: () => {
            opens++
            const fast = mode === 'fast'
            let served = 0
            return Promise.resolve(
                {
                    write: (b: Uint8Array) => Promise.resolve(b.byteLength),
                    read: (buf: Uint8Array) => {
                        // Two instant replies, then faults — all well inside
                        // the survival threshold.
                        if (fast && served++ < 2) {
                            const ok = new TextEncoder().encode('+OK\r\n')
                            buf.set(ok)
                            return Promise.resolve(ok.byteLength)
                        }
                        return Promise.reject(new Error('reset'))
                    },
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
    const client = new RedisClient({
        hostname: '127.0.0.1',
        port: 1,
        retryBaseMs: 400,
        retryMaxMs: 400,
    })
    try {
        await assertRejects(() => client.command('GET', 'k'), Error)
        await assertRejects(() => client.command('GET', 'k'), Error)
        // Past the window, then a socket that serves two commands instantly.
        await new Promise((r) => setTimeout(r, 420))
        mode = 'fast'
        await client.command('GET', 'k')
        await client.command('GET', 'k')
        // Its third read faults. The socket is milliseconds old, so this must
        // NOT have been treated as a recovery.
        await assertRejects(() => client.command('GET', 'k'), Error)
        const dialsBefore = opens
        await assertRejects(() => client.command('GET', 'k'), Error)
        assertEquals(
            opens,
            dialsBefore,
            'the streak was cleared by two exchanges on a socket only ' +
                'milliseconds old, so the fault after them opened no window ' +
                'and this command re-dialled — a peer that serves two commands ' +
                'and wedges resets the throttle every cycle',
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
