/**
 * @fileoverview The `jsr:@lockness/upgrade` command line: argument parsing and
 * console output around {@link Upgrader}. Internal — not in `exports`; the
 * package's `mod.ts` runs {@link main} through `runEntry` when executed.
 *
 * @module @lockness/upgrade/cli
 * @internal
 */

import { CommandFailedError } from '@lockness/cli/command-failure'
import { parseArgs } from '@std/cli'
import { Upgrader } from './upgrader.ts'
import { createVersionProvider } from './version_fetcher.ts'
import type { PackageUpgrade, VersionProvider } from './types.ts'

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
 * Parses command-line arguments and runs the upgrade process. A failure
 * throws — {@link runEntry} prints it once and sets the exit status; nothing
 * here touches process state.
 *
 * @param argv - The command-line arguments, without the program name.
 * @param versionProvider - Where the latest versions come from; JSR by
 *   default, injected by tests.
 * @throws {CommandFailedError} When the config has no imports or no Lockness
 *   package.
 * @throws {Error} Whatever `Upgrader.upgrade()` throws.
 *
 * @internal
 */
export async function main(
    argv: string[],
    versionProvider: VersionProvider = createVersionProvider(),
): Promise<void> {
    const args = parseArgs(argv, {
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
        return
    }

    const targetVersion = args._[0]?.toString()
    const dryRun = args['dry-run'] === true

    console.log('🔍 Detecting Lockness packages in deno.json...')

    const upgrader = new Upgrader(versionProvider)

    const result = await upgrader.upgrade({
        targetVersion,
        dryRun,
    })

    if (!result.success) {
        throw new CommandFailedError(result.error ?? 'Upgrade failed')
    }

    printSummary(result.upgrades, result.dryRun)
    printSuccess(result.dryRun)
}
