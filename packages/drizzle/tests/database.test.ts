/**
 * @fileoverview #301/#302 — what a failed `connect()` is allowed to say.
 *
 * `Database.connect` is the one `renderError` call site in the repository whose
 * result is **returned** rather than passed to `console.*`, so an application
 * may put it somewhere a log line would never go. It is also the site that
 * holds the DSN, which is what lets it redact by identity where the shared
 * encoder can only redact by pattern.
 *
 * @module @lockness/drizzle/tests/database
 */

import { assertEquals } from '@std/assert'
import { Database } from '../mod.ts'

Deno.test('#301 a password containing a slash never reaches the result', () => {
    // `/` in the userinfo is what makes `new URL()` throw AND what a pattern
    // redactor could not span — the same characters on both sides. The shared
    // encoder now handles this one; the assertion is on the PROPERTY, not on
    // which of the two mechanisms got there first.
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
    // The identity leg (`replaceAll(url, ...)`) has NO reachable test here and
    // that is stated rather than papered over: the only in-repo error that
    // embeds the DSN is `TypeError: Invalid URL`, and the characters that make
    // WHATWG throw are exactly the ones the shared encoder now spans — so the
    // encoder gets there first every time. A raw space parses fine, so the
    // driver fails at DNS with no DSN in the message at all. The leg is the net
    // for a third-party client that puts the DSN in a message of its own
    // shaping, which no driver in this tree does today. Its battery row is
    // recorded as a known survivor with that reason, not quietly dropped.
    for (
        const dsn of [
            'postgres://app:aB3/xY9+z@db.invalid:5432/prod',
            'postgres://app:my pass@db.invalid:5432/prod',
            'postgres://app:p@ss@db.invalid:5432/prod',
        ]
    ) {
        const result = await new Database().connect(dsn, { silent: true })
        assertEquals(result.success, false, dsn)
        for (const secret of ['aB3/xY9+z', 'my pass', 'p@ss']) {
            assertEquals(
                result.error?.includes(secret),
                false,
                `${secret} reached ConnectionResult.error via ${dsn}`,
            )
        }
    }
})

Deno.test('#302 connect() returns a head-only render, never a cause chain', async () => {
    // This is the only renderError call site in the repo whose result is
    // RETURNED rather than passed to console — an application may put it in a
    // response. Same distinction telemetry draws for a span.
    const db = new Database()
    const result = await db.connect('postgres://u:p@db.invalid:5432/x', {
        silent: true,
    })

    assertEquals(result.success, false)
    assertEquals(
        result.error?.includes('caused by:'),
        false,
        'a cause chain reached a returned value',
    )
})
