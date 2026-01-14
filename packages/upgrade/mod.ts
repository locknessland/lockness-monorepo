#!/usr/bin/env -S deno run -A
import { parseArgs } from '@std/cli'
import { Upgrader } from './upgrader.ts'
import { createVersionProvider } from './version_fetcher.ts'
import type { PackageUpgrade } from './types.ts'

/**
 * Print upgrade summary
 */
function printSummary(
    upgrades: PackageUpgrade[],
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
 * Print success message
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
            '  - Check the changelog at https://github.com/locknessjs/lockness/releases',
        )
        console.log('  - Test your application\n')
    }
}

/**
 * Main CLI entry point
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

// Run CLI if executed directly
if (import.meta.main) {
    main()
}
