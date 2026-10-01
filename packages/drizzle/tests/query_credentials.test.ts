/**
 * @fileoverview #438 — a credential carried in the DSN's query string is held
 * like the userinfo password, so `probe()` withholds any driver message that
 * echoes it, whatever form the driver echoes it in.
 *
 * Which names are credentials is the contract's rule (`isCredentialParamName`),
 * shared with `renderError`. The held check is the #425 one: a message holding
 * a value is withheld whole, never edited around it.
 *
 * Every secret is a fake marker assembled at run time, so the repository's
 * secret scan never sees a credential-shaped literal.
 *
 * @module @lockness/drizzle/tests/query_credentials
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { Database } from '../mod.ts'
import type { Dialect, DriverFactory } from '../drivers.ts'
import { inspectDsn } from '../dsn.ts'

const HEAD = 'FA' + 'KE'
const TAIL = 'MA' + 'RK'
/** The fake credential. */
const M = HEAD + TAIL

/** Assert that no part of the marker survived into `out`. */
function assertNoMarker(out: string): void {
    assert(!out.includes(M), `marker leaked: ${out}`)
    assert(!out.includes(HEAD), `marker head leaked: ${out}`)
    assert(!out.includes(TAIL), `marker tail leaked: ${out}`)
}

/** The fixed sentence a probe failure holding a credential renders as. */
const WITHHELD =
    'The database probe failed (Error); its message is withheld because it ' +
    'contains a database credential'

/** A fake factory whose probe rejects with `error`. */
function failingFactory(error: unknown): DriverFactory {
    return () =>
        Promise.resolve({
            db: {} as unknown,
            close: () => Promise.resolve(),
            probe: () => Promise.reject(error),
        })
}

/** Connect through a fake client whose probe rejects, and return the render. */
async function probeFailure(
    dialect: Dialect,
    dsn: string,
    error: unknown,
): Promise<string> {
    const db = new Database()
    db.setDriverFactory(dialect, failingFactory(error))
    assertEquals((await db.connect(dsn, { silent: true })).success, true, dsn)
    const rejected = await assertRejects(() => db.probe())
    return rejected instanceof Error ? rejected.message : String(rejected)
}

Deno.test('#438 inspectDsn holds an authToken in all four forms', () => {
    // As written, percent-decoded, decoded the form way (`+` is a space), and
    // as WHATWG serialises the query (`"` becomes `%22`).
    const dsn = `libsql://db.example.com?authToken=${M}%2B+"&tls=1`
    assertEquals(inspectDsn(dsn), {
        ok: true,
        secrets: [`${M}%2B+"`, `${M}++"`, `${M}+ "`, `${M}%2B+%22`],
    })
})

Deno.test('#438 the userinfo password and query credentials are both held', () => {
    const inspection = inspectDsn(
        `postgres://app:Pw7@db/app?sslpassword=Ssl8&sslmode=require`,
    )
    assertEquals(inspection, { ok: true, secrets: ['Pw7', 'Ssl8'] })
})

Deno.test('#438 every value of a repeated credential name is held', () => {
    assertEquals(inspectDsn('libsql://h?authToken=One1&authToken=Two2'), {
        ok: true,
        secrets: ['One1', 'Two2'],
    })
})

Deno.test('#438 a name is matched whatever its case or encoding', () => {
    for (const name of ['AUTHTOKEN', 'Password', 'api%5Fkey']) {
        assertEquals(
            inspectDsn(`libsql://h?${name}=Val9`),
            { ok: true, secrets: ['Val9'] },
            name,
        )
    }
})

Deno.test('#438 an empty or absent value, or a plain parameter, holds nothing', () => {
    for (
        const dsn of [
            'libsql://h?authToken=',
            'libsql://h?authToken',
            'libsql://h?',
            'postgres://h/db?sslmode=require&application_name=web',
            'postgres://h/db#authToken=frag',
        ]
    ) {
        assertEquals(inspectDsn(dsn), { ok: true, secrets: [] }, dsn)
    }
})

Deno.test('#438 a probe error echoing the authToken alone is withheld', async () => {
    const out = await probeFailure(
        'sqlite',
        `libsql://db.example.com?authToken=${M}`,
        new Error(`HTTP 401: token ${M} rejected`),
    )
    assertEquals(out, WITHHELD)
    assertNoMarker(out)
})

Deno.test('#438 a probe error echoing the authToken in a rebuilt URL is withheld', async () => {
    // Not the exact DSN, so the identity replacement cannot find it.
    const out = await probeFailure(
        'sqlite',
        `libsql://db.example.com?authToken=${M}`,
        new Error(`cannot reach https://db.example.com:443/?authToken=${M}`),
    )
    assertEquals(out, WITHHELD)
    assertNoMarker(out)
})

Deno.test('#438 a probe error echoing the decoded form is withheld', async () => {
    const out = await probeFailure(
        'sqlite',
        `libsql://db.example.com?authToken=${M}%2Fx`,
        new Error(`bad token ${M}/x`),
    )
    assertEquals(out, WITHHELD)
    assertNoMarker(out)
})

Deno.test('#438 a mysql ?password= echoed alone is withheld', async () => {
    const out = await probeFailure(
        'mysql',
        `mysql://app@db/app?password=${M}`,
        new Error(`Access denied (using password ${M})`),
    )
    assertEquals(out, WITHHELD)
    assertNoMarker(out)
})

Deno.test('#438 an AUTHTOKEN in capitals is held too', async () => {
    const out = await probeFailure(
        'sqlite',
        `libsql://db.example.com?AUTHTOKEN=${M}`,
        new Error(`rejected ${M}`),
    )
    assertEquals(out, WITHHELD)
    assertNoMarker(out)
})

Deno.test('#438 a probe error holding no credential is shown, not withheld', async () => {
    const out = await probeFailure(
        'sqlite',
        `libsql://db.example.com?authToken=${M}`,
        new Error('connection refused'),
    )
    assertEquals(out, 'Error: connection refused')
})
