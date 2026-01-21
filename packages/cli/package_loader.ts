/**
 * @fileoverview Package management utilities for Lockness CLI.
 *
 * Provides functions to dynamically load, add, and remove packages
 * from the project's deno.json configuration.
 *
 * @module @lockness/cli/package-loader
 */

import type { Cli } from './mod.ts'

/**
 * Load and register commands from packages listed in deno.json.
 *
 * Reads the `lockness.packages` section from deno.json and dynamically
 * imports the register functions from each package.
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
        // Read deno.json from current working directory
        const denoJsonPath = 'deno.json'
        const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath))

        // Get packages list from lockness config
        const packages: string[] = denoJson.lockness?.packages || []

        if (packages.length === 0) {
            return
        }

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
                    `❌ Failed to load commands from @lockness/${packageName.replace('@lockness/', '')
                    }:`,
                )
                console.error(
                    `   The package is listed in "lockness.packages" in your deno.json but could not be imported.`,
                )
                console.error(
                    `   - Error: ${error instanceof Error ? error.message : error
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
 * @throws {Error} When deno.json cannot be read or written
 *
 * @example
 * ```ts
 * await addPackage('openapi')
 * // or
 * await addPackage('@lockness/openapi')
 * ```
 */
export async function addPackage(packageName: string): Promise<void> {
    const denoJsonPath = 'deno.json'

    try {
        const content = await Deno.readTextFile(denoJsonPath)
        const denoJson = JSON.parse(content)

        // Initialize lockness section if it doesn't exist
        if (!denoJson.lockness) {
            denoJson.lockness = {}
        }
        if (!denoJson.lockness.packages) {
            denoJson.lockness.packages = []
        }

        // Normalize package name
        const normalizedName = packageName.startsWith('@lockness/')
            ? packageName.replace('@lockness/', '')
            : packageName

        // Check if already added
        if (denoJson.lockness.packages.includes(normalizedName)) {
            console.log(`✓ Package ${normalizedName} is already registered`)
            return
        }

        // Add package
        denoJson.lockness.packages.push(normalizedName)
        denoJson.lockness.packages.sort()

        // Write back to file
        await Deno.writeTextFile(
            denoJsonPath,
            JSON.stringify(denoJson, null, 2) + '\n',
        )

        console.log(`✓ Added ${normalizedName} to lockness.packages`)
    } catch (error) {
        throw new Error(
            `Failed to add package: ${error instanceof Error ? error.message : error
            }`,
        )
    }
}

/**
 * Remove a package from the deno.json lockness.packages list.
 *
 * @param packageName - Package name (with or without @lockness/ prefix)
 * @throws {Error} When deno.json cannot be read or written
 *
 * @example
 * ```ts
 * await removePackage('openapi')
 * ```
 */
export async function removePackage(packageName: string): Promise<void> {
    const denoJsonPath = 'deno.json'

    try {
        const content = await Deno.readTextFile(denoJsonPath)
        const denoJson = JSON.parse(content)

        if (!denoJson.lockness?.packages) {
            console.log('No packages registered')
            return
        }

        // Normalize package name
        const normalizedName = packageName.startsWith('@lockness/')
            ? packageName.replace('@lockness/', '')
            : packageName

        // Remove package
        const index = denoJson.lockness.packages.indexOf(normalizedName)
        if (index === -1) {
            console.log(`Package ${normalizedName} is not registered`)
            return
        }

        denoJson.lockness.packages.splice(index, 1)

        // Write back to file
        await Deno.writeTextFile(
            denoJsonPath,
            JSON.stringify(denoJson, null, 2) + '\n',
        )

        console.log(`✓ Removed ${normalizedName} from lockness.packages`)
    } catch (error) {
        throw new Error(
            `Failed to remove package: ${error instanceof Error ? error.message : error
            }`,
        )
    }
}
