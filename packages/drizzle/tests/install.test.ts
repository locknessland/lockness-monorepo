/**
 * @fileoverview Hermetic tests for the Drizzle installer helpers (#180).
 *
 * Every test runs inside a throwaway temp directory (the installer works on
 * project-relative paths) and touches only the local filesystem — no database,
 * no process, no network. Fixtures use synthetic placeholder values only.
 *
 * @module @lockness/drizzle/tests/install
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import {
    checkProjectStructure,
    createDatabaseSeeder,
    createDirectories,
    createDrizzleConfig,
    ProjectStructureError,
    type SqlConnector,
    testDatabaseConnection,
    updateSingleEnvFile,
} from '../install.ts'

/** Silence the installer's console chatter for the duration of a test. */
function muteConsole(): () => void {
    const { log, error } = console
    console.log = () => {}
    console.error = () => {}
    return () => {
        console.log = log
        console.error = error
    }
}

/** Build a fake postgres client whose `SELECT 1` resolves or rejects. */
function fakeConnector(opts: { fail?: boolean } = {}) {
    let ended = false
    const sql = Object.assign(
        (_s: TemplateStringsArray, ..._v: unknown[]) =>
            opts.fail
                ? Promise.reject(new Error('unreachable'))
                : Promise.resolve([]),
        {
            end: () => {
                ended = true
                return Promise.resolve()
            },
        },
    )
    const connect: SqlConnector = () => sql
    return { connect, ended: () => ended }
}

/**
 * Run `fn` with the process cwd pointed at a fresh temp dir, then clean up.
 *
 * Note: `Deno.chdir` is process-global, so these tests rely on `deno test`
 * running a file's steps sequentially (the default — no `--parallel`).
 */
async function withTempCwd(fn: (dir: string) => Promise<void>): Promise<void> {
    const original = Deno.cwd()
    const dir = await Deno.makeTempDir({ prefix: 'lockness_drizzle_install_' })
    const restore = muteConsole()
    try {
        Deno.chdir(dir)
        await fn(dir)
    } finally {
        Deno.chdir(original)
        restore()
        await Deno.remove(dir, { recursive: true })
    }
}

Deno.test('createDirectories - creates the required project directories', async () => {
    await withTempCwd(async () => {
        await createDirectories()
        for (
            const dir of [
                './database/migrations',
                './database/seeders',
                './app/model',
                './app/repository',
            ]
        ) {
            const stat = await Deno.stat(dir)
            assert(stat.isDirectory, `${dir} should be a directory`)
        }
    })
})

Deno.test('updateSingleEnvFile - creates the file with DATABASE_URL when absent', async () => {
    await withTempCwd(async () => {
        await updateSingleEnvFile('./.env')
        const content = await Deno.readTextFile('./.env')
        assertStringIncludes(content, 'DATABASE_URL=')
    })
})

Deno.test('updateSingleEnvFile - appends DATABASE_URL to an existing file', async () => {
    await withTempCwd(async () => {
        await Deno.writeTextFile('./.env', 'APP_KEY=synthetic\n')
        await updateSingleEnvFile('./.env')
        const content = await Deno.readTextFile('./.env')
        assertStringIncludes(content, 'APP_KEY=synthetic')
        assertStringIncludes(content, 'DATABASE_URL=')
    })
})

Deno.test('updateSingleEnvFile - leaves an existing DATABASE_URL untouched', async () => {
    await withTempCwd(async () => {
        const existing = 'DATABASE_URL=postgres://user:pass@localhost:5432/db\n'
        await Deno.writeTextFile('./.env', existing)
        await updateSingleEnvFile('./.env')
        assertEquals(await Deno.readTextFile('./.env'), existing)
    })
})

Deno.test('createDrizzleConfig - creates then skips on second run', async () => {
    await withTempCwd(async () => {
        assertEquals(await createDrizzleConfig(), true)
        assert((await Deno.stat('./drizzle.config.ts')).isFile)
        // A second run must not overwrite — it reports "already exists".
        assertEquals(await createDrizzleConfig(), false)
    })
})

Deno.test('createDatabaseSeeder - creates then skips on second run', async () => {
    await withTempCwd(async () => {
        await Deno.mkdir('./database/seeders', { recursive: true })
        assertEquals(await createDatabaseSeeder(), true)
        assert(
            (await Deno.stat('./database/seeders/database_seeder.ts')).isFile,
        )
        assertEquals(await createDatabaseSeeder(), false)
    })
})

Deno.test('checkProjectStructure - passes when src/ and deno.json exist', async () => {
    await withTempCwd(async () => {
        await Deno.mkdir('./src', { recursive: true })
        await Deno.writeTextFile('./deno.json', '{}')
        // Resolves without calling Deno.exit — the success path.
        await checkProjectStructure()
    })
})

Deno.test('checkProjectStructure - throws when a required file is missing', async () => {
    await withTempCwd(async () => {
        // Empty dir: neither ./src nor ./deno.json exist.
        await assertRejects(
            () => checkProjectStructure(),
            ProjectStructureError,
        )
    })
})

Deno.test('testDatabaseConnection - returns early when DATABASE_URL is unset', async () => {
    const previous = Deno.env.get('DATABASE_URL')
    Deno.env.delete('DATABASE_URL')
    const restore = muteConsole()
    try {
        // No URL → no connection attempt; must resolve without throwing.
        await testDatabaseConnection()
    } finally {
        restore()
        if (previous !== undefined) Deno.env.set('DATABASE_URL', previous)
    }
})

Deno.test('testDatabaseConnection - probes and always closes the client', async (t) => {
    const previous = Deno.env.get('DATABASE_URL')
    Deno.env.set('DATABASE_URL', 'postgres://user:pass@localhost:5432/db')
    const restore = muteConsole()
    try {
        await t.step('closes on a successful probe', async () => {
            const fake = fakeConnector()
            await testDatabaseConnection(fake.connect)
            assert(fake.ended(), 'the client was closed')
        })
        await t.step('closes even when the probe fails', async () => {
            const fake = fakeConnector({ fail: true })
            await testDatabaseConnection(fake.connect) // swallowed + logged
            assert(fake.ended(), 'the client was closed despite the failure')
        })
    } finally {
        restore()
        if (previous === undefined) Deno.env.delete('DATABASE_URL')
        else Deno.env.set('DATABASE_URL', previous)
    }
})
