import { assertEquals, assertExists } from '@std/assert'
import type { PackageUpgrade, UpgradeResult } from '../types.ts'

Deno.test('types - PackageUpgrade structure validation', () => {
    const upgrade: PackageUpgrade = {
        name: '@lockness/core',
        currentVersion: '0.1.19',
        targetVersion: '0.2.0',
    }

    assertExists(upgrade.name)
    assertExists(upgrade.currentVersion)
    assertExists(upgrade.targetVersion)
    assertEquals(typeof upgrade.name, 'string')
    assertEquals(typeof upgrade.currentVersion, 'string')
    assertEquals(typeof upgrade.targetVersion, 'string')
})

Deno.test('types - UpgradeResult successful upgrade', () => {
    const result: UpgradeResult = {
        success: true,
        upgrades: [],
        dryRun: false,
    }

    assertEquals(result.success, true)
    assertEquals(result.upgrades.length, 0)
    assertEquals(result.dryRun, false)
    assertEquals(result.error, undefined)
})

Deno.test('types - UpgradeResult with error', () => {
    const result: UpgradeResult = {
        success: false,
        upgrades: [],
        error: 'File not found',
        dryRun: false,
    }

    assertEquals(result.success, false)
    assertEquals(result.error, 'File not found')
})

Deno.test('types - UpgradeResult dry run', () => {
    const result: UpgradeResult = {
        success: true,
        upgrades: [
            {
                name: '@lockness/core',
                currentVersion: '0.1.19',
                targetVersion: '0.2.0',
            },
        ],
        dryRun: true,
    }

    assertEquals(result.dryRun, true)
    assertEquals(result.upgrades.length, 1)
})
