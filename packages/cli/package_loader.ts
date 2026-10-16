/**
 * @fileoverview Package management utilities for Lockness CLI.
 *
 * Provides functions to dynamically load, add, and remove packages
 * from the project's deno.json configuration.
 *
 * @module @lockness/cli/package-loader
 */

import { parse as parseJsonc } from '@std/jsonc'
import type { Cli } from './mod.ts'

/**
 * Find and read the project configuration file (deno.json or deno.jsonc).
 * @returns Object with config content and the path found.
 */
async function readConfig(): Promise<{ content: any; path: string }> {
    let configPath = 'deno.json'
    let content = ''
    try {
        content = await Deno.readTextFile(configPath)
    } catch (_e) {
        configPath = 'deno.jsonc'
        content = await Deno.readTextFile(configPath)
    }
    return { content: parseJsonc(content), path: configPath }
}

/** The part of an app's `deno.json(c)` that decides which packages load. */
export interface PackageLoadConfig {
    /** The app's import map; only its keys are read. */
    readonly imports?: unknown
    /** Lockness settings; `packages` lists the packages to load. */
    readonly lockness?: { readonly packages?: unknown }
}

/**
 * Which packages `loadPackageCommands` imports for an app, in order.
 *
 * `core` first (the engine always provides its commands), then the packages
 * `lockness.packages` lists. Then `queue` when the app maps
 * `@lockness/queue` and does not list it: the `queue:*` commands lived in
 * `@lockness/cli` until #592 and were there for every app, so an app that
 * uses the queue keeps them. **Interim adapter** — plan 274 C19 replaces
 * name-based discovery with the app's `config/packages.ts`, and this
 * special case goes with it.
 *
 * @param config - The parsed `deno.json(c)`.
 * @returns The package names to import, as written (with or without scope).
 * @internal Exported for tests; not on any `exports` entry.
 *
 * @example
 * ```ts
 * packagesToLoad({ lockness: { packages: ['drizzle'] } }) // ['core', 'drizzle']
 * ```
 */
export function packagesToLoad(config: PackageLoadConfig): string[] {
    const listed = config.lockness?.packages
    const packages = Array.isArray(listed)
        ? listed.filter((name): name is string => typeof name === 'string')
        : []
    const has = (name: string) =>
        packages.includes(name) || packages.includes(`@lockness/${name}`)
    if (!has('core')) packages.unshift('core')
    const imports = config.imports
    const mapsQueue = typeof imports === 'object' && imports !== null &&
        '@lockness/queue' in imports
    if (mapsQueue && !has('queue')) packages.push('queue')
    return packages
}

/** A package's command registration function, as the loader calls it. */
export type RegisterFunction = (cli: Cli) => unknown

/**
 * The registration function the loader calls on a loaded package: its first
 * export named `register…Commands`, `register…Command` or
 * `registerCommands` that is a function.
 *
 * Name-based discovery, replaced by the app's `config/packages.ts` in plan
 * 274 C19.
 *
 * @param module - The package's root module namespace.
 * @returns The function, or `undefined` when the package exports none.
 * @internal Exported for tests; not on any `exports` entry.
 *
 * @example
 * ```ts
 * findRegisterFunction(await import('@lockness/queue')) // registerQueueCommands
 * ```
 */
export function findRegisterFunction(
    module: Record<string, unknown>,
): RegisterFunction | undefined {
    for (const key of Object.keys(module)) {
        const named = (key.startsWith('register') &&
            (key.endsWith('Commands') || key.endsWith('Command'))) ||
            key === 'registerCommands'
        const candidate = module[key]
        if (named && typeof candidate === 'function') {
            return candidate as RegisterFunction
        }
    }
    return undefined
}

/**
 * Why the loader tried a package it then failed to import, and how to fix
 * it: listed in `lockness.packages`, mapped in `imports` (queue's commands,
 * see {@link packagesToLoad}), or core, which always loads.
 *
 * @param packageName - The package as {@link packagesToLoad} returned it.
 * @param config - The parsed `deno.json(c)`.
 * @returns The explanation line and the fix line, without their prefixes.
 * @internal Exported for tests; not on any `exports` entry.
 *
 * @example
 * ```ts
 * loadFailureSource('queue', { imports: { '@lockness/queue': '…' } }).reason
 * // 'The package is mapped in "imports" in your deno.json, …'
 * ```
 */
export function loadFailureSource(
    packageName: string,
    config: PackageLoadConfig,
): { readonly reason: string; readonly fix: string } {
    const listed = config.lockness?.packages
    const short = packageName.replace('@lockness/', '')
    const isListed = Array.isArray(listed) &&
        (listed.includes(short) || listed.includes(`@lockness/${short}`))
    if (isListed) {
        return {
            reason:
                'The package is listed in "lockness.packages" in your deno.json but could not be imported.',
            fix: `Use "./nessy package:remove ${packageName}" or manually remove it from deno.json`,
        }
    }
    if (short === 'core') {
        return {
            reason:
                'The framework core is always loaded for its commands, but could not be imported.',
            fix: 'Map "@lockness/core" in "imports" in your deno.json',
        }
    }
    return {
        reason:
            `The package is mapped in "imports" in your deno.json, so its commands load automatically, but it could not be imported.`,
        fix: `Install it again, or remove "@lockness/${short}" from "imports" in deno.json`,
    }
}

/**
 * Load and register commands from packages listed in deno.json or deno.jsonc.
 *
 * Reads the `lockness.packages` section from the configuration file and dynamically
 * imports the register functions from each package — the list
 * {@link packagesToLoad} decides.
 *
 * @param cli - The CLI instance to register commands on
 *
 * @example
 * ```ts
 * const cli = new Cli()
 * await loadPackageCommands(cli)
 * ```
 */
export async function loadPackageCommands(cli: Cli): Promise<void> {
    try {
        const { content: denoJson } = await readConfig()

        const packages = packagesToLoad(denoJson)

        // Load each package and register its commands
        for (const packageName of packages) {
            try {
                const fullPackageName = packageName.startsWith('@lockness/')
                    ? packageName
                    : `@lockness/${packageName}`

                // Try to import the package
                const module = await import(fullPackageName)

                const registerFn = findRegisterFunction(module)
                if (registerFn) {
                    await registerFn(cli)
                } else {
                    console.warn(
                        `⚠ Package ${fullPackageName} does not export a register function`,
                    )
                }
            } catch (error) {
                const { reason, fix } = loadFailureSource(
                    packageName,
                    denoJson,
                )
                console.error(
                    `❌ Failed to load commands from @lockness/${
                        packageName.replace('@lockness/', '')
                    }:`,
                )
                console.error(`   ${reason}`)
                console.error(
                    `   - Error: ${
                        error instanceof Error ? error.message : error
                    }`,
                )
                console.error(`   - Fix: ${fix}`)
                console.log('') // Add empty line for readability
            }
        }
    } catch (error) {
        // If deno.json doesn't exist or can't be read, silently continue
        if (error instanceof Deno.errors.NotFound) {
            return
        }
        console.error('Error loading package commands:', error)
    }
}

/**
 * Add a package to the deno.json lockness.packages list.
 *
 * Normalizes package names and prevents duplicates.
 *
 * @param packageName - Package name (with or without @lockness/ prefix)
 * @throws {Error} When deno.json cannot be read or written; the caught error
 *   is the `cause`
 *
 * @example
 * ```ts
 * await addPackage('openapi')
 * // or
 * await addPackage('@lockness/openapi')
 * ```
 */
export async function addPackage(packageName: string): Promise<void> {
    try {
        const { content: denoJson, path: denoJsonPath } = await readConfig()

        // Initialize lockness section if it doesn't exist
        if (!(denoJson as any).lockness) {
            ;(denoJson as any).lockness = {}
        }
        if (!(denoJson as any).lockness.packages) {
            ;(denoJson as any).lockness.packages = []
        }

        // Normalize package name
        const normalizedName = packageName.startsWith('@lockness/')
            ? packageName.replace('@lockness/', '')
            : packageName

        // Check if already added
        if ((denoJson as any).lockness.packages.includes(normalizedName)) {
            console.log(`✓ Package ${normalizedName} is already registered`)
            return
        }

        // Separate statements: a leading-paren line once joined the sort onto
        // push(), so the call ran on push's numeric return value.
        const packages: string[] = (denoJson as any).lockness.packages
        packages.push(normalizedName)
        packages.sort()

        // Write back to file
        await Deno.writeTextFile(
            denoJsonPath,
            JSON.stringify(denoJson, null, 2) + '\n',
        )

        console.log(`✓ Added ${normalizedName} to lockness.packages`)
    } catch (error) {
        // The caught error is the cause, never copied into the message (D4).
        throw new Error('Failed to add package', { cause: error })
    }
}

/**
 * Remove a package from the deno.json lockness.packages list.
 *
 * @param packageName - Package name (with or without @lockness/ prefix)
 * @throws {Error} When deno.json cannot be read or written; the caught error
 *   is the `cause`
 *
 * @example
 * ```ts
 * await removePackage('openapi')
 * ```
 */
export async function removePackage(packageName: string): Promise<void> {
    try {
        const { content: denoJson, path: denoJsonPath } = await readConfig()

        if (!(denoJson as any).lockness?.packages) {
            console.log('No packages registered')
            return
        }

        // Normalize package name
        const normalizedName = packageName.startsWith('@lockness/')
            ? packageName.replace('@lockness/', '')
            : packageName

        // Remove package
        const index = (denoJson as any).lockness.packages.indexOf(
            normalizedName,
        )
        if (index === -1) {
            console.log(`Package ${normalizedName} is not registered`)
            return
        }

        ;(denoJson as any).lockness.packages.splice(index, 1)

        // Write back to file
        await Deno.writeTextFile(
            denoJsonPath,
            JSON.stringify(denoJson, null, 2) + '\n',
        )

        console.log(`✓ Removed ${normalizedName} from lockness.packages`)
    } catch (error) {
        // The caught error is the cause, never copied into the message (D4).
        throw new Error('Failed to remove package', { cause: error })
    }
}
