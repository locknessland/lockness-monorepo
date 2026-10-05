/**
 * @fileoverview No `db:*` path supplies a default database (#443, #555).
 *
 * `DATABASE_URL` is the single source of a target. The rendered
 * `drizzle.config.ts` names it or names nothing, and `initDatabase` refuses
 * rather than fall back — so `db:fresh` (which reads the config) and `db:seed`
 * (which reads the variable) agree on the same database, or both refuse.
 *
 * - **T2** renders the drizzle stub into a directory under the working
 *   directory (so the workspace import map resolves `drizzle-kit`) and loads
 *   it through the real migration-settings loader.
 * - **T3** renders the stub once per dialect and pins that no URL, fallback
 *   or unrendered placeholder survives.
 *
 * Every URL is assembled at run time: no literal DSN sits in this file.
 *
 * @module @lockness/drizzle/tests/no_default_target
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { CommandFailedError } from '@lockness/cli/command-failure'
import { container } from '@lockness/container'
import { Database } from '../mod.ts'
import {
    type MaintenanceOpener,
    registerDrizzleCommands,
    type SeederLoader,
} from '../cli_commands.ts'
import { createDrizzleConfig } from '../install.ts'

type Handler = (args: string[]) => void | Promise<void>

/** A CLI that records registrations and lets a test invoke one by name. */
class FakeCli {
    readonly commands = new Map<string, Handler>()

    register(name: string, handler: Handler): void {
        this.commands.set(name, handler)
    }

    run(name: string): Promise<void> {
        const handler = this.commands.get(name)
        if (!handler) throw new Error(`command not registered: ${name}`)
        return Promise.resolve(handler([]))
    }
}

/** Build a fake DSN at run time: `<scheme>:` + `rest`. */
const dsn = (scheme: string, rest: string): string => [scheme, rest].join(':')

/** A postgres DSN for a throwaway, never-contacted host. */
const PG_URL = dsn('postgres', '//app@db.invalid:5432/app')

/**
 * Run `fn` with `DATABASE_URL`, `APP_ENV` and `DENO_ENV` set as given
 * (`undefined` deletes), restoring every prior value afterwards.
 */
async function withEnv(
    env: Readonly<Record<string, string | undefined>>,
    fn: () => Promise<void>,
): Promise<void> {
    const prev = new Map(
        Object.keys(env).map((key) => [key, Deno.env.get(key)]),
    )
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) Deno.env.delete(key)
        else Deno.env.set(key, value)
    }
    try {
        await fn()
    } finally {
        for (const [key, value] of prev) {
            if (value === undefined) Deno.env.delete(key)
            else Deno.env.set(key, value)
        }
    }
}

/** Run `fn` with the console silenced, returning what it threw. */
async function quietly(fn: () => Promise<void>): Promise<unknown> {
    const { log, error } = console
    console.log = () => {}
    console.error = () => {}
    try {
        await fn()
        return undefined
    } catch (caught) {
        return caught
    } finally {
        console.log = log
        console.error = error
    }
}

/**
 * Render `drizzle.config.ts` through `createDrizzleConfig` into a fresh
 * directory under `<cwd>/tmp/` holding a one-entry migrations journal, and run
 * `fn` with that directory as the working directory. A fresh directory per
 * call: the module cache would otherwise hand back a config evaluated under
 * another test's environment.
 */
async function withRenderedApp(fn: () => Promise<void>): Promise<void> {
    const cwd = Deno.cwd()
    const dir = join(cwd, 'tmp', `drizzle-443-${crypto.randomUUID()}`)
    const migrations = join(dir, 'database', 'migrations')
    await Deno.mkdir(join(migrations, 'meta'), { recursive: true })
    try {
        await Deno.writeTextFile(
            join(migrations, 'meta', '_journal.json'),
            JSON.stringify({
                entries: [{ tag: '0000_init', when: 1, breakpoints: true }],
            }),
        )
        await Deno.writeTextFile(
            join(migrations, '0000_init.sql'),
            'CREATE TABLE "users" ("id" integer);',
        )
        Deno.chdir(dir)
        assertEquals(
            await quietly(async () => {
                assertEquals(await createDrizzleConfig(), true)
            }),
            undefined,
        )
        await fn()
    } finally {
        Deno.chdir(cwd)
        await Deno.remove(dir, { recursive: true })
    }
}

/**
 * Run `db:fresh` and `db:seed` against the rendered config, with every
 * connection faked at its last seam: `db:fresh`'s opener and `db:seed`'s
 * driver factory record the url they were handed, then refuse.
 */
async function runBoth(): Promise<{
    readonly freshUrls: string[]
    readonly seedUrls: string[]
    readonly freshError: unknown
    readonly seedError: unknown
    readonly seedersLoaded: number
}> {
    const freshUrls: string[] = []
    const seedUrls: string[] = []
    let seedersLoaded = 0
    const openMaintenance: MaintenanceOpener = (settings) => {
        freshUrls.push(settings.url)
        return Promise.reject(new Error('opener reached'))
    }
    const loadSeeder: SeederLoader = () => {
        seedersLoaded++
        return Promise.resolve({})
    }
    container.delete(Database)
    try {
        container.get(Database).setDriverFactory('postgres', (url) => {
            seedUrls.push(url)
            return Promise.reject(new Error('driver reached'))
        })
        const cli = new FakeCli()
        registerDrizzleCommands(cli, { openMaintenance, loadSeeder })
        const freshError = await quietly(() => cli.run('db:fresh'))
        const seedError = await quietly(() => cli.run('db:seed'))
        return { freshUrls, seedUrls, freshError, seedError, seedersLoaded }
    } finally {
        container.delete(Database)
    }
}

Deno.test('#443 T2 db:fresh and db:seed resolve the same url from the rendered config', async () => {
    await withEnv(
        { DATABASE_URL: PG_URL, APP_ENV: undefined, DENO_ENV: undefined },
        () =>
            withRenderedApp(async () => {
                const run = await runBoth()

                assertEquals(run.freshUrls, [PG_URL])
                assertEquals(run.seedUrls, [PG_URL])
                assert(run.freshError instanceof CommandFailedError)
                assert(run.seedError instanceof CommandFailedError)
                assertEquals(run.seedersLoaded, 0)
            }),
    )
})

Deno.test('#443 T2 with DATABASE_URL unset, db:fresh and db:seed both refuse without connecting', async () => {
    await withEnv(
        { DATABASE_URL: undefined, APP_ENV: undefined, DENO_ENV: undefined },
        () =>
            withRenderedApp(async () => {
                const run = await runBoth()

                assertEquals(run.freshUrls, [], 'db:fresh opened a connection')
                assertEquals(run.seedUrls, [], 'db:seed built a client')
                assert(run.freshError instanceof CommandFailedError)
                assertStringIncludes(run.freshError.message, 'dbCredentials')
                assert(run.seedError instanceof CommandFailedError)
                assertStringIncludes(
                    run.seedError.message,
                    'DATABASE_URL is not set',
                )
                assertEquals(run.seedersLoaded, 0)
            }),
    )
})

/** One rendering per dialect, keyed by the scheme the dialect resolves from. */
const DIALECTS: ReadonlyArray<readonly [url: string, kitDialect: string]> = [
    [PG_URL, 'postgresql'],
    [dsn('mysql', '//app@db.invalid:3306/app'), 'mysql'],
    [dsn('file', './local.db'), 'sqlite'],
]

for (const [url, kitDialect] of DIALECTS) {
    Deno.test(`#555 T3 the ${kitDialect} drizzle.config.ts names no url and no fallback`, async () => {
        const cwd = Deno.cwd()
        const tmp = await Deno.makeTempDir()
        try {
            Deno.chdir(tmp)
            await withEnv({ DATABASE_URL: url }, async () => {
                assertEquals(
                    await quietly(async () => {
                        assertEquals(await createDrizzleConfig(), true)
                    }),
                    undefined,
                )
            })
            const content = await Deno.readTextFile('./drizzle.config.ts')

            assertStringIncludes(content, `dialect: '${kitDialect}'`)
            assertEquals(
                content.includes('{{'),
                false,
                'unrendered placeholder',
            )
            assertEquals(content.includes('://'), false, 'a url was rendered')
            assertEquals(/\|\||\?\?/.test(content), false, 'a url fallback')
            // The literal packages/init/tests/kits.test.ts pins in the kit
            // stub: the two files cannot import each other, so parity rests
            // on both tests holding the same line.
            assertStringIncludes(
                content,
                '...(url ? { dbCredentials: { url } } : {})',
            )
        } finally {
            Deno.chdir(cwd)
            await Deno.remove(tmp, { recursive: true })
        }
    })
}
