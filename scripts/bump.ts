#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Version bump script for the Lockness monorepo.
 *
 * This script updates version numbers across all packages in the monorepo,
 * including the root deno.jsonc, all package deno.json files, inter-package
 * dependencies, and stub files.
 *
 * @module scripts/bump
 *
 * @example
 * ```bash
 * # Bump all packages to version 0.2.0
 * deno task bump 0.2.0
 *
 * # Or run directly
 * deno run -A scripts/bump.ts 0.2.0
 * ```
 */

import { parse } from '@std/jsonc'

// =============================================================================
// Types
// =============================================================================

/**
 * Root monorepo configuration structure.
 */
interface RootConfig {
    /** Current version of the monorepo */
    version: string
    /** List of workspace member paths */
    readonly workspace: readonly string[]
    /** Import map entries */
    imports?: Record<string, string>
}

/**
 * Package configuration structure.
 */
interface PackageConfig {
    /** Package version */
    version: string
    /** Import map entries */
    imports?: Record<string, string>
}

/**
 * Result of an update operation.
 */
interface UpdateResult {
    /** Whether the update was successful */
    readonly success: boolean
    /** Path that was updated */
    readonly path: string
    /** Error message if failed */
    readonly error?: string
}

// =============================================================================
// Constants
// =============================================================================

/** Path to the root configuration file */
const ROOT_CONFIG_PATH = './deno.jsonc' as const

/** Regex pattern for matching JSR Lockness imports with versions */
export const LOCKNESS_VERSION_PATTERN =
    /(jsr:@lockness\/[^@]+)@([\^~])([\d.]+)/g

/** Regex pattern for extracting version parts from an import */
export const VERSION_EXTRACT_PATTERN = /(jsr:@lockness\/[^@]+)@([\^~])([\d.]+)/

/** Regex pattern for validating semver format */
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract error message from an unknown error.
 *
 * @param error - The error to extract message from
 * @returns The error message string
 */
export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/**
 * Check if an import key/value pair is a Lockness package.
 *
 * @param key - The import key
 * @param value - The import value
 * @returns True if this is a Lockness package import
 */
export function isLocknessImport(key: string, value: unknown): value is string {
    return (
        typeof value === 'string' &&
        (key.startsWith('@lockness/') || value.includes('jsr:@lockness/'))
    )
}

/**
 * Update the version in a JSR import string.
 *
 * @param importValue - The current import value
 * @param newVersion - The new version to set
 * @returns The updated import string, or null if no match
 */
export function updateImportVersion(
    importValue: string,
    newVersion: string,
): string | null {
    const match = importValue.match(VERSION_EXTRACT_PATTERN)
    if (!match) return null

    const [, packagePath, versionPrefix] = match
    return `${packagePath}@${versionPrefix}${newVersion}`
}

/**
 * Recursively collect all .stub files from a directory.
 *
 * @param dirPath - The directory path to scan
 * @returns Array of stub file paths
 */
async function collectStubFiles(dirPath: string): Promise<string[]> {
    const stubFiles: string[] = []

    const walk = async (path: string): Promise<void> => {
        try {
            for await (const entry of Deno.readDir(path)) {
                const fullPath = `${path}/${entry.name}`
                if (entry.isDirectory) {
                    await walk(fullPath)
                } else if (entry.name.endsWith('.stub')) {
                    stubFiles.push(fullPath)
                }
            }
        } catch {
            // Directory doesn't exist or isn't readable
        }
    }

    await walk(dirPath)
    return stubFiles
}

// =============================================================================
// Update Functions
// =============================================================================

/**
 * Update the root monorepo configuration.
 *
 * Updates both the version field and any Lockness imports.
 *
 * @param newVersion - The new version to set
 * @returns The updated root configuration
 */
async function updateRootConfig(newVersion: string): Promise<RootConfig> {
    const content = await Deno.readTextFile(ROOT_CONFIG_PATH)
    const config = parse(content) as unknown as RootConfig

    // Update version
    config.version = newVersion

    // Update imports
    if (config.imports) {
        for (const [key, value] of Object.entries(config.imports)) {
            if (isLocknessImport(key, value)) {
                const updated = updateImportVersion(value, newVersion)
                if (updated && updated !== value) {
                    config.imports[key] = updated
                }
            }
        }
    }

    await Deno.writeTextFile(
        ROOT_CONFIG_PATH,
        JSON.stringify(config, null, 4) + '\n',
    )

    return config
}

/**
 * Update a single package's version and dependencies.
 *
 * @param memberPath - Path to the package (e.g., './packages/core')
 * @param newVersion - The new version to set
 * @returns Result of the update operation
 */
async function updatePackage(
    memberPath: string,
    newVersion: string,
): Promise<UpdateResult> {
    const configPath = `${memberPath}/deno.json`

    try {
        const content = await Deno.readTextFile(configPath)
        const config = JSON.parse(content) as PackageConfig

        // Update version
        config.version = newVersion

        // Update imports
        let hasImportUpdates = false
        if (config.imports) {
            for (const [key, value] of Object.entries(config.imports)) {
                if (isLocknessImport(key, value)) {
                    const updated = updateImportVersion(value, newVersion)
                    if (updated && updated !== value) {
                        config.imports[key] = updated
                        hasImportUpdates = true
                    }
                }
            }
        }

        await Deno.writeTextFile(
            configPath,
            JSON.stringify(config, null, 4) + '\n',
        )

        return {
            success: true,
            path: memberPath,
            error: hasImportUpdates ? undefined : undefined,
        }
    } catch (error) {
        return {
            success: false,
            path: memberPath,
            error: getErrorMessage(error),
        }
    }
}

/**
 * Update version references in a stub file.
 *
 * @param stubPath - Path to the stub file
 * @param newVersion - The new version to set
 * @returns Result of the update operation
 */
async function updateStubFile(
    stubPath: string,
    newVersion: string,
): Promise<UpdateResult> {
    try {
        const content = await Deno.readTextFile(stubPath)
        const updatedContent = content.replace(
            LOCKNESS_VERSION_PATTERN,
            `$1@$2${newVersion}`,
        )

        if (updatedContent !== content) {
            await Deno.writeTextFile(stubPath, updatedContent)
            return { success: true, path: stubPath }
        }

        return { success: true, path: stubPath }
    } catch (error) {
        return {
            success: false,
            path: stubPath,
            error: getErrorMessage(error),
        }
    }
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Print the final summary and next steps.
 *
 * @param newVersion - The version that was set
 */
function printSummary(newVersion: string): void {
    console.log('')
    console.log(
        `✨ Bump terminé ! Tous les packages sont en version ${newVersion}`,
    )
    console.log('')
    console.log('📝 Prochaines étapes:')
    console.log('   1. Vérifier les changements: git diff')
    console.log('   2. Tester: deno task test')
    console.log('   3. Publier: deno publish')
    console.log('')
}

/**
 * Main entry point for the bump script.
 *
 * Orchestrates the version bump across all packages.
 */
async function main(): Promise<void> {
    const newVersion = Deno.args[0]

    if (!newVersion) {
        console.error(
            '❌ Merci de spécifier une version. Ex: deno task bump 0.2.0',
        )
        Deno.exit(1)
    }

    // Validate version format
    if (!SEMVER_PATTERN.test(newVersion)) {
        console.error(
            '❌ Format de version invalide. Utilisez le format semver: X.Y.Z',
        )
        Deno.exit(1)
    }

    console.log(`🚀 Mise à jour vers la version ${newVersion}`)
    console.log('')

    // Step 0: Update root config
    console.log('🏠 Mise à jour de la version du monorepo racine...')
    const rootConfig = await updateRootConfig(newVersion)
    console.log(`   ✅ deno.jsonc → ${newVersion}`)
    console.log('')

    // Step 1: Update all packages
    console.log('📦 Mise à jour des versions des packages...')
    for (const member of rootConfig.workspace) {
        const result = await updatePackage(member, newVersion)
        if (result.success) {
            console.log(`   ✅ ${member} → ${newVersion}`)
        } else {
            console.warn(`   ⚠️  ${member}: ${result.error}`)
        }
    }
    console.log('')

    // Step 2: Update stub files
    console.log('🔧 Mise à jour des fichiers stubs...')
    const stubFiles: string[] = []

    for await (const entry of Deno.readDir('packages')) {
        if (entry.isDirectory) {
            const packageStubs = await collectStubFiles(
                `packages/${entry.name}/stubs`,
            )
            stubFiles.push(...packageStubs)
        }
    }

    let stubUpdates = 0
    for (const stubPath of stubFiles) {
        const result = await updateStubFile(stubPath, newVersion)
        if (result.success) {
            const content = await Deno.readTextFile(stubPath)
            if (
                content.includes(`@^${newVersion}`) ||
                content.includes(`@~${newVersion}`)
            ) {
                console.log(`   ✅ ${stubPath}`)
                stubUpdates++
            }
        } else {
            console.warn(`   ⚠️  ${stubPath}: ${result.error}`)
        }
    }

    if (stubUpdates === 0 && stubFiles.length > 0) {
        console.log('   ℹ️  Aucun fichier stub nécessitant une mise à jour')
    } else if (stubFiles.length === 0) {
        console.log('   ℹ️  Aucun fichier stub trouvé')
    }

    printSummary(newVersion)
}

// =============================================================================
// Execution
// =============================================================================

if (import.meta.main) {
    main()
}
