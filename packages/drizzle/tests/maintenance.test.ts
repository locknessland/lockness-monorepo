/**
 * @fileoverview #435, #447 — the schema-maintenance capability a driver
 * handle may carry, the one connection it opens, and what
 * `Database.maintenance` lets a failure say.
 *
 * The connection mechanics are proven on fakes, through the loader seams of
 * the default factories:
 *
 * - **postgres:** the connection is a dedicated `max: 1` client with the
 *   routed notice callback, never the pool; the planner reads inside
 *   `BEGIN ISOLATION LEVEL REPEATABLE READ`, before the first statement; and
 *   the migrator's `drizzle` wraps that dedicated client.
 * - **mysql:** the connection comes from `createConnection`, never from the
 *   pool, and the migrator's `drizzle` wraps the very connection the reads
 *   and statements ran on.
 * - **libsql:** the reads and statements run on one write transaction,
 *   committed once; a planner that refuses closes it uncommitted.
 *
 * The libsql path also runs on a real `:memory:` database in
 * `fresh_libsql.test.ts`, and postgres and MySQL against live servers.
 *
 * The rows of `tests/mutations/fresh_447.ts` name tests in this file.
 *
 * @module @lockness/drizzle/tests/maintenance
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert'
import { Database } from '../mod.ts'
import {
    type DriverFactory,
    type MaintenanceConnection,
    type MysqlClientLoader,
    mysqlDriverFactory,
    type PostgresClientLoader,
    postgresDriverFactory,
} from '../drivers.ts'
import {
    libsqlConnection,
    type LibsqlMaintenanceClient,
    REPEATABLE_READ,
} from '../maintenance_connection.ts'
import { RefusedError } from '../refusal.ts'

/** Capture every `console.warn` line `fn` writes, and what it rejected with. */
async function warned(fn: () => Promise<unknown>): Promise<{
    readonly lines: string[]
    readonly error: unknown
}> {
    const lines: string[] = []
    const { warn } = console
    console.warn = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
        await fn()
        return { lines, error: undefined }
    } catch (error) {
        return { lines, error }
    } finally {
        console.warn = warn
    }
}

/** A url with no credential, assembled at run time. */
const PG_URL = ['postgres:', '//app@db.example', ':5432/app'].join('')
const MYSQL_URL = ['mysql:', '//app@db.example', ':3306/app'].join('')

/** A planner that reads twice, then returns two statements. */
const PLANNER = async (
    read: (sql: string) => Promise<readonly Record<string, unknown>[]>,
): Promise<readonly string[]> => {
    await read('READ 1')
    await read('READ 2')
    return ['DROP A', 'DROP B']
}

/** A planner that reads, then refuses. */
const REFUSING = async (
    read: (sql: string) => Promise<readonly Record<string, unknown>[]>,
): Promise<readonly string[]> => {
    await read('READ 1')
    throw new RefusedError('no')
}

// -----------------------------------------------------------------------------
// postgres — a dedicated single-connection client, REPEATABLE READ
// -----------------------------------------------------------------------------

/**
 * A fake postgres loader: every client it builds is numbered and records
 * its calls in `events`; `drizzle` records which client it wrapped.
 */
function fakePostgres() {
    const events: string[] = []
    const built: Array<{ readonly id: number; readonly options: unknown }> = []
    const wrapped: number[] = []
    const clientFor = (id: number) => {
        const unsafe = (sql: string) => {
            events.push(`${id}:unsafe:${sql}`)
            return Promise.resolve([{ sql }])
        }
        return Object.assign(() => Promise.resolve([]), {
            id,
            unsafe,
            end: () => {
                events.push(`${id}:end`)
                return Promise.resolve()
            },
            begin: async (
                options: string,
                run: (tx: { unsafe: typeof unsafe }) => Promise<unknown>,
            ) => {
                events.push(`${id}:begin ${options}`)
                try {
                    const result = await run({
                        unsafe: (sql) => {
                            events.push(`${id}:tx:${sql}`)
                            return Promise.resolve([{ sql }])
                        },
                    })
                    events.push(`${id}:commit`)
                    return result
                } catch (error) {
                    events.push(`${id}:rollback`)
                    throw error
                }
            },
        })
    }
    const load = (() =>
        Promise.resolve({
            drizzle: (client: { id: number }) => {
                wrapped.push(client.id)
                return { client: client.id }
            },
            postgres: (_url: string, options?: unknown) => {
                const id = built.length + 1
                built.push({ id, options })
                return clientFor(id)
            },
        })) as unknown as PostgresClientLoader
    return { events, built, wrapped, load }
}

/** Open the maintenance connection of a fresh postgres handle. */
async function openPostgres(onNotice?: (notice: unknown) => void) {
    const fake = fakePostgres()
    const handle = await postgresDriverFactory(fake.load)(PG_URL, { onNotice })
    assert(handle.maintenance, 'the postgres handle has no maintenance')
    const connection = await handle.maintenance.open()
    return { ...fake, handle, connection }
}

Deno.test('#447 postgres open builds a dedicated max: 1 client with the routed onnotice, apart from the pool', async () => {
    const received: unknown[] = []
    const { built, connection } = await openPostgres((notice) =>
        void received.push(notice)
    )

    assertEquals(built.length, 2, 'open did not build a client of its own')
    const options = built[1].options as Record<string, unknown>
    assertEquals(options.max, 1)
    assertEquals(options.max_lifetime, null)
    assert(typeof options.onnotice === 'function', 'no onnotice')
    const notice = { severity: 'NOTICE', message: 'm' }
    ;(options.onnotice as (n: unknown) => void)(notice)
    assertEquals(received, [notice])
    // The pool keeps postgres.js's own sizing.
    assertEquals((built[0].options as Record<string, unknown>).max, undefined)
    await connection.close()
})

Deno.test('#447 postgres execute reads inside BEGIN ISOLATION LEVEL REPEATABLE READ, before the first statement', async () => {
    const { events, connection } = await openPostgres()

    await connection.execute(PLANNER)

    assertEquals(REPEATABLE_READ, 'isolation level repeatable read')
    assertEquals(events, [
        '2:begin isolation level repeatable read',
        '2:tx:READ 1',
        '2:tx:READ 2',
        '2:tx:DROP A',
        '2:tx:DROP B',
        '2:commit',
    ])
})

Deno.test('#447 postgres: a planner that refuses rolls back with its own error, and no statement ran', async () => {
    const { events, connection } = await openPostgres()

    await assertRejects(() => connection.execute(REFUSING), RefusedError, 'no')

    assertEquals(events, [
        '2:begin isolation level repeatable read',
        '2:tx:READ 1',
        '2:rollback',
    ])
})

Deno.test('#447 postgres: query, the migrator and close all use the dedicated client, never the pool', async () => {
    const { events, wrapped, connection } = await openPostgres()

    await connection.query('SELECT 1')
    await connection.close()

    // drizzle wrapped the pool for `handle.db`, then the dedicated client
    // for the migrator.
    assertEquals(wrapped, [1, 2])
    assertEquals(events, ['2:unsafe:SELECT 1', '2:end'])
})

// -----------------------------------------------------------------------------
// mysql — createConnection, never the pool
// -----------------------------------------------------------------------------

/**
 * A fake mysql2 loader: the pool throws on every use but `end`; each
 * `createConnection` returns a numbered connection that records its calls.
 */
function fakeMysql(drizzleFailsOnConnection = false) {
    const events: string[] = []
    const wrapped: unknown[] = []
    const connections: unknown[] = []
    const pool = {
        query: () => {
            throw new Error('the pool was queried')
        },
        getConnection: () => {
            throw new Error('a connection was borrowed from the pool')
        },
        end: () => {
            events.push('pool:end')
            return Promise.resolve()
        },
    }
    const load = (() =>
        Promise.resolve({
            drizzle: (client: unknown) => {
                wrapped.push(client)
                if (drizzleFailsOnConnection && client !== pool) {
                    throw new Error('drizzle could not wrap the connection')
                }
                return {}
            },
            mysql: {
                createPool: () => pool,
                createConnection: () => {
                    const id = connections.length + 1
                    const connection = {
                        query: (sql: string) => {
                            events.push(`${id}:${sql}`)
                            return Promise.resolve([[{ sql }], []])
                        },
                        end: () => {
                            events.push(`${id}:end`)
                            return Promise.resolve()
                        },
                    }
                    connections.push(connection)
                    events.push(`${id}:connect`)
                    return Promise.resolve(connection)
                },
            },
        })) as unknown as MysqlClientLoader
    return { events, wrapped, connections, pool, load }
}

Deno.test('#447 mysql: reads, statements and the migrator all run on the one connection createConnection opened', async () => {
    const fake = fakeMysql()
    const handle = await mysqlDriverFactory(fake.load)(MYSQL_URL)
    assert(handle.maintenance, 'the mysql handle has no maintenance')

    const connection = await handle.maintenance.open()
    assertEquals(await connection.query('SELECT 1'), [{ sql: 'SELECT 1' }])
    await connection.execute(PLANNER)
    await connection.close()

    assertEquals(fake.events, [
        '1:connect',
        '1:SELECT 1',
        '1:READ 1',
        '1:READ 2',
        '1:DROP A',
        '1:DROP B',
        '1:end',
    ])
    // drizzle wrapped the pool for `handle.db`, then the connection itself
    // for the migrator: never the pool.
    assertEquals(fake.wrapped.length, 2)
    assertStrictEquals(fake.wrapped[0], fake.pool)
    assertStrictEquals(fake.wrapped[1], fake.connections[0])
    assertEquals('getConnection' in (fake.connections[0] as object), false)
})

Deno.test('#447 mysql: a planner that refuses runs no statement and keeps its own error', async () => {
    const fake = fakeMysql()
    const handle = await mysqlDriverFactory(fake.load)(MYSQL_URL)
    const connection = await handle.maintenance!.open()

    await assertRejects(() => connection.execute(REFUSING), RefusedError, 'no')

    assertEquals(fake.events, ['1:connect', '1:READ 1'])
})

Deno.test("#447 mysql: a connection drizzle cannot wrap is closed, and open fails with drizzle's error", async () => {
    const fake = fakeMysql(true)
    const handle = await mysqlDriverFactory(fake.load)(MYSQL_URL)

    await assertRejects(
        () => handle.maintenance!.open(),
        Error,
        'drizzle could not wrap the connection',
    )

    assertEquals(fake.events, ['1:connect', '1:end'])
})

// -----------------------------------------------------------------------------
// libsql — one write transaction
// -----------------------------------------------------------------------------

/** A fake libsql client whose one transaction records its calls. */
function fakeLibsql(closeFails = false) {
    const events: string[] = []
    const result = (sql: string) => ({ columns: ['sql'], rows: [[sql]] })
    const client: LibsqlMaintenanceClient = {
        execute: (sql) => {
            events.push(`client:${sql}`)
            return Promise.resolve(result(sql))
        },
        transaction: (mode) => {
            events.push(`transaction:${mode}`)
            return Promise.resolve({
                execute: (sql) => {
                    events.push(`tx:${sql}`)
                    return Promise.resolve(result(sql))
                },
                commit: () => {
                    events.push('commit')
                    return Promise.resolve()
                },
                close: () => {
                    events.push('close')
                    if (closeFails) throw new Error('ROLLBACK failed')
                },
            })
        },
    }
    return { events, client }
}

Deno.test('#447 libsql: reads and statements run on one write transaction, committed once', async () => {
    const { events, client } = fakeLibsql()
    const connection = libsqlConnection(client, () => Promise.resolve())

    const read: string[] = []
    await connection.execute(async (r) => {
        read.push(...(await r('READ 1')).map((row) => String(row.sql)))
        return ['DROP A', 'DROP B']
    })

    assertEquals(read, ['READ 1'])
    assertEquals(events, [
        'transaction:write',
        'tx:READ 1',
        'tx:DROP A',
        'tx:DROP B',
        'commit',
        'close',
    ])
})

Deno.test('#447 libsql: a planner that refuses closes the transaction uncommitted, with its own error', async () => {
    const { events, client } = fakeLibsql()
    const connection = libsqlConnection(client, () => Promise.resolve())

    await assertRejects(() => connection.execute(REFUSING), RefusedError, 'no')

    assertEquals(events, ['transaction:write', 'tx:READ 1', 'close'])
})

Deno.test("#447 libsql: a transaction close that fails keeps the planner's refusal, and is logged", async () => {
    const { events, client } = fakeLibsql(true)
    const connection = libsqlConnection(client, () => Promise.resolve())

    const { lines, error } = await warned(() => connection.execute(REFUSING))

    assert(error instanceof RefusedError, String(error))
    assertEquals(events, ['transaction:write', 'tx:READ 1', 'close'])
    assertEquals(lines.length, 1, JSON.stringify(lines))
    assert(lines[0].includes('ROLLBACK failed'), lines[0])
})

Deno.test("#447 libsql: a transaction close that fails keeps the statement's error, and is logged", async () => {
    const { client } = fakeLibsql(true)
    const failing: LibsqlMaintenanceClient = {
        ...client,
        transaction: async (mode) => {
            const tx = await client.transaction(mode)
            return {
                ...tx,
                execute: (sql) =>
                    sql === 'DROP B'
                        ? Promise.reject(new Error('DROP B failed'))
                        : tx.execute(sql),
            }
        },
    }
    const connection = libsqlConnection(failing, () => Promise.resolve())

    const { lines, error } = await warned(() => connection.execute(PLANNER))

    assert(
        error instanceof Error && error.message === 'DROP B failed',
        String(error),
    )
    assertEquals(lines.length, 1, JSON.stringify(lines))
    assert(lines[0].includes('ROLLBACK failed'), lines[0])
})

Deno.test("#447 libsql: close leaves the handle's client open", async () => {
    const { events, client } = fakeLibsql()
    const connection = libsqlConnection(client, () => Promise.resolve())

    await connection.query('SELECT 1')
    await connection.close()

    assertEquals(events, ['client:SELECT 1'])
})

// -----------------------------------------------------------------------------
// Database.maintenance — optional, and redacted like probe()
// -----------------------------------------------------------------------------

const DSN = ['postgres://app:', 's3cretPw', '@db.example:5432/app'].join('')

/** Which call of a fake connection fails. */
type Failing = 'open' | 'query' | 'read' | 'statement' | 'migrate' | 'close'

/** A factory whose maintenance fails at `failAt` with `message`. */
function maintainedFactory(
    failAt?: Failing,
    message = 'boom',
): { factory: DriverFactory; calls: string[] } {
    const calls: string[] = []
    const step = (name: Failing, label: string) => {
        calls.push(label)
        return name === failAt
            ? Promise.reject(new Error(message))
            : Promise.resolve()
    }
    const connection: MaintenanceConnection = {
        query: async (sql) => {
            await step('query', `query:${sql}`)
            return [{ n: 1 }]
        },
        execute: async (planner) => {
            const plan = await planner(async (sql) => {
                await step('read', `read:${sql}`)
                return [{ n: 2 }]
            })
            for (const statement of plan) {
                await step('statement', `statement:${statement}`)
            }
        },
        migrate: (options) =>
            step(
                'migrate',
                `migrate:${options.folder}:${options.table}:${options.schema}`,
            ),
        close: () => step('close', 'close'),
    }
    const factory: DriverFactory = () =>
        Promise.resolve({
            db: {},
            close: () => Promise.resolve(),
            probe: () => Promise.resolve(),
            maintenance: {
                open: async () => {
                    await step('open', 'open')
                    return connection
                },
            },
        })
    return { factory, calls }
}

/** A configured `Database` over `factory`. */
async function connected(factory: DriverFactory): Promise<Database> {
    const db = new Database()
    db.setDriverFactory('postgres', factory)
    await db.connect(DSN, { silent: true })
    return db
}

Deno.test('#435 #447 maintenance passes each call through to the connection', async () => {
    const { factory, calls } = maintainedFactory()
    const db = await connected(factory)

    const connection = await db.maintenance!.open()
    assertEquals(await connection.query('SELECT 1'), [{ n: 1 }])
    const read: unknown[] = []
    await connection.execute(async (r) => {
        read.push(...await r('READ'))
        return ['A', 'B']
    })
    await connection.migrate({ folder: 'out', table: 't', schema: 's' })
    await connection.close()

    assertEquals(read, [{ n: 2 }])
    assertEquals(calls, [
        'open',
        'query:SELECT 1',
        'read:READ',
        'statement:A',
        'statement:B',
        'migrate:out:t:s',
        'close',
    ])
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

/** Each call that can fail, driven through the redacting capability. */
const FAILING_CALLS: ReadonlyArray<
    readonly [Failing, (db: Database) => Promise<unknown>]
> = [
    ['open', (db) => db.maintenance!.open()],
    ['query', async (db) => (await db.maintenance!.open()).query('SELECT 1')],
    [
        'read',
        async (db) =>
            (await db.maintenance!.open()).execute(async (read) => {
                await read('READ')
                return []
            }),
    ],
    [
        'statement',
        async (db) =>
            (await db.maintenance!.open()).execute(() =>
                Promise.resolve(['DROP X'])
            ),
    ],
    [
        'migrate',
        async (db) =>
            (await db.maintenance!.open()).migrate({
                folder: 'out',
                table: 't',
            }),
    ],
    ['close', async (db) => (await db.maintenance!.open()).close()],
]

for (const [failAt, run] of FAILING_CALLS) {
    Deno.test(`#435 #447 a ${failAt} failure quoting the DSN is redacted by identity`, async () => {
        const { factory } = maintainedFactory(failAt, `missing on ${DSN}`)
        const db = await connected(factory)

        const error = await assertRejects(() => run(db), Error)

        assertEquals(error.message.includes('s3cretPw'), false)
        assertEquals(error.message.includes('<dsn redacted>'), true)
    })

    Deno.test(`#435 #447 a ${failAt} failure holding the password is withheld whole`, async () => {
        const { factory } = maintainedFactory(failAt, 'password s3cretPw bad')
        const db = await connected(factory)

        const error = await assertRejects(() => run(db), Error)

        assertEquals(error.message.includes('s3cretPw'), false)
        assertEquals(error.message.includes('withheld'), true)
    })
}

Deno.test('#447 an error the planner throws comes back unchanged through the redacting capability', async () => {
    const { factory } = maintainedFactory()
    const db = await connected(factory)
    const connection = await db.maintenance!.open()
    const refusal = new RefusedError(`not ${DSN}, but a refusal`)

    const error = await assertRejects(() =>
        connection.execute(() => Promise.reject(refusal))
    )

    assertStrictEquals(error, refusal)
})

Deno.test('#447 the capability keeps the DSN it was read with, after close()', async () => {
    const { factory } = maintainedFactory('query', `missing on ${DSN}`)
    const db = await connected(factory)
    const maintenance = db.maintenance!
    await db.close()

    const connection = await maintenance.open()
    const error = await assertRejects(() => connection.query('SELECT 1'), Error)

    assertEquals(error.message.includes('s3cretPw'), false)
    assertEquals(error.message.includes('<dsn redacted>'), true)
})
