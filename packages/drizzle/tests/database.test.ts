/**
 * @fileoverview #301/#302/#420 — what `connect()` does on the wire, and what a
 * failure is allowed to say.
 *
 * #420: `connect()` only configures a lazy client and makes **zero** round
 * trips; `probe()` is the one method that talks to the database. So a failure
 * surfaces in one of two places — `connect()` for a missing client package or a
 * URL the client's parser rejects, `probe()` for everything the network decides
 * — and both render it through the same DSN-redacting, head-only path.
 *
 * That render is the one `renderError` call site in the repository whose result
 * is **returned** (or re-thrown) rather than passed to `console.*`, so an
 * application may put it somewhere a log line would never go. It is also the
 * site that holds the DSN, which is what lets it redact by identity where the
 * shared encoder can only redact by pattern.
 *
 * @module @lockness/drizzle/tests/database
 */

import { assertEquals, assertRejects } from '@std/assert'
import { Database } from '../mod.ts'
import type { DriverFactory } from '../drivers.ts'

/**
 * A fake postgres factory that counts constructions and round trips, so a test
 * can assert how many times the database would have been woken.
 */
function countingFactory(): {
    counts: { built: number; probes: number }
    factory: DriverFactory
} {
    const counts = { built: 0, probes: 0 }
    const factory: DriverFactory = () => {
        counts.built++
        return Promise.resolve({
            db: {} as unknown,
            close: () => Promise.resolve(),
            probe: () => {
                counts.probes++
                return Promise.resolve()
            },
        })
    }
    return { counts, factory }
}

/** Read an error's message, or its string form, for a no-leak assertion. */
function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

Deno.test('#420 connect() makes zero round trips; probe() makes exactly one', async () => {
    const { counts, factory } = countingFactory()
    const db = new Database()
    db.setDriverFactory('postgres', factory)

    const result = await db.connect('postgres://u:p@h:5432/app', {
        silent: true,
    })

    assertEquals(result.success, true)
    assertEquals(db.isConnected(), true)
    assertEquals(counts, { built: 1, probes: 0 }, 'connect() woke the database')

    await db.probe()
    assertEquals(counts, { built: 1, probes: 1 })
})

Deno.test('#420 probe() rejects with "not connected" after close()', async () => {
    const { counts, factory } = countingFactory()
    const db = new Database()
    db.setDriverFactory('postgres', factory)
    await db.connect('postgres://u:p@h:5432/app', { silent: true })

    await db.close()

    assertEquals(db.isConnected(), false)
    await assertRejects(() => db.probe(), Error, 'not connected')
    assertEquals(counts.probes, 0, 'a closed client must not be probed')
})

Deno.test('#420 probe() rejects with "not connected" before any connect()', async () => {
    await assertRejects(() => new Database().probe(), Error, 'not connected')
})

Deno.test('#301 a password containing a slash never reaches the result', () => {
    // `/` in the userinfo is what makes `new URL()` throw AND what a pattern
    // redactor could not span — the same characters on both sides. The shared
    // encoder now handles this one; the assertion is on the PROPERTY, not on
    // which of the two mechanisms got there first. The client's parser rejects
    // this DSN in its constructor, so it still fails at `connect()` with no
    // round trip (#420).
    return new Database()
        .connect('postgres://app:aB3/xY9+z@db.invalid:5432/prod', {
            silent: true,
        })
        .then((result) => {
            assertEquals(result.success, false)
            assertEquals(
                result.error?.includes('aB3/xY9+z'),
                false,
                'the password reached ConnectionResult.error',
            )
        })
})

Deno.test('#301 no password shape reaches the returned error', async () => {
    // The property, over the shapes that broke the pattern before this branch.
    //
    // Since #420 the shapes surface in two places. The slashed DSN is rejected
    // by the client's parser inside `connect()`. The space and `@` shapes parse
    // fine, so `connect()` succeeds without a round trip and the failure is the
    // DNS lookup `probe()` makes — the error it re-throws is the one checked.
    //
    // The identity leg (`replaceAll(url, ...)`) has NO reachable test here and
    // that is stated rather than papered over: the only in-repo error that
    // embeds the DSN is `TypeError: Invalid URL`, and the characters that make
    // WHATWG throw are exactly the ones the shared encoder now spans — so the
    // encoder gets there first every time. A raw space parses fine, so the
    // driver fails at DNS with no DSN in the message at all. The leg is the net
    // for a third-party client that puts the DSN in a message of its own
    // shaping, which no driver in this tree does today. Its battery row is
    // recorded as a known survivor with that reason, not quietly dropped.
    const secrets = ['aB3/xY9+z', 'my pass', 'p@ss']
    const assertNoSecret = (text: string, dsn: string): void => {
        for (const secret of secrets) {
            assertEquals(
                text.includes(secret),
                false,
                `${secret} reached the returned error via ${dsn}`,
            )
        }
    }

    const slashed = 'postgres://app:aB3/xY9+z@db.invalid:5432/prod'
    const rejected = await new Database().connect(slashed, { silent: true })
    assertEquals(rejected.success, false, slashed)
    assertNoSecret(rejected.error ?? '', slashed)

    for (
        const dsn of [
            'postgres://app:my pass@db.invalid:5432/prod',
            'postgres://app:p@ss@db.invalid:5432/prod',
        ]
    ) {
        const db = new Database()
        const result = await db.connect(dsn, { silent: true })
        assertEquals(result.success, true, `${dsn} made connect() fail`)
        const error = await assertRejects(() => db.probe())
        assertNoSecret(messageOf(error), dsn)
    }
})

Deno.test('#302 probe() re-throws a head-only render, never a cause chain', async () => {
    // This is the only renderError call site in the repo whose result is
    // RETURNED (or re-thrown) rather than passed to console — an application
    // may put it in a response. Same distinction telemetry draws for a span.
    const db = new Database()
    const result = await db.connect('postgres://u:p@db.invalid:5432/x', {
        silent: true,
    })
    assertEquals(result.success, true)

    const error = await assertRejects(() => db.probe())
    assertEquals(
        messageOf(error).includes('caused by:'),
        false,
        'a cause chain reached a re-thrown value',
    )
})

/**
 * A fake postgres factory whose probe rejects with `error` — the shape of a
 * third-party client that words its own failure, DSN and cause included.
 */
function failingFactory(error: unknown): DriverFactory {
    return () =>
        Promise.resolve({
            db: {} as unknown,
            close: () => Promise.resolve(),
            probe: () => Promise.reject(error),
        })
}

Deno.test('#420 with no DSN held, the render is untouched and head-only', async () => {
    // An empty URL is a real input (`DATABASE_URL=` set but blank). There is
    // then no DSN to remove, and `replaceAll('', marker)` would splice the
    // marker between every character of the message.
    const db = new Database()
    db.setDriverFactory(
        'postgres',
        failingFactory(
            new Error('connection refused', {
                cause: new Error('CAUSE-ONLY-SECRET'),
            }),
        ),
    )
    assertEquals((await db.connect('', { silent: true })).success, true)

    const error = await assertRejects(() => db.probe())
    assertEquals(messageOf(error), 'Error: connection refused')
})
