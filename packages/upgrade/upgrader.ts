/**
 * @fileoverview Core upgrader logic for Lockness packages.
 *
 * Provides the `Upgrader` class which handles reading deno.json,
 * detecting Lockness packages, and upgrading them to specified versions.
 *
 * @module @lockness/upgrade/upgrader
 *
 * @example
 * ```typescript
 * import { Upgrader } from '@lockness/upgrade'
 * import { createVersionProvider } from '@lockness/upgrade'
 *
 * const upgrader = new Upgrader(createVersionProvider())
 * const result = await upgrader.upgrade({ dryRun: true })
 *
 * if (result.success) {
 *     console.log(`Found ${result.upgrades.length} packages to upgrade`)
 * }
 * ```
 */

import { parse } from '@std/jsonc'
import type {
    PackageUpgrade,
    UpgradeOptions,
    UpgradeResult,
    VersionProvider,
} from './types.ts'

// =============================================================================
// Types
// =============================================================================

/**
 * Structure of a deno.json configuration file.
 * @internal
 */
interface DenoConfig {
    /** Import map entries */
    imports?: Record<string, string>
}

// =============================================================================
// Upgrader Class
// =============================================================================

/**
 * Handles upgrading Lockness packages in a deno.json file.
 *
 * The upgrader:
 * - Reads and parses the deno.json configuration
 * - Detects all `@lockness/*` packages in the imports
 * - Fetches latest versions from the configured provider
 * - Updates the configuration with new versions
 *
 * @example Basic usage
 * ```typescript
 * const upgrader = new Upgrader(versionProvider)
 *
 * // Upgrade to latest
 * const result = await upgrader.upgrade()
 *
 * // Upgrade to specific version
 * const result = await upgrader.upgrade({ targetVersion: '0.2.0' })
 *
 * // Dry run (preview only)
 * const result = await upgrader.upgrade({ dryRun: true })
 * ```
 */
export class Upgrader {
    /**
     * Create a new Upgrader instance.
     *
     * @param versionProvider - Provider for fetching latest package versions
     */
    constructor(private readonly versionProvider: VersionProvider) {}

    /**
     * Perform an upgrade operation on the deno.json file.
     *
     * This method:
     * 1. Reads the deno.json configuration
     * 2. Finds all `@lockness/*` packages in imports
     * 3. Determines target versions for each package
     * 4. Updates the configuration (unless dry-run)
     *
     * @param options - Upgrade options
     * @returns Promise resolving to the upgrade result
     *
     * @example Upgrade to latest
     * ```typescript
     * const result = await upgrader.upgrade()
     * if (result.success) {
     *     console.log('Upgraded', result.upgrades.length, 'packages')
     * }
     * ```
     *
     * @example Dry run
     * ```typescript
     * const result = await upgrader.upgrade({ dryRun: true })
     * for (const pkg of result.upgrades) {
     *     console.log(`Would upgrade ${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion}`)
     * }
     * ```
     */
    async upgrade(options: UpgradeOptions = {}): Promise<UpgradeResult> {
        const {
            targetVersion,
            dryRun = false,
            configPath = './deno.json',
        } = options

        try {
            // Read deno.json
            const configContent = await Deno.readTextFile(configPath)
            const config = parse(configContent) as DenoConfig

            if (!config.imports) {
                return {
                    success: false,
                    upgrades: [],
                    error: 'No imports found in deno.json',
                    dryRun,
                }
            }

            // Find all @lockness/* packages
            const locknessPackages = Object.entries(config.imports)
                .filter(([key]) => key.startsWith('@lockness/'))
                .filter(([, value]) => value.startsWith('jsr:@lockness/'))

            if (locknessPackages.length === 0) {
                return {
                    success: false,
                    upgrades: [],
                    error: 'No Lockness packages found in imports',
                    dryRun,
                }
            }

            // Determine target version for each package
            const upgrades: PackageUpgrade[] = []

            for (const [packageName, importValue] of locknessPackages) {
                const currentVersion = this.extractVersion(importValue)
                const newVersion = targetVersion ||
                    await this.versionProvider.getLatestVersion(packageName)

                if (currentVersion !== newVersion) {
                    upgrades.push({
                        name: packageName,
                        currentVersion,
                        targetVersion: newVersion,
                    })
                }
            }

            if (upgrades.length === 0) {
                return {
                    success: true,
                    upgrades: [],
                    dryRun,
                }
            }

            // Apply upgrades if not dry-run
            if (!dryRun) {
                for (const upgrade of upgrades) {
                    const oldImport = config.imports[upgrade.name]
                    config.imports[upgrade.name] = this.updateVersion(
                        oldImport,
                        upgrade.targetVersion,
                    )
                }

                // Write back to file
                await Deno.writeTextFile(
                    configPath,
                    JSON.stringify(config, null, 4) + '\n',
                )
            }

            return {
                success: true,
                upgrades,
                dryRun,
            }
        } catch (error) {
            return {
                success: false,
                upgrades: [],
                error: error instanceof Error ? error.message : 'Unknown error',
                dryRun,
            }
        }
    }

    /**
     * Extract the version number from a JSR import string.
     *
     * @param importValue - Import string like "jsr:@lockness/contract@^0.1.19"
     * @returns Version string like "0.1.19", or "unknown" if not found
     *
     * @example
     * ```typescript
     * extractVersion('jsr:@lockness/contract@^0.1.19') // '0.1.19'
     * extractVersion('jsr:@lockness/contract@0.2.0')   // '0.2.0'
     * ```
     *
     * @internal
     */
    private extractVersion(importValue: string): string {
        const match = importValue.match(/@\^?([0-9.]+)/)
        return match ? match[1] : 'unknown'
    }

    /**
     * Update the version in a JSR import string.
     *
     * Replaces the version portion with a caret range for the new version.
     *
     * @param importValue - Current import string
     * @param newVersion - New version to set
     * @returns Updated import string with new version
     *
     * @example
     * ```typescript
     * updateVersion('jsr:@lockness/contract@^0.1.19', '0.2.0')
     * // Returns: 'jsr:@lockness/contract@^0.2.0'
     * ```
     *
     * @internal
     */
    private updateVersion(importValue: string, newVersion: string): string {
        return importValue.replace(/@\^?[0-9.]+/, `@^${newVersion}`)
    }
}
