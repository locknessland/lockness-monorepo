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
import { container } from '@lockness/container'
import { Database } from './mod.ts'

/**
 * CLI command handler type.
 */
type CommandHandler = (args: string[]) => void | Promise<void>

/**
 * Minimal CLI interface to avoid direct dependency on @lockness/cli.
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
 */
export interface DbConnection {
    /** Verify connectivity (runs `SELECT 1`). */
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
 * The three injectable I/O seams of the Drizzle CLI commands.
 *
 * Each field defaults to real I/O in {@link registerDrizzleCommands}; a test
 * overrides any subset to stay hermetic (no real database, process, or import).
 */
export interface DrizzleCommandDeps {
    /** Connection port — resolves a connected {@link DbConnection}. */
    readonly connect: () => Promise<DbConnection>
    /** Command-runner port wrapping {@link Deno.Command}. */
    readonly runCommand: CommandRunner
    /** Seeder-loader port replacing `db:seed`'s dynamic import. */
    readonly loadSeeder: SeederLoader
}

/**
 * Parsed CLI flags for make:model command.
 */
interface ModelFlags {
    /** Model name (e.g., 'User') */
    readonly name: string | undefined
    /** Whether to create a repository */
    readonly repository: boolean
    /** Whether to create a seeder */
    readonly seeder: boolean
    /** Whether to create a controller */
    readonly controller: boolean
}

/**
 * Naming conventions derived from a model name.
 */
interface ModelNaming {
    /** PascalCase model name (e.g., 'User') */
    readonly modelName: string
    /** Lowercase plural table name (e.g., 'users') */
    readonly tableName: string
    /** Lowercase file name (e.g., 'user') */
    readonly fileName: string
    /** Route path (e.g., 'users') */
    readonly route: string
    /** Repository class name (e.g., 'UserRepository') */
    readonly repositoryName: string
    /** Repository variable name (e.g., 'userRepository') */
    readonly repositoryVar: string
}

/**
 * Seeder class constructor type.
 */
type SeederConstructor = new () => { run(): Promise<void> }

// =============================================================================
// Constants
// =============================================================================

/** Drizzle Kit CLI command base */
const DRIZZLE_KIT_ARGS = ['run', '-A', 'npm:drizzle-kit'] as const

/** Directory for database seeders */
const SEEDERS_DIR = './database/seeders' as const

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
 * Initialize the database connection.
 *
 * @returns Connected Database instance
 */
async function initDatabase(): Promise<Database> {
    const db = container.get<Database>(Database)
    await db.connect(
        Deno.env.get('DATABASE_URL') || 'postgres://localhost:5432/lockness',
    )
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
 * Extract error message from an unknown error.
 *
 * @param error - The error to extract message from
 * @returns The error message string
 */
function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/**
 * Parse CLI flags from arguments array.
 *
 * Supports short and long flags:
 * - `-r`, `--repository` - Create repository
 * - `-s`, `--seeder` - Create seeder
 * - `-c`, `--controller` - Create controller
 * - `-a`, `--all` - Create all related files
 *
 * @param args - CLI arguments array
 * @returns Parsed flags object
 */
function parseFlags(args: readonly string[]): ModelFlags {
    const name = args.find((a) => !a.startsWith('-'))
    const hasFlag = (short: string, long: string): boolean =>
        args.includes(short) || args.includes(long)

    const all = hasFlag('-a', '--all')

    return {
        name,
        repository: all || hasFlag('-r', '--repository'),
        seeder: all || hasFlag('-s', '--seeder'),
        controller: all || hasFlag('-c', '--controller'),
    }
}

/**
 * Generate naming conventions from a model name.
 *
 * @param name - Base model name (e.g., 'user', 'User')
 * @returns Complete naming conventions
 */
function generateNaming(name: string): ModelNaming {
    const modelName = name.charAt(0).toUpperCase() + name.slice(1)
    const tableName = name.toLowerCase() + 's'
    const fileName = name.toLowerCase()

    return {
        modelName,
        tableName,
        fileName,
        route: tableName,
        repositoryName: `${modelName}Repository`,
        repositoryVar: `${fileName}Repository`,
    }
}

/**
 * Read and process a stub file with variable replacements.
 *
 * @param stubName - Name of the stub file (without .stub extension)
 * @param replacements - Key-value pairs for template replacements
 * @returns Processed stub content
 */
async function processStub(
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
async function createFile(filePath: string, content: string): Promise<void> {
    const dirPath = dirname(filePath)
    await Deno.mkdir(dirPath, { recursive: true })
    await Deno.writeTextFile(filePath, content)
}

// =============================================================================
// Command Handlers
// =============================================================================

/**
 * Handle db:seed command - run database seeders.
 *
 * @param args - Command arguments (optional seeder name)
 */
async function handleSeed(
    args: string[],
    deps: DrizzleCommandDeps,
): Promise<void> {
    console.log('🌱 Running seeders...')

    const db = await deps.connect()
    const specificSeeder = args[0]

    try {
        if (specificSeeder) {
            await runSpecificSeeder(specificSeeder, deps.loadSeeder)
        } else {
            await runDatabaseSeeder(deps.loadSeeder)
        }
    } catch (error) {
        console.error(`❌ Seeding failed: ${getErrorMessage(error)}`)
    } finally {
        await db.close()
    }
}

/**
 * Run a specific seeder by name.
 *
 * @param seederName - Name of the seeder (e.g., 'user')
 * @param loadSeeder - Seeder-loader port that resolves the seeder module
 */
async function runSpecificSeeder(
    seederName: string,
    loadSeeder: SeederLoader,
): Promise<void> {
    const fileName = `${seederName.toLowerCase()}_seeder.ts`
    const filePath = `${SEEDERS_DIR}/${fileName}`

    try {
        const module = await loadSeeder(filePath)
        const SeederClass = Object.values(module).find(
            (v): v is SeederConstructor =>
                typeof v === 'function' &&
                v.prototype?.run !== undefined,
        )

        if (SeederClass) {
            const seeder = new SeederClass()
            await seeder.run()
        } else {
            console.error(`❌ No valid seeder found in ${filePath}`)
        }
    } catch (error) {
        console.error(`❌ Failed to run seeder: ${getErrorMessage(error)}`)
    }
}

/**
 * Run the main DatabaseSeeder orchestrator.
 *
 * @param loadSeeder - Seeder-loader port that resolves the seeder module
 */
async function runDatabaseSeeder(loadSeeder: SeederLoader): Promise<void> {
    const mainSeederPath = `${SEEDERS_DIR}/database_seeder.ts`

    try {
        const module = await loadSeeder(mainSeederPath)
        const DatabaseSeeder = module.DatabaseSeeder as
            | SeederConstructor
            | undefined

        if (DatabaseSeeder) {
            const seeder = new DatabaseSeeder()
            await seeder.run()
        } else {
            console.error(
                '❌ DatabaseSeeder class not found. Run `deno task cli make:seeder Database` first.',
            )
        }
    } catch (error) {
        const err = error as Error
        if (err.message.includes('Module not found')) {
            console.error(
                '❌ No database_seeder.ts found. Run `deno task cli make:seeder Database` first.',
            )
        } else {
            console.error(`❌ Seeding failed: ${err.message}`)
            if (err.stack) {
                console.error(err.stack)
            }
        }
    }
}

/**
 * Handle make:seeder command - create a new seeder file.
 *
 * @param args - Command arguments (seeder name)
 */
async function handleMakeSeeder(args: string[]): Promise<void> {
    const name = args[0]
    if (!name) {
        console.error('❌ Please provide a seeder name (e.g., User)')
        return
    }

    const className = name.charAt(0).toUpperCase() + name.slice(1)
    const fileName = `${name.toLowerCase()}_seeder.ts`
    const filePath = `${SEEDERS_DIR}/${fileName}`

    const isDatabase = name.toLowerCase() === 'database'
    const stubName = isDatabase ? 'database_seeder' : 'seeder'

    try {
        const content = await processStub(stubName, { className })
        await createFile(filePath, content)

        console.log(`✅ Seeder created at ${filePath}`)

        if (isDatabase) {
            console.log(
                '💡 Add your seeders to the `seeders` array in DatabaseSeeder',
            )
        }
    } catch (error) {
        console.error(`❌ Failed to create seeder: ${getErrorMessage(error)}`)
    }
}

/**
 * Handle make:model command - create model and related files.
 *
 * @param args - Command arguments and flags
 */
async function handleMakeModel(args: string[]): Promise<void> {
    const flags = parseFlags(args)

    if (!flags.name) {
        printMakeModelUsage()
        return
    }

    const naming = generateNaming(flags.name)
    const createdFiles: string[] = []

    // Always create the model
    const modelCreated = await createModelFile(naming)
    if (!modelCreated) return
    createdFiles.push(`./app/model/${naming.fileName}.ts`)

    // Create optional files based on flags
    if (flags.repository) {
        const created = await createRepositoryFile(naming)
        if (created) {
            createdFiles.push(
                `./app/repository/${naming.fileName}_repository.ts`,
            )
        }
    }

    if (flags.seeder) {
        const created = await createSeederFile(naming)
        if (created) {
            createdFiles.push(`./database/seeders/${naming.fileName}_seeder.ts`)
        }
    }

    if (flags.controller) {
        const created = await createControllerFile(naming)
        if (created) {
            createdFiles.push(
                `./app/controller/${naming.fileName}_controller.ts`,
            )
        }
    }

    // Print summary
    console.log(`✅ Created ${createdFiles.length} file(s):`)
    createdFiles.forEach((f) => console.log(`   ${f}`))

    if (createdFiles.length === 1) {
        console.log('')
        console.log('💡 Use flags to generate related files:')
        console.log('   -r  repository   -s  seeder   -c  controller   -a  all')
    }
}

/**
 * Print usage information for make:model command.
 */
function printMakeModelUsage(): void {
    console.error('❌ Please provide a model name (e.g., Post)')
    console.log('')
    console.log('Usage: deno task cli make:model <Name> [options]')
    console.log('')
    console.log('Options:')
    console.log('  -r, --repository    Create a repository')
    console.log('  -s, --seeder        Create a seeder')
    console.log('  -c, --controller    Create a CRUD controller')
    console.log(
        '  -a, --all           Create all (repository, seeder, controller)',
    )
}

/**
 * Create the model file.
 *
 * @param naming - Model naming conventions
 * @returns True if created successfully
 */
async function createModelFile(naming: ModelNaming): Promise<boolean> {
    try {
        const content = await processStub('model', {
            ModelName: naming.modelName,
            tableName: naming.tableName,
        })
        await createFile(`./app/model/${naming.fileName}.ts`, content)
        return true
    } catch (error) {
        console.error(`❌ Failed to create model: ${getErrorMessage(error)}`)
        return false
    }
}

/**
 * Create the repository file.
 *
 * @param naming - Model naming conventions
 * @returns True if created successfully
 */
async function createRepositoryFile(naming: ModelNaming): Promise<boolean> {
    try {
        const content = await processStub('repository', {
            ModelName: naming.modelName,
            tableName: naming.tableName,
            fileName: naming.fileName,
            RepositoryName: naming.repositoryName,
        })
        await createFile(
            `./app/repository/${naming.fileName}_repository.ts`,
            content,
        )
        return true
    } catch (error) {
        console.error(
            `❌ Failed to create repository: ${getErrorMessage(error)}`,
        )
        return false
    }
}

/**
 * Create the seeder file.
 *
 * @param naming - Model naming conventions
 * @returns True if created successfully
 */
async function createSeederFile(naming: ModelNaming): Promise<boolean> {
    try {
        const content = await processStub('seeder', {
            className: naming.modelName,
        })
        await createFile(
            `./database/seeders/${naming.fileName}_seeder.ts`,
            content,
        )
        return true
    } catch (error) {
        console.error(`❌ Failed to create seeder: ${getErrorMessage(error)}`)
        return false
    }
}

/**
 * Create the controller file.
 *
 * @param naming - Model naming conventions
 * @returns True if created successfully
 */
async function createControllerFile(naming: ModelNaming): Promise<boolean> {
    try {
        const content = await processStub('controller', {
            ModelName: naming.modelName,
            tableName: naming.tableName,
            fileName: naming.fileName,
            route: naming.route,
            RepositoryName: naming.repositoryName,
            repositoryVar: naming.repositoryVar,
        })
        await createFile(
            `./app/controller/${naming.fileName}_controller.ts`,
            content,
        )
        return true
    } catch (error) {
        console.error(
            `❌ Failed to create controller: ${getErrorMessage(error)}`,
        )
        return false
    }
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
 * - `db:status` - Check if migrations are up to date
 * - `db:check` - Test database connection
 * - `db:fresh` - Drop all tables and re-migrate
 * - `db:seed` - Seed the database with test data
 * - `make:seeder` - Create a new database seeder
 * - `make:model` - Create a new Drizzle model
 *
 * @param cli - The CLI instance to register commands on
 * @param overrides - Optional I/O-seam overrides for testing; each unset field
 *   defaults to real I/O (the container-resolved connection, `Deno.Command`,
 *   and a dynamic seeder import).
 *
 * @example
 * ```ts
 * import { Cli } from '@lockness/cli'
 * import { registerDrizzleCommands } from '@lockness/drizzle'
 *
 * const cli = new Cli()
 * registerDrizzleCommands(cli)
 *
 * await cli.run()
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

    // -------------------------------------------------------------------------
    // Migration Commands
    // -------------------------------------------------------------------------

    cli.register(
        'db:generate',
        async () => {
            console.log('📦 Generating migrations...')
            const code = await runKit('generate')
            if (code === 0) {
                console.log('✅ Migrations generated successfully')
            } else {
                console.error('❌ Failed to generate migrations')
            }
        },
        'Generate migration files from schema changes',
    )

    cli.register(
        'db:migrate',
        async () => {
            console.log('🚀 Running migrations...')
            const code = await runKit('migrate')
            if (code === 0) {
                console.log('✅ Migrations applied successfully')
            } else {
                console.error('❌ Failed to apply migrations')
            }
        },
        'Run pending database migrations',
    )

    cli.register(
        'db:push',
        async () => {
            console.log('🔄 Pushing schema to database...')
            const code = await runKit('push')
            if (code === 0) {
                console.log('✅ Schema pushed successfully')
            } else {
                console.error('❌ Failed to push schema')
            }
        },
        'Push schema changes directly to database (without migrations)',
    )

    cli.register(
        'db:studio',
        async () => {
            console.log('🎨 Starting Drizzle Studio...')
            const code = await runKit('studio')
            if (code !== 0) {
                console.error('❌ Failed to start Drizzle Studio')
            }
        },
        'Open Drizzle Studio (database GUI)',
    )

    cli.register(
        'db:status',
        async () => {
            console.log('📊 Checking migration status...')
            const code = await runKit('check')
            if (code === 0) {
                console.log('✅ Schema is up to date')
            } else {
                console.log(
                    '⚠️  Schema changes detected. Run db:generate to create a migration',
                )
            }
        },
        'Check if migrations are up to date with schema',
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
                console.error(
                    '❌ Database connection failed:',
                    getErrorMessage(error),
                )
                console.log('\n💡 Check your DATABASE_URL in .env')
            } finally {
                await db?.close()
            }
        },
        'Test database connection',
    )

    cli.register(
        'db:fresh',
        async () => {
            console.log('🚨 WARNING: This will drop ALL tables and re-migrate')
            console.log('⏳ Starting in 3 seconds... (Ctrl+C to cancel)')
            await new Promise((resolve) => setTimeout(resolve, 3000))

            console.log('🗑️  Dropping database...')
            await runKit('drop')

            console.log('🔄 Running migrations...')
            const code = await runKit('migrate')

            if (code === 0) {
                console.log('✅ Database refreshed successfully')
            } else {
                console.error('❌ Failed to refresh database')
            }
        },
        'Drop all tables and run migrations from scratch',
    )

    // -------------------------------------------------------------------------
    // Seeding Commands
    // -------------------------------------------------------------------------

    cli.register(
        'db:seed',
        (args) => handleSeed(args, deps),
        'Seed the database with test data',
    )

    cli.register(
        'make:seeder',
        handleMakeSeeder,
        'Create a new database seeder',
    )

    // -------------------------------------------------------------------------
    // Model Generation Command
    // -------------------------------------------------------------------------

    cli.register(
        'make:model',
        handleMakeModel,
        'Create a new Drizzle model (with optional repository, seeder, controller)',
    )
}
