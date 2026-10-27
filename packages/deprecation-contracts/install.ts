#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Deprecation Contracts Package Installer.
 *
 * Automatically configures the `@lockness/deprecation-contracts` package
 * in your project by adding it to `deno.json` and updating environment files.
 *
 * The work is the default-exported {@link install}, which reports failure by
 * throwing and never touches process state; run directly, the module hands it
 * to `runEntry`, which prints a failure once and exits non-zero.
 *
 * @module @lockness/deprecation-contracts/install
 *
 * @example
 * ```bash
 * deno run -A jsr:@lockness/deprecation-contracts/install
 * ```
 */

// `@lockness/cli` may be imported here: `cli` never reaches `core` or this
// package, and only this installer imports it, so `core` -> `mod.ts` loads none
// of it (deps.policy.jsonc). The barrel is imported for `addPackage`, the one
// implementation of package registration (#580); it loads every built-in
// command, a cost paid only by this standalone installer process.
import { addPackage } from '@lockness/cli'
import { CommandFailedError } from '@lockness/cli/command-failure'
import { runEntry } from '@lockness/cli/entry'

// =============================================================================
// Constants
// =============================================================================

/**
 * Deprecation configuration to add to environment files.
 * @internal
 */
const DEPRECATION_CONFIG =
    '\n# Deprecation Configuration\nSTRICT_DEPRECATIONS=false\nIGNORE_DEPRECATIONS=false\n'

// =============================================================================
// Helpers
// =============================================================================

/**
 * Read a text file that may legitimately be absent.
 *
 * @param path - The file to read.
 * @returns Its content, or `undefined` when it does not exist.
 * @throws {Error} Any other read error (permissions, a directory, …): only
 *   absence is expected, so nothing else is skipped silently.
 * @internal
 */
async function readIfExists(path: string): Promise<string | undefined> {
    try {
        return await Deno.readTextFile(path)
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return undefined
        throw error
    }
}

/**
 * Whether `path` exists; only `NotFound` means it does not.
 *
 * @param path - The path to stat.
 * @returns True if the path exists, false if it does not.
 * @throws {Error} Any other stat error.
 * @internal
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
 * Check that the current directory is a Lockness project: it has the
 * `deno.json` or `deno.jsonc` that `addPackage` registers the package in.
 *
 * @throws {CommandFailedError} When neither config file exists.
 * @internal
 */
async function assertProjectStructure(): Promise<void> {
    if (await exists('./deno.json') || await exists('./deno.jsonc')) return
    throw new CommandFailedError(
        'No deno.json or deno.jsonc found. Are you in a Lockness project?',
    )
}

/**
 * Register the package in `lockness.packages` through cli's `addPackage`.
 *
 * cli's failure is a plain `Error`, which the printer would report as
 * unexpected; it is wrapped here so the step is named and the error follows
 * as the `cause`.
 *
 * @throws {CommandFailedError} When the config cannot be read, parsed or
 *   written; cli's error is the `cause`.
 * @internal
 */
async function registerPackage(): Promise<void> {
    try {
        await addPackage('deprecation-contracts')
    } catch (error) {
        throw new CommandFailedError(
            'Could not add deprecation-contracts to lockness.packages',
            { cause: error },
        )
    }
}

/**
 * Update environment files with deprecation configuration.
 *
 * Adds `STRICT_DEPRECATIONS` and `IGNORE_DEPRECATIONS` variables
 * to `.env` and `.env.exemple` when the file exists and lacks them.
 *
 * @throws {Error} When an existing file cannot be read or written.
 * @internal
 */
async function updateEnvFile(): Promise<void> {
    for (const path of ['.env', '.env.exemple']) {
        const content = await readIfExists(`./${path}`)
        if (content === undefined || content.includes('STRICT_DEPRECATIONS')) {
            continue
        }
        await Deno.writeTextFile(`./${path}`, content + DEPRECATION_CONFIG)
        console.log(`✓ Updated ${path} with deprecation configuration`)
    }
}

// =============================================================================
// Main
// =============================================================================

/**
 * Install `@lockness/deprecation-contracts` into the project in the current
 * directory: register it in `lockness.packages` and add the deprecation
 * variables to `.env` and `.env.exemple`.
 *
 * It reports failure by throwing and never touches process state, so a
 * caller — `runEntry` when this module is run directly, or another tool —
 * decides how a failure is printed and which status the process exits with.
 *
 * @returns A promise that resolves once the package is installed.
 * @throws {CommandFailedError} When the current directory has neither
 *   `deno.json` nor `deno.jsonc`, or the config cannot be updated.
 * @throws {Error} When an existing `.env` or `.env.exemple` cannot be read or
 *   written.
 *
 * @example
 * ```ts
 * import install from '@lockness/deprecation-contracts/install'
 *
 * await install()
 * ```
 */
export default async function install(): Promise<void> {
    console.log('🌊 Installing @lockness/deprecation-contracts...\n')

    await assertProjectStructure()
    await registerPackage()
    await updateEnvFile()

    console.log(
        '\n✅ @lockness/deprecation-contracts installed successfully!',
    )
    console.log('📖 Usage:')
    console.log(
        '   import { triggerDeprecation } from "@lockness/deprecation-contracts"',
    )
    console.log(
        '   triggerDeprecation("my-pkg", "1.2.0", "Use newMethod() instead")\n',
    )
    console.log('⚙️ Configuration:')
    console.log(
        '   CHECK your .env file to control deprecation behavior.\n',
    )
}

if (import.meta.main) {
    await runEntry('deprecation-contracts install', () => install())
}
