/**
 * @fileoverview #425 — the DSN grammar `connect()` checks before any driver
 * factory runs.
 *
 * A driver that cannot tell where a password ends does not fail: it rewrites
 * the DSN. postgres.js reads a comma as a host separator and ends the host
 * part at the first `/` or `?`; the other clients end it at the first `/`, `?`
 * or `#`. So password fragments become hosts, ports or database names. They
 * are then looked up in cleartext DNS and echoed in errors no exact-DSN
 * redaction can match. The
 * check refuses those DSNs before a driver sees them, and still accepts every
 * form the drivers support: multi-host with and without ports, IPv6, a
 * percent-encoded host name, an empty authority and non-URL SQLite paths.
 *
 * All passwords here are fake markers.
 *
 * @module @lockness/drizzle/tests/dsn
 */

import { assertEquals } from '@std/assert'
import { Database } from '../mod.ts'
import type { DriverFactory } from '../drivers.ts'
import { inspectDsn } from '../dsn.ts'

/** The fixed message; spelled out so a change to the constant is caught. */
const REJECTED = 'DSN is not a valid URL; percent-encode reserved characters ' +
    'in the password'

/** DSNs the drivers support, which the check must never refuse. */
const ACCEPTED = [
    'postgres://u:p@h1,h2/db',
    'postgres://u:p@h1:5432,h2:5433/db?target_session_attrs=read-write',
    'postgres://u:p@[::1]:5432,h2/db',
    'postgres://u:p@%2Fvar%2Frun%2Fpostgresql/db',
    'postgres:///db',
    'postgres://localhost:5432/lockness',
    'mysql://u:p%2Fq@h:3306/db',
    'libsql://db.turso.io?authToken=eyJhbGci.eyJ.sig',
    'file:local.db',
    'file:///tmp/x.db',
    'postgres://u:p%40ss%2C%3F@h/db',
    'postgres://u:a,b@h/db',
    '',
    // The password may equal a host, or hold the first one: postgres.js's
    // host-list replace only matters for a list, and only finds the list.
    'postgres://postgres:postgres@postgres/db',
    'postgres://u:db1@db1,db2/db',
    // Scheme-only forms that are paths, not URLs.
    'sqlite:local.db',
    'FILE:local.db',
    ':memory:',
    'postgres://u:p@h/db?next=http://x',
]

/**
 * DSNs a driver misparses into hosts, ports or database names built from
 * password fragments — or that the pattern redactor cannot fully span.
 */
const MISPARSED = [
    // The three passwords from the issue.
    'postgres://u:X,a/Xb@Xc@db.invalid:5432/x',
    'postgres://u:X,a?Xb@db.invalid:5432/x',
    'postgres://u:X#a@Xb,c@db.invalid:5432/x',
    // Accepted by the drivers today: host `u`, port 2024, db `Spring@h/db`.
    'postgres://u:2024/Spring@h/db',
    'mysql://u:2024/Spring@h/db',
    'libsql://u:2024/Spring@h/db',
    // postgres.js rewrites the comma, then accepts: hosts `u`, `Qfrag`.
    'postgres://u:1,Qfrag/Rfrag@h/db',
    // Empty userinfo and host: still refused here with a database named (#456).
    'postgres://:@:5432/app',
    // A raw `@` in the password.
    'postgres://u:Pa@Qfrag,Rfrag@h/db',
    'postgres://u:Pa@Qfrag@h1,h2/db',
    'postgres://app:p@ss@db/prod',
    'postgres://app:Tk9/Qz@Wm4@db.invalid:5432/prod',
    // A space and a non-ASCII character in the password.
    'postgres://app:my pass@db/prod',
    'postgres://app:pässword@db/prod',
    // A raw `@` in the query string.
    'postgres://h/db?application_name=a@b',
    // A percent sequence that does not decode.
    'postgres://u:%C3@h/db',
    'postgres://%C3:p@h/db',
    // A host entry outside the registered-name grammar. Only R3 refuses the
    // second: once the list is collapsed to `h1`, WHATWG accepts it.
    'postgres://u:p@h o/db',
    'postgres://u:p@h1,h o/db',
    // Grammatical, but not a WHATWG URL once the host list is collapsed.
    'postgres://u:p@[1:2:3]/db',
    'postgres://u:p@h:99999,h2/db',
    // A scheme with no `//`: postgres.js hands the rest to WHATWG as an
    // opaque path, and the password becomes part of the database name.
    'postgres:u:Qx9frag@h/db',
    'mysql:u:Qx9frag@h/db',
    'u:2024/Spring@h/db',
    // A `://` later in the DSN is not an authority.
    'postgres:u:Qx9frag@h/db?next=http://x',
    // WHATWG drops a tab or newline anywhere and strips leading spaces and
    // controls, so the text a driver parses is not the text checked.
    'postgres:/\t/u:2024/Spring@h/db',
    'postgres:/\n/u:2024/Spring@h/db',
    ' postgres://u:2024/Spring@h/db',
    ' postgres:u:Qx9frag@h/db',
    'postgres://u:p@h/db\x00',
    'postgres://u:p@h/db\x7F',
    // A tab or newline inside the scheme keeps the `//`, so only the control
    // check refuses these; WHATWG drops the character and parses the rest.
    'post\tgres://u:2024/Spring@h/db',
    'post\ngres://u:2024/Spring@h/db',
    // postgres.js collapses a host list by replacing its FIRST match anywhere
    // in the DSN — here inside the password, or straddling the `@` once the
    // list is decoded — so the password is rewritten, not the host list.
    'postgres://u:xdb1,db2x@db1,db2/db',
    'postgres://u:h1,h2@h1%2Ch2/db',
    'postgres://u:a,a@a,a%40a,a/db',
    // postgres.js collapses the list with String.replace, which reads `$`
    // sequences in the replacement as patterns (`$\``, `$'`, `$&`), so a
    // host list holding `$` can splice the password into the database name.
    'postgres://u:Zq7Fake@h$%60,x/h$`,x',
]

/**
 * A spy factory that counts calls, so a test can prove the driver was never
 * handed a DSN.
 */
function spyFactory(): { calls: string[]; factory: DriverFactory } {
    const calls: string[] = []
    const factory: DriverFactory = (url) => {
        calls.push(url)
        return Promise.resolve({
            db: {} as unknown,
            close: () => Promise.resolve(),
            probe: () => Promise.resolve(),
        })
    }
    return { calls, factory }
}

/** Connect `dsn` through spy factories for every dialect. */
async function connectThroughSpy(
    dsn: string,
): Promise<{ calls: string[]; success: boolean; error?: string }> {
    const { calls, factory } = spyFactory()
    const db = new Database()
    for (const dialect of ['postgres', 'mysql', 'sqlite'] as const) {
        db.setDriverFactory(dialect, factory)
    }
    const original = console.error
    console.error = () => {}
    try {
        const result = await db.connect(dsn, { silent: true })
        return { calls, ...result }
    } finally {
        console.error = original
    }
}

Deno.test('#425 inspectDsn accepts every form the drivers support', () => {
    // Every refused form at once, so a failure names each of them.
    assertEquals(ACCEPTED.filter((dsn) => !inspectDsn(dsn).ok), [])
})

Deno.test('#425 inspectDsn rejects every misparsed DSN', () => {
    // Every bypass at once, so a failure names each of them.
    assertEquals(MISPARSED.filter((dsn) => inspectDsn(dsn).ok), [])
})

Deno.test('#425 a misparsed DSN is refused before any factory is called', async () => {
    for (const dsn of MISPARSED) {
        const result = await connectThroughSpy(dsn)
        assertEquals(result.success, false, dsn)
        assertEquals(result.error, REJECTED, dsn)
        assertEquals(result.calls, [], `${dsn} reached a driver factory`)
    }
})

Deno.test('#425 an accepted DSN reaches its factory unchanged', async () => {
    for (const dsn of ACCEPTED) {
        const result = await connectThroughSpy(dsn)
        assertEquals(result.success, true, dsn)
        assertEquals(result.calls, [dsn])
    }
})

Deno.test('#425 the password allow-list is exactly the one the docs state', () => {
    // DOCS.md and connect()'s JSDoc promise: `A-Za-z0-9-._~!$&'()*+,;=:` and
    // `%XX` are allowed, and every other character must be percent-encoded.
    // Walk every printable ASCII character, plus a non-ASCII one, both ways.
    const allowed = /^[A-Za-z0-9\-._~!$&'()*+,;=:]$/
    const refusedRaw: string[] = []
    const acceptedRaw: string[] = []
    const refusedEncoded: string[] = []
    for (
        const char of [...Array(95)].map((_, i) => String.fromCharCode(32 + i))
            .concat('ä')
    ) {
        const raw = inspectDsn(`postgres://u:a${char}b@h/db`).ok
        if (allowed.test(char) && !raw) refusedRaw.push(char)
        if (!allowed.test(char) && char !== '%' && raw) acceptedRaw.push(char)
        const encoded = `postgres://u:a${encodeURIComponent(char)}b@h/db`
        if (!inspectDsn(encoded).ok) refusedEncoded.push(char)
    }
    assertEquals(refusedRaw, [])
    assertEquals(acceptedRaw, [])
    assertEquals(refusedEncoded, [])
    // `%` is allowed only as the start of `%XX`.
    assertEquals(inspectDsn('postgres://u:100%@h/db').ok, false)
    assertEquals(inspectDsn('postgres://u:1%zz@h/db').ok, false)
    assertEquals(inspectDsn('postgres://u:100%25@h/db').ok, true)
})

Deno.test('#425 secrets are the password as written, decoded and as WHATWG re-encodes it', () => {
    assertEquals(inspectDsn('postgres://u:p%40ss%2C%3F@h/db'), {
        ok: true,
        secrets: ['p%40ss%2C%3F', 'p@ss,?'],
    })
    // WHATWG percent-encodes `;` and `=`, which RFC 3986 allows raw: a
    // driver echoing `new URL(dsn).href` prints that third form.
    assertEquals(inspectDsn('postgres://u:Nq4;Vd8=Jp3@h1,h2/db'), {
        ok: true,
        secrets: ['Nq4;Vd8=Jp3', 'Nq4%3BVd8%3DJp3'],
    })
    // A password with nothing to decode or re-encode is held once.
    assertEquals(inspectDsn('postgres://u:Plain7@h1,h2/db'), {
        ok: true,
        secrets: ['Plain7'],
    })
    // The username is not a secret: it is not held.
    assertEquals(inspectDsn('postgres://u%40x:Plain7@h/db'), {
        ok: true,
        secrets: ['Plain7'],
    })
})

Deno.test('#425 an empty or absent password holds no secret', () => {
    // An empty needle would splice the marker between every character.
    for (
        const dsn of [
            'postgres://u:@h/db',
            'postgres://u@h/db',
            'postgres://h/db',
            'postgres:///db',
            'file:local.db',
            '',
        ]
    ) {
        assertEquals(inspectDsn(dsn), { ok: true, secrets: [] }, dsn)
    }
})

Deno.test('#425 multi-host, IPv6 and percent-encoded-host DSNs configure the real postgres client', async () => {
    // The real default factory, not a spy: the check must never reject what
    // postgres.js supports. The client is lazy, so building it sends nothing
    // and resolves no host — the op sanitizer fails this test if a lookup or
    // a socket were left pending.
    // `%2F…` is not a unix socket to postgres.js 3.4.8: it keeps the host
    // encoded, finds no `/` in it, and treats it as a TCP host name.
    for (
        const dsn of [
            'postgres://u:p@h1.invalid,h2.invalid/db',
            'postgres://u:p@h1.invalid:5432,h2.invalid:5433/db',
            'postgres://u:p@[::1]:5432,h2.invalid/db',
            'postgres://u:p@%2Fvar%2Frun%2Fpostgresql/db',
        ]
    ) {
        const db = new Database()
        const result = await db.connect(dsn, { silent: true })
        assertEquals(result, { success: true }, dsn)
        await db.close()
    }
})

/**
 * Connect `dsn` through the REAL default factories, capturing every
 * `console.error` line, so a test can prove what reached the log.
 */
async function connectCapturingLog(
    dsn: string,
): Promise<{ result: unknown; logged: string }> {
    const lines: string[] = []
    const original = console.error
    console.error = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '))
    }
    try {
        const result = await new Database().connect(dsn, { silent: true })
        return { result, logged: lines.join('\n') }
    } finally {
        console.error = original
    }
}

/**
 * The withheld message for a client the real driver cannot build. Spelled out
 * so a change of wording, or a leak into it, is caught.
 */
function withheld(dialect: string, name: string): string {
    return `The '${dialect}' driver could not be configured (${name}); ` +
        'its message is withheld because it may contain the DSN'
}

// Each DSN passes the check, then makes the real client constructor throw —
// no network involved — with a message that quotes the marker. Only the order
// "import under loadClient, construct outside it" keeps that message out:
// construct inside loadClient and it is shown as an import error. The password
// is one no error name contains: a name holding it would be dropped.
const CONSTRUCTOR_FAILURES = [
    {
        dsn: 'libsql://h.invalid/db#Frag7Secret',
        error: withheld('sqlite', 'LibsqlError'),
    },
    {
        dsn: 'postgres://u:Pw7Fake@h.invalid/db?target_session_attrs=Frag7Secret',
        error: withheld('postgres', 'Error'),
    },
    {
        dsn: 'mysql://u:Pw7Fake@h.invalid/db?ssl=Frag7Secret',
        error: withheld('mysql', 'TypeError'),
    },
]

for (const { dsn, error } of CONSTRUCTOR_FAILURES) {
    Deno.test(`#425 a client the real factory cannot build withholds its message: ${dsn}`, async () => {
        const { result, logged } = await connectCapturingLog(dsn)
        assertEquals(result, { success: false, error })
        assertEquals(logged, `❌ Database connection failed: ${error}`)
        assertEquals(JSON.stringify(result).includes('Frag7Secret'), false)
        assertEquals(logged.includes('Frag7Secret'), false)
    })
}
