/**
 * @fileoverview The `make:model` scaffolding handler and its related-file
 * generators (repository, seeder, controller).
 *
 * Lives in its own module (not inline in `cli_commands.ts`) so every `make:*`
 * generator sits under `generators/`, matching the factory and seeder
 * generators (architecture A-F5). It reuses `cli_commands.ts`'s
 * `processStub`/`createFile`/`getErrorMessage` helpers, and resolves the schema
 * dialect through `dialect_schema.ts`, so the stub-render and dialect logic is
 * not duplicated.
 *
 * @module @lockness/drizzle/generators/model_generator
 * @since 0.2.2
 */

import { createFile, getErrorMessage, processStub } from '../cli_commands.ts'
import { modelStubParts, resolveGeneratorDialect } from './dialect_schema.ts'
import type { Dialect } from '../drivers.ts'

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
    /** Raw `--dialect` override value, if supplied (else configured/inferred). */
    readonly dialect: string | undefined
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
 * Parse CLI flags from arguments array.
 *
 * Supports short and long flags:
 * - `-r`, `--repository` - Create repository
 * - `-s`, `--seeder` - Create seeder
 * - `-c`, `--controller` - Create controller
 * - `-a`, `--all` - Create all related files
 * - `--dialect <d>` / `--dialect=<d>` - Override the schema dialect
 *
 * The `--dialect` value (whether spelled `--dialect mysql` or `--dialect=mysql`)
 * is consumed here so it is never mistaken for the positional model name.
 *
 * @param args - CLI arguments array
 * @returns Parsed flags object
 */
function parseFlags(args: readonly string[]): ModelFlags {
    let dialect: string | undefined
    const positional: string[] = []

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg.startsWith('--dialect=')) {
            dialect = arg.slice('--dialect='.length)
            continue
        }
        if (arg === '--dialect') {
            dialect = args[i + 1]
            i++ // skip the consumed value
            continue
        }
        if (!arg.startsWith('-')) positional.push(arg)
    }

    const hasFlag = (short: string, long: string): boolean =>
        args.includes(short) || args.includes(long)

    const all = hasFlag('-a', '--all')

    return {
        name: positional[0],
        repository: all || hasFlag('-r', '--repository'),
        seeder: all || hasFlag('-s', '--seeder'),
        controller: all || hasFlag('-c', '--controller'),
        dialect,
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
 * Handle make:model command - create model and related files.
 *
 * @param args - Command arguments and flags
 */
export async function handleMakeModel(args: string[]): Promise<void> {
    const flags = parseFlags(args)

    if (!flags.name) {
        printMakeModelUsage()
        return
    }

    const naming = generateNaming(flags.name)
    const createdFiles: string[] = []

    // Resolve the schema dialect: explicit --dialect flag wins, else infer from
    // the configured DATABASE_URL, else default postgres.
    const dialect = resolveGeneratorDialect(
        flags.dialect,
        Deno.env.get('DATABASE_URL'),
    )

    // Always create the model
    const modelCreated = await createModelFile(naming, dialect)
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
    console.log(
        '  --dialect <d>       Schema dialect: postgres | mysql | sqlite',
    )
    console.log(
        '                      (defaults to the DATABASE_URL scheme, else postgres)',
    )
}

/**
 * Create the model file for the resolved dialect.
 *
 * @param naming - Model naming conventions
 * @param dialect - The resolved schema dialect; selects the table/column helpers
 *   (pg `serial`, mysql `int`+`autoincrement`, sqlite `integer` PK) the stub is
 *   rendered with.
 * @returns True if created successfully
 */
async function createModelFile(
    naming: ModelNaming,
    dialect: Dialect,
): Promise<boolean> {
    try {
        const content = await processStub('model', {
            ModelName: naming.modelName,
            tableName: naming.tableName,
            ...modelStubParts(dialect),
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
