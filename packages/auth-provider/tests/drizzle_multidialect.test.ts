/**
 * @fileoverview The Drizzle auth providers accept a handle for every dialect (#259).
 *
 * Before #259 the three Drizzle providers pinned their `db` field and the `db`
 * argument of every lookup callback to `PostgresJsDatabase`, so a `mysql` or
 * `sqlite` handle from the #214 multi-DB `Database` service could not feed auth
 * persistence. These tests are the compile-time contract that the providers now
 * accept `DrizzleDatabase<D>` for `D in 'pg' | 'mysql' | 'sqlite'`, while the
 * unparameterised (Postgres-default) instantiation stays source-compatible.
 *
 * The assertions are structural: type-checking this file (the gate's
 * `deno check`) *is* the test. The runtime `assert`s only prove the fixtures
 * were wired, so the file is not vacuously green.
 *
 * Since #452 the token provider also takes the application's tokens table.
 * Each dialect passes a REAL `pgTable` / `mysqlTable` / `sqliteTable`, which
 * proves that a dialect table is assignable to `DrizzleAccessTokensTable` and
 * passes `assertAccessTokensTable` at construction.
 *
 * @module @lockness/auth-provider/tests/drizzle_multidialect
 */

import { assert } from '@std/assert'
import type { Authenticatable } from '@lockness/auth'
import * as pg from 'drizzle-orm/pg-core'
import * as mysql from 'drizzle-orm/mysql-core'
import * as sqlite from 'drizzle-orm/sqlite-core'
import type { DrizzleDatabase, DrizzleDialect } from '../drizzle/database.ts'
import { DrizzleBasicAuthProvider } from '../drizzle/drizzle_basic_auth_provider.ts'
import { DrizzleSessionProvider } from '../drizzle/drizzle_session_provider.ts'
import { DrizzleTokenProvider } from '../drizzle/drizzle_token_provider.ts'

/** The kit's tokens table, in each dialect's own column builders. */
const pgTokens = pg.pgTable('access_tokens', {
    id: pg.serial('id').primaryKey(),
    userId: pg.integer('user_id').notNull(),
    name: pg.text('name').notNull(),
    hash: pg.text('hash').notNull().unique(),
    expiresAt: pg.timestamp('expires_at').notNull(),
    lastUsedAt: pg.timestamp('last_used_at'),
    createdAt: pg.timestamp('created_at').notNull().defaultNow(),
})

const mysqlTokens = mysql.mysqlTable('access_tokens', {
    id: mysql.serial('id').primaryKey(),
    userId: mysql.int('user_id').notNull(),
    name: mysql.varchar('name', { length: 255 }).notNull(),
    hash: mysql.varchar('hash', { length: 64 }).notNull().unique(),
    expiresAt: mysql.timestamp('expires_at').notNull(),
    lastUsedAt: mysql.timestamp('last_used_at'),
    createdAt: mysql.timestamp('created_at').notNull().defaultNow(),
})

const sqliteTokens = sqlite.sqliteTable('access_tokens', {
    id: sqlite.integer('id').primaryKey({ autoIncrement: true }),
    userId: sqlite.integer('user_id').notNull(),
    name: sqlite.text('name').notNull(),
    hash: sqlite.text('hash').notNull().unique(),
    expiresAt: sqlite.integer('expires_at', { mode: 'timestamp_ms' })
        .notNull(),
    lastUsedAt: sqlite.integer('last_used_at', { mode: 'timestamp_ms' }),
    createdAt: sqlite.integer('created_at', { mode: 'timestamp_ms' })
        .notNull(),
})

interface DemoUser extends Authenticatable {
    id: number
    email: string
    password: string
}

/**
 * Builds a session provider for one dialect. The callback params are annotated
 * with the *same* `DrizzleDatabase<D>` the provider hands back — the assignment
 * only compiles if the provider threads the dialect through untouched, which is
 * the whole point of #259.
 */
function sessionProviderFor<D extends DrizzleDialect>(
    db: DrizzleDatabase<D>,
): DrizzleSessionProvider<DemoUser, D> {
    return new DrizzleSessionProvider<DemoUser, D>({
        db: () => db,
        findUserById: (handle: DrizzleDatabase<D>, _id) => {
            // The handle round-trips at the dialect's precise type.
            const _typed: DrizzleDatabase<D> = handle
            return Promise.resolve(null)
        },
        findUserByCredentials: (handle: DrizzleDatabase<D>, _email, _pw) => {
            const _typed: DrizzleDatabase<D> = handle
            return Promise.resolve(null)
        },
    })
}

Deno.test('drizzle providers accept a mysql handle (#259)', () => {
    const mysqlDb = {} as DrizzleDatabase<'mysql'>

    const session = sessionProviderFor<'mysql'>(mysqlDb)
    const token = new DrizzleTokenProvider<DemoUser, 'mysql'>({
        db: () => mysqlDb,
        tokensTable: mysqlTokens,
        findUserById: (_db: DrizzleDatabase<'mysql'>, _id) =>
            Promise.resolve(null),
        findUserByCredentials: (_db: DrizzleDatabase<'mysql'>, _e, _p) =>
            Promise.resolve(null),
    })
    const basic = new DrizzleBasicAuthProvider<DemoUser, 'mysql'>({
        db: () => mysqlDb,
        findUserById: (_db: DrizzleDatabase<'mysql'>, _id) =>
            Promise.resolve(null),
        findUserByCredentials: (_db: DrizzleDatabase<'mysql'>, _e, _p) =>
            Promise.resolve(null),
    })

    assert(session instanceof DrizzleSessionProvider)
    assert(token instanceof DrizzleTokenProvider)
    assert(basic instanceof DrizzleBasicAuthProvider)
})

Deno.test('drizzle providers accept a sqlite handle (#259)', () => {
    const sqliteDb = {} as DrizzleDatabase<'sqlite'>

    const session = sessionProviderFor<'sqlite'>(sqliteDb)
    const token = new DrizzleTokenProvider<DemoUser, 'sqlite'>({
        db: () => sqliteDb,
        tokensTable: sqliteTokens,
        findUserById: (_db: DrizzleDatabase<'sqlite'>, _id) =>
            Promise.resolve(null),
        findUserByCredentials: (_db: DrizzleDatabase<'sqlite'>, _e, _p) =>
            Promise.resolve(null),
    })
    const basic = new DrizzleBasicAuthProvider<DemoUser, 'sqlite'>({
        db: () => sqliteDb,
        findUserById: (_db: DrizzleDatabase<'sqlite'>, _id) =>
            Promise.resolve(null),
        findUserByCredentials: (_db: DrizzleDatabase<'sqlite'>, _e, _p) =>
            Promise.resolve(null),
    })

    assert(session instanceof DrizzleSessionProvider)
    assert(token instanceof DrizzleTokenProvider)
    assert(basic instanceof DrizzleBasicAuthProvider)
})

Deno.test('the default (unparameterised) instantiation stays Postgres — no breaking change (#259)', () => {
    // The historical one-type-argument form must keep compiling and default to
    // the Postgres handle, so existing PG consumers are untouched.
    const pgDb = {} as DrizzleDatabase
    const provider = new DrizzleSessionProvider<DemoUser>({
        db: () => pgDb,
        findUserById: () => Promise.resolve(null),
        findUserByCredentials: () => Promise.resolve(null),
    })
    assert(provider instanceof DrizzleSessionProvider)

    const token = new DrizzleTokenProvider<DemoUser>({
        db: () => pgDb,
        tokensTable: pgTokens,
        findUserById: () => Promise.resolve(null),
        findUserByCredentials: () => Promise.resolve(null),
    })
    assert(token instanceof DrizzleTokenProvider)

    // The default parameter of DrizzleDatabase is the Postgres handle.
    const _assertDefaultIsPg: DrizzleDatabase<'pg'> = pgDb
    assert(_assertDefaultIsPg === pgDb)
})
