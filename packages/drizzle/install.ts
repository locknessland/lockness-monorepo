#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Drizzle package installer for Lockness projects.
 *
 * Automatically configures the @lockness/drizzle package in a project,
 * creating necessary configuration files, directories, and environment
 * variables.
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
import { dirname, fromFileUrl, join } from '@std/path'
import postgres from 'postgres'
import { resolveDialect } from './drivers.ts'
import { DRIZZLE_KIT_DIALECT } from './generators/dialect_schema.ts'

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
 * Create the drizzle.config.ts configuration file.
 *
 * Skips creation if the file already exists. The `drizzle-kit` dialect is
 * resolved from the configured `DATABASE_URL` scheme (falling back to
 * `postgresql`), so migrations are generated and run against the active
 * database rather than always assuming PostgreSQL.
 *
 * @returns True if the file was created, false if it already existed
 */
export async function createDrizzleConfig(): Promise<boolean> {
    const configPath = './drizzle.config.ts'

    try {
        await Deno.stat(configPath)
        console.log('ℹ️  drizzle.config.ts already exists, skipping...')
        return false
    } catch {
        const stubsDir = resolveStubsDir()
        const dialect = resolveDialect(
            undefined,
            Deno.env.get('DATABASE_URL') ?? '',
        )
        const content = await Stub.renderFrom(
            stubsDir,
            '',
            'drizzle.config.ts',
            { dialect: DRIZZLE_KIT_DIALECT[dialect] },
        )

        await Deno.writeTextFile(configPath, content)
        console.log('✓ Created drizzle.config.ts')
        return true
    }
}

/**
 * Create required directories for the Drizzle setup.
 *
 * Creates directories recursively, skipping those that already exist.
 */
export async function createDirectories(): Promise<void> {
    for (const dir of REQUIRED_DIRECTORIES) {
        try {
            await Deno.mkdir(dir, { recursive: true })
            console.log(`✓ Created ${dir}`)
        } catch (error) {
            if (!(error instanceof Deno.errors.AlreadyExists)) {
                console.error(
                    `✗ Failed to create ${dir}:`,
                    error instanceof Error ? error.message : String(error),
                )
            }
        }
    }
}

/**
 * Create the main DatabaseSeeder file.
 *
 * Skips creation if the file already exists.
 *
 * @returns True if the file was created, false if it already existed
 */
export async function createDatabaseSeeder(): Promise<boolean> {
    const seederPath = './database/seeders/database_seeder.ts'

    try {
        await Deno.stat(seederPath)
        console.log('ℹ️  database_seeder.ts already exists, skipping...')
        return false
    } catch {
        const stubsDir = resolveStubsDir()
        const content = await Stub.renderFrom(
            stubsDir,
            '',
            'database_seeder',
            {},
        )

        await Deno.writeTextFile(seederPath, content)
        console.log('✓ Created database/seeders/database_seeder.ts')
        return true
    }
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
 * @param envPath - Path to the environment file
 */
export async function updateSingleEnvFile(envPath: string): Promise<void> {
    const isExample = envPath.includes('.example')
    const fileLabel = isExample ? '.env.example' : '.env'

    try {
        const envContent = await Deno.readTextFile(envPath)

        if (envContent.includes('DATABASE_URL')) {
            console.log(`ℹ️  DATABASE_URL already exists in ${fileLabel}`)
        } else {
            await Deno.writeTextFile(
                envPath,
                `${envContent}\n\n# Database\n${DEFAULT_DATABASE_URL}\n`,
            )
            console.log(`✓ Added DATABASE_URL to ${fileLabel}`)
        }
    } catch {
        // Create file if it doesn't exist
        await Deno.writeTextFile(
            envPath,
            `# Database\n${DEFAULT_DATABASE_URL}\n`,
        )
        console.log(`✓ Created ${fileLabel} with DATABASE_URL`)
    }
}

/**
 * Raised when the project is missing a file the installer requires.
 *
 * Thrown instead of calling `Deno.exit` directly so the check is testable and
 * the process-exit decision stays with the top-level {@link install} entry.
 */
export class ProjectStructureError extends Error {
    /**
     * @param name - Human-readable name of the missing file/directory.
     */
    constructor(name: string) {
        super(
            `Missing ${name}. Please run this command from your project root.`,
        )
        this.name = 'ProjectStructureError'
    }
}

/**
 * Verify the project has the required structure.
 *
 * @throws {ProjectStructureError} If a required file/directory is missing.
 */
export async function checkProjectStructure(): Promise<void> {
    for (const check of STRUCTURE_CHECKS) {
        try {
            await Deno.stat(check.path)
        } catch {
            console.error(
                `✗ Missing ${check.name}. Please run this command from your project root.`,
            )
            throw new ProjectStructureError(check.name)
        }
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
 * @returns A minimal SQL client.
 */
export type SqlConnector = (url: string) => SqlProbe

/** Production connector: the real postgres.js client. */
const defaultConnector: SqlConnector = (url) =>
    postgres(url) as unknown as SqlProbe

/**
 * Test the database connection using the configured DATABASE_URL.
 *
 * Prints connection status to the console.
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

    const sql = connect(databaseUrl)
    try {
        await sql`SELECT 1`
        console.log('✓ Database connection successful!')
    } catch (error) {
        console.log(
            '✗ Database connection failed:',
            error instanceof Error ? error.message : String(error),
        )
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
 * Main installation function.
 *
 * Orchestrates the complete installation process:
 * 1. Verify project structure
 * 2. Create directories
 * 3. Create configuration files
 * 4. Update environment files
 * 5. Register package
 * 6. Test database connection
 * 7. Show next steps
 */
async function install(): Promise<void> {
    console.log('🔧 Installing @lockness/drizzle...\n')

    try {
        await checkProjectStructure()
    } catch (error) {
        if (error instanceof ProjectStructureError) Deno.exit(1)
        throw error
    }
    await createDirectories()
    await createDrizzleConfig()
    await createDatabaseSeeder()
    await updateEnvFile()

    // Register package
    await addPackage('drizzle')

    await testDatabaseConnection()
    showNextSteps()
}

// =============================================================================
// Execution
// =============================================================================

if (import.meta.main) {
    install()
}
