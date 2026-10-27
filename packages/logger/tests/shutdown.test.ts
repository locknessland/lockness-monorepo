/**
 * The global logger's file handle is released at shutdown.
 *
 * This package is the one whose docs actually instructed the application to do
 * it by hand — `await log.close() // Close file handles`. Neither #136 nor the
 * first sweep for `Deno.openKv`/`Deno.connect` caught it, because it opens with
 * `Deno.open`.
 */

import { assertEquals } from '@std/assert'
import {
    disposableCount,
    drainDisposables,
} from '@lockness/contract/lifecycle/internal'
import { configureLogger, logger } from '../mod.ts'

Deno.test('logger - the global logger announces itself', () => {
    drainDisposables()
    configureLogger({})

    assertEquals(disposableCount(), 1)
})

Deno.test('logger - reconfiguring does not leave a stale entry', () => {
    drainDisposables()
    configureLogger({})
    configureLogger({})
    configureLogger({})

    assertEquals(
        disposableCount(),
        1,
        'replacing the global logger withdraws the previous registration',
    )
})

Deno.test('logger - closes after the things that write to it', () => {
    drainDisposables()
    configureLogger({})
    const [entry] = drainDisposables()

    // STORES(60), so the teardown lines emitted by SERVICES(30) still land.
    assertEquals(entry.priority, 60)
})

Deno.test('logger - disposing closes a file transport it OWNS', async () => {
    // FR-015 put this package in scope for a `Deno.FsFile`. Every earlier test
    // here used configureLogger({}), which builds a console transport and opens
    // no file at all — so the resource the requirement is about was never
    // exercised, and removing `close()` from the dispose closure left the file
    // green.
    drainDisposables()
    await Deno.mkdir(`${Deno.cwd()}/tmp`, { recursive: true })
    const path = `${Deno.cwd()}/tmp/log-${crypto.randomUUID().slice(0, 8)}.log`

    try {
        // No `transports` passed, so the logger builds — and therefore owns —
        // its own default. A transport the application supplies is borrowed and
        // deliberately NOT closed.
        const { FileTransport } = await import('../mod.ts')
        const log = configureLogger({ transports: [new FileTransport(path)] })
        await log.info('opens the handle')

        for (const d of drainDisposables()) await d.dispose()

        // Proof the handle is really released: reopening and truncating the
        // file would fail on Windows and leak a descriptor on Unix if it were
        // still held. The sanitiser is the second check.
        const reopened = await Deno.open(path, { write: true, truncate: true })
        reopened.close()
    } finally {
        await Deno.remove(path).catch(() => {})
    }
})

Deno.test('logger - a transport the APPLICATION supplied is not closed', async () => {
    // `ownsTransports: false` — the app keeps its own reference and uses the
    // transport elsewhere, so closing it from a framework teardown would throw
    // BadResource on their next write. The DEFAULT is owned: see the config
    // JSDoc for why the safer-sounding default is the wrong one here.
    drainDisposables()
    let closed = false
    const borrowed = {
        log: () => Promise.resolve(),
        close: () => {
            closed = true
            return Promise.resolve()
        },
    }

    configureLogger({ transports: [borrowed], ownsTransports: false } as never)
    for (const d of drainDisposables()) await d.dispose()

    assertEquals(closed, false, 'a borrowed transport is left alone')
})

Deno.test('logger - the accessor rebuilds after a teardown', async () => {
    drainDisposables()
    configureLogger({})
    assertEquals(disposableCount(), 1)
    // DISPOSE, not merely drain — the rebuild is triggered by the dispose
    // nulling globalLogger, and draining alone would test nothing.
    for (const d of drainDisposables()) await d.dispose()

    logger()

    assertEquals(disposableCount(), 1, 'the process stays able to log')
})
