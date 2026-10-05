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
import { renderError } from '@lockness/contract'
import { Database } from './mod.ts'
import { handleMakeFactory } from './generators/factory_generator.ts'
import { handleMakeModel } from './generators/model_generator.ts'
import { handleMakeSeeder } from './generators/seeder_generator.ts'
import {
    ALLOW_PRODUCTION_FLAG,
    assertNotProduction,
} from './production_guard.ts'
import type { MaintenanceConnection } from './drivers.ts'
import { DRIZZLE_KIT_SPECIFIER } from './generators/dialect_schema.ts'
import {
    defaultLoadMigrationConfig,
    type FreshSettings,
    loadFreshSettings,
    loadMigrationSettings,
    type MigrationConfigLoader,
    type MigrationSettings,
} from './migration_settings.ts'
import { describeResetScope, resetDatabase } from './reset.ts'
import {
    type BookkeepingRow,
    computeMigrationStatus,
    readBookkeeping,
    renderMigrationStatus,
} from './migration_status.ts'
import { RefusedError } from './refusal.ts'
import { settleInOrder, type SettleStep } from './settle_in_order.ts'
import { kitFailure, type KitSubcommand } from './kit_outcome.ts'
import {
    type CommandResult,
    type CommandRunner,
    type CommandSpec,
    defaultRunCommand,
} from './command_runner.ts'
import { defaultLoadSeeder, type SeederLoader } from './seeder_loader.ts'

// The port types are public — `DrizzleCommandDeps` names them — so they are
// re-exported here; their default implementations stay in the two unlisted
// modules, out of reach of every `exports` entry (#564).
export type { CommandResult, CommandRunner, CommandSpec, SeederLoader }

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
 * Opens the one connection `db:migrate`, `db:fresh` and `db:status` work on,
 * from the settings read out of `drizzle.config.ts` — its url and dialect:
 * what `db:fresh` resets and migrates through (#435), what `db:migrate`
 * migrates through (#442), and what `db:status` reads through (#439), all on
 * one dedicated connection (#447).
 *
 * The connection's `close()` releases everything the opener acquired; the
 * command calls it once, on every path that opened it.
 *
 * @param settings - The validated settings.
 * @returns The open connection.
 * @throws When the client cannot be configured, or has no maintenance
 *   capability (a refusal: nothing is changed).
 *
 * @example
 * ```ts
 * const openMaintenance: MaintenanceOpener = async (settings) => {
 *     const db = new Database()
 *     await db.connect(settings.url, { driver: settings.dialect, silent: true })
 *     const connection = await db.maintenance!.open()
 *     return {
 *         ...connection,
 *         close: async () => {
 *             await connection.close()
 *             await db.close()
 *         },
 *     }
 * }
 * ```
 */
export type MaintenanceOpener = (
    settings: MigrationSettings,
) => Promise<MaintenanceConnection>

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
    /**
     * `db:migrate`, `db:fresh` and `db:status`: loads the `drizzle.config.ts`
     * default export.
     */
    readonly loadMigrationConfig: MigrationConfigLoader
    /**
     * `db:migrate`, `db:fresh` and `db:status`: opens the connection they
     * migrate or read through.
     */
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
 * Drizzle Kit CLI command base, as a person types it: the fallback a kit-only
 * `db:migrate` refusal names. The `npm:` specifier is a hard-rule-2 exception,
 * pinned exactly — see {@link DRIZZLE_KIT_SPECIFIER} (#437).
 */
const DRIZZLE_KIT_ARGS = ['run', '-A', DRIZZLE_KIT_SPECIFIER] as const

/**
 * The same command as spawned for `db:generate`, `db:push`, `db:studio` and
 * `db:validate`, with `-q` (#445). The flag is load-bearing: without it Deno
 * itself writes to stderr — the npm `Initialize` lines and the
 * "Ignored build scripts" warning on a project's first run — and the stderr
 * rule in `kit_outcome.ts` would fail a run that worked.
 */
const DRIZZLE_KIT_SPAWN_ARGS = [
    'run',
    '-q',
    '-A',
    DRIZZLE_KIT_SPECIFIER,
] as const

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
 * No default target (#443): an unset or blank variable names no database, so
 * this refuses before `connect()` rather than seed or probe a database the app
 * never chose — the same answer `drizzle.config.ts` gives `db:migrate` and
 * `db:fresh` when it carries no `dbCredentials`.
 *
 * `connect()` makes no round trip (#420), so its `success: false` — a missing
 * client package, or a URL the client rejects — is the only signal that the
 * configuration is broken. It is turned into a throw here: a command that goes
 * on regardless would run every seeder against a client that was never built.
 *
 * Silent (#427): the command reports the failure once, through the
 * `CommandFailedError` it throws, and a `✅ Database configured` line would be
 * a false claim just before a probe that fails.
 *
 * @returns The configured Database instance.
 * @throws {Error} When `DATABASE_URL` is unset or blank — before any client is
 *   built — or when the client could not be configured; the message is then
 *   the redacted `ConnectionResult.error`.
 */
async function initDatabase(): Promise<Database> {
    const url = Deno.env.get('DATABASE_URL')
    if (url === undefined || url.trim() === '') {
        const state = url === undefined ? 'not set' : 'empty'
        throw new Error(
            `Database not configured: DATABASE_URL is ${state}, so no ` +
                'database is named; the db:* commands never fall back to a ' +
                'default database',
        )
    }
    const db = container.get<Database>(Database)
    const result = await db.connect(url, { silent: true })
    if (!result.success) {
        throw new Error(
            `Database not configured: ${result.error ?? 'unknown error'}`,
        )
    }
    return db
}

/**
 * Production opener: configures the container's `Database` from the
 * `drizzle.config.ts` url and dialect, and opens one connection through its
 * redacting maintenance capability. Being the in-process client, it routes
 * postgres notices through the #454 reporter.
 *
 * Whatever it acquired is released on every path, the first failure kept:
 * the `Database` is closed when the capability is missing or the connection
 * cannot be opened, and the connection's `close()` closes the connection,
 * then the `Database`.
 *
 * @param settings - The validated settings.
 * @returns The connection; closing it closes the connection, then the
 *   `Database`, and rejects with the first close failure.
 * @throws {Error} When the client cannot be configured (the redacted
 *   `ConnectionResult.error`), or the connection cannot be opened.
 * @throws {RefusedError} R4, `kitOnly`: the driver offers no maintenance
 *   capability — a custom driver factory need not. The client is closed.
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
    const closeDatabase = { what: 'close the database', run: () => db.close() }
    // `error` stays the failure reported; a close failure after it is logged.
    const failClosing = async (
        what: string,
        error: unknown,
    ): Promise<never> => {
        await settleInOrder([failWith(what, error), closeDatabase])
        throw error // settleInOrder has already thrown it; this types `never`
    }
    const maintenance = db.maintenance
    if (!maintenance) {
        return failClosing(
            'refuse',
            new RefusedError(
                `the '${settings.dialect}' driver offers no schema maintenance ` +
                    '(a custom driver factory?): give the factory a ' +
                    '`maintenance` capability',
                { kitOnly: true },
            ),
        )
    }
    let connection: MaintenanceConnection
    try {
        connection = await maintenance.open()
    } catch (error) {
        return failClosing('open the maintenance connection', error)
    }
    return {
        query: (sql) => connection.query(sql),
        execute: (planner) => connection.execute(planner),
        migrate: (options) => connection.migrate(options),
        close: () =>
            settleInOrder([
                {
                    what: 'close the maintenance connection',
                    run: () => connection.close(),
                },
                closeDatabase,
            ]),
    }
}

/**
 * A step that has already failed, so {@link settleInOrder} keeps it as the
 * first failure and still runs the release steps after it.
 *
 * @param what - What failed, as a verb phrase.
 * @param error - The failure.
 * @returns The step.
 */
function failWith(what: string, error: unknown): SettleStep {
    return { what, run: () => Promise.reject(error) }
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
 * How each schema command frames a refusal: the sentence saying it changed
 * nothing, and whether it names drizzle-kit as the fallback for a
 * configuration only drizzle-kit can run. Both belong to the command, so the
 * shared loader never has to know which command called it (#442).
 *
 * `db:fresh` never names the fallback: drizzle-kit has no equivalent, and
 * `drizzle-kit drop` deletes migration files. Nor does `db:status`:
 * drizzle-kit has no command that reads the bookkeeping table (#439).
 */
const REFUSAL_FRAME = {
    'db:migrate': { outcome: 'No migration was applied', kitFallback: true },
    'db:fresh': { outcome: 'Nothing was dropped', kitFallback: false },
    'db:status': {
        outcome: 'No migration status was read',
        kitFallback: false,
    },
} as const

/** A command that frames a {@link RefusedError}. */
type RefusingCommand = keyof typeof REFUSAL_FRAME

/**
 * Frame a refusal for the command that caught it:
 * `<command> refused: <reason>. <outcome>.`, with the drizzle-kit command
 * inserted before the last sentence when the command offers it and the
 * configuration is `kitOnly`. The command is built from the same pinned
 * argv the other commands run, so the advice cannot drift from the pin.
 *
 * @param command - The command that refused.
 * @param error - The refusal, carrying only its reason.
 * @returns The message the command fails with.
 */
function refusalMessage(command: RefusingCommand, error: RefusedError): string {
    const frame = REFUSAL_FRAME[command]
    const fallback = frame.kitFallback && error.kitOnly
        ? '; drizzle-kit can still apply this configuration: ' +
            `deno ${DRIZZLE_KIT_ARGS.join(' ')} migrate`
        : ''
    return `${command} refused: ${error.reason}${fallback}. ${frame.outcome}.`
}

/**
 * The message for a failure caught while a command reads its settings or
 * opens its connection: a refusal framed for the command, anything else
 * prefixed with what was being done.
 *
 * @param command - The command that failed.
 * @param error - Whatever was thrown.
 * @param prefix - Prepended to a failure that is not a refusal.
 * @returns The message the command fails with.
 */
function failureMessage(
    command: RefusingCommand,
    error: unknown,
    prefix = '',
): string {
    return error instanceof RefusedError
        ? refusalMessage(command, error)
        : `${prefix}${getErrorMessage(error)}`
}

/**
 * Handle `db:migrate` — apply every pending migration in-process, through the
 * settings loader and the maintenance opener `db:fresh` uses (#442), so the
 * two commands cannot reach different databases from one config.
 *
 * Order: the settings from `drizzle.config.ts` (R2, R3), the connection (R4),
 * drizzle-orm's migrator; the connection is closed on every path that opened
 * it. There is no production guard: this is the deploy step
 * (`./nessy db:migrate && ./nessy start`). Nothing is spawned.
 *
 * @param deps - The I/O seams.
 * @throws {CommandFailedError} On any failure; a refusal says that no
 *   migration was applied, and names drizzle-kit when it can still run the
 *   configuration.
 */
async function handleMigrate(deps: DrizzleCommandDeps): Promise<void> {
    console.log('🚀 Running migrations...')

    let settings: MigrationSettings
    try {
        settings = await loadMigrationSettings(deps.loadMigrationConfig)
    } catch (error) {
        throw new CommandFailedError(failureMessage('db:migrate', error), {
            cause: error,
        })
    }

    let connection: MaintenanceConnection
    try {
        connection = await deps.openMaintenance(settings)
    } catch (error) {
        throw new CommandFailedError(
            failureMessage(
                'db:migrate',
                error,
                'Could not open the database: ',
            ),
            { cause: error },
        )
    }

    try {
        try {
            await connection.migrate({
                folder: settings.folder,
                table: settings.table,
                schema: settings.schema,
            })
        } catch (error) {
            throw new CommandFailedError(
                `Failed to apply migrations: ${getErrorMessage(error)}`,
                { cause: error },
            )
        }
        console.log('✅ Migrations applied successfully')
    } finally {
        await connection.close()
    }
}

/**
 * Handle `db:fresh` — empty the managed scope, then apply every migration,
 * in one process over one connection (#435, #447).
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
 *   was dropped, a failed reset that the migrations were not run, and a
 *   failed migrate that the database was emptied: the reset is committed
 *   before the migrate runs, on every dialect.
 */
async function handleFresh(
    args: string[],
    deps: DrizzleCommandDeps,
): Promise<void> {
    refuseInProduction('db:fresh', args)

    let settings: FreshSettings
    try {
        settings = await loadFreshSettings(deps.loadMigrationConfig)
    } catch (error) {
        throw new CommandFailedError(failureMessage('db:fresh', error), {
            cause: error,
        })
    }

    let connection: MaintenanceConnection
    try {
        connection = await deps.openMaintenance(settings)
    } catch (error) {
        throw new CommandFailedError(
            failureMessage('db:fresh', error, 'Could not open the database: '),
            { cause: error },
        )
    }

    try {
        console.log(`🗑️  Resetting ${describeResetScope(settings)}`)
        try {
            await resetDatabase(connection, settings)
        } catch (error) {
            throw new CommandFailedError(
                failureMessage(
                    'db:fresh',
                    error,
                    'Failed to empty the database; migrations were not run: ',
                ),
                { cause: error },
            )
        }

        console.log(`🔄 Applying ${settings.migrations} migration(s)...`)
        try {
            await connection.migrate({
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
        await connection.close()
    }
}

/**
 * Handle `db:status` — list each journal entry as applied, pending or out of
 * order against the database, and fail while any is not applied (#439).
 *
 * It reads through the settings loader and the maintenance opener
 * `db:migrate` uses, so it reports on the database and the migrations
 * `db:migrate` would act on; the policy (drizzle-orm's high-water rule, the
 * catalogue check, the rendering) lives in `migration_status.ts`. Order: the
 * settings (R2, R3), the connection (R4), the read, closed on every path that
 * opened it; then the report. Read-only, so there is no production guard: it
 * is the deploy gate. Nothing is spawned.
 *
 * @param deps - The I/O seams.
 * @throws {CommandFailedError} With the count of unapplied migrations when
 *   any is pending or out of order; or when the check could not run — a
 *   refusal says that no migration status was read.
 */
async function handleStatus(deps: DrizzleCommandDeps): Promise<void> {
    let settings: MigrationSettings
    try {
        settings = await loadMigrationSettings(deps.loadMigrationConfig)
    } catch (error) {
        throw new CommandFailedError(failureMessage('db:status', error), {
            cause: error,
        })
    }

    let connection: MaintenanceConnection
    try {
        connection = await deps.openMaintenance(settings)
    } catch (error) {
        throw new CommandFailedError(
            failureMessage('db:status', error, 'Could not open the database: '),
            { cause: error },
        )
    }

    let rows: readonly BookkeepingRow[] | undefined
    try {
        rows = await readBookkeeping(connection, settings)
    } catch (error) {
        throw new CommandFailedError(
            `Could not read the migration status: ${getErrorMessage(error)}`,
            { cause: error },
        )
    } finally {
        await connection.close()
    }

    const report = renderMigrationStatus(
        computeMigrationStatus(settings.entries, rows),
        settings,
    )
    for (const line of report.lines) console.log(line)
    if (report.failure !== undefined) {
        throw new CommandFailedError(report.failure)
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
        // The raw text decides only whether the file is missing; what is
        // SHOWN is rendered (#478), so a credential or a source excerpt in
        // the load failure never reaches the terminal.
        if (
            path.endsWith('/database_seeder.ts') &&
            getErrorMessage(error).includes('Module not found')
        ) {
            throw new CommandFailedError(
                'No database_seeder.ts found. Run `deno task cli make:seeder Database` first.',
                { cause: error },
            )
        }
        throw new CommandFailedError(
            `Failed to load seeder ${path}: ${renderError(error)}`,
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
 * - `db:migrate` - Run pending database migrations, in-process
 * - `db:push` - Push schema changes directly to database
 * - `db:studio` - Open Drizzle Studio GUI
 * - `db:status` - List each migration as applied or pending against the
 *   database, in-process; exits `1` while any is not applied
 * - `db:validate` - Validate the migrations folder (`drizzle-kit check`)
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
 *   container's `Database` opened from it). `db:migrate`, `db:fresh` and
 *   `db:status` run through the last two, not the command runner.
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
     * Run a `drizzle-kit` subcommand through the command-runner port and fail
     * the command when {@link kitFailure} says the run did not work: a
     * non-zero exit, or for `generate` and `push` an exit 0 after writing to
     * stderr (#445). The argv is constructed here, so a fake runner can
     * assert it. drizzle-kit's own diagnostics have already reached the
     * terminal; the thrown message says which step failed and why.
     *
     * @throws {CommandFailedError} With the verdict's message.
     */
    const runKitOrFail = async (
        subcommand: KitSubcommand,
        failure: string,
    ): Promise<void> => {
        const result = await deps.runCommand({
            cmd: 'deno',
            args: [...DRIZZLE_KIT_SPAWN_ARGS, subcommand],
        })
        const message = kitFailure(subcommand, failure, result)
        if (message !== undefined) throw new CommandFailedError(message)
    }

    // -------------------------------------------------------------------------
    // Migration Commands
    // -------------------------------------------------------------------------

    cli.register(
        'db:generate',
        async () => {
            // No closing ✅ line (#445): Lockness cannot observe the outcome,
            // and drizzle-kit's own last line already reports it.
            console.log('📦 Generating migrations...')
            await runKitOrFail('generate', 'Failed to generate migrations')
        },
        'Generate migration files from schema changes',
    )

    cli.register(
        'db:migrate',
        () => handleMigrate(deps),
        'Run pending database migrations',
    )

    cli.register(
        'db:push',
        async () => {
            // No closing ✅ line (#445), as for db:generate: drizzle-kit
            // prints "[✓] Changes applied" or "[x] All changes were aborted".
            console.log('🔄 Pushing schema to database...')
            await runKitOrFail('push', 'Failed to push schema')
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

    cli.register(
        'db:status',
        () => handleStatus(deps),
        'List each migration as applied or pending against the database; ' +
            'exits 1 while any is not applied',
    )

    // `drizzle-kit check` validates the migrations folder only — snapshot
    // versions, malformed snapshots, collisions. It never reads the schema or
    // the database, so this command must not claim to detect drift or
    // pending migrations: that is db:status (#439).
    cli.register(
        'db:validate',
        async () => {
            console.log('🔎 Validating the migrations folder...')
            await runKitOrFail('check', 'Migration validation failed')
            console.log('✅ The migrations folder is consistent')
        },
        'Validate the migrations folder (drizzle-kit check): snapshot ' +
            'versions, malformed snapshots, collisions. Reads no database.',
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
