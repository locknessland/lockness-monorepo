/**
 * @fileoverview #427 — the `Database` lifecycle: one client at a time.
 *
 * A `Database` moves idle → configuring → configured, and `close()` takes it
 * back to idle. `connect()` is legal only from idle: a second one throws,
 * whatever its URL, so two live clients cannot exist and none is orphaned.
 * `close()` waits for a configure in flight, so once it resolves no client
 * exists. Every operation captures the client it runs on — handle and held
 * DSN together — before its first await, so a `close()` racing a `probe()`
 * cannot strip the redaction from the probe's failure (the #425/#438 trap).
 *
 * `silent: true` silences everything `connect()` would print, the failure line
 * included; the failure is still returned.
 *
 * The rows of `tests/mutations/lifecycle_427.ts` name these tests.
 *
 * @module @lockness/drizzle/tests/lifecycle
 */

import { assertEquals, assertRejects } from '@std/assert'
import { Database } from '../mod.ts'
import type { DriverFactory, DriverHandle } from '../drivers.ts'

/** The message a second `connect()` throws; spelled out so a change is caught. */
const ALREADY_CONFIGURED =
    'Database is already configured; call close() before connect() again'

/** The message every operation throws when no client exists. */
const NOT_CONNECTED = 'Database is not connected'

const DSN = 'postgres://app:Hx7Kq2Lw@db.internal:5432/prod'

/** What the recording factory saw, in order: `build:1`, `probe:1`, `close:1`. */
interface Recorder {
    readonly events: string[]
    readonly factory: DriverFactory
}

/**
 * A fake postgres factory whose every handle is numbered, so a test can tell
 * which client a call reached. `db` is `{ id }`.
 */
function recordingFactory(): Recorder {
    const events: string[] = []
    let built = 0
    const factory: DriverFactory = () => {
        const id = ++built
        events.push(`build:${id}`)
        return Promise.resolve({
            db: { id },
            close: () => {
                events.push(`close:${id}`)
                return Promise.resolve()
            },
            probe: () => {
                events.push(`probe:${id}`)
                return Promise.resolve()
            },
            maintenance: {
                query: () => Promise.resolve([]),
                execute: () => Promise.resolve(),
                migrate: () => Promise.resolve(),
            },
        })
    }
    return { events, factory }
}

/** A promise with its settlers exposed. */
function deferred<T>(): {
    promise: Promise<T>
    resolve: (value: T) => void
    reject: (error: unknown) => void
} {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

/** Read the id of the fake client `db` points at. */
function idOf(db: Database): number {
    return (db.db as unknown as { id: number }).id
}

/** What `console.log` and `console.error` received while `body` ran. */
async function capturingConsole<T>(
    body: () => Promise<T>,
): Promise<{ value: T; logs: string[]; errors: string[] }> {
    const logs: string[] = []
    const errors: string[] = []
    const { log, error } = console
    console.log = (...args: unknown[]) => void logs.push(args.join(' '))
    console.error = (...args: unknown[]) => void errors.push(args.join(' '))
    try {
        return { value: await body(), logs, errors }
    } finally {
        console.log = log
        console.error = error
    }
}

Deno.test('#427 T1 a second connect() throws, and the first client stays in use', async () => {
    const { events, factory } = recordingFactory()
    const db = new Database()
    db.setDriverFactory('postgres', factory)
    assertEquals((await db.connect(DSN, { silent: true })).success, true)

    await assertRejects(
        () => db.connect('postgres://other@elsewhere/db', { silent: true }),
        Error,
        ALREADY_CONFIGURED,
    )

    assertEquals(events, ['build:1'], 'a second client was built or closed')
    assertEquals(db.isConnected(), true)
    assertEquals(idOf(db), 1, 'db no longer reaches the first client')
    await db.probe()
    assertEquals(events, ['build:1', 'probe:1'])
    await db.close()
})

Deno.test('#427 T2 a second connect() with a refused DSN throws and logs nothing', async () => {
    const { events, factory } = recordingFactory()
    const db = new Database()
    db.setDriverFactory('postgres', factory)
    await db.connect(DSN, { silent: true })

    const { value: error, logs, errors } = await capturingConsole(() =>
        assertRejects(() => db.connect('postgres://u:p@ss@h/db'), Error)
    )

    assertEquals(error.message, ALREADY_CONFIGURED)
    assertEquals([logs, errors], [[], []], 'the refusal was logged')
    assertEquals(events, ['build:1'])
    await db.close()
})

Deno.test('#427 T3 a connect() racing another in flight throws, and one client is built', async () => {
    const gate = deferred<void>()
    let built = 0
    const db = new Database()
    db.setDriverFactory('postgres', async () => {
        built++
        await gate.promise
        return {
            db: {},
            close: () => Promise.resolve(),
            probe: () => Promise.resolve(),
        }
    })

    const first = db.connect(DSN, { silent: true })
    await assertRejects(
        () => db.connect(DSN, { silent: true }),
        Error,
        ALREADY_CONFIGURED,
    )
    gate.resolve()

    assertEquals((await first).success, true)
    assertEquals(built, 1, 'two clients were built')
    await db.close()
})

Deno.test('#427 T4 a factory failure leaves the Database free to connect again', async () => {
    let attempt = 0
    const db = new Database()
    db.setDriverFactory('postgres', () => {
        attempt++
        if (attempt === 1) return Promise.reject(new Error('boom'))
        return Promise.resolve({
            db: {},
            close: () => Promise.resolve(),
            probe: () => Promise.resolve(),
        })
    })

    assertEquals((await db.connect(DSN, { silent: true })).success, false)
    assertEquals(db.isConnected(), false)
    assertEquals((await db.connect(DSN, { silent: true })).success, true)
    assertEquals(db.isConnected(), true)
    await db.close()
})

Deno.test('#427 T5 a refused DSN leaves the Database free to connect again', async () => {
    const { events, factory } = recordingFactory()
    const db = new Database()
    db.setDriverFactory('postgres', factory)

    const refused = await db.connect('postgres://u:p@ss@h/db', { silent: true })
    assertEquals(refused.success, false)
    assertEquals((await db.connect(DSN, { silent: true })).success, true)
    assertEquals(events, ['build:1'])
    await db.close()
})

Deno.test('#427 T6 close() then connect() builds a second client; the first closes once', async () => {
    const { events, factory } = recordingFactory()
    const db = new Database()
    db.setDriverFactory('postgres', factory)
    await db.connect(DSN, { silent: true })

    await db.close()
    assertEquals((await db.connect(DSN, { silent: true })).success, true)

    assertEquals(idOf(db), 2)
    await db.close()
    await db.close()
    assertEquals(events, ['build:1', 'close:1', 'build:2', 'close:2'])
})

Deno.test('#427 T7 db, maintenance and probe throw "not connected" before connect() and after close()', async () => {
    const { events, factory } = recordingFactory()
    const db = new Database()
    db.setDriverFactory('postgres', factory)

    const assertNotConnected = async (when: string): Promise<void> => {
        assertEquals(db.isConnected(), false, when)
        let dbError: unknown
        try {
            void db.db
        } catch (error) {
            dbError = error
        }
        assertEquals(
            dbError instanceof Error ? dbError.message : dbError,
            NOT_CONNECTED,
            `db ${when}`,
        )
        let maintenanceError: unknown
        try {
            void db.maintenance
        } catch (error) {
            maintenanceError = error
        }
        assertEquals(
            maintenanceError instanceof Error
                ? maintenanceError.message
                : maintenanceError,
            NOT_CONNECTED,
            `maintenance ${when}`,
        )
        const probeError = await assertRejects(() => db.probe(), Error)
        assertEquals(probeError.message, NOT_CONNECTED, `probe ${when}`)
    }

    await assertNotConnected('before connect()')
    await db.connect(DSN, { silent: true })
    await db.close()
    await assertNotConnected('after close()')
    assertEquals(events, ['build:1', 'close:1'], 'a closed client was used')
})

Deno.test('#427 T8 a probe in flight when close() runs still withholds the password', async () => {
    // The security trap: the probe captured its handle before the await, so it
    // must have captured what is held with it. Read back from `this` after the
    // await, `close()` has already emptied it — the failure would render with
    // nothing held and the bare password would be shown.
    const failure = deferred<void>()
    const db = new Database()
    db.setDriverFactory('postgres', () =>
        Promise.resolve(
            {
                db: {},
                close: () => Promise.resolve(),
                probe: () => failure.promise,
            } satisfies DriverHandle,
        ))
    await db.connect(DSN, { silent: true })

    const outcome = db.probe().then(
        () => undefined,
        (error: unknown) => error,
    )
    await db.close()
    failure.reject(new Error('password authentication failed: Hx7Kq2Lw'))
    const error = await outcome

    const message = error instanceof Error ? error.message : String(error)
    assertEquals(
        message,
        'The database probe failed (Error); its message is withheld because ' +
            'it contains a database credential',
    )
    assertEquals(message.includes('Hx7Kq2Lw'), false, message)
})

Deno.test('#427 T9 close() during a configure waits for it, then closes the client', async () => {
    const gate = deferred<void>()
    let closes = 0
    const db = new Database()
    db.setDriverFactory('postgres', async () => {
        await gate.promise
        return {
            db: {},
            close: () => {
                closes++
                return Promise.resolve()
            },
            probe: () => Promise.resolve(),
        }
    })

    const connecting = db.connect(DSN, { silent: true })
    const closing = db.close()
    gate.resolve()
    await connecting
    await closing

    assertEquals(db.isConnected(), false, 'a client outlived close()')
    assertEquals(closes, 1, 'the client was not closed exactly once')
})

Deno.test('#427 T10 silent silences every line connect() prints; the default prints one', async () => {
    const throwing: DriverFactory = () => Promise.reject(new Error('boom'))
    const cases: Array<[string, string, DriverFactory | undefined]> = [
        ['refused DSN', 'postgres://u:p@ss@h/db', undefined],
        ['factory failure', DSN, throwing],
        ['success', DSN, recordingFactory().factory],
    ]
    for (const [label, url, factory] of cases) {
        for (const silent of [true, false]) {
            const db = new Database()
            db.setDriverFactory('postgres', factory ?? throwing)
            const { value: result, logs, errors } = await capturingConsole(
                () => db.connect(url, silent ? { silent } : {}),
            )
            const expected = silent ? 0 : 1
            const [expectedLogs, expectedErrors] = result.success
                ? [expected, 0]
                : [0, expected]
            assertEquals(
                [logs.length, errors.length],
                [expectedLogs, expectedErrors],
                `${label}, silent: ${silent}`,
            )
            assertEquals(result.success, label === 'success', label)
            await db.close()
        }
    }
})
