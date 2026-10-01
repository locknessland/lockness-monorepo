/**
 * @fileoverview CLI commands for Drizzle ORM database operations.
 *
 * Registers database-related CLI commands for migration management,
 * seeding, model generation, and database utilities.
 *
 * @module @lockness/drizzle/cli-commands
 *
 * @example
 * ```ts
 * import { registerDrizzleCommands } from '@lockness/drizzle'
 * import { cli } from './cli.ts'
 *
 * registerDrizzleCommands(cli)
 * ```
 */

import { dirname, fromFileUrl, join } from '@std/path'
// The dependency-free subpath, not the `@lockness/cli` barrel: this module is
// re-exported from `mod.ts`, which core loads at boot whenever a database is
// configured, and the barrel would pull every built-in command in with it.
import { CommandFailedError } from '@lockness/cli/command-failure'
import { container } from '@lockness/container'
import { Database } from './mod.ts'
import { handleMakeFactory } from './generators/factory_generator.ts'
import { handleMakeModel } from './generators/model_generator.ts'
import { handleMakeSeeder } from './generators/seeder_generator.ts'
import {
    ALLOW_PRODUCTION_FLAG,
    assertNotProduction,
} from './production_guard.ts'
import type { SchemaMaintenance } from './drivers.ts'
import { DRIZZLE_KIT_SPECIFIER } from './generators/dialect_schema.ts'
import {
    defaultLoadMigrationConfig,
    loadMigrationSettings,
    type MigrationConfigLoader,
    type MigrationSettings,
} from './migration_settings.ts'
import {
    describeResetScope,
    FreshRefusedError,
    resetDatabase,
} from './reset.ts'

/**
 * CLI command handler type.
 */
type CommandHandler = (args: string[]) => void | Promise<void>

/**
 * The one method of `@lockness/cli`'s `Cli` these commands need, kept
 * structural so a test can register them on a recording fake.
 *
 * A handler reports failure by throwing a {@link CommandFailedError}; the CLI
 * prints it once and exits non-zero (#428).
 */
interface Cli {
    register(name: string, handler: CommandHandler, description?: string): void
}

// =============================================================================
// Injectable I/O seams (testability)
// =============================================================================

/**
 * A process to spawn: an executable plus its argument vector.
 */
export interface CommandSpec {
    /** The executable to run (e.g. `'deno'`). */
    readonly cmd: string
    /** The argument vector passed to the executable. */
    readonly args: readonly string[]
}

/**
 * Command-runner port — spawns a process and resolves its exit code.
 *
 * The production default wraps {@link Deno.Command}; a test injects a fake that
 * records the constructed argv (asserting the `drizzle-kit` command line)
 * without ever executing it.
 *
 * @param spec - The command and arguments to run.
 * @returns The process exit code.
 */
export type CommandRunner = (spec: CommandSpec) => Promise<number>

/**
 * Minimal database connection port used by the `db:check` and `db:seed`
 * commands. {@link Database} satisfies it structurally.
 *
 * A value of this type is **configured**, not connected: obtaining it makes no
 * round trip (#420). Only {@link DbConnection.probe} talks to the database.
 */
export interface DbConnection {
    /** Verify connectivity (runs `SELECT 1`) — the one round trip. */
    probe(): Promise<void>
    /** Close the connection. */
    close(): Promise<void>
}

/**
 * Seeder-module loader port — resolves a seeder module from a project-relative
 * path.
 *
 * The production default dynamically imports it; a test injects a fake that
 * returns a synthetic module, keeping `db:seed` hermetic.
 *
 * @param relativePath - Path to the seeder file, relative to the project root.
 * @returns The imported module namespace.
 */
export type SeederLoader = (
    relativePath: string,
) => Promise<Record<string, unknown>>

/**
 * One open connection's schema-maintenance capability, plus the way to close
 * it — what `db:fresh` resets and migrates through (#435).
 */
export type MaintenanceSession = SchemaMaintenance & {
    /** Close the connection. Called on every path that opened it. */
    close(): Promise<void>
}

/**
 * Opens the connection `db:fresh` works on, from the settings read out of
 * `drizzle.config.ts` — the same url and dialect `drizzle-kit` would use.
 *
 * @param settings - The validated `db:fresh` settings.
 * @returns The open session.
 * @throws When the client cannot be configured, or has no maintenance
 *   capability (a refusal: nothing is dropped).
 */
export type MaintenanceOpener = (
    settings: MigrationSettings,
) => Promise<MaintenanceSession>

/**
 * The injectable I/O seams of the Drizzle CLI commands.
 *
 * Each field defaults to real I/O in {@link registerDrizzleCommands}; a test
 * overrides any subset to stay hermetic (no real database, process, or import).
 */
export interface DrizzleCommandDeps {
    /**
     * Connection port — resolves a configured {@link DbConnection}, or rejects
     * when the client cannot be configured.
     */
    readonly connect: () => Promise<DbConnection>
    /** Command-runner port wrapping {@link Deno.Command}. */
    readonly runCommand: CommandRunner
    /** Seeder-loader port replacing `db:seed`'s dynamic import. */
    readonly loadSeeder: SeederLoader
    /** `db:fresh`: loads the `drizzle.config.ts` default export. */
    readonly loadMigrationConfig: MigrationConfigLoader
    /** `db:fresh`: opens the connection it resets and migrates through. */
    readonly openMaintenance: MaintenanceOpener
}

/**
 * Seeder class constructor type.
 */
type SeederConstructor = new () => { run(): Promise<void> }

// =============================================================================
// Constants
// =============================================================================

/**
 * Drizzle Kit CLI command base. The `npm:` specifier is a hard-rule-2
 * exception, pinned exactly — see {@link DRIZZLE_KIT_SPECIFIER} (#437).
 */
const DRIZZLE_KIT_ARGS = ['run', '-A', DRIZZLE_KIT_SPECIFIER] as const

/** Directory for database seeders. Shared with the seeder generator. */
export const SEEDERS_DIR = './database/seeders' as const

// =============================================================================
// Stub Path Resolution
// =============================================================================

/**
 * Resolved path to the stubs directory.
 * Handles both local (file://) and remote (https://) imports.
 */
const STUBS_PATH: string = import.meta.url.startsWith('file://')
    ? join(dirname(fromFileUrl(import.meta.url)), 'stubs')
    : new URL('./stubs', import.meta.url).href

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Configure the container's database client from `DATABASE_URL`.
 *
 * `connect()` makes no round trip (#420), so its `success: false` — a missing
 * client package, or a URL the client rejects — is the only signal that the
 * configuration is broken. It is turned into a throw here: a command that goes
 * on regardless would run every seeder against a client that was never built.
 *
 * @returns The configured Database instance.
 * @throws {Error} When the client could not be configured; the message is the
 *   redacted `ConnectionResult.error`.
 */
async function initDatabase(): Promise<Database> {
    const db = container.get<Database>(Database)
    const result = await db.connect(
        Deno.env.get('DATABASE_URL') || 'postgres://localhost:5432/lockness',
    )
    if (!result.success) {
        throw new Error(
            `Database not configured: ${result.error ?? 'unknown error'}`,
        )
    }
    return db
}

/**
 * Production command-runner: spawns a real process via {@link Deno.Command}.
 *
 * @param spec - The command and arguments to run.
 * @returns The process exit code.
 */
const defaultRunCommand: CommandRunner = async (spec) => {
    const command = new Deno.Command(spec.cmd, {
        args: [...spec.args],
        stdout: 'inherit',
        stderr: 'inherit',
    })
    const { code } = await command.output()
    return code
}

/**
 * Production seeder-loader: dynamically imports a seeder module from the
 * project's working directory.
 *
 * @param relativePath - Path to the seeder file, relative to the project root.
 * @returns The imported module namespace.
 */
const defaultLoadSeeder: SeederLoader = (relativePath) =>
    import(`file://${Deno.cwd()}/${relativePath}`)

/**
 * Production opener: configures the container's `Database` from the
 * `drizzle.config.ts` url and dialect, and hands out its redacting
 * maintenance capability.
 *
 * @param settings - The validated `db:fresh` settings.
 * @returns The session; closing it closes the `Database`.
 * @throws {Error} When the client cannot be configured (the redacted
 *   `ConnectionResult.error`).
 * @throws {FreshRefusedError} R4: the driver offers no maintenance
 *   capability — a custom driver factory need not.
 */
const defaultOpenMaintenance: MaintenanceOpener = async (settings) => {
    const db = container.get<Database>(Database)
    const result = await db.connect(settings.url, {
        driver: settings.dialect,
        silent: true,
    })
    if (!result.success) {
        throw new Error(
            `Database not configured: ${result.error ?? 'unknown error'}`,
        )
    }
    const maintenance = db.maintenance
    if (!maintenance) {
        await db.close()
        throw new FreshRefusedError(
            `the '${settings.dialect}' driver offers no schema maintenance ` +
                '(a custom driver factory?)',
        )
    }
    return { ...maintenance, close: () => db.close() }
}

/**
 * Extract error message from an unknown error.
 *
 * @param error - The error to extract message from
 * @returns The error message string
 */
export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/**
 * Read and process a stub file with variable replacements.
 *
 * @param stubName - Name of the stub file (without .stub extension)
 * @param replacements - Key-value pairs for template replacements
 * @returns Processed stub content
 */
export async function processStub(
    stubName: string,
    replacements: Record<string, string>,
): Promise<string> {
    const stubPath = join(STUBS_PATH, `${stubName}.stub`)
    let content = await Deno.readTextFile(stubPath)

    for (const [key, value] of Object.entries(replacements)) {
        content = content.replaceAll(`{{${key}}}`, value)
    }

    return content
}

/**
 * Create a file with content, ensuring directory exists.
 *
 * @param filePath - Path to create the file at
 * @param content - File content
 */
export async function createFile(
    filePath: string,
    content: string,
): Promise<void> {
    const dirPath = dirname(filePath)
    await Deno.mkdir(dirPath, { recursive: true })
    await Deno.writeTextFile(filePath, content)
}

// =============================================================================
// Command Handlers
// =============================================================================

/**
 * The production guard every destructive `db:*` command runs first, before it
 * reads a config or opens a connection — one helper, so `db:seed` and
 * `db:fresh` refuse with the same message shape.
 *
 * `assertNotProduction` stays a plain `Error` — `factory.ts` calls it at
 * runtime, outside any CLI — so the command translates it here.
 *
 * @param command - The command name, embedded in the refusal.
 * @param args - The command arguments; `--allow-production` overrides.
 * @throws {CommandFailedError} When the environment is production and
 *   `--allow-production` was not passed.
 */
function refuseInProduction(command: string, args: readonly string[]): void {
    try {
        assertNotProduction(command, args.includes(ALLOW_PRODUCTION_FLAG))
    } catch (error) {
        throw new CommandFailedError(getErrorMessage(error), { cause: error })
    }
}

/**
 * Handle `db:fresh` — empty the managed scope, then apply every migration,
 * in one process over one connection (#435).
 *
 * Order: the production guard, the settings from `drizzle.config.ts` (R2,
 * R3), the connection (R4), the reset (R5–R7), the migrate; the connection is
 * closed on every path that opened it. Nothing is spawned and no prompt API
 * is called, so the command behaves the same with or without a TTY. The
 * migrations folder is only read.
 *
 * @param args - Command arguments (optional `--allow-production`).
 * @param deps - The I/O seams.
 * @throws {CommandFailedError} On any failure; a refusal says that nothing
 *   was dropped, and a failed reset that the migrations were not run.
 */
async function handleFresh(
    args: string[],
    deps: DrizzleCommandDeps,
): Promise<void> {
    refuseInProduction('db:fresh', args)

    let settings: MigrationSettings
    try {
        settings = await loadMigrationSettings(deps.loadMigrationConfig)
    } catch (error) {
        throw new CommandFailedError(getErrorMessage(error), { cause: error })
    }

    let session: MaintenanceSession
    try {
        session = await deps.openMaintenance(settings)
    } catch (error) {
        throw new CommandFailedError(
            error instanceof FreshRefusedError
                ? error.message
                : `Could not open the database: ${getErrorMessage(error)}`,
            { cause: error },
        )
    }

    try {
        console.log(`🗑️  Resetting ${describeResetScope(settings)}`)
        try {
            await resetDatabase(session, settings)
        } catch (error) {
            throw new CommandFailedError(
                error instanceof FreshRefusedError
                    ? error.message
                    : 'Failed to empty the database; migrations were not run: ' +
                        getErrorMessage(error),
                { cause: error },
            )
        }

        console.log(`🔄 Applying ${settings.migrations} migration(s)...`)
        try {
            await session.migrate({
                folder: settings.folder,
                table: settings.table,
                schema: settings.schema,
            })
        } catch (error) {
            throw new CommandFailedError(
                'The database was emptied, but the migrations failed: ' +
                    getErrorMessage(error),
                { cause: error },
            )
        }
        console.log('✅ Database refreshed successfully')
    } finally {
        await session.close()
    }
}

/**
 * Handle db:seed command - run database seeders.
 *
 * Refuses to run against a production environment unless the
 * `--allow-production` flag is passed — seeding writes rows unconditionally, so
 * an accidental run against production is guarded by {@link assertNotProduction}.
 *
 * Every expected failure — the production guard, a connection that cannot be
 * configured, a seeder module that is missing or exports no seeder — is a
 * {@link CommandFailedError}. An error thrown by the seeder's own `run()` is
 * user code failing, so it passes through unwrapped and the CLI prints its
 * stack. The connection is closed on every path that opened it.
 *
 * @param args - Command arguments (optional seeder name, optional
 *   `--allow-production` flag)
 * @param deps - The I/O seams.
 * @throws {CommandFailedError} When the environment is production and
 *   `--allow-production` was not passed, the connection cannot be configured,
 *   or no seeder could be loaded.
 */
async function handleSeed(
    args: string[],
    deps: DrizzleCommandDeps,
): Promise<void> {
    refuseInProduction('db:seed', args)

    console.log('🌱 Running seeders...')

    let db: DbConnection
    try {
        db = await deps.connect()
    } catch (error) {
        throw new CommandFailedError(getErrorMessage(error), { cause: error })
    }
    const specificSeeder = args.find((a) => !a.startsWith('-'))

    try {
        const seeder = specificSeeder
            ? await loadSpecificSeeder(specificSeeder, deps.loadSeeder)
            : await loadDatabaseSeeder(deps.loadSeeder)
        await seeder.run()
    } finally {
        await db.close()
    }
}

/**
 * Load a seeder module through the loader port, turning a load failure into a
 * {@link CommandFailedError}.
 *
 * @param path - The seeder file, relative to the project root.
 * @param loadSeeder - Seeder-loader port that resolves the module.
 * @returns The module namespace.
 * @throws {CommandFailedError} When the module cannot be loaded; a missing
 *   `database_seeder.ts` names the command that creates it.
 */
async function loadSeederModule(
    path: string,
    loadSeeder: SeederLoader,
): Promise<Record<string, unknown>> {
    try {
        return await loadSeeder(path)
    } catch (error) {
        const message = getErrorMessage(error)
        if (
            path.endsWith('/database_seeder.ts') &&
            message.includes('Module not found')
        ) {
            throw new CommandFailedError(
                'No database_seeder.ts found. Run `deno task cli make:seeder Database` first.',
                { cause: error },
            )
        }
        throw new CommandFailedError(
            `Failed to load seeder ${path}: ${message}`,
            { cause: error },
        )
    }
}

/**
 * Load and instantiate a specific seeder by name.
 *
 * @param seederName - Name of the seeder (e.g., 'user')
 * @param loadSeeder - Seeder-loader port that resolves the seeder module
 * @returns A seeder instance, not yet run.
 * @throws {CommandFailedError} When the module cannot be loaded or exports no
 *   class with a `run()` method.
 */
async function loadSpecificSeeder(
    seederName: string,
    loadSeeder: SeederLoader,
): Promise<{ run(): Promise<void> }> {
    const filePath = `${SEEDERS_DIR}/${seederName.toLowerCase()}_seeder.ts`
    const module = await loadSeederModule(filePath, loadSeeder)
    const SeederClass = Object.values(module).find(
        (v): v is SeederConstructor =>
            typeof v === 'function' &&
            v.prototype?.run !== undefined,
    )
    if (!SeederClass) {
        throw new CommandFailedError(`No valid seeder found in ${filePath}`)
    }
    return new SeederClass()
}

/**
 * Load and instantiate the main `DatabaseSeeder` orchestrator.
 *
 * @param loadSeeder - Seeder-loader port that resolves the seeder module
 * @returns The `DatabaseSeeder` instance, not yet run.
 * @throws {CommandFailedError} When `database_seeder.ts` cannot be loaded or
 *   does not export `DatabaseSeeder`.
 */
async function loadDatabaseSeeder(
    loadSeeder: SeederLoader,
): Promise<{ run(): Promise<void> }> {
    const module = await loadSeederModule(
        `${SEEDERS_DIR}/database_seeder.ts`,
        loadSeeder,
    )
    const DatabaseSeeder = module.DatabaseSeeder
    if (typeof DatabaseSeeder !== 'function') {
        throw new CommandFailedError(
            'DatabaseSeeder class not found. Run `deno task cli make:seeder Database` first.',
        )
    }
    return new (DatabaseSeeder as SeederConstructor)()
}

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register all Drizzle-related CLI commands.
 *
 * Adds the following commands to the CLI:
 * - `db:generate` - Generate migration files from schema changes
 * - `db:migrate` - Run pending database migrations
 * - `db:push` - Push schema changes directly to database
 * - `db:studio` - Open Drizzle Studio GUI
 * - `db:status` - Check the migration history for consistency
 * - `db:check` - Test database connection
 * - `db:fresh` - Empty the managed scope and apply every migration
 * - `db:seed` - Seed the database with test data
 * - `make:seeder` - Create a new database seeder
 * - `make:model` - Create a new Drizzle model
 * - `make:factory` - Create a new model factory
 *
 * A `db:*` command that fails throws a {@link CommandFailedError}, so
 * `@lockness/cli` prints the failure once and the process exits `1`; a
 * command that succeeds exits `0`. Scripts and CI can branch on the status.
 *
 * @param cli - The CLI instance to register commands on
 * @param overrides - Optional I/O-seam overrides for testing; each unset field
 *   defaults to real I/O (the container-resolved connection, `Deno.Command`,
 *   a dynamic seeder import, the `drizzle.config.ts` import, and the
 *   container's `Database` opened from it).
 *
 * @example
 * ```ts
 * import { Cli } from '@lockness/cli'
 * import { registerDrizzleCommands } from '@lockness/drizzle'
 *
 * const cli = new Cli()
 * registerDrizzleCommands(cli)
 *
 * await cli.run(Deno.args)
 * ```
 */
export function registerDrizzleCommands(
    cli: Cli,
    overrides: Partial<DrizzleCommandDeps> = {},
): void {
    const deps: DrizzleCommandDeps = {
        connect: initDatabase,
        runCommand: defaultRunCommand,
        loadSeeder: defaultLoadSeeder,
        loadMigrationConfig: defaultLoadMigrationConfig,
        openMaintenance: defaultOpenMaintenance,
        ...overrides,
    }

    /**
     * Build and run a `drizzle-kit` command line through the command-runner
     * port. The argv is constructed here (so a fake runner can assert it) and
     * executed only by the injected runner.
     */
    const runKit = (subcommand: string): Promise<number> =>
        deps.runCommand({
            cmd: 'deno',
            args: [...DRIZZLE_KIT_ARGS, subcommand],
        })

    /**
     * Run a `drizzle-kit` subcommand and fail the command when it exits
     * non-zero. drizzle-kit has already printed its own diagnostics to the
     * inherited stderr; the thrown message says which step failed.
     *
     * @throws {CommandFailedError} `<failure> (drizzle-kit <sub> exited <n>)`.
     */
    const runKitOrFail = async (
        subcommand: string,
        failure: string,
    ): Promise<void> => {
        const code = await runKit(subcommand)
        if (code !== 0) {
            throw new CommandFailedError(
                `${failure} (drizzle-kit ${subcommand} exited ${code})`,
            )
        }
    }

    // -------------------------------------------------------------------------
    // Migration Commands
    // -------------------------------------------------------------------------

    cli.register(
        'db:generate',
        async () => {
            console.log('📦 Generating migrations...')
            await runKitOrFail('generate', 'Failed to generate migrations')
            console.log('✅ Migrations generated successfully')
        },
        'Generate migration files from schema changes',
    )

    cli.register(
        'db:migrate',
        async () => {
            console.log('🚀 Running migrations...')
            await runKitOrFail('migrate', 'Failed to apply migrations')
            console.log('✅ Migrations applied successfully')
        },
        'Run pending database migrations',
    )

    cli.register(
        'db:push',
        async () => {
            console.log('🔄 Pushing schema to database...')
            await runKitOrFail('push', 'Failed to push schema')
            console.log('✅ Schema pushed successfully')
        },
        'Push schema changes directly to database (without migrations)',
    )

    cli.register(
        'db:studio',
        async () => {
            console.log('🎨 Starting Drizzle Studio...')
            await runKitOrFail('studio', 'Failed to start Drizzle Studio')
        },
        'Open Drizzle Studio (database GUI)',
    )

    // `drizzle-kit check` validates the migrations folder only — snapshot
    // versions, malformed snapshots, collisions. It never reads the schema or
    // the database, so this command must not claim to detect drift.
    cli.register(
        'db:status',
        async () => {
            console.log('📊 Checking migration history...')
            await runKitOrFail('check', 'Migration history check failed')
            console.log('✅ Migration history is consistent')
        },
        'Check the migration history for consistency (drizzle-kit check)',
    )

    // -------------------------------------------------------------------------
    // Database Utility Commands
    // -------------------------------------------------------------------------

    cli.register(
        'db:check',
        async () => {
            console.log('🔍 Checking database connection...')
            let db: DbConnection | undefined
            try {
                db = await deps.connect()
                await db.probe()
                console.log('✅ Database connection successful')
            } catch (error) {
                throw new CommandFailedError(
                    `Database connection failed: ${getErrorMessage(error)}\n` +
                        '💡 Check your DATABASE_URL in .env',
                    { cause: error },
                )
            } finally {
                await db?.close()
            }
        },
        'Test database connection',
    )

    cli.register(
        'db:fresh',
        (args) => handleFresh(args, deps),
        'Empty the database and apply every migration from scratch',
    )

    // -------------------------------------------------------------------------
    // Seeding Commands
    // -------------------------------------------------------------------------

    cli.register(
        'db:seed',
        (args) => handleSeed(args, deps),
        'Seed the database with test data',
    )

    // -------------------------------------------------------------------------
    // Generation Commands — each handler lives in its own generators/* module
    // (architecture A-F5), keeping this file focused on command wiring.
    // -------------------------------------------------------------------------

    cli.register(
        'make:seeder',
        handleMakeSeeder,
        'Create a new database seeder',
    )

    cli.register(
        'make:model',
        handleMakeModel,
        'Create a new Drizzle model (with optional repository, seeder, controller)',
    )

    cli.register(
        'make:factory',
        handleMakeFactory,
        'Create a new faker-backed model factory',
    )
}
