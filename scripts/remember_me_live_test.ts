/**
 * @fileoverview #457: remember-me tokens through `SessionGuard` and
 * `DrizzleSessionProvider`, against a REAL Postgres.
 *
 * The unit suites prove the lifecycle policy through an in-memory store. Only
 * a server proves that the Drizzle store's queries, including the
 * owner-scoped delete, do what the policy needs. Neither package can test
 * the guard-to-provider units contract either: auth-provider imports
 * `@lockness/auth` for types only, and auth may not import auth-provider at
 * all. So the suite lives here and wires the real guard to the real provider:
 * the row's expiry must equal the cookie's `Max-Age`, in seconds.
 *
 * **Skipped unless `LOCKNESS_POSTGRES_INTEGRATION=1`.** `deno task
 * test:postgres` and the `live-postgres` CI job set it.
 * `LOCKNESS_POSTGRES_URL` names a loopback server the suite may create and
 * drop databases on. It creates exactly one, `lockness_remember_<random>`,
 * and drops it.
 *
 * @module
 */

import { assert, assertEquals, assertNotEquals } from '@std/assert'
import postgres from 'postgres'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { type Context, Hono } from '@lockness/core'
import { type Authenticatable, SessionGuard } from '@lockness/auth'
import { DrizzleSessionProvider } from '@lockness/auth-provider/drizzle'
import {
    LIVE_POSTGRES,
    liveUrl,
} from '../packages/drizzle/tests/live_postgres.ts'
import { withDatabase } from './kit_live.ts'

const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
})

const rememberMeTokens = pgTable('remember_me_tokens', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    hash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    firstIssuedAt: timestamp('first_issued_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
})

const DDL = `
CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE);
CREATE TABLE remember_me_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    first_issued_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL
);`

/** SHA-256, lowercase hex: what the store must hold instead of the value. */
async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(value),
    )
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

/** A value no store has seen, built at run time. */
function neverIssued(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(40))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The `remember_web` cookie a response set: its value and Max-Age. */
function rememberCookie(response: Response): { value: string; maxAge: number } {
    const header = response.headers.getSetCookie()
        .find((c) => c.startsWith('remember_web='))
    assert(header, 'no remember_web cookie was set')
    const value = header.slice('remember_web='.length).split(';')[0]
    const maxAge = Number(/Max-Age=(\d+)/i.exec(header)?.[1])
    return { value, maxAge }
}

Deno.test({
    name:
        '#457 live: SessionGuard and DrizzleSessionProvider store, verify, recycle and revoke remember-me tokens on Postgres',
    ignore: !LIVE_POSTGRES,
    async fn(t) {
        const adminUrl = await liveUrl()
        const database = `lockness_remember_${
            crypto.randomUUID().replaceAll('-', '').slice(0, 12)
        }`
        const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
        await admin.unsafe(`CREATE DATABASE "${database}"`)
        const sql = postgres(withDatabase(adminUrl, database), {
            max: 1,
            onnotice: () => {},
        })
        try {
            await sql.unsafe(DDL)
            const db = drizzle(sql)
            const [alice] = await db.insert(users)
                .values({ email: 'alice@example.test' }).returning()
            const [bob] = await db.insert(users)
                .values({ email: 'bob@example.test' }).returning()

            const provider = new DrizzleSessionProvider<Authenticatable>({
                db: () => db as never,
                rememberTokensTable: rememberMeTokens,
                findUserById: async (_db, id) => {
                    const [row] = await db.select().from(users)
                        .where(eq(users.id, Number(id))).limit(1)
                    return row ?? null
                },
                findUserByCredentials: async (_db, email) => {
                    const [row] = await db.select().from(users)
                        .where(eq(users.email, email)).limit(1)
                    return row ?? null
                },
            })

            /** One request through the guard, with an optional cookie. */
            const request = async (
                act: (
                    guard: SessionGuard<true, typeof provider>,
                ) => Promise<unknown>,
                cookie?: string,
            ): Promise<Response> => {
                const app = new Hono()
                app.all('*', async (c: Context) => {
                    const data = new Map<string, unknown>()
                    c.set('session' as never, {
                        get: (k: string) => data.get(k),
                        set: (k: string, v: unknown) => data.set(k, v),
                        forget: (k: string) => data.delete(k),
                        regenerate: () => Promise.resolve(),
                        destroy: () => Promise.resolve(),
                    } as never)
                    const guard = new SessionGuard('web', c, provider, {
                        useRememberMeTokens: true,
                    })
                    await act(guard)
                    return c.body(null, 204)
                })
                return await app.request('/', {
                    headers: cookie ? { cookie } : {},
                })
            }

            const rowsOf = (userId: number) =>
                db.select().from(rememberMeTokens)
                    .where(eq(rememberMeTokens.userId, userId))

            let first = { value: '', maxAge: 0 }
            await t.step(
                'login with remember stores the hash only, for the cookie Max-Age in seconds',
                async () => {
                    const response = await request((g) =>
                        g.login('alice@example.test', 'unused', true)
                    )
                    first = rememberCookie(response)
                    const [row, ...rest] = await rowsOf(alice.id)
                    assertEquals(rest, [])
                    assertEquals(row.hash, await sha256(first.value))
                    for (const v of Object.values(row)) {
                        assertNotEquals(String(v), first.value)
                    }
                    assertEquals(first.maxAge, 2_592_000)
                    assertEquals(
                        row.expiresAt.getTime() - row.createdAt.getTime(),
                        first.maxAge * 1000,
                    )
                    assertEquals(
                        row.firstIssuedAt.getTime(),
                        row.createdAt.getTime(),
                    )
                },
            )

            await t.step(
                'the cookie authenticates and is recycled, keeping first_issued_at',
                async () => {
                    const [before] = await rowsOf(alice.id)
                    await new Promise((r) => setTimeout(r, 5))
                    let who: unknown
                    const response = await request(async (g) => {
                        who = await g.authenticate()
                    }, `remember_web=${first.value}`)
                    assertEquals((who as Authenticatable).id, alice.id)
                    const renewed = rememberCookie(response)
                    assertNotEquals(renewed.value, first.value)

                    const [after, ...rest] = await rowsOf(alice.id)
                    assertEquals(rest, [], 'the old row was deleted')
                    assertEquals(after.hash, await sha256(renewed.value))
                    assertEquals(
                        after.firstIssuedAt.getTime(),
                        before.firstIssuedAt.getTime(),
                    )
                    assert(
                        after.createdAt.getTime() > before.createdAt.getTime(),
                    )
                    assertEquals(
                        await provider.verifyRememberToken(first.value),
                        null,
                    )
                    first = renewed
                },
            )

            await t.step('a cross-user delete has no effect', async () => {
                const [row] = await rowsOf(alice.id)
                await provider.deleteRememberToken(bob, row.id)
                assert(await provider.verifyRememberToken(first.value))
            })

            await t.step(
                'deleteAllRememberTokens is scoped to its user',
                async () => {
                    const bobToken = await provider.createRememberToken(
                        bob,
                        3600,
                    )
                    const second = await provider.createRememberToken(
                        alice,
                        3600,
                    )
                    await provider.deleteAllRememberTokens(alice)
                    assertEquals(
                        await provider.verifyRememberToken(first.value),
                        null,
                    )
                    assertEquals(
                        await provider.verifyRememberToken(second.value),
                        null,
                    )
                    assert(await provider.verifyRememberToken(bobToken.value))
                },
            )

            await t.step(
                'unknown, expired and revoked tokens deny',
                async () => {
                    assertEquals(
                        await provider.verifyRememberToken(neverIssued()),
                        null,
                    )

                    const expiring = await provider.createRememberToken(
                        bob,
                        3600,
                    )
                    assert(await provider.verifyRememberToken(expiring.value))
                    await db.update(rememberMeTokens)
                        .set({ expiresAt: new Date(Date.now() - 1000) })
                        .where(
                            eq(
                                rememberMeTokens.id,
                                Number(expiring.identifier),
                            ),
                        )
                    assertEquals(
                        await provider.verifyRememberToken(expiring.value),
                        null,
                    )

                    const revoked = await provider.createRememberToken(
                        bob,
                        3600,
                    )
                    await provider.deleteRememberToken(bob, revoked.identifier)
                    assertEquals(
                        await provider.verifyRememberToken(revoked.value),
                        null,
                    )
                },
            )
        } finally {
            await sql.end()
            await admin.unsafe(
                `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`,
            )
            await admin.end()
        }
    },
})
