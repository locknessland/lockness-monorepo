#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Drizzle package installer for Lockness projects.
 *
 * Automatically configures the @lockness/drizzle package in a project,
 * creating necessary configuration files, directories, and environment
 * variables.
 *
 * The work is the default-exported {@link install}, which reports failure by
 * throwing and never touches process state. Run standalone, the module hands
 * it to `runEntry`, which prints a failure once and exits non-zero (#436).
 *
 * @module @lockness/drizzle/install
 *
 * @example
 * ```bash
 * # Install via JSR
 * deno run -A jsr:@lockness/drizzle/install
 *
 * # Or via CLI
 * deno task cli package:install drizzle
 * ```
 */

import { addPackage, Stub } from '@lockness/cli'
import {
    CommandFailedError,
    type CommandStep,
    runSteps,
} from '@lockness/cli/command-failure'
import { runEntry } from '@lockness/cli/entry'
import { renderError } from '@lockness/contract'
import { dirname, fromFileUrl, join } from '@std/path'
import postgres from 'postgres'
import { resolveDialect } from './drivers.ts'
import { consoleNoticeReporter, reportNotice } from './notice.ts'
import {
    DRIZZLE_KIT_DIALECT,
    DRIZZLE_KIT_SPECIFIER,
} from './generators/dialect_schema.ts'

// =============================================================================
// Types
// =============================================================================

/**
 * Project structure check definition.
 */
interface StructureCheck {
    /** Path to check */
    readonly path: string
    /** Human-readable name */
    readonly name: string
}

// =============================================================================
// Constants
// =============================================================================

/** Default database connection URL template */
const DEFAULT_DATABASE_URL =
    'DATABASE_URL=postgres://user:password@localhost:5432/mydb' as const

/** Directories to create during installation */
const REQUIRED_DIRECTORIES: readonly string[] = [
    './database/migrations',
    './database/seeders',
    './app/model',
    './app/repository',
] as const

/** Project structure requirements */
const STRUCTURE_CHECKS: readonly StructureCheck[] = [
    { path: './src', name: 'src directory' },
    { path: './deno.json', name: 'deno.json' },
] as const

// =============================================================================
// Stub Path Resolution
// =============================================================================

/**
 * Resolve the stubs directory path.
 * Handles both local (file://) and remote (https://) imports.
 *
 * @returns The resolved stubs directory path
 */
function resolveStubsDir(): string {
    if (import.meta.url.startsWith('file://')) {
        const currentDir = dirname(fromFileUrl(import.meta.url))
        return join(currentDir, 'stubs')
    }
    return new URL('./stubs', import.meta.url).href
}

// =============================================================================
// Installation Functions
// =============================================================================

/**
 * Whether `path` exists.
 *
 * Only `NotFound` means absent. Any other stat failure — permission denied, a
 * symlink loop — is re-thrown: a helper that took it for absence would go on
 * to write over a file it merely could not inspect.
 *
 * @param path - The path to stat.
 * @returns True if the path exists, false if it does not.
 * @throws Any stat error other than `Deno.errors.NotFound`.
 */
async function exists(path: string): Promise<boolean> {
    try {
        await Deno.stat(path)
        return true
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return false
        throw error
    }
}

/**
 * Create the drizzle.config.ts configuration file.
 *
 * Skips creation if the file already exists. The `drizzle-kit` dialect is
 * resolved from the configured `DATABASE_URL` scheme (falling back to
 * `postgresql`), so migrations are generated and run against the active
 * database rather than always assuming PostgreSQL.
 *
 * @returns True if the file was created, false if it already existed
 * @throws When the path exists but cannot be stat'ed, or the write fails.
 */
export async function createDrizzleConfig(): Promise<boolean> {
    const configPath = './drizzle.config.ts'

    if (await exists(configPath)) {
        console.log('ℹ️  drizzle.config.ts already exists, skipping...')
        return false
    }
    const dialect = resolveDialect(
        undefined,
        Deno.env.get('DATABASE_URL') ?? '',
    )
    const content = await Stub.renderFrom(
        resolveStubsDir(),
        '',
        'drizzle.config.ts',
        { dialect: DRIZZLE_KIT_DIALECT[dialect] },
    )

    await Deno.writeTextFile(configPath, content)
    console.log('✓ Created drizzle.config.ts')
    return true
}

/**
 * Map `drizzle-kit` in the project's `deno.json` import map (#437).
 *
 * The generated `drizzle.config.ts` imports `defineConfig` from
 * `drizzle-kit`, and `db:fresh` imports that file — so without the mapping
 * the config cannot be loaded. The specifier is the exactly pinned one the
 * `db:*` commands run; the `npm:` registry is a hard-rule-2 exception,
 * justified at {@link DRIZZLE_KIT_SPECIFIER}. An existing mapping is the
 * project's choice and is left alone.
 *
 * @param path - The project's `deno.json`.
 * @returns True if the mapping was added, false if one already existed.
 * @throws When the file cannot be read, parsed or written.
 */
export async function mapDrizzleKit(
    path: string = './deno.json',
): Promise<boolean> {
    const config = JSON.parse(await Deno.readTextFile(path))
    const imports: Record<string, string> = config.imports ?? {}
    if (imports['drizzle-kit'] !== undefined) {
        console.log(
            'ℹ️  drizzle-kit is already mapped in deno.json, skipping...',
        )
        return false
    }
    config.imports = { ...imports, 'drizzle-kit': DRIZZLE_KIT_SPECIFIER }
    await Deno.writeTextFile(path, JSON.stringify(config, null, 2) + '\n')
    console.log(`✓ Mapped drizzle-kit to ${DRIZZLE_KIT_SPECIFIER} in deno.json`)
    return true
}

/**
 * One step per required directory, labelled with its path, so a failure names
 * the directory it could not create.
 *
 * A directory that already exists passes (`recursive: true`); a path taken by
 * a file, or one the process may not write, fails its step.
 *
 * @returns The steps, in {@link REQUIRED_DIRECTORIES} order.
 */
function directorySteps(): CommandStep[] {
    return REQUIRED_DIRECTORIES.map((dir) => ({
        label: dir,
        run: async () => {
            await Deno.mkdir(dir, { recursive: true })
            console.log(`✓ Created ${dir}`)
        },
    }))
}

/**
 * Create required directories for the Drizzle setup.
 *
 * Creates directories recursively; one that already exists is left as it is.
 * Every directory is attempted, then one failure names those that could not be
 * created.
 *
 * @throws {CommandFailedError} When at least one directory could not be
 *   created; the first error is its `cause`.
 */
export async function createDirectories(): Promise<void> {
    await runSteps(directorySteps())
}

/**
 * Create the main DatabaseSeeder file.
 *
 * Skips creation if the file already exists.
 *
 * @returns True if the file was created, false if it already existed
 * @throws When the path exists but cannot be stat'ed, or the write fails.
 */
export async function createDatabaseSeeder(): Promise<boolean> {
    const seederPath = './database/seeders/database_seeder.ts'

    if (await exists(seederPath)) {
        console.log('ℹ️  database_seeder.ts already exists, skipping...')
        return false
    }
    const content = await Stub.renderFrom(
        resolveStubsDir(),
        '',
        'database_seeder',
        {},
    )

    await Deno.writeTextFile(seederPath, content)
    console.log('✓ Created database/seeders/database_seeder.ts')
    return true
}

/**
 * Update environment files with DATABASE_URL.
 *
 * Updates both .env and .env.example files, creating them if necessary.
 */
async function updateEnvFile(): Promise<void> {
    await updateSingleEnvFile('./.env')
    await updateSingleEnvFile('./.env.example')
}

/**
 * Update a single environment file with DATABASE_URL.
 *
 * A missing file is created. A file that exists but cannot be read is left
 * exactly as it is and the call fails: writing it as if it were absent would
 * replace the user's settings with the one `DATABASE_URL` line.
 *
 * @param envPath - Path to the environment file
 * @throws Any read error other than `Deno.errors.NotFound`, or a write error.
 */
export async function updateSingleEnvFile(envPath: string): Promise<void> {
    const isExample = envPath.includes('.example')
    const fileLabel = isExample ? '.env.example' : '.env'

    const envContent = await readIfPresent(envPath)
    if (envContent === undefined) {
        await Deno.writeTextFile(
            envPath,
            `# Database\n${DEFAULT_DATABASE_URL}\n`,
        )
        console.log(`✓ Created ${fileLabel} with DATABASE_URL`)
    } else if (envContent.includes('DATABASE_URL')) {
        console.log(`ℹ️  DATABASE_URL already exists in ${fileLabel}`)
    } else {
        await Deno.writeTextFile(
            envPath,
            `${envContent}\n\n# Database\n${DEFAULT_DATABASE_URL}\n`,
        )
        console.log(`✓ Added DATABASE_URL to ${fileLabel}`)
    }
}

/**
 * Read a text file, or `undefined` when it does not exist.
 *
 * @param path - The file to read.
 * @returns Its contents, or `undefined` on `Deno.errors.NotFound`.
 * @throws Any other read error.
 */
async function readIfPresent(path: string): Promise<string | undefined> {
    try {
        return await Deno.readTextFile(path)
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return undefined
        throw error
    }
}

/**
 * Raised when the project is missing a file the installer requires, or when
 * the installer cannot tell whether it is there.
 *
 * A {@link CommandFailedError}, so whoever runs the installer — `runEntry`
 * standalone, or `Cli.dispatch` — prints its one-line message once and exits
 * `1` (#436). The check itself prints nothing.
 */
export class ProjectStructureError extends CommandFailedError {
    /**
     * @param name - Human-readable name of the file/directory.
     * @param options - The stat error, when the path could not be checked;
     *   the message then says so instead of calling it missing.
     */
    constructor(name: string, options: { readonly cause?: unknown } = {}) {
        super(
            options.cause === undefined
                ? `Missing ${name}. Please run this command from your project root.`
                : `Could not check ${name}.`,
            options,
        )
        this.name = 'ProjectStructureError'
    }
}

/**
 * Verify the project has the required structure.
 *
 * @throws {ProjectStructureError} If a required file/directory is missing,
 *   or cannot be stat'ed — then with the stat error as its `cause`.
 */
export async function checkProjectStructure(): Promise<void> {
    for (const check of STRUCTURE_CHECKS) {
        let present: boolean
        try {
            present = await exists(check.path)
        } catch (error) {
            throw new ProjectStructureError(check.name, { cause: error })
        }
        if (!present) throw new ProjectStructureError(check.name)
    }
}

/**
 * Minimal shape of the postgres.js client used by the connectivity probe:
 * callable as a tagged template, plus `end()`.
 */
interface SqlProbe {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
    end(): Promise<void>
}

/**
 * Opens a SQL client for a connection string. Injectable so the probe can be
 * tested without a real database.
 *
 * @param url - The PostgreSQL connection string.
 * @param options - The client options the probe decides: its `onnotice`
 *   (#454). A connector that takes only the url still type-checks.
 * @returns A minimal SQL client.
 */
export type SqlConnector = (
    url: string,
    options: { readonly onnotice: (notice: unknown) => void },
) => SqlProbe

/**
 * Production connector: the real postgres.js client, options passed through.
 * Constructing it opens no connection.
 *
 * @param url - The PostgreSQL connection string.
 * @param options - Forwarded to postgres.js as they are.
 * @returns The postgres.js client, as a {@link SqlProbe}.
 * @internal Exported for tests (#454): a connector that drops `options`
 *   brings back postgres.js's raw notice dump.
 *
 * @example
 * ```ts
 * const sql = defaultConnector(url, { onnotice: () => {} })
 * ```
 */
export const defaultConnector: SqlConnector = (url, options) =>
    postgres(url, options) as unknown as SqlProbe

/**
 * Test the database connection using the configured DATABASE_URL.
 *
 * Prints connection status to the console. A server notice the probe raises
 * follows the console notice policy (#454): a `WARNING` is one stderr line,
 * anything quieter is discarded. The installer boots no kernel, so there is
 * no logger to route to.
 *
 * @param connect - SQL connector to use; defaults to the real postgres client.
 */
export async function testDatabaseConnection(
    connect: SqlConnector = defaultConnector,
): Promise<void> {
    const databaseUrl = Deno.env.get('DATABASE_URL')

    if (!databaseUrl) {
        console.log(
            '\n⚠️  DATABASE_URL not set. Please configure your database connection in .env',
        )
        return
    }

    console.log('\n🔌 Testing database connection...')

    const sql = connect(databaseUrl, {
        onnotice: (notice) => reportNotice(notice, consoleNoticeReporter),
    })
    try {
        await sql`SELECT 1`
        console.log('✓ Database connection successful!')
    } catch (error) {
        // A driver error can embed the DSN, password included: rendered,
        // never interpolated raw.
        console.log(`✗ Database connection failed: ${renderError(error)}`)
        console.log(
            '\n💡 Make sure your database is running and DATABASE_URL is correct',
        )
    } finally {
        await sql.end()
    }
}

/**
 * Print post-installation instructions.
 */
function showNextSteps(): void {
    console.log('\n📦 @lockness/drizzle installation complete!\n')
    console.log('Next steps:')
    console.log(
        '  1. Update DATABASE_URL in .env with your database credentials',
    )
    console.log('  2. Create your first model:')
    console.log('     deno task cli make:model User -a')
    console.log('  3. Generate and run migrations:')
    console.log('     deno task cli db:generate')
    console.log('     deno task cli db:migrate')
    console.log('  4. Explore with Drizzle Studio:')
    console.log('     dx drizzle-kit studio')
    console.log('\n📖 Documentation: https://lockness.land/docs/models')
}

// =============================================================================
// Main Installation
// =============================================================================

/**
 * Install `@lockness/drizzle` into the project in the current directory.
 *
 * Orchestrates the complete installation process:
 * 1. Verify project structure — a missing file stops here, before anything is
 *    written
 * 2. Create directories
 * 3. Create configuration files, and map `drizzle-kit` in `deno.json`
 * 4. Update environment files
 * 5. Register package
 * 6. Test database connection
 * 7. Show next steps
 *
 * Steps 2 to 5 run with `runSteps`: each runs whatever the one before it did,
 * then one failure names those that failed (#436, finish then fail), and the
 * connection test and next steps are skipped. A failed connection test is
 * only a warning: the installation itself succeeded.
 *
 * @returns A promise that resolves once the project is set up.
 * @throws {ProjectStructureError} When `./src` or `./deno.json` is missing.
 * @throws {CommandFailedError} When at least one setup step failed; the first
 *   failure is its `cause`.
 *
 * @example
 * ```ts
 * import install from '@lockness/drizzle/install'
 *
 * await install()
 * ```
 */
export default async function install(): Promise<void> {
    console.log('🔧 Installing @lockness/drizzle...\n')

    await checkProjectStructure()
    await runSteps([
        ...directorySteps(),
        // Each helper resolves to whether it wrote anything; a step only
        // needs it to settle, so the boolean is awaited and dropped.
        {
            label: 'drizzle.config.ts',
            run: async () => void await createDrizzleConfig(),
        },
        {
            label: 'drizzle-kit mapping',
            run: async () => void await mapDrizzleKit(),
        },
        {
            label: 'database_seeder.ts',
            run: async () => void await createDatabaseSeeder(),
        },
        { label: '.env files', run: updateEnvFile },
        { label: 'package registration', run: () => addPackage('drizzle') },
    ])

    await testDatabaseConnection()
    showNextSteps()
}

// =============================================================================
// Execution
// =============================================================================

if (import.meta.main) await runEntry('drizzle install', install)
