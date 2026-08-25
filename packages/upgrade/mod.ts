#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Lockness Upgrade Tool - CLI and library for upgrading Lockness packages.
 *
 * This module provides both a CLI tool and programmatic API for upgrading
 * Lockness packages in a deno.json configuration file to their latest versions.
 *
 * @module @lockness/upgrade
 *
 * ## CLI Usage
 *
 * ```bash
 * # Upgrade to latest version
 * deno run -Ar jsr:@lockness/upgrade
 *
 * # Upgrade to specific version
 * deno run -Ar jsr:@lockness/upgrade 0.2.0
 *
 * # Dry run (preview only)
 * deno run -Ar jsr:@lockness/upgrade --dry-run
 * ```
 *
 * ## Programmatic Usage
 *
 * ```typescript
 * import { Upgrader, createVersionProvider } from '@lockness/upgrade'
 *
 * const upgrader = new Upgrader(createVersionProvider())
 * const result = await upgrader.upgrade({ dryRun: true })
 *
 * if (result.success) {
 *     for (const pkg of result.upgrades) {
 *         console.log(`${pkg.name}: ${pkg.currentVersion} → ${pkg.targetVersion}`)
 *     }
 * }
 * ```
 */

import { parseArgs } from '@std/cli'
import { Upgrader } from './upgrader.ts'
import { createVersionProvider } from './version_fetcher.ts'
import type { PackageUpgrade } from './types.ts'

// =============================================================================
// Exports
// =============================================================================

export { Upgrader } from './upgrader.ts'
export { createVersionProvider, JsrVersionProvider } from './version_fetcher.ts'
export type {
    PackageUpgrade,
    UpgradeOptions,
    UpgradeResult,
    VersionProvider,
} from './types.ts'

// =============================================================================
// CLI Helpers
// =============================================================================

// =============================================================================
// CLI Helpers
// =============================================================================

/**
 * Print a summary of package upgrades to the console.
 *
 * @param upgrades - List of package upgrades
 * @param dryRun - Whether this was a dry run
 *
 * @internal
 */
function printSummary(
    upgrades: readonly PackageUpgrade[],
    dryRun: boolean,
): void {
    if (upgrades.length === 0) {
        console.log('\n✅ All packages are already up to date!')
        return
    }

    const verb = dryRun ? 'Would upgrade' : 'Found'
    console.log(`\n📦 ${verb} ${upgrades.length} package(s):\n`)

    for (const upgrade of upgrades) {
        console.log(
            `  ${
                upgrade.name.padEnd(30)
            } ${upgrade.currentVersion} → ${upgrade.targetVersion}`,
        )
    }

    console.log()
}

/**
 * Print success message with next steps.
 *
 * @param dryRun - Whether this was a dry run
 *
 * @internal
 */
function printSuccess(dryRun: boolean): void {
    if (dryRun) {
        console.log('ℹ️  This was a dry run. No files were modified.')
        console.log('Run without --dry-run to apply changes.\n')
    } else {
        console.log('✅ deno.json updated successfully!\n')
        console.log("⚠️  Don't forget to:")
        console.log('  - Review the changes with git diff')
        console.log(
            '  - Check the changelog at https://github.com/locknessland/lockness-monorepo/releases',
        )
        console.log('  - Test your application\n')
    }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

/**
 * Main CLI entry point.
 *
 * Parses command-line arguments and runs the upgrade process.
 *
 * @internal
 */
async function main(): Promise<void> {
    const args = parseArgs(Deno.args, {
        boolean: ['dry-run', 'help'],
        alias: {
            'dry-run': 'd',
            'help': 'h',
        },
    })

    if (args.help) {
        console.log(`
Lockness Upgrade Tool

Usage:
  deno run -Ar jsr:@lockness/upgrade [version] [options]

Arguments:
  [version]         Target version (e.g., 0.2.0). If omitted, upgrades to latest.

Options:
  --dry-run, -d     Preview changes without applying them
  --help, -h        Show this help message

Examples:
  # Upgrade to latest version
  deno run -Ar jsr:@lockness/upgrade

  # Upgrade to specific version
  deno run -Ar jsr:@lockness/upgrade 0.2.0

  # Dry run (preview only)
  deno run -Ar jsr:@lockness/upgrade --dry-run
        `)
        Deno.exit(0)
    }

    const targetVersion = args._[0]?.toString()
    const dryRun = args['dry-run'] === true

    console.log('🔍 Detecting Lockness packages in deno.json...')

    const versionProvider = createVersionProvider()
    const upgrader = new Upgrader(versionProvider)

    const result = await upgrader.upgrade({
        targetVersion,
        dryRun,
    })

    if (!result.success) {
        console.error(`\n❌ Error: ${result.error}\n`)
        Deno.exit(1)
    }

    printSummary(result.upgrades, result.dryRun)
    printSuccess(result.dryRun)
}

// =============================================================================
// Execution
// =============================================================================

// Run CLI if executed directly
if (import.meta.main) {
    main()
}
