#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Version bump script for the Lockness monorepo.
 *
 * This script updates version numbers across all packages in the monorepo,
 * including the root deno.jsonc, all package deno.json files, inter-package
 * dependencies, and stub files.
 *
 * ## Comment preservation strategy
 *
 * The root `deno.jsonc` file is edited via `@david/jsonc-morph`, which
 * operates on the Concrete Syntax Tree (CST) of the file. Only the
 * touched leaf tokens (`version` value and `@lockness/*` import values)
 * are replaced in the source text; all comments, blank lines, key order,
 * and unrelated formatting are preserved byte-for-byte.
 *
 * Per-package `packages/*\/deno.json` files are plain JSON by convention
 * (no comments) and continue to use `JSON.parse` / `JSON.stringify`.
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

import { parse as parseJsonc } from '@david/jsonc-morph'
import { parse } from '@std/jsonc'
import { parseArgs } from '@std/cli/parse-args'
import * as semver from '@std/semver'

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
 * Rewrite the text of a JSONC config, bumping `version` and all
 * `@lockness/*` import values, while preserving every comment,
 * blank line, and unrelated token byte-for-byte.
 *
 * This is a pure function (no I/O) so it can be snapshot-tested directly.
 *
 * @param text - The raw source text of the JSONC file
 * @param newVersion - The new semver string to write
 * @returns The rewritten source text with only the targeted tokens changed
 *
 * @throws {Error} If the JSONC text is malformed or `version` key is missing
 *
 * @example
 * ```ts
 * const source = await Deno.readTextFile('deno.jsonc')
 * const updated = updateRootJsonc(source, '1.2.3')
 * await Deno.writeTextFile('deno.jsonc', updated)
 * ```
 */
export function updateRootJsonc(text: string, newVersion: string): string {
    const root = parseJsonc(text)
    const obj = root.asObjectOrThrow()

    // Bump the version field
    obj.getOrThrow('version').setValue(newVersion)

    // Bump any @lockness/* imports
    const importsProp = obj.get('imports')
    if (importsProp) {
        const importsObj = importsProp.valueIfObjectOrThrow()
        for (const prop of importsObj.properties()) {
            const key = prop.nameOrThrow().decodedValue()
            const valNode = prop.value()
            if (!valNode || !valNode.isString()) continue
            const strLit = valNode.asStringLitOrThrow()
            const current = strLit.decodedValue()
            if (!isLocknessImport(key, current)) continue
            const updated = updateImportVersion(current, newVersion)
            if (updated && updated !== current) {
                // setRawValue expects the raw JSON token including quotes
                strLit.setRawValue(`"${updated}"`)
            }
        }
    }

    return root.toString()
}

/**
 * Update the root monorepo configuration.
 *
 * Updates both the version field and any Lockness imports.
 * Uses {@link updateRootJsonc} to preserve comments in `deno.jsonc`.
 *
 * @param newVersion - The new version to set
 * @returns The updated root configuration (parsed for workspace traversal)
 */
async function updateRootConfig(newVersion: string): Promise<RootConfig> {
    const content = await Deno.readTextFile(ROOT_CONFIG_PATH)
    const rewritten = updateRootJsonc(content, newVersion)
    await Deno.writeTextFile(ROOT_CONFIG_PATH, rewritten)
    // Parse for caller to read workspace list; use @std/jsonc for read-only
    return parse(rewritten) as unknown as RootConfig
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
    const args = parseArgs(Deno.args, {
        boolean: ['major', 'minor', 'patch'],
        alias: { major: 'M', minor: 'm', patch: 'p' },
    })

    let newVersion = args._[0]?.toString()

    if (!newVersion) {
        // Read current version to determine next version
        try {
            const content = await Deno.readTextFile(ROOT_CONFIG_PATH)
            const config = parse(content) as unknown as RootConfig
            const currentVersion = config.version

            const versionSemver = semver.parse(currentVersion)

            if (args.major) {
                newVersion = semver.format(
                    semver.increment(versionSemver, 'major'),
                )
            } else if (args.minor) {
                newVersion = semver.format(
                    semver.increment(versionSemver, 'minor'),
                )
            } else if (args.patch) {
                newVersion = semver.format(
                    semver.increment(versionSemver, 'patch'),
                )
            } else {
                console.error(
                    '❌ Merci de spécifier une version ou un flag type --major, --minor, --patch.',
                )
                console.error('   Ex: deno task bump 0.2.0')
                console.error('   Ex: deno task bump --minor')
                Deno.exit(1)
            }
            console.log(
                `ℹ️  Bump automatique: ${currentVersion} -> ${newVersion}`,
            )
        } catch (error) {
            console.error(
                `❌ Impossible de lire la version actuelle: ${
                    getErrorMessage(error)
                }`,
            )
            Deno.exit(1)
        }
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
