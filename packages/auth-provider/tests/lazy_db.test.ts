/**
 * @fileoverview The `db` option is a resolver, read per lookup and never at
 * construction — the contract that keeps a provider built per request (the
 * starter-kit guards) from touching a database that is not connected.
 *
 * Each of the four providers is held to the same four properties:
 *
 * 1. building it with a resolver that throws does not throw;
 * 2. a lookup then rejects with the resolver's error — never resolves `null`,
 *    which would turn "not connected" into a silent deny;
 * 3. a resolver returning A then B is called again on the second lookup, so a
 *    reconnect is followed instead of a closed client being held;
 * 4. a `db` that is not a function is refused at construction.
 *
 * @module @lockness/auth-provider/tests/lazy_db
 */

import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
    assertThrows,
} from '@std/assert'
import * as pg from 'drizzle-orm/pg-core'
import type { Authenticatable } from '@lockness/auth'
import { DrizzleBasicAuthProvider } from '../drizzle/drizzle_basic_auth_provider.ts'
import { DrizzleSessionProvider } from '../drizzle/drizzle_session_provider.ts'
import { DrizzleTokenProvider } from '../drizzle/drizzle_token_provider.ts'
import { KyselySessionProvider } from '../kysely/kysely_session_provider.ts'
import type { SessionProviderBase } from '../base/session_provider_base.ts'

const NOT_CONNECTED = 'Database is not connected'
const RESOLVER_MESSAGE =
    '`db` must be a function returning the database instance, e.g. db: () => database.db'

const tokens = pg.pgTable('access_tokens', {
    id: pg.serial('id').primaryKey(),
    userId: pg.integer('user_id').notNull(),
    name: pg.text('name').notNull(),
    hash: pg.text('hash').notNull().unique(),
    expiresAt: pg.timestamp('expires_at').notNull(),
    lastUsedAt: pg.timestamp('last_used_at'),
    createdAt: pg.timestamp('created_at').notNull().defaultNow(),
})

/**
 * A database stand-in that records which instance a query reached: through a
 * user callback (it is the callback's first argument) or through the token
 * provider's own `select(...).from().where().limit()` chain.
 */
interface FakeDb {
    readonly tag: string
    readonly reached: string[]
    select(): unknown
}

function fakeDb(tag: string, reached: string[]): FakeDb {
    const chain = {
        from: () => chain,
        where: () => chain,
        limit: () => {
            reached.push(tag)
            return Promise.resolve([])
        },
    }
    return { tag, reached, select: () => chain }
}

/** Lookups that record the instance they were handed, then deny. */
const recording = {
    findUserById: (db: unknown) => {
        const fake = db as FakeDb
        fake.reached.push(fake.tag)
        return Promise.resolve<Authenticatable | null>(null)
    },
    findUserByCredentials: () => Promise.resolve<Authenticatable | null>(null),
}

/** The common shape the four providers are driven through. */
interface Case {
    readonly name: string
    readonly build: (db: unknown) => unknown
    /** One lookup through the path that reads the database. */
    readonly lookup: (provider: unknown) => Promise<unknown>
}

interface UserLookup {
    findById(id: string | number): Promise<unknown>
}

interface TokenLookup {
    createToken(user: Authenticatable, name: string): Promise<unknown>
    verifyToken(value: string): Promise<unknown>
}

const findById = (provider: unknown) => (provider as UserLookup).findById(1)

const cases: readonly Case[] = [
    {
        name: 'DrizzleBasicAuthProvider',
        build: (db) =>
            new DrizzleBasicAuthProvider<Authenticatable>({
                db: db as never,
                ...recording,
            }),
        lookup: findById,
    },
    {
        name: 'DrizzleSessionProvider',
        build: (db) =>
            new DrizzleSessionProvider<Authenticatable>({
                db: db as never,
                ...recording,
            }),
        lookup: findById,
    },
    {
        name: 'KyselySessionProvider',
        build: (db) =>
            new KyselySessionProvider<Authenticatable>({
                db: db as never,
                ...recording,
            }),
        lookup: findById,
    },
    {
        name: 'DrizzleTokenProvider',
        build: (db) =>
            new DrizzleTokenProvider<Authenticatable>({
                db: db as never,
                tokensTable: tokens,
                ...recording,
            }),
        // The token provider's own storage path, not a user callback.
        lookup: (provider) => (provider as TokenLookup).verifyToken('token'),
    },
]

const notConnected = () => {
    throw new Error(NOT_CONNECTED)
}

for (const c of cases) {
    Deno.test(`${c.name} - a throwing resolver does not throw at construction`, () => {
        c.build(notConnected)
    })

    Deno.test(`${c.name} - a lookup rejects with the resolver's error, never null`, async () => {
        const provider = c.build(notConnected)
        await assertRejects(() => c.lookup(provider), Error, NOT_CONNECTED)
    })

    Deno.test(`${c.name} - the resolver is called per lookup, not cached`, async () => {
        const reached: string[] = []
        const instances = [fakeDb('A', reached), fakeDb('B', reached)]
        let calls = 0
        const provider = c.build(() => instances[Math.min(calls++, 1)])

        await c.lookup(provider)
        await c.lookup(provider)

        assertEquals(reached, ['A', 'B'])
    })

    Deno.test(`${c.name} - a db that is not a function is refused at construction`, () => {
        const reached: string[] = []
        const error = assertThrows(
            () => c.build(fakeDb('instance', reached)),
            TypeError,
        )
        assertStrictEquals(error.message, RESOLVER_MESSAGE)
    })
}

Deno.test('DrizzleTokenProvider - createToken rejects with the resolver error', async () => {
    const provider = new DrizzleTokenProvider<Authenticatable>({
        db: notConnected,
        tokensTable: tokens,
        ...recording,
    })
    await assertRejects(
        () => provider.createToken({ id: 1 }, 'cli'),
        Error,
        NOT_CONNECTED,
    )
})

const rememberMeTokens = pg.pgTable('remember_me_tokens', {
    id: pg.serial('id').primaryKey(),
    userId: pg.integer('user_id').notNull(),
    hash: pg.text('token_hash').notNull().unique(),
    expiresAt: pg.timestamp('expires_at').notNull(),
    firstIssuedAt: pg.timestamp('first_issued_at').notNull(),
    createdAt: pg.timestamp('created_at').notNull(),
})

/** The two session providers, with remember-me on. */
const rememberCases: ReadonlyArray<
    readonly [
        string,
        (db: () => unknown) => SessionProviderBase<Authenticatable>,
    ]
> = [
    [
        'DrizzleSessionProvider',
        (db) =>
            new DrizzleSessionProvider<Authenticatable>({
                db: db as never,
                rememberTokensTable: rememberMeTokens,
                ...recording,
            }),
    ],
    [
        'KyselySessionProvider',
        (db) =>
            new KyselySessionProvider<Authenticatable>({
                db: db as never,
                rememberTokensTable: 'remember_me_tokens',
                ...recording,
            }),
    ],
]

for (const [name, build] of rememberCases) {
    Deno.test(`${name} - with a remember table, construction never calls the resolver (#457)`, () => {
        let calls = 0
        build(() => {
            calls++
            throw new Error(NOT_CONNECTED)
        })
        assertEquals(calls, 0)
    })

    Deno.test(`${name} - remember-me calls reject with the resolver's error, never null (#457)`, async () => {
        const provider = build(notConnected)
        await assertRejects(
            () => provider.createRememberToken({ id: 1 }, 3600),
            Error,
            NOT_CONNECTED,
        )
        await assertRejects(
            () => provider.verifyRememberToken('presented-value'),
            Error,
            NOT_CONNECTED,
        )
        await assertRejects(
            () => provider.deleteAllRememberTokens({ id: 1 }),
            Error,
            NOT_CONNECTED,
        )
    })
}
