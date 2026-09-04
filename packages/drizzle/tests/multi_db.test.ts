/**
 * @fileoverview Multi-dialect Database tests — the dialect resolver, per-dialect
 * driver selection through the injectable factory seam (no live DB), the
 * unknown/missing-driver error, credential redaction (S1/SC-006), the
 * on-demand-only guarantee (SC-005), and the Postgres default (SC-001).
 *
 * @module @lockness/drizzle/tests/multi_db
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { Database } from '../mod.ts'
import { type Dialect, resolveDialect } from '../drivers.ts'

/**
 * Install fake driver factories on `db` that record which dialect ran, so a
 * test can assert driver selection without a live database.
 */
function withFakes(db: Database, calls: Dialect[]): void {
    for (const d of ['postgres', 'mysql', 'sqlite'] as const) {
        db.setDriverFactory(d, () => {
            calls.push(d)
            return Promise.resolve({
                db: { marker: d } as unknown,
                close: () => Promise.resolve(),
                probe: () => Promise.resolve(),
            })
        })
    }
}

Deno.test('resolveDialect: explicit driver > URL scheme > postgres', () => {
    assertEquals(resolveDialect('mysql', 'postgres://x'), 'mysql') // explicit wins
    assertEquals(resolveDialect(undefined, 'mysql://h/db'), 'mysql')
    assertEquals(resolveDialect(undefined, 'file:local.db'), 'sqlite')
    assertEquals(resolveDialect(undefined, 'libsql://h'), 'sqlite')
    assertEquals(resolveDialect(undefined, 'postgres://h/db'), 'postgres')
    assertEquals(resolveDialect(undefined, 'postgresql://h/db'), 'postgres')
    assertEquals(resolveDialect(undefined, 'weird://h'), 'postgres') // default
})

Deno.test('connect selects the driver by dialect (via the fake seam)', async () => {
    for (
        const [url, driver, expected] of [
            ['mysql://h/db', undefined, 'mysql'],
            ['file:x.db', undefined, 'sqlite'],
            ['postgres://h/db', undefined, 'postgres'],
            ['postgres://h/db', 'sqlite', 'sqlite'], // explicit override
        ] as const
    ) {
        const db = new Database()
        const calls: Dialect[] = []
        withFakes(db, calls)
        const res = await db.connect(url, { silent: true, driver })
        assertEquals(res.success, true)
        assertEquals(calls, [expected])
    }
})

Deno.test('SC-005 on-demand: the postgres path invokes no other dialect factory', async () => {
    const db = new Database()
    const calls: Dialect[] = []
    withFakes(db, calls)
    await db.connect('postgres://h/db', { silent: true })
    assertEquals(calls, ['postgres'])
    assert(!calls.includes('mysql'))
    assert(!calls.includes('sqlite'))
})

Deno.test('SC-001 default: no driver + postgres URL uses the postgres path', async () => {
    const db = new Database()
    const calls: Dialect[] = []
    withFakes(db, calls)
    const res = await db.connect('postgres://localhost:5432/lockness', {
        silent: true,
    })
    assertEquals(res.success, true)
    assertEquals(calls, ['postgres'])
    assertEquals(db.isConnected(), true)
})

Deno.test('a driver whose client cannot load fails with an actionable, dialect-named message', async () => {
    const db = new Database()
    db.setDriverFactory('mysql', () => {
        throw new Error('Cannot find module mysql2')
    })
    const res = await db.connect('mysql://h/db', { silent: true })
    assertEquals(res.success, false)
    assertStringIncludes(res.error ?? '', 'mysql')
})

Deno.test('SC-006: a connection failure does not leak credentials from the error object', async () => {
    const db = new Database()
    db.setDriverFactory('postgres', () => {
        // A driver error whose message is safe but whose properties carry a
        // secret — renderError returns name+message only, dropping the object.
        const err = new Error('connection refused') as Error & {
            connectionString?: string
        }
        err.connectionString = 'postgres://admin:SUPERSECRETPW@db.internal/app'
        return Promise.resolve({
            db: {} as unknown,
            close: () => Promise.resolve(),
            probe: () => Promise.reject(err),
        })
    })
    const res = await db.connect('postgres://h/db', { silent: true })
    assertEquals(res.success, false)
    assert(
        !(res.error ?? '').includes('SUPERSECRETPW'),
        'the returned error must not carry the credential from the error object',
    )
})
