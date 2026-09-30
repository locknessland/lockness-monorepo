/**
 * @fileoverview #435 — the schema-maintenance capability a driver handle may
 * carry, and what `Database.maintenance` lets a failure say.
 *
 * The session mechanics are proven on fakes: a MySQL reset runs on one
 * dedicated connection that is destroyed afterwards and never released to the
 * pool (a released connection would hand `FOREIGN_KEY_CHECKS=0` to the next
 * borrower), and a postgres reset runs every statement inside one transaction.
 * The libsql path is proven on a real `:memory:` database in
 * `fresh_libsql.test.ts`.
 *
 * @module @lockness/drizzle/tests/maintenance
 */

import { assertEquals, assertRejects, assertStrictEquals } from '@std/assert'
import { Database } from '../mod.ts'
import {
    type DriverFactory,
    executeInTransaction,
    executeOnDedicatedSession,
    type MysqlSession,
    type SchemaMaintenance,
} from '../drivers.ts'

// -----------------------------------------------------------------------------
// MySQL — one dedicated session, destroyed, never released
// -----------------------------------------------------------------------------

/** A fake pool whose one connection records what happens to it. */
function fakePool(failOn?: string) {
    const events: string[] = []
    const session: MysqlSession = {
        query: (sql: string) => {
            events.push(`query:${sql}`)
            return sql === failOn
                ? Promise.reject(new Error(`failed: ${sql}`))
                : Promise.resolve([])
        },
        destroy: () => void events.push('destroy'),
        release: () => void events.push('release'),
    }
    const pool = {
        getConnection: () => {
            events.push('getConnection')
            return Promise.resolve(session)
        },
    }
    return { events, pool }
}

Deno.test('#435 mysql execute runs every statement on one session, then destroys it', async () => {
    const { events, pool } = fakePool()

    await executeOnDedicatedSession(pool, ['SET A', 'DROP B', 'SET C'])

    assertEquals(events, [
        'getConnection',
        'query:SET A',
        'query:DROP B',
        'query:SET C',
        'destroy',
    ])
})

Deno.test('#435 mysql execute destroys the session on failure and never releases it', async () => {
    const { events, pool } = fakePool('DROP B')

    await assertRejects(
        () => executeOnDedicatedSession(pool, ['SET A', 'DROP B', 'SET C']),
        Error,
        'failed: DROP B',
    )

    assertEquals(events, [
        'getConnection',
        'query:SET A',
        'query:DROP B',
        'destroy',
    ])
})

// -----------------------------------------------------------------------------
// postgres — one transaction
// -----------------------------------------------------------------------------

Deno.test('#435 postgres execute runs every statement inside one transaction', async () => {
    const events: string[] = []
    const client = {
        begin: async <T>(
            run: (tx: { unsafe(sql: string): Promise<unknown> }) => Promise<T>,
        ): Promise<T> => {
            events.push('begin')
            const result = await run({
                unsafe: (sql) => {
                    events.push(`tx:${sql}`)
                    return Promise.resolve([])
                },
            })
            events.push('commit')
            return result
        },
    }

    await executeInTransaction(client, ['DROP A', 'DO $$ $$'])

    assertEquals(events, ['begin', 'tx:DROP A', 'tx:DO $$ $$', 'commit'])
})

// -----------------------------------------------------------------------------
// Database.maintenance — optional, and redacted like probe()
// -----------------------------------------------------------------------------

const DSN = 'postgres://app:s3cretPw@db.example:5432/app'

/** A factory whose maintenance fails with `message`, or succeeds. */
function maintainedFactory(
    message?: string,
): { factory: DriverFactory; calls: string[] } {
    const calls: string[] = []
    const fail = (op: string) => {
        calls.push(op)
        return message === undefined
            ? Promise.resolve()
            : Promise.reject(new Error(message))
    }
    const maintenance: SchemaMaintenance = {
        query: async (sql) => {
            await fail(`query:${sql}`)
            return [{ n: 1 }]
        },
        execute: (statements) => fail(`execute:${statements.join(';')}`),
        migrate: (options) => fail(`migrate:${options.folder}`),
    }
    const factory: DriverFactory = () =>
        Promise.resolve({
            db: {},
            close: () => Promise.resolve(),
            probe: () => Promise.resolve(),
            maintenance,
        })
    return { factory, calls }
}

Deno.test('#435 maintenance passes each call through to the handle', async () => {
    const { factory, calls } = maintainedFactory()
    const db = new Database()
    db.setDriverFactory('postgres', factory)
    await db.connect(DSN, { silent: true })

    const maintenance = db.maintenance
    if (!maintenance) throw new Error('maintenance missing')
    assertEquals(await maintenance.query('SELECT 1'), [{ n: 1 }])
    await maintenance.execute(['A', 'B'])
    await maintenance.migrate({ folder: 'out', table: 't' })

    assertEquals(calls, ['query:SELECT 1', 'execute:A;B', 'migrate:out'])
})

Deno.test('#435 maintenance is undefined when the handle has none (a custom factory)', async () => {
    const db = new Database()
    db.setDriverFactory('postgres', () =>
        Promise.resolve({
            db: {},
            close: () => Promise.resolve(),
            probe: () => Promise.resolve(),
        }))
    await db.connect(DSN, { silent: true })

    assertStrictEquals(db.maintenance, undefined)
})

Deno.test('#435 maintenance throws "not connected" before connect() and after close()', async () => {
    const db = new Database()
    let threw = false
    try {
        void db.maintenance
    } catch (error) {
        threw = error instanceof Error &&
            error.message.includes('not connected')
    }
    assertEquals(threw, true, 'maintenance before connect() did not throw')

    const { factory } = maintainedFactory()
    db.setDriverFactory('postgres', factory)
    await db.connect(DSN, { silent: true })
    await db.close()
    threw = false
    try {
        void db.maintenance
    } catch (error) {
        threw = error instanceof Error &&
            error.message.includes('not connected')
    }
    assertEquals(threw, true, 'maintenance after close() did not throw')
})

Deno.test('#435 a maintenance failure quoting the DSN is redacted by identity', async () => {
    const { factory } = maintainedFactory(`relation missing on ${DSN}`)
    const db = new Database()
    db.setDriverFactory('postgres', factory)
    await db.connect(DSN, { silent: true })
    const maintenance = db.maintenance!

    for (
        const run of [
            () => maintenance.query('SELECT 1'),
            () => maintenance.execute(['DROP X']),
            () => maintenance.migrate({ folder: 'out', table: 't' }),
        ]
    ) {
        const error = await assertRejects(run, Error)
        assertEquals(error.message.includes('s3cretPw'), false)
        assertEquals(error.message.includes('<dsn redacted>'), true)
    }
})

Deno.test('#435 a maintenance failure holding the password is withheld whole', async () => {
    const { factory } = maintainedFactory('password s3cretPw rejected')
    const db = new Database()
    db.setDriverFactory('postgres', factory)
    await db.connect(DSN, { silent: true })

    const error = await assertRejects(
        () => db.maintenance!.execute(['DROP X']),
        Error,
    )
    assertEquals(error.message.includes('s3cretPw'), false)
    assertEquals(error.message.includes('withheld'), true)
})
