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
 * @module @lockness/auth-provider/tests/drizzle_multidialect
 */

import { assert } from '@std/assert'
import type { Authenticatable } from '@lockness/auth'
import type { DrizzleDatabase, DrizzleDialect } from '../drizzle/database.ts'
import { DrizzleBasicAuthProvider } from '../drizzle/drizzle_basic_auth_provider.ts'
import { DrizzleSessionProvider } from '../drizzle/drizzle_session_provider.ts'
import { DrizzleTokenProvider } from '../drizzle/drizzle_token_provider.ts'

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
        db,
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
        db: mysqlDb,
        findUserById: (_db: DrizzleDatabase<'mysql'>, _id) =>
            Promise.resolve(null),
        findUserByCredentials: (_db: DrizzleDatabase<'mysql'>, _e, _p) =>
            Promise.resolve(null),
    })
    const basic = new DrizzleBasicAuthProvider<DemoUser, 'mysql'>({
        db: mysqlDb,
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
        db: sqliteDb,
        findUserById: (_db: DrizzleDatabase<'sqlite'>, _id) =>
            Promise.resolve(null),
        findUserByCredentials: (_db: DrizzleDatabase<'sqlite'>, _e, _p) =>
            Promise.resolve(null),
    })
    const basic = new DrizzleBasicAuthProvider<DemoUser, 'sqlite'>({
        db: sqliteDb,
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
        db: pgDb,
        findUserById: () => Promise.resolve(null),
        findUserByCredentials: () => Promise.resolve(null),
    })
    assert(provider instanceof DrizzleSessionProvider)

    // The default parameter of DrizzleDatabase is the Postgres handle.
    const _assertDefaultIsPg: DrizzleDatabase<'pg'> = pgDb
    assert(_assertDefaultIsPg === pgDb)
})
