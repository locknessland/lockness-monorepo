import { parse } from '@std/jsonc'
import type {
    PackageUpgrade,
    UpgradeOptions,
    UpgradeResult,
    VersionProvider,
} from './types.ts'

/**
 * Main upgrader class
 */
export class Upgrader {
    constructor(private versionProvider: VersionProvider) {}

    /**
     * Perform upgrade operation
     * @param options Upgrade options
     * @returns Upgrade result with details
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
            const config = parse(configContent) as {
                imports?: Record<string, string>
            }

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
     * Extract version from JSR import string
     * @param importValue Import string like "jsr:@lockness/core@^0.1.19"
     * @returns Version string like "0.1.19"
     */
    private extractVersion(importValue: string): string {
        const match = importValue.match(/@\^?([0-9.]+)/)
        return match ? match[1] : 'unknown'
    }

    /**
     * Update version in import string
     * @param importValue Current import string
     * @param newVersion New version to set
     * @returns Updated import string
     */
    private updateVersion(importValue: string, newVersion: string): string {
        return importValue.replace(/@\^?[0-9.]+/, `@^${newVersion}`)
    }
}
