/**
 * @fileoverview The `make:model` scaffolding handler and its related-file
 * generators (repository, seeder, controller).
 *
 * Lives in its own module (not inline in `cli_commands.ts`) so every `make:*`
 * generator sits under `generators/`, matching the factory and seeder
 * generators (architecture A-F5). It reuses `cli_commands.ts`'s
 * `processStub`/`createFile` helpers, and resolves the schema
 * dialect through `dialect_schema.ts`, so the stub-render and dialect logic is
 * not duplicated.
 *
 * @module @lockness/drizzle/generators/model_generator
 * @since 0.2.2
 */

import {
    CommandFailedError,
    type CommandStep,
    runSteps,
} from '@lockness/cli/command-failure'
import { createFile, processStub } from '../cli_commands.ts'
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
 * The one-line usage hint a missing model name fails with. It is folded into
 * the failure message, because the dispatcher prints that message last (#436).
 */
const MAKE_MODEL_USAGE =
    'Please provide a model name (e.g., Post). Usage: deno task cli make:model <Name> [-r|--repository] [-s|--seeder] [-c|--controller] [-a|--all] [--dialect postgres|mysql|sqlite]'

/**
 * Handle make:model command - create model and related files.
 *
 * Each file is one step, run with `runSteps`: every selected file is written
 * even when an earlier one fails, then one failure names the files that could
 * not be written (#436, finish then fail). The files that were written are
 * listed either way.
 *
 * @param args - Command arguments and flags
 * @throws {CommandFailedError} When no model name is given, or when at least
 *   one file could not be written (the first write error is its `cause`).
 */
export async function handleMakeModel(args: string[]): Promise<void> {
    const flags = parseFlags(args)

    if (!flags.name) throw new CommandFailedError(MAKE_MODEL_USAGE)

    const naming = generateNaming(flags.name)
    const createdFiles: string[] = []

    // Resolve the schema dialect: explicit --dialect flag wins, else infer from
    // the configured DATABASE_URL, else default postgres.
    const dialect = resolveGeneratorDialect(
        flags.dialect,
        Deno.env.get('DATABASE_URL'),
    )

    /** A step that writes one file and records its path once written. */
    const fileStep = (
        label: string,
        write: () => Promise<string>,
    ): CommandStep => ({
        label,
        run: async () => void createdFiles.push(await write()),
    })

    // The model is always created; the related files follow the flags.
    const steps: CommandStep[] = [
        fileStep('model', () => createModelFile(naming, dialect)),
    ]
    if (flags.repository) {
        steps.push(fileStep('repository', () => createRepositoryFile(naming)))
    }
    if (flags.seeder) {
        steps.push(fileStep('seeder', () => createSeederFile(naming)))
    }
    if (flags.controller) {
        steps.push(fileStep('controller', () => createControllerFile(naming)))
    }

    try {
        await runSteps(steps)
    } catch (error) {
        // Re-thrown, not swallowed: the files that do exist are listed first,
        // then the dispatcher prints the failure naming the ones that do not.
        printCreatedFiles(createdFiles)
        throw error
    }

    console.log(`✅ Created ${createdFiles.length} file(s):`)
    createdFiles.forEach((f) => console.log(`   ${f}`))

    if (createdFiles.length === 1) {
        console.log('')
        console.log('💡 Use flags to generate related files:')
        console.log('   -r  repository   -s  seeder   -c  controller   -a  all')
    }
}

/**
 * List the files a failed `make:model` did write, so the user knows what
 * exists before the failure line names what does not.
 *
 * @param files - The paths written, in order.
 */
function printCreatedFiles(files: readonly string[]): void {
    if (files.length === 0) return
    console.log(`Created ${files.length} file(s) before the failure:`)
    files.forEach((f) => console.log(`   ${f}`))
}

/**
 * Create the model file for the resolved dialect.
 *
 * @param naming - Model naming conventions
 * @param dialect - The resolved schema dialect; selects the table/column helpers
 *   (pg `serial`, mysql `int`+`autoincrement`, sqlite `integer` PK) the stub is
 *   rendered with.
 * @returns The path written.
 * @throws When the stub cannot be read or the file cannot be written.
 */
async function createModelFile(
    naming: ModelNaming,
    dialect: Dialect,
): Promise<string> {
    const path = `./app/model/${naming.fileName}.ts`
    const content = await processStub('model', {
        ModelName: naming.modelName,
        tableName: naming.tableName,
        ...modelStubParts(dialect),
    })
    await createFile(path, content)
    return path
}

/**
 * Create the repository file.
 *
 * @param naming - Model naming conventions
 * @returns The path written.
 * @throws When the stub cannot be read or the file cannot be written.
 */
async function createRepositoryFile(naming: ModelNaming): Promise<string> {
    const path = `./app/repository/${naming.fileName}_repository.ts`
    const content = await processStub('repository', {
        ModelName: naming.modelName,
        tableName: naming.tableName,
        fileName: naming.fileName,
        RepositoryName: naming.repositoryName,
    })
    await createFile(path, content)
    return path
}

/**
 * Create the seeder file.
 *
 * @param naming - Model naming conventions
 * @returns The path written.
 * @throws When the stub cannot be read or the file cannot be written.
 */
async function createSeederFile(naming: ModelNaming): Promise<string> {
    const path = `./database/seeders/${naming.fileName}_seeder.ts`
    const content = await processStub('seeder', {
        className: naming.modelName,
    })
    await createFile(path, content)
    return path
}

/**
 * Create the controller file.
 *
 * @param naming - Model naming conventions
 * @returns The path written.
 * @throws When the stub cannot be read or the file cannot be written.
 */
async function createControllerFile(naming: ModelNaming): Promise<string> {
    const path = `./app/controller/${naming.fileName}_controller.ts`
    const content = await processStub('controller', {
        ModelName: naming.modelName,
        tableName: naming.tableName,
        fileName: naming.fileName,
        route: naming.route,
        RepositoryName: naming.repositoryName,
        repositoryVar: naming.repositoryVar,
    })
    await createFile(path, content)
    return path
}
