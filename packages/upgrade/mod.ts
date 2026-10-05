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

import { runEntry } from '@lockness/cli/entry'
import { main } from './cli.ts'

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
// Execution
// =============================================================================

if (import.meta.main) await runEntry('upgrade', () => main(Deno.args))
