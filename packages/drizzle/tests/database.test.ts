/**
 * @fileoverview #301/#302/#420/#425 — what `connect()` does on the wire, and
 * what a failure is allowed to say.
 *
 * #420: `connect()` only configures a lazy client and makes **zero** round
 * trips; `probe()` is the one method that talks to the database. So a failure
 * surfaces in one of two places — `connect()` for a refused DSN, a missing
 * client package or a client that cannot be built, `probe()` for everything
 * the network decides.
 *
 * #425: `connect()` refuses a DSN whose password a driver would misparse, with
 * a fixed message, before any factory runs; a client that cannot be built
 * reports its error NAME only, never its message; and `probe()` replaces the
 * exact DSN whole, and withholds the whole message when any known form of the
 * password occurs in it — driver text is never edited around a password.
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
import { renderError } from '@lockness/contract'
import { Database } from '../mod.ts'
import {
    ClientUnavailableError,
    type DriverFactory,
    loadClient,
} from '../drivers.ts'

/** The fixed message; spelled out so a change to the constant is caught. */
const REJECTED = 'DSN is not a valid URL; percent-encode reserved characters ' +
    'in the password'

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

Deno.test('#301 a password containing a slash never reaches the result', async () => {
    // `/` in the userinfo is what makes `new URL()` throw AND what a pattern
    // redactor could not span — the same characters on both sides. The
    // assertion is on the PROPERTY, not on which mechanism got there first.
    // Since #425 the DSN check refuses it before the client's parser runs, so
    // it still fails at `connect()` with no round trip (#420). The counting
    // fake proves no client — and so no resolver — was ever reached (#427).
    const { counts, factory } = countingFactory()
    const db = new Database()
    db.setDriverFactory('postgres', factory)
    const result = await db.connect(
        'postgres://app:aB3/xY9+z@db.invalid:5432/prod',
        { silent: true },
    )
    assertEquals(result.success, false)
    assertEquals(
        result.error?.includes('aB3/xY9+z'),
        false,
        'the password reached ConnectionResult.error',
    )
    assertEquals(counts.built, 0, 'the refused DSN reached the factory')
})

Deno.test('#301 no password shape reaches the returned error', async () => {
    // The property, over the shapes that broke the pattern before #301.
    //
    // Since #425 all three are refused by the DSN check inside `connect()`,
    // before any driver sees them: a `/` ends the authority early, a raw `@`
    // or a space is outside the userinfo grammar. Each returns the fixed
    // message, which quotes no part of the DSN. Percent-encoded, the same
    // passwords are accepted — see "#425 a percent-encoded password is
    // removed whole from a probe failure".
    const secrets = ['aB3/xY9+z', 'my pass', 'p@ss']
    for (
        const dsn of [
            'postgres://app:aB3/xY9+z@db.invalid:5432/prod',
            'postgres://app:my pass@db.invalid:5432/prod',
            'postgres://app:p@ss@db.invalid:5432/prod',
        ]
    ) {
        const result = await new Database().connect(dsn, { silent: true })
        assertEquals(result.success, false, `${dsn} was accepted`)
        assertEquals(result.error, REJECTED, dsn)
        for (const secret of secrets) {
            assertEquals(
                result.error?.includes(secret),
                false,
                `${secret} reached the returned error via ${dsn}`,
            )
        }
    }
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

Deno.test('#302 probe() re-throws a head-only render, never a cause chain', async () => {
    // This is the only renderError call site in the repo whose result is
    // RETURNED (or re-thrown) rather than passed to console — an application
    // may put it in a response. Same distinction telemetry draws for a span.
    // A fake client, not a real resolver (#427): the failure, its cause and
    // the held DSN are all fixed, so the exact render can be asserted.
    const db = new Database()
    db.setDriverFactory(
        'postgres',
        failingFactory(
            new Error('connection refused', {
                cause: new Error('CAUSE-SENTINEL'),
            }),
        ),
    )
    const result = await db.connect('postgres://u:p@db.invalid:5432/x', {
        silent: true,
    })
    assertEquals(result.success, true)

    const error = await assertRejects(() => db.probe())
    assertEquals(messageOf(error), 'Error: connection refused')
})

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

Deno.test('#420 a driver message carrying the exact DSN is redacted by identity', async () => {
    // The identity leg, reached: a client that words its own failure with the
    // DSN in it. The marker proves the leg fired — the shared pattern alone
    // would leave `postgres://***:***@db.internal...`, not the marker. The
    // cause carries a bare value no pattern knows, so only head-only drops it.
    const dsn = 'postgres://app:Hx7Kq2Lw@db.internal:5432/prod'
    const db = new Database()
    db.setDriverFactory(
        'postgres',
        failingFactory(
            new Error(`could not reach ${dsn}`, {
                cause: new Error('CAUSE-ONLY-VALUE'),
            }),
        ),
    )
    await db.connect(dsn, { silent: true })

    const message = messageOf(await assertRejects(() => db.probe()))
    assertEquals(message, 'Error: could not reach <dsn redacted>')
})

Deno.test('#420 a slash then a raw @ in the password leaks no fragment of it', async () => {
    // `/` makes the userinfo span what the shared pattern must stop at, and
    // the first raw `@` is where it stops — so pattern-first redaction left
    // the tail after it (`postgres://***:***@Wm4@db...`). Both surfaces are
    // checked. `connect()` refuses the raw DSN (#425). `probe()` is reached
    // with the same password percent-encoded — a DSN the check accepts — and
    // a client that echoes it DECODED, which puts the raw `@` back in front
    // of the pattern: only the held decoded password removes it.
    const raw = 'postgres://app:Tk9/Qz@Wm4@db.invalid:5432/prod'
    const encoded = 'postgres://app:Tk9%2FQz%40Wm4@db.invalid:5432/prod'
    const fragments = ['Tk9', 'Qz', 'Wm4']
    const assertNoFragment = (text: string, surface: string): void => {
        for (const fragment of fragments) {
            assertEquals(
                text.includes(fragment),
                false,
                `${surface} leaked '${fragment}': ${text}`,
            )
        }
    }

    const rejected = await new Database().connect(raw, { silent: true })
    assertEquals(rejected.success, false, 'the check accepted the raw DSN')
    assertNoFragment(rejected.error ?? '', 'connect()')

    const db = new Database()
    db.setDriverFactory(
        'postgres',
        failingFactory(new Error(`could not reach ${raw} (${encoded})`)),
    )
    const accepted = await db.connect(encoded, { silent: true })
    assertEquals(accepted.success, true, 'the probe leg went hollow')
    const error = await assertRejects(() => db.probe())
    assertNoFragment(messageOf(error), 'probe()')
})

Deno.test('#420 an unreadable driver error renders as a sentinel, not a throw', async () => {
    // Removing the DSN reads the raw message, and a thrown value's `message`
    // can be a getter that throws. The render must stay total: the caller
    // gets the sentinel, never the getter's own error.
    const hostile = new Error('placeholder')
    Object.defineProperty(hostile, 'message', {
        get(): never {
            throw new Error('getter exploded')
        },
    })
    const db = new Database()
    db.setDriverFactory('postgres', failingFactory(hostile))
    await db.connect('postgres://u:p@db.internal:5432/app', { silent: true })

    const error = await assertRejects(() => db.probe())
    assertEquals(messageOf(error), '[unrenderable error]')
})

/**
 * Run `body` with `console.error` captured, so a test can assert what a failed
 * `connect()` logged as well as what it returned.
 */
async function capturingErrors<T>(
    body: () => Promise<T>,
): Promise<{ value: T; logged: string }> {
    const lines: string[] = []
    const original = console.error
    console.error = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '))
    }
    try {
        return { value: await body(), logged: lines.join('\n') }
    } finally {
        console.error = original
    }
}

Deno.test('#425 the issue passwords reach neither the result nor the log, and no factory', async () => {
    // Through the REAL default driver: before #425 postgres.js rewrote each
    // of these (a comma is a host separator to it) and echoed the rewrite,
    // which the exact-DSN removal could not match.
    const cases: Array<[string, string[]]> = [
        ['X,a/Xb@Xc', ['X,a', 'Xb', 'Xc']],
        ['X,a?Xb', ['X,a', 'Xb']],
        ['X#a@Xb,c', ['X#a', 'Xb', 'b,c']],
    ]
    for (const [password, fragments] of cases) {
        const dsn = `postgres://u:${password}@db.invalid:5432/x`
        // Not silent: since #427 `silent` silences the failure line too, and
        // the no-leak check below would pass on an empty log.
        const { value: result, logged } = await capturingErrors(() =>
            new Database().connect(dsn)
        )
        assertEquals(result, { success: false, error: REJECTED }, dsn)
        assertEquals(logged, `❌ Database connection failed: ${REJECTED}`)
        for (const fragment of fragments) {
            assertEquals(
                `${result.error}\n${logged}`.includes(fragment),
                false,
                `'${fragment}' of ${password} leaked`,
            )
        }

        // And the driver is never handed the DSN at all.
        const { counts, factory } = countingFactory()
        const db = new Database()
        db.setDriverFactory('postgres', factory)
        await capturingErrors(() => db.connect(dsn, { silent: true }))
        assertEquals(counts.built, 0, `${dsn} reached the factory`)
    }
})

/** The fixed sentence a probe failure holding the password renders as. */
function probeWithheld(name?: string): string {
    return `The database probe failed${
        name === undefined ? '' : ` (${name})`
    }; its message is withheld because it contains a database credential`
}

/** Connect through a fake client whose probe rejects, and return the render. */
async function probeFailure(dsn: string, error: unknown): Promise<string> {
    const db = new Database()
    db.setDriverFactory('postgres', failingFactory(error))
    assertEquals((await db.connect(dsn, { silent: true })).success, true, dsn)
    return messageOf(await assertRejects(() => db.probe()))
}

Deno.test('#425 a short password is withheld, never replaced inside driver text', async () => {
    // Replacing by value turns the replacement into a detector: `e` would
    // become `conn***ct … us***r`, and `5432` would mask the port. So the
    // text is shown verbatim or withheld whole — never edited.
    const cases: Array<[string, string]> = [
        ['postgres://u:e@h/db', 'connect failed for user'],
        ['postgres://u:5432@h/db', 'connect ECONNREFUSED 127.0.0.1:5432'],
    ]
    for (const [dsn, text] of cases) {
        const message = await probeFailure(dsn, new Error(text))
        assertEquals(message, probeWithheld('Error'), dsn)
        assertEquals(message.includes('***'), false, message)
    }
})

Deno.test('#425 the Docker default postgres:postgres is withheld, not masked', async () => {
    const message = await probeFailure(
        'postgres://postgres:postgres@localhost:5432/postgres',
        new Error('password authentication failed for user "postgres"'),
    )
    assertEquals(message, probeWithheld('Error'))
})

Deno.test('#425 text holding no form of the password renders the same whatever the password', async () => {
    // Output independence: the password must not influence a render it does
    // not occur in. A foreign DSN proves the shared pattern still runs.
    const text = 'could not reach postgres://other:Zz9Other@elsewhere/db'
    const expected = renderError(new Error(text), { followCause: false })
    for (
        const dsn of [
            'postgres://app:Aa1Fake@h/db',
            'postgres://app:Bb2Fake@h/db',
        ]
    ) {
        assertEquals(await probeFailure(dsn, new Error(text)), expected, dsn)
    }
})

Deno.test('#425 every echo of a held password is withheld; the exact DSN is replaced whole', async () => {
    // Every form a driver may echo once the DSN has passed the check. The
    // exact DSN is replaced whole and the rest of the message kept; any other
    // form of the password — the WHATWG href, the multi-host list collapsed
    // to one host, the password alone encoded or decoded — withholds it all.
    const dsn = 'postgres://app:Qv7%2FRz9%40Lm2@h1:5432,h2:5433/prod'
    const collapsed = 'postgres://app:Qv7%2FRz9%40Lm2@h1:5432/prod'
    assertEquals(
        await probeFailure(dsn, new Error(`could not reach ${dsn}`)),
        'Error: could not reach <dsn redacted>',
    )
    const echoes = [
        `could not reach ${new URL(collapsed).href}`,
        `could not reach ${collapsed}`,
        'password authentication failed: Qv7/Rz9@Lm2',
        'password authentication failed: Qv7%2FRz9%40Lm2',
    ]
    for (const echo of echoes) {
        assertEquals(
            await probeFailure(dsn, new Error(echo)),
            probeWithheld('Error'),
            echo,
        )
    }
})

Deno.test('#425 a password WHATWG re-encodes is withheld in its href', async () => {
    // `;` and `=` are legal in the userinfo but WHATWG percent-encodes them
    // in `href`: only the URL-parser form of the password matches that echo.
    const dsn = 'postgres://app:Nq4;Vd8=Jp3@h1:5432,h2:5433/prod'
    const href = new URL('postgres://app:Nq4;Vd8=Jp3@h1:5432/prod').href
    assertEquals(
        await probeFailure(dsn, new Error(`could not reach ${href}`)),
        probeWithheld('Error'),
    )
    // A DSN nobody holds is still caught by the shared pattern.
    assertEquals(
        await probeFailure(
            dsn,
            new Error('could not reach postgres://other:Zz9Other@elsewhere/db'),
        ),
        'Error: could not reach postgres://***:***@elsewhere/db',
    )
})

Deno.test('#425 an empty password does not splice a marker into the message', async () => {
    for (const dsn of ['postgres://app:@h/db', 'postgres://app@h/db']) {
        const db = new Database()
        db.setDriverFactory(
            'postgres',
            failingFactory(new Error('connection refused')),
        )
        await db.connect(dsn, { silent: true })
        const message = messageOf(await assertRejects(() => db.probe()))
        assertEquals(message, 'Error: connection refused', dsn)
    }
})

/** A factory that fails while building its client, with `error`. */
function throwingFactory(error: unknown): DriverFactory {
    return () => Promise.reject(error)
}

Deno.test('#425 a client that cannot be built reports its error name, never its message', async () => {
    // The constructor's message may quote the DSN in any rewritten form, so
    // none of it is shown — only a name, and only an identifier-shaped one.
    const db = new Database()
    db.setDriverFactory(
        'postgres',
        throwingFactory(
            new TypeError('boom Pw7Fake in postgres://u:Pw7Fake@h'),
        ),
    )
    // Not silent (#427): the log is half of what this test checks.
    const { value: result, logged } = await capturingErrors(() =>
        db.connect('postgres://u:Pw7Fake@h/db')
    )
    assertEquals(result, {
        success: false,
        error: "The 'postgres' driver could not be configured (TypeError); " +
            'its message is withheld because it may contain the DSN',
    })
    assertEquals(logged, `❌ Database connection failed: ${result.error}`)
    assertEquals(logged.includes('Pw7Fake'), false, logged)
    assertEquals(logged.includes('boom'), false, logged)
})

Deno.test('#425 an error name that is not identifier-shaped is dropped', async () => {
    const withheld = "The 'mysql' driver could not be configured; " +
        'its message is withheld because it may contain the DSN'
    const named = new Error('boom')
    named.name = 'Bad name Pw7Fake'
    for (const thrown of [named, 'Pw7Fake as a string', undefined]) {
        const db = new Database()
        db.setDriverFactory('mysql', throwingFactory(thrown))
        const { value: result } = await capturingErrors(() =>
            db.connect('mysql://u:Pw7Fake@h/db', { silent: true })
        )
        assertEquals(result, { success: false, error: withheld })
    }
})

/** The fixed sentence a client that cannot be built renders as. */
function configureWithheld(dialect: string, name?: string): string {
    return `The '${dialect}' driver could not be configured${
        name === undefined ? '' : ` (${name})`
    }; its message is withheld because it may contain the DSN`
}

Deno.test('#425 an unreadable error name is marked in the one error line, with no warning', async () => {
    const hostile = new Error('boom')
    Object.defineProperty(hostile, 'name', {
        get(): never {
            throw new Error('GetterText Pw7Fake')
        },
    })
    const warned: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
        warned.push(args.map(String).join(' '))
    }
    let errorCalls = 0
    const originalError = console.error
    const logged: string[] = []
    try {
        const db = new Database()
        db.setDriverFactory('postgres', throwingFactory(hostile))
        console.error = (...args: unknown[]) => {
            errorCalls++
            logged.push(args.map(String).join(' '))
        }
        // Not silent (#427): the one ERROR line is what this test counts.
        const result = await db.connect('postgres://u:Pw7Fake@h/db')
        console.error = originalError
        assertEquals(result, {
            success: false,
            error: configureWithheld('postgres', '[unreadable name]'),
        })
        assertEquals(errorCalls, 1, 'the failure is logged once, at ERROR')
        assertEquals(warned, [], 'a separate warning is logged')
        const everything = `${result.error}\n${logged.join('\n')}`
        assertEquals(everything.includes('GetterText'), false, everything)
    } finally {
        console.error = originalError
        console.warn = originalWarn
    }
})

Deno.test('#425 a throwing prototype lookup fails connect(), it does not reject', async () => {
    // `instanceof` walks the prototype chain, and a Proxy can throw there.
    const hostile = new Proxy({}, {
        getPrototypeOf(): never {
            throw new Error('trap Pw7Fake')
        },
    })
    const db = new Database()
    db.setDriverFactory('postgres', throwingFactory(hostile))
    // Not silent (#427): the log is half of what this test checks.
    const { value: result, logged } = await capturingErrors(() =>
        db.connect('postgres://u:Pw7Fake@h/db')
    )
    assertEquals(result, {
        success: false,
        error: configureWithheld('postgres', '[unreadable name]'),
    })
    assertEquals(logged, `❌ Database connection failed: ${result.error}`)
    assertEquals(logged.includes('trap'), false, logged)
})

Deno.test('#425 the unreadable-name marker cannot be spoofed by a name', async () => {
    const cases: Array<[string, string]> = [
        ['unreadableName', configureWithheld('postgres', 'unreadableName')],
        ['x y', configureWithheld('postgres')],
        ['[unreadable name]', configureWithheld('postgres')],
    ]
    for (const [name, expected] of cases) {
        const thrown = new Error('boom')
        thrown.name = name
        const db = new Database()
        db.setDriverFactory('postgres', throwingFactory(thrown))
        const { value: result } = await capturingErrors(() =>
            db.connect('postgres://u:Pw7Fake@h/db', { silent: true })
        )
        assertEquals(result, { success: false, error: expected }, name)
    }
})

Deno.test('#425 an identifier-shaped name holding the password is dropped', async () => {
    const thrown = new Error('boom')
    thrown.name = 'Pw7FakeError'
    const db = new Database()
    db.setDriverFactory('mysql', throwingFactory(thrown))
    const { value: result } = await capturingErrors(() =>
        db.connect('mysql://u:Pw7Fake@h/db', { silent: true })
    )
    assertEquals(result, { success: false, error: configureWithheld('mysql') })

    // The same name on a probe failure withholds the whole text, name too.
    const clean = new Error('connection refused')
    clean.name = 'Pw7FakeError'
    assertEquals(
        await probeFailure('postgres://u:Pw7Fake@h/db', clean),
        probeWithheld(),
    )
})

Deno.test('#425 an import error holding the password is withheld after the package sentence', async () => {
    // The Docker default: the password is also the package name.
    const db = new Database()
    db.setDriverFactory(
        'postgres',
        throwingFactory(
            new ClientUnavailableError(
                'postgres',
                new Error("Cannot find module 'npm:postgres'"),
            ),
        ),
    )
    const { value: result } = await capturingErrors(() =>
        db.connect('postgres://postgres:postgres@localhost/db', {
            silent: true,
        })
    )
    assertEquals(result, {
        success: false,
        error: "The 'postgres' driver's client package (postgres) could not " +
            'be imported; the import error is withheld because it contains ' +
            'a database credential',
    })
})

Deno.test('#425 a missing client package is named, with the import error', async () => {
    const db = new Database()
    db.setDriverFactory(
        'sqlite',
        throwingFactory(
            new ClientUnavailableError(
                'sqlite',
                new Error("Cannot find module '@libsql/client'"),
            ),
        ),
    )
    const { value: result } = await capturingErrors(() =>
        db.connect('file:local.db', { silent: true })
    )
    assertEquals(result, {
        success: false,
        error: "The 'sqlite' driver's client package (@libsql/client) could " +
            "not be imported: Error: Cannot find module '@libsql/client'",
    })
})

Deno.test('#425 loadClient wraps an import failure, and passes a load through', async () => {
    const cause = new Error('Cannot find module mysql2')
    const error = await assertRejects(
        () => loadClient('mysql', () => Promise.reject(cause)),
        ClientUnavailableError,
    )
    assertEquals(error.dialect, 'mysql')
    assertEquals(error.cause, cause)
    assertEquals(await loadClient('mysql', () => Promise.resolve(42)), 42)
})
