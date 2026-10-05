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
// of it (deps.policy.jsonc). Only the two light subpaths are used, never the
// barrel, which would load every built-in command.
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
 * Check that the current directory is a Lockness project.
 *
 * @throws {CommandFailedError} When `deno.json` does not exist.
 * @internal
 */
async function assertProjectStructure(): Promise<void> {
    try {
        await Deno.stat('./deno.json')
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error
        throw new CommandFailedError(
            'deno.json not found. Are you in a Lockness project?',
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

/**
 * Add a package to `lockness.packages` in `deno.json` (or `deno.jsonc`).
 *
 * @param packageName - The package to register, e.g. `deprecation-contracts`.
 * @throws {CommandFailedError} When the config exists but cannot be parsed or
 *   written; the error that stopped it is the `cause`.
 * @internal
 */
async function addPackage(packageName: string): Promise<void> {
    let configPath = 'deno.json'
    let text = await readIfExists(configPath)
    if (text === undefined) {
        configPath = 'deno.jsonc'
        text = await readIfExists(configPath)
    }
    if (text === undefined) return // No config to update

    try {
        // JSON.parse, not a JSONC parser: this installer keeps its imports to
        // the two `@lockness/cli` subpaths, so a commented config fails here.
        const config = JSON.parse(text)
        if (!config.lockness) config.lockness = {}
        if (!config.lockness.packages) config.lockness.packages = []

        if (!config.lockness.packages.includes(packageName)) {
            config.lockness.packages.push(packageName)
            config.lockness.packages.sort()
            await Deno.writeTextFile(
                configPath,
                JSON.stringify(config, null, 4) + '\n',
            )
            console.log(`✓ Added ${packageName} to lockness.packages`)
        }
    } catch (error) {
        throw new CommandFailedError(
            `Could not add ${packageName} to lockness.packages in ${configPath}`,
            { cause: error },
        )
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
 * @throws {CommandFailedError} When the current directory has no `deno.json`,
 *   or the config cannot be updated.
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
    await addPackage('deprecation-contracts')
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
