#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Deprecation Contracts Package Installer.
 *
 * Automatically configures the `@lockness/deprecation-contracts` package
 * in your project by adding it to `deno.json` and updating environment files.
 *
 * @module @lockness/deprecation-contracts/install
 *
 * @example
 * ```bash
 * deno run -A jsr:@lockness/deprecation-contracts/install
 * ```
 */

// No static import of @lockness/cli to avoid circular dependency
// core -> deprecation-contracts -> cli -> core

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
 * Check if the current directory is a valid Lockness project.
 *
 * @returns `true` if `deno.json` exists, `false` otherwise
 * @internal
 */
async function checkProjectStructure(): Promise<boolean> {
    try {
        await Deno.stat('./deno.json')
        return true
    } catch {
        console.error('❌ deno.json not found. Are you in a Lockness project?')
        return false
    }
}

/**
 * Update environment files with deprecation configuration.
 *
 * Adds `STRICT_DEPRECATIONS` and `IGNORE_DEPRECATIONS` variables
 * to `.env` and `.env.exemple` if they don't already exist.
 *
 * @returns void
 * @internal
 */
async function updateEnvFile(): Promise<void> {
    const envPath = './.env'
    const envExemplePath = './.env.exemple'

    // Update .env if it exists
    try {
        const envContent = await Deno.readTextFile(envPath)
        if (!envContent.includes('STRICT_DEPRECATIONS')) {
            await Deno.writeTextFile(envPath, envContent + DEPRECATION_CONFIG)
            console.log('✓ Updated .env with deprecation configuration')
        }
    } catch {
        // .env might not exist, skip silently
    }

    // Update .env.exemple if it exists
    try {
        const envExContent = await Deno.readTextFile(envExemplePath)
        if (!envExContent.includes('STRICT_DEPRECATIONS')) {
            await Deno.writeTextFile(
                envExemplePath,
                envExContent + DEPRECATION_CONFIG,
            )
            console.log('✓ Updated .env.exemple with deprecation configuration')
        }
    } catch {
        // .env.exemple might not exist, skip silently
    }
}

// =============================================================================
// Main
// =============================================================================

/**
 * Add a package to lockness.packages in deno.json/deno.jsonc
 * Standalone implementation to avoid dependency on @lockness/cli
 */
async function addPackage(packageName: string): Promise<void> {
    let configPath = 'deno.json'
    let text = ''
    try {
        text = await Deno.readTextFile(configPath)
    } catch {
        try {
            configPath = 'deno.jsonc'
            text = await Deno.readTextFile(configPath)
        } catch {
            return // No config to update
        }
    }

    try {
        // Use regex to find and update packages to preserve comments if possible
        // but for simplicity, we'll just parse it for now.
        // Deno's standard library has a better parser but we want zero deps.
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
    } catch {
        console.warn(`⚠️  Could not update ${configPath} automatically.`)
    }
}

/**
 * Main installer function.
 *
 * @returns void
 * @internal
 */
async function main(): Promise<void> {
    console.log('🌊 Installing @lockness/deprecation-contracts...\n')

    if (!(await checkProjectStructure())) {
        Deno.exit(1)
    }

    try {
        // 1. Add package to deno.json
        await addPackage('deprecation-contracts')

        // 2. Update environment variables
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
    } catch (error) {
        console.error('❌ Failed to add package to deno.json:', error)
        Deno.exit(1)
    }
}

if (import.meta.main) {
    await main()
}
