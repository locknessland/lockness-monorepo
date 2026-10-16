/**
 * @fileoverview What `package:install` does with a package (#592): run its
 * `./setup` step with a `SetupContext`, else its `./install` default export,
 * else register it alone.
 *
 * The import itself is not here: `core_commands.ts` holds the command's one
 * computed `import()` (inventoried by `deps.policy.jsonc` `runtimeImports`)
 * and hands it in as an {@link EntryImporter}, so this module can be driven
 * by fixtures. Internal: no `exports` entry lists it.
 *
 * @module @lockness/cli/package-install
 * @internal
 */

import type { PackageSetup, SetupContext } from '@lockness/contract/setup'
import { CommandFailedError } from './command_failure.ts'
import { addPackage } from './package_loader.ts'

/**
 * The two entries `package:install` looks for, in order. The `install` entry
 * is transitional: plan 274 C21 moves drizzle and openapi to `./setup` and
 * deletes it (tasks.md, next to T035).
 */
export type InstallEntry = 'setup' | 'install'

/**
 * Imports one package entry by specifier, e.g. `@lockness/openapi/setup`.
 *
 * @param specifier - The bare specifier to import.
 * @returns The module namespace.
 */
export type EntryImporter = (
    specifier: string,
) => Promise<Record<string, unknown>>

/**
 * Whether an import failure means "this package has no such entry" — and
 * nothing else.
 *
 * Deno says `Unknown export './setup' for '@lockness/x'` for a subpath an
 * `exports` map lacks, and "does not provide an export" in its other form.
 * Either counts only when the message names this package **and** this
 * subpath: a setup module that loads but fails on a broken import of its own
 * ("… does not provide an export named 'x'") is a failure, not an absence.
 *
 * @param error - What the import rejected with.
 * @param packageName - The full package name, `@lockness/<name>`.
 * @param entry - The subpath that was imported.
 * @returns `true` when the package has no such entry.
 *
 * @example
 * ```ts
 * isMissingEntry(
 *     new TypeError("Unknown export './setup' for '@lockness/cache'."),
 *     '@lockness/cache',
 *     'setup',
 * ) // true
 * ```
 */
export function isMissingEntry(
    error: unknown,
    packageName: string,
    entry: InstallEntry,
): boolean {
    if (!(error instanceof Error)) return false
    const { message } = error
    const namesEntry = message.includes(packageName) &&
        message.includes(`'./${entry}'`)
    return namesEntry && (
        message.includes('Unknown export') ||
        message.includes('does not provide an export')
    )
}

/**
 * The context `package:install` hands a package setup: a project root, and
 * registration through {@link addPackage}.
 *
 * Registration refuses a directory with neither `deno.json` nor
 * `deno.jsonc`, and names the step when the manifest cannot be updated, the
 * caught error as its `cause` — the checks `@lockness/deprecation-contracts`'
 * installer made itself before the setup port (#580, #592).
 *
 * @param root - The project directory; the working directory by default.
 * @returns The context.
 *
 * @example
 * ```ts
 * await setupContext().registerPackage('deprecation-contracts')
 * ```
 */
export function setupContext(root: string = Deno.cwd()): SetupContext {
    return {
        root,
        async registerPackage(name: string): Promise<void> {
            const found = await Promise.all(
                ['deno.json', 'deno.jsonc'].map((path) =>
                    Deno.stat(path).then(() => true, (error) => {
                        if (error instanceof Deno.errors.NotFound) return false
                        throw error
                    })
                ),
            )
            if (!found.includes(true)) {
                throw new CommandFailedError(
                    'No deno.json or deno.jsonc found. Are you in a Lockness project?',
                )
            }
            try {
                await addPackage(name)
            } catch (error) {
                throw new CommandFailedError(
                    `Could not add ${name} to lockness.packages`,
                    { cause: error },
                )
            }
        },
    }
}

/**
 * Install a package: run its `./setup` step (the named `setup` export, a
 * `PackageSetup`) with a {@link SetupContext}; else its `./install` default
 * export; else register it alone.
 *
 * An entry that exists but does not hold what it should is a failure, never
 * a silent skip to the next one.
 *
 * @param packageName - The name the user typed, with or without the scope.
 * @param importEntry - Imports a package entry; the command's one computed
 *   `import()` in production.
 * @returns A promise that resolves once the package is installed.
 * @throws {CommandFailedError} When `./setup` has no named `setup` function,
 *   `./install` has no callable default export, or the setup refuses the
 *   directory or cannot register the package.
 * @throws {Error} When the package does not resolve, an entry fails to load,
 *   or its step fails.
 *
 * @example
 * ```ts
 * await installPackage('openapi', (specifier) => import(specifier))
 * ```
 */
export async function installPackage(
    packageName: string,
    importEntry: EntryImporter,
): Promise<void> {
    const fullPackageName = packageName.startsWith('@lockness/')
        ? packageName
        : `@lockness/${packageName}`

    const setupModule = await tryImport(fullPackageName, 'setup', importEntry)
    if (setupModule !== undefined) {
        if (typeof setupModule.setup !== 'function') {
            throw new CommandFailedError(
                `${fullPackageName}/setup has no named \`setup\` export to run ` +
                    '(a PackageSetup function; a default export is not used)',
            )
        }
        await (setupModule.setup as PackageSetup)(setupContext())
        return
    }

    const installModule = await tryImport(
        fullPackageName,
        'install',
        importEntry,
    )
    if (installModule !== undefined) {
        if (typeof installModule.default !== 'function') {
            throw new CommandFailedError(
                `${fullPackageName}/install has no default export to run. ` +
                    'Please refer to the package documentation for setup instructions',
            )
        }
        await (installModule.default as () => Promise<void>)()
        return
    }

    await addPackage(packageName)
    console.log('\n✅ Package added to configuration')
    console.log('ℹ️  This package does not have an automated installer')
}

/**
 * Import one entry, or `undefined` when the package has none.
 *
 * @param packageName - The full package name.
 * @param entry - The subpath.
 * @param importEntry - The importer.
 * @returns The module, or `undefined` per {@link isMissingEntry}.
 * @throws {Error} Any other import failure, unchanged.
 */
async function tryImport(
    packageName: string,
    entry: InstallEntry,
    importEntry: EntryImporter,
): Promise<Record<string, unknown> | undefined> {
    try {
        return await importEntry(`${packageName}/${entry}`)
    } catch (error) {
        if (isMissingEntry(error, packageName, entry)) return undefined
        throw error
    }
}
