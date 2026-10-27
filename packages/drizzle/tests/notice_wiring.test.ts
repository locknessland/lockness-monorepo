/**
 * @fileoverview #454 — every postgres.js client the package opens installs the
 * notice policy as `onnotice`: the driver factory, the `Database` that calls
 * it, and the installer's probe.
 *
 * Without an `onnotice`, postgres.js falls back to `console.log(notice)` and
 * dumps the raw notice object on every idempotent `CREATE … IF NOT EXISTS`.
 * Each test observes the options a client is constructed with through a seam,
 * so no server is needed.
 *
 * @module @lockness/drizzle/tests/notice_wiring
 */

import { assert, assertEquals } from '@std/assert'
import { Database } from '../mod.ts'
import {
    type DriverFactory,
    type DriverOptions,
    type PostgresClientLoader,
    postgresDriverFactory,
} from '../drivers.ts'
import {
    defaultConnector,
    type SqlConnector,
    testDatabaseConnection,
} from '../install.ts'
import type { NoticeReporter } from '../notice.ts'

/** A connection url with no credential, assembled at run time. */
const URL_UNDER_TEST = ['postgres:', '//app@db.example', ':5432/app'].join('')

/** Capture every `console.warn` / `console.log` line `fn` writes. */
async function captureConsole(fn: () => unknown) {
    const lines = { log: [] as string[], warn: [] as string[] }
    const { log, warn } = console
    console.log = (...a: unknown[]) => void lines.log.push(a.join(' '))
    console.warn = (...a: unknown[]) => void lines.warn.push(a.join(' '))
    try {
        await fn()
    } finally {
        console.log = log
        console.warn = warn
    }
    return lines
}

/**
 * A fake postgres loader that records the `(url, options)` the client is
 * constructed with, and returns a client that is never queried.
 */
function recordingLoader() {
    const constructed: Array<readonly [string, unknown]> = []
    const client = Object.assign(() => Promise.resolve([]), {
        end: () => Promise.resolve(),
        unsafe: () => Promise.resolve([]),
    })
    const load = (() =>
        Promise.resolve({
            drizzle: () => ({}),
            postgres: (url: string, options?: unknown) => {
                constructed.push([url, options])
                return client
            },
        })) as unknown as PostgresClientLoader
    return { constructed, load }
}

/** The `onnotice` the recorded client was given, asserted to be a function. */
function onnoticeOf(options: unknown): (notice: unknown) => void {
    assert(
        typeof options === 'object' && options !== null,
        'the client was built without options, so postgres.js prints raw notices',
    )
    const onnotice = (options as Record<string, unknown>).onnotice
    assert(typeof onnotice === 'function', 'the client has no onnotice')
    return onnotice as (notice: unknown) => void
}

// -----------------------------------------------------------------------------
// The driver factory (AC 3)
// -----------------------------------------------------------------------------

Deno.test('#454 postgresDriverFactory - the client gets an onnotice that reaches the onNotice given', async () => {
    const { constructed, load } = recordingLoader()
    const received: unknown[] = []

    await postgresDriverFactory(load)(URL_UNDER_TEST, {
        onNotice: (notice) => void received.push(notice),
    })

    assertEquals(constructed.length, 1)
    assertEquals(constructed[0][0], URL_UNDER_TEST)
    const notice = { severity: 'NOTICE', message: 'm' }
    onnoticeOf(constructed[0][1])(notice)
    assertEquals(received, [notice])
})

Deno.test('#454 postgresDriverFactory - with no onNotice, a WARNING produces the single fallback line', async () => {
    const { constructed, load } = recordingLoader()

    await postgresDriverFactory(load)(URL_UNDER_TEST)

    const onnotice = onnoticeOf(constructed[0][1])
    const lines = await captureConsole(() => {
        onnotice({ severity: 'WARNING', message: 'w' })
        onnotice({ severity: 'NOTICE', message: 'n' })
    })
    assertEquals(lines.log, [])
    assertEquals(lines.warn, ['⚠️  PostgreSQL warning: w'])
})

// -----------------------------------------------------------------------------
// Database.connect
// -----------------------------------------------------------------------------

/** A factory that records the options `Database.connect` hands it. */
function spyFactory() {
    const seen: Array<DriverOptions | undefined> = []
    const factory: DriverFactory = (_url, options) => {
        seen.push(options)
        return Promise.resolve({
            db: {},
            close: () => Promise.resolve(),
            probe: () => Promise.resolve(),
        })
    }
    return { seen, factory }
}

Deno.test('#454 Database.connect - the factory receives an onNotice that reaches ConnectionOptions.notices', async () => {
    const { seen, factory } = spyFactory()
    const calls: string[] = []
    const notices: NoticeReporter = {
        warn: (message) => void calls.push(`warn:${message}`),
        debug: (message) => void calls.push(`debug:${message}`),
    }
    const db = new Database()
    db.setDriverFactory('postgres', factory)
    try {
        await db.connect(URL_UNDER_TEST, { silent: true, notices })

        const onNotice = seen[0]?.onNotice
        assert(onNotice, 'connect passed the factory no onNotice')
        onNotice({ severity: 'NOTICE', message: 'n' })
        onNotice({ severity: 'WARNING', message: 'w' })
        assertEquals(calls, ['debug:n', 'warn:w'])
    } finally {
        await db.close()
    }
})

Deno.test('#454 Database.connect - silent: true does not hide a WARNING', async () => {
    const { seen, factory } = spyFactory()
    const db = new Database()
    db.setDriverFactory('postgres', factory)
    try {
        await db.connect(URL_UNDER_TEST, { silent: true })

        const onNotice = seen[0]?.onNotice
        assert(onNotice, 'connect passed the factory no onNotice')
        const lines = await captureConsole(() =>
            onNotice({ severity: 'WARNING', message: 'w' })
        )
        assertEquals(lines.warn, ['⚠️  PostgreSQL warning: w'])
    } finally {
        await db.close()
    }
})

// -----------------------------------------------------------------------------
// The installer's probe
// -----------------------------------------------------------------------------

Deno.test('#454 testDatabaseConnection - the probe client gets an onnotice, and a WARNING is one console.warn line', async () => {
    const previous = Deno.env.get('DATABASE_URL')
    Deno.env.set('DATABASE_URL', URL_UNDER_TEST)
    const options: unknown[] = []
    const sql = Object.assign(() => Promise.resolve([]), {
        end: () => Promise.resolve(),
    })
    const connect: SqlConnector = (_url, given) => {
        options.push(given)
        return sql
    }
    try {
        await captureConsole(() => testDatabaseConnection(connect))
        const onnotice = onnoticeOf(options[0])

        const lines = await captureConsole(() => {
            onnotice({ severity: 'WARNING', message: 'collation mismatch' })
            onnotice({ severity: 'NOTICE', message: 'n' })
        })
        assertEquals(lines.log, [])
        assertEquals(lines.warn, [
            '⚠️  PostgreSQL warning: collation mismatch',
        ])
    } finally {
        if (previous === undefined) Deno.env.delete('DATABASE_URL')
        else Deno.env.set('DATABASE_URL', previous)
    }
})

Deno.test('#454 defaultConnector - forwards options.onnotice to the postgres.js client', async () => {
    const onnotice = (_notice: unknown) => {}
    // postgres.js is lazy: constructing the client opens no connection.
    const sql = defaultConnector(URL_UNDER_TEST, { onnotice })
    try {
        const options = (sql as unknown as { options: { onnotice: unknown } })
            .options
        assertEquals(options.onnotice, onnotice)
    } finally {
        await sql.end()
    }
})
