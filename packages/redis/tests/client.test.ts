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

import { assertEquals } from '@std/assert'
import { drainDisposables } from '@lockness/contract/lifecycle/internal'
import { RedisClient } from '../mod.ts'
import { startFakeServer } from './fake_server.ts'

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
