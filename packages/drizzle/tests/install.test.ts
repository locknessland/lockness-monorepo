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
import { CommandFailedError } from '@lockness/cli/command-failure'
import install, {
    checkProjectStructure,
    createDatabaseSeeder,
    createDirectories,
    createDrizzleConfig,
    mapDrizzleKit,
    ProjectStructureError,
    type SqlConnector,
    testDatabaseConnection,
    updateSingleEnvFile,
} from '../install.ts'
import { fromFileUrl, join } from '@std/path'
import { DRIZZLE_KIT_SPECIFIER } from '../generators/dialect_schema.ts'

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

Deno.test('#437 mapDrizzleKit - maps drizzle-kit to the pinned specifier in deno.json', async () => {
    await withTempCwd(async () => {
        await Deno.writeTextFile(
            './deno.json',
            JSON.stringify({
                imports: { 'drizzle-orm': 'npm:drizzle-orm@^0.36.3' },
            }),
        )

        assertEquals(await mapDrizzleKit(), true)

        const config = JSON.parse(await Deno.readTextFile('./deno.json'))
        assertEquals(config.imports, {
            'drizzle-orm': 'npm:drizzle-orm@^0.36.3',
            'drizzle-kit': DRIZZLE_KIT_SPECIFIER,
        })
    })
})

Deno.test('#437 mapDrizzleKit - leaves an existing drizzle-kit mapping alone', async () => {
    await withTempCwd(async () => {
        await Deno.writeTextFile(
            './deno.json',
            JSON.stringify({
                imports: { 'drizzle-kit': 'npm:drizzle-kit@0.30.0' },
            }),
        )

        assertEquals(await mapDrizzleKit(), false)

        const config = JSON.parse(await Deno.readTextFile('./deno.json'))
        assertEquals(config.imports['drizzle-kit'], 'npm:drizzle-kit@0.30.0')
    })
})

Deno.test('#437 mapDrizzleKit - creates the imports map when there is none', async () => {
    await withTempCwd(async () => {
        await Deno.writeTextFile('./deno.json', JSON.stringify({ tasks: {} }))

        assertEquals(await mapDrizzleKit(), true)

        const config = JSON.parse(await Deno.readTextFile('./deno.json'))
        assertEquals(config.tasks, {})
        assertEquals(config.imports, { 'drizzle-kit': DRIZZLE_KIT_SPECIFIER })
    })
})

Deno.test('#437 the specifier is exactly pinned, and the init kits and the repo map the same one', async () => {
    assert(
        /^npm:drizzle-kit@\d+\.\d+\.\d+$/.test(DRIZZLE_KIT_SPECIFIER),
        DRIZZLE_KIT_SPECIFIER,
    )
    const root = new URL('../../../', import.meta.url)
    for (
        const path of [
            'packages/init/stubs/kits/web/deno.json.stub',
            'packages/init/stubs/kits/api/deno.json.stub',
            'deno.jsonc',
        ]
    ) {
        const text = await Deno.readTextFile(new URL(path, root))
        assertStringIncludes(
            text,
            `"drizzle-kit": "${DRIZZLE_KIT_SPECIFIER}"`,
            path,
        )
    }
})

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

Deno.test('checkProjectStructure - throws a CommandFailedError and prints nothing itself', async () => {
    await withTempCwd(async () => {
        const errors: unknown[][] = []
        const muted = console.error
        console.error = (...line: unknown[]) => void errors.push(line)
        try {
            // Empty dir: neither ./src nor ./deno.json exist.
            const error = await assertRejects(
                () => checkProjectStructure(),
                ProjectStructureError,
                'Missing src directory. Please run this command from your project root.',
            )
            // Same public name, now under the exit contract (#436).
            assert(error instanceof CommandFailedError)
            assertEquals(error.name, 'ProjectStructureError')
            assertEquals(error.exitCode, 1)
            // The printer prints the failure once; the check prints nothing.
            assertEquals(errors, [])
        } finally {
            console.error = muted
        }
    })
})

/**
 * Lay out a project the installer accepts: `src/`, and a `deno.json` that
 * already registers drizzle, so `addPackage` has nothing to write.
 */
async function arrangeProject(): Promise<void> {
    await Deno.mkdir('./src', { recursive: true })
    await Deno.writeTextFile(
        './deno.json',
        JSON.stringify({ lockness: { packages: ['drizzle'] } }),
    )
}

/** Run `fn` with `DATABASE_URL` unset, so the installer opens no connection. */
async function withoutDatabaseUrl(fn: () => Promise<void>): Promise<void> {
    const previous = Deno.env.get('DATABASE_URL')
    Deno.env.delete('DATABASE_URL')
    try {
        await fn()
    } finally {
        if (previous !== undefined) Deno.env.set('DATABASE_URL', previous)
    }
}

Deno.test('#436 install - rejects outside a project with ProjectStructureError, writing nothing', async () => {
    await withTempCwd(async () => {
        await assertRejects(() => install(), ProjectStructureError)
        await assertRejects(
            () => Deno.stat('./drizzle.config.ts'),
            Deno.errors.NotFound,
        )
    })
})

Deno.test('#436 install - sets the project up and resolves', async () => {
    await withoutDatabaseUrl(() =>
        withTempCwd(async () => {
            await arrangeProject()

            await install()

            assert((await Deno.stat('./app/model')).isDirectory)
            assert((await Deno.stat('./drizzle.config.ts')).isFile)
            assert(
                (await Deno.stat('./database/seeders/database_seeder.ts'))
                    .isFile,
            )
            assertStringIncludes(
                await Deno.readTextFile('./.env'),
                'DATABASE_URL=',
            )
        })
    )
})

Deno.test('#436 install - finishes every step, then fails naming the directory it could not create', async () => {
    await withoutDatabaseUrl(() =>
        withTempCwd(async () => {
            await arrangeProject()
            await Deno.mkdir('./app', { recursive: true })
            await Deno.writeTextFile('./app/model', 'not a directory')

            const error = await assertRejects(
                () => install(),
                CommandFailedError,
                '1 of 9 steps failed: ./app/model',
            )
            assert(error.cause !== undefined, 'the mkdir error is the cause')

            // The steps after the failed one still ran (FR-010).
            assert((await Deno.stat('./app/repository')).isDirectory)
            assert((await Deno.stat('./drizzle.config.ts')).isFile)
            const config = JSON.parse(await Deno.readTextFile('./deno.json'))
            assertEquals(config.imports['drizzle-kit'], DRIZZLE_KIT_SPECIFIER)
            assertStringIncludes(
                await Deno.readTextFile('./.env.example'),
                'DATABASE_URL=',
            )
        })
    )
})

/**
 * Run `install.ts` as the standalone tool it is, in `cwd`, with no
 * `DATABASE_URL`, and return its status and stderr lines.
 */
async function runInstaller(
    cwd: string,
): Promise<{ readonly code: number; readonly stderr: string }> {
    const env = Deno.env.toObject()
    delete env.DATABASE_URL
    const { code, stderr } = await new Deno.Command(Deno.execPath(), {
        args: [
            'run',
            '-A',
            '--config',
            fromFileUrl(new URL('../../../deno.jsonc', import.meta.url)),
            fromFileUrl(new URL('../install.ts', import.meta.url)),
        ],
        cwd,
        env,
        clearEnv: true,
        stdout: 'null',
        stderr: 'piped',
    }).output()
    return { code, stderr: new TextDecoder().decode(stderr) }
}

/** Assert `stderr` holds exactly one `❌` line and no uncaught-error dump. */
function assertOneFailureLine(stderr: string): string {
    const failures = stderr.split('\n').filter((l) => l.startsWith('❌'))
    assertEquals(failures.length, 1, stderr)
    assert(!stderr.includes('error: Uncaught'), stderr)
    return failures[0]
}

Deno.test('#436 install.ts run standalone outside a project exits 1 with one ❌ line', async () => {
    const dir = await Deno.makeTempDir({ prefix: 'lockness_drizzle_install_' })
    try {
        const { code, stderr } = await runInstaller(dir)

        assertEquals(code, 1, stderr)
        assertStringIncludes(
            assertOneFailureLine(stderr),
            'Missing src directory',
        )
        assert(!stderr.includes('✗'), `no second, ✗-prefixed line: ${stderr}`)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('#436 install.ts run standalone exits 1 when a step fails, after the others ran', async () => {
    const dir = await Deno.makeTempDir({ prefix: 'lockness_drizzle_install_' })
    try {
        await Deno.mkdir(join(dir, 'src'))
        await Deno.writeTextFile(
            join(dir, 'deno.json'),
            JSON.stringify({ lockness: { packages: ['drizzle'] } }),
        )
        await Deno.mkdir(join(dir, 'app'))
        await Deno.writeTextFile(join(dir, 'app', 'model'), 'not a directory')

        const { code, stderr } = await runInstaller(dir)

        assertEquals(code, 1, stderr)
        assert(
            assertOneFailureLine(stderr).startsWith(
                '❌ 1 of 9 steps failed: ./app/model caused by: ',
            ),
            stderr,
        )
        assert((await Deno.stat(join(dir, 'drizzle.config.ts'))).isFile)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
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
