/**
 * @fileoverview Type definitions for the Lockness upgrade package.
 *
 * Provides interfaces for package upgrades, upgrade results, options,
 * and version providers used by the upgrade tool.
 *
 * @module @lockness/upgrade/types
 */

// =============================================================================
// Package Types
// =============================================================================

/**
 * Represents a single package upgrade operation.
 *
 * Contains information about which package is being upgraded and
 * the version transition.
 *
 * @example
 * ```typescript
 * const upgrade: PackageUpgrade = {
 *     name: '@lockness/core',
 *     currentVersion: '0.1.19',
 *     targetVersion: '0.2.0',
 * }
 * ```
 */
export interface PackageUpgrade {
    /** Package name (e.g., "@lockness/core") */
    readonly name: string
    /** Current version before upgrade */
    readonly currentVersion: string
    /** Target version to upgrade to */
    readonly targetVersion: string
}

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result of an upgrade operation.
 *
 * Contains success status, list of upgrades performed, and any error
 * information if the upgrade failed.
 *
 * @example Successful upgrade
 * ```typescript
 * const result: UpgradeResult = {
 *     success: true,
 *     upgrades: [{ name: '@lockness/core', currentVersion: '0.1.19', targetVersion: '0.2.0' }],
 *     dryRun: false,
 * }
 * ```
 *
 * @example Failed upgrade
 * ```typescript
 * const result: UpgradeResult = {
 *     success: false,
 *     upgrades: [],
 *     error: 'No Lockness packages found in imports',
 *     dryRun: false,
 * }
 * ```
 */
export interface UpgradeResult {
    /** Whether the upgrade operation completed successfully */
    readonly success: boolean
    /** List of packages that were upgraded (or would be in dry-run mode) */
    readonly upgrades: readonly PackageUpgrade[]
    /** Error message if the upgrade failed */
    readonly error?: string
    /** Whether this was a dry run (no files modified) */
    readonly dryRun: boolean
}

// =============================================================================
// Option Types
// =============================================================================

/**
 * Options for configuring an upgrade operation.
 *
 * @example Upgrade to latest
 * ```typescript
 * const options: UpgradeOptions = {
 *     dryRun: true,
 * }
 * ```
 *
 * @example Upgrade to specific version
 * ```typescript
 * const options: UpgradeOptions = {
 *     targetVersion: '0.2.0',
 *     configPath: './deno.json',
 * }
 * ```
 */
export interface UpgradeOptions {
    /**
     * Target version to upgrade to.
     * If undefined, upgrades to the latest available version.
     */
    readonly targetVersion?: string

    /**
     * Whether to perform a dry run.
     * When true, no files are modified and changes are only previewed.
     * @default false
     */
    readonly dryRun?: boolean

    /**
     * Path to the deno.json configuration file.
     * @default './deno.json'
     */
    readonly configPath?: string
}

// =============================================================================
// Provider Types
// =============================================================================

/**
 * Interface for version providers.
 *
 * A version provider is responsible for fetching the latest available
 * version of a package from a registry (e.g., JSR).
 *
 * @example Implementing a custom provider
 * ```typescript
 * class CustomVersionProvider implements VersionProvider {
 *     async getLatestVersion(packageName: string): Promise<string> {
 *         // Fetch version from custom registry
 *         return '1.0.0'
 *     }
 * }
 * ```
 */
export interface VersionProvider {
    /**
     * Get the latest available version of a package.
     *
     * @param packageName - Full package name (e.g., "@lockness/core")
     * @returns Promise resolving to the latest version string (e.g., "0.2.0")
     * @throws {Error} If the version cannot be fetched
     */
    getLatestVersion(packageName: string): Promise<string>
}
