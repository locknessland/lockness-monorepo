/**
 * Represents a single package upgrade
 */
export interface PackageUpgrade {
    /** Package name (e.g., "@lockness/core") */
    name: string
    /** Current version */
    currentVersion: string
    /** Target version */
    targetVersion: string
}

/**
 * Result of an upgrade operation
 */
export interface UpgradeResult {
    /** Whether the upgrade was successful */
    success: boolean
    /** List of packages that were/would be upgraded */
    upgrades: PackageUpgrade[]
    /** Error message if upgrade failed */
    error?: string
    /** Whether this was a dry run */
    dryRun: boolean
}

/**
 * Options for the upgrade operation
 */
export interface UpgradeOptions {
    /** Target version (undefined = latest) */
    targetVersion?: string
    /** Whether to perform a dry run */
    dryRun?: boolean
    /** Path to deno.json (defaults to ./deno.json) */
    configPath?: string
}

/**
 * Interface for version providers
 */
export interface VersionProvider {
    /**
     * Get the latest version of a package
     * @param packageName Full package name (e.g., "@lockness/core")
     * @returns Latest version string (e.g., "0.2.0")
     */
    getLatestVersion(packageName: string): Promise<string>
}
