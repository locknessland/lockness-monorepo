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

                // Look for register function
                let registered = false
                for (const key of Object.keys(module)) {
                    if (
                        (key.startsWith('register') &&
                            (key.endsWith('Commands') ||
                                key.endsWith('Command'))) ||
                        key === 'registerCommands'
                    ) {
                        const registerFn = module[key]
                        if (typeof registerFn === 'function') {
                            await registerFn(cli)
                            registered = true
                            break
                        }
                    }
                }

                if (!registered) {
                    console.warn(
                        `⚠ Package ${fullPackageName} does not export a register function`,
                    )
                }
            } catch (error) {
                console.error(
                    `❌ Failed to load commands from @lockness/${
                        packageName.replace('@lockness/', '')
                    }:`,
                )
                console.error(
                    `   The package is listed in "lockness.packages" in your deno.json but could not be imported.`,
                )
                console.error(
                    `   - Error: ${
                        error instanceof Error ? error.message : error
                    }`,
                )
                console.error(
                    `   - Fix: Use "./nessy package:remove ${packageName}" or manually remove it from deno.json`,
                )
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
