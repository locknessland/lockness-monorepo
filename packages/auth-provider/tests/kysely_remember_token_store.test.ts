/**
 * @fileoverview The Kysely remember-me store's queries, against a recording
 * fake (#457).
 *
 * The lifecycle policy is the base's and is tested through the in-memory
 * store. What is specific to Kysely is the query shape — no `.returning()`,
 * no SQL expiry predicate, owner-scoped deletes, the `first_issued_at` column
 * — and the translation of driver timestamps into `Date`. No Kysely binding
 * runs against a live database yet; this is the whole of its coverage.
 *
 * @module @lockness/auth-provider/tests/kysely_remember_token_store
 */

import { assert, assertEquals, assertThrows } from '@std/assert'
import type { Authenticatable } from '@lockness/auth'
import { KyselySessionProvider } from '../kysely/kysely_session_provider.ts'

const TABLE = 'remember_me_tokens'

/** One recorded builder call. */
interface Call {
    readonly method: string
    readonly args: readonly unknown[]
}

/** One executed query: its calls, in order. */
type Query = Call[]

/**
 * A Kysely stand-in that records every query and stores rows in memory, so a
 * create → verify → recycle round trip runs. `stringDates` makes it hand
 * timestamps back as strings, the way some drivers do.
 */
class RecordingKysely {
    readonly queries: Query[] = []
    readonly rows: Array<Record<string, unknown>> = []
    stringDates = false
    #nextId = 1

    insertInto(table: string) {
        return this.#builder([{ method: 'insertInto', args: [table] }])
    }

    selectFrom(table: string) {
        return this.#builder([{ method: 'selectFrom', args: [table] }])
    }

    deleteFrom(table: string) {
        return this.#builder([{ method: 'deleteFrom', args: [table] }])
    }

    #builder(calls: Query): Record<string, unknown> {
        const builder: Record<string, unknown> = {}
        const record = (method: string) => (...args: unknown[]) => {
            calls.push({ method, args })
            return builder
        }
        for (const method of ['values', 'select', 'selectAll', 'where']) {
            builder[method] = record(method)
        }
        builder.returning = () => {
            throw new Error('the store must not call .returning()')
        }
        builder.execute = () => {
            this.queries.push(calls)
            return Promise.resolve(this.#run(calls))
        }
        builder.executeTakeFirst = () => {
            this.queries.push(calls)
            return Promise.resolve(this.#run(calls)[0])
        }
        return builder
    }

    #run(calls: Query): Array<Record<string, unknown>> {
        const wheres = calls.filter((c) => c.method === 'where')
        const matches = (row: Record<string, unknown>) =>
            wheres.every(({ args: [col, op, val] }) =>
                op === '=' && row[col as string] === val
            )
        switch (calls[0].method) {
            case 'insertInto': {
                const values = calls.find((c) => c.method === 'values')!
                    .args[0] as Record<string, unknown>
                this.rows.push({ id: this.#nextId++, ...values })
                return []
            }
            case 'selectFrom':
                return this.rows.filter(matches).map((row) =>
                    this.stringDates
                        ? Object.fromEntries(
                            Object.entries(row).map(([k, v]) => [
                                k,
                                v instanceof Date ? v.toISOString() : v,
                            ]),
                        )
                        : { ...row }
                )
            case 'deleteFrom': {
                for (let i = this.rows.length - 1; i >= 0; i--) {
                    if (matches(this.rows[i])) this.rows.splice(i, 1)
                }
                return []
            }
        }
        return []
    }

    /** The `where` columns of every query that started with `method`. */
    wheresOf(method: string): string[][] {
        return this.queries
            .filter((q) => q[0].method === method)
            .map((q) =>
                q.filter((c) => c.method === 'where').map((c) =>
                    String(c.args[0])
                )
            )
    }
}

function build(db: RecordingKysely) {
    const users = new Map<number, Authenticatable>([
        [1, { id: 1 }],
        [2, { id: 2 }],
    ])
    return new KyselySessionProvider<Authenticatable>({
        db: () => db,
        findUserById: (_db, id) =>
            Promise.resolve(users.get(Number(id)) ?? null),
        findUserByCredentials: () => Promise.resolve(null),
        rememberTokensTable: TABLE,
    })
}

Deno.test('kysely store - insert has no .returning() and re-selects by token_hash', async () => {
    const db = new RecordingKysely()
    const token = await build(db).createRememberToken({ id: 1 }, 3600)

    const [insert, reselect] = db.queries
    assertEquals(insert[0], { method: 'insertInto', args: [TABLE] })
    assertEquals(reselect[0], { method: 'selectFrom', args: [TABLE] })
    assertEquals(db.wheresOf('selectFrom'), [['token_hash']])
    assertEquals(token.identifier, 1, 'the id comes from the re-select')
    assertEquals(db.rows[0].token_hash, token.hash)
})

Deno.test('kysely store - first_issued_at is written, and read back through verify', async () => {
    const db = new RecordingKysely()
    const provider = build(db)
    const token = await provider.createRememberToken({ id: 1 }, 3600)

    assert(db.rows[0].first_issued_at instanceof Date)
    assertEquals(
        (db.rows[0].first_issued_at as Date).getTime(),
        token.createdAt.getTime(),
    )
    const verified = await provider.verifyRememberToken(token.value)
    assert(verified)
    assertEquals(
        verified.token.firstIssuedAt?.getTime(),
        token.firstIssuedAt?.getTime(),
    )
})

Deno.test('kysely store - findByHash carries no expires_at predicate', async () => {
    const db = new RecordingKysely()
    await build(db).verifyRememberToken('presented-value')
    assertEquals(db.wheresOf('selectFrom'), [['token_hash']])
})

Deno.test('kysely store - delete is scoped by id and user_id; deleteAllForUser by user_id', async () => {
    const db = new RecordingKysely()
    const provider = build(db)
    const token = await provider.createRememberToken({ id: 1 }, 3600)

    await provider.deleteRememberToken({ id: 2 }, token.identifier)
    assertEquals(db.rows.length, 1, "B cannot delete A's token")
    await provider.deleteAllRememberTokens({ id: 2 })
    assertEquals(db.rows.length, 1, "B's purge leaves A's token")

    await provider.deleteRememberToken({ id: 1 }, token.identifier)
    await provider.deleteAllRememberTokens({ id: 1 })
    assertEquals(db.wheresOf('deleteFrom'), [
        ['id', 'user_id'],
        ['user_id'],
        ['id', 'user_id'],
        ['user_id'],
    ])
    assertEquals(db.rows.length, 0)
})

Deno.test('kysely store - string timestamps come back as Date, so the token verifies', async () => {
    const db = new RecordingKysely()
    db.stringDates = true
    const provider = build(db)
    const token = await provider.createRememberToken({ id: 1 }, 3600)

    const verified = await provider.verifyRememberToken(token.value)
    assert(verified, 'a string expiry was translated, not read as expired')
    assert(verified.token.expiresAt instanceof Date)
    assert(verified.token.firstIssuedAt instanceof Date)
    assert(verified.token.createdAt instanceof Date)
    assertEquals(verified.token.expiresAt.getTime(), token.expiresAt.getTime())
})

Deno.test('kysely provider - a table name that is empty or not a string is refused', () => {
    for (const bad of ['', 42, null, {}]) {
        assertThrows(
            () =>
                new KyselySessionProvider<Authenticatable>({
                    db: () => new RecordingKysely(),
                    findUserById: () => Promise.resolve(null),
                    findUserByCredentials: () => Promise.resolve(null),
                    rememberTokensTable: bad as string,
                }),
            TypeError,
            'rememberTokensTable',
        )
    }
})

Deno.test('kysely provider - the removed enableRememberTokens option is refused', () => {
    assertThrows(
        () =>
            new KyselySessionProvider<Authenticatable>({
                db: () => new RecordingKysely(),
                findUserById: () => Promise.resolve(null),
                findUserByCredentials: () => Promise.resolve(null),
                rememberTokensTable: TABLE,
                enableRememberTokens: true,
            } as never),
        TypeError,
        'rememberTokensTable',
    )
})
