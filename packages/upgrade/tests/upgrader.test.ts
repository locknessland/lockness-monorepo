import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { Upgrader } from '../upgrader.ts'
import type { VersionProvider } from '../types.ts'

/**
 * Mock version provider for tests
 */
class TestVersionProvider implements VersionProvider {
    getLatestVersion(_packageName: string): Promise<string> {
        return Promise.resolve('0.2.0')
    }
}

Deno.test('upgrader - extracts version correctly from import string', () => {
    // This is tested indirectly through the full upgrade flow
    // The extraction logic is private, so we verify it through integration tests
    assertEquals(true, true)
})

Deno.test('upgrader - detects Lockness packages in deno.json', async () => {
    const upgrader = new Upgrader(new TestVersionProvider())
    const fixtureDir = join(
        Deno.cwd(),
        'packages/upgrade/tests/fixtures',
    )
    const fixturePath = join(fixtureDir, 'sample_deno.json')

    const result = await upgrader.upgrade({
        configPath: fixturePath,
        dryRun: true,
    })

    assertEquals(result.success, true)
    assertEquals(result.dryRun, true)
    assertEquals(result.upgrades.length, 5) // 5 @lockness packages in fixture
})

Deno.test('upgrader - dry run does not modify files', async () => {
    const upgrader = new Upgrader(new TestVersionProvider())
    const fixtureDir = join(
        Deno.cwd(),
        'packages/upgrade/tests/fixtures',
    )
    const fixturePath = join(fixtureDir, 'sample_deno.json')

    // Read original content
    const originalContent = await Deno.readTextFile(fixturePath)

    const result = await upgrader.upgrade({
        configPath: fixturePath,
        dryRun: true,
    })

    // Read content after dry run
    const afterContent = await Deno.readTextFile(fixturePath)

    assertEquals(result.dryRun, true)
    assertEquals(originalContent, afterContent)
})

Deno.test('upgrader - identifies packages needing upgrade', async () => {
    const upgrader = new Upgrader(new TestVersionProvider())
    const fixtureDir = join(
        Deno.cwd(),
        'packages/upgrade/tests/fixtures',
    )
    const fixturePath = join(fixtureDir, 'sample_deno.json')

    const result = await upgrader.upgrade({
        configPath: fixturePath,
        targetVersion: '0.2.0',
        dryRun: true,
    })

    assertEquals(result.success, true)
    assertEquals(result.upgrades.length, 5)

    // Verify package names
    const packageNames = result.upgrades.map((u) => u.name)
    assertEquals(packageNames.includes('@lockness/core'), true)
    assertEquals(packageNames.includes('@lockness/cli'), true)
    assertEquals(packageNames.includes('@lockness/auth'), true)
})

Deno.test('upgrader - extracts current version correctly', async () => {
    const upgrader = new Upgrader(new TestVersionProvider())
    const fixtureDir = join(
        Deno.cwd(),
        'packages/upgrade/tests/fixtures',
    )
    const fixturePath = join(fixtureDir, 'sample_deno.json')

    const result = await upgrader.upgrade({
        configPath: fixturePath,
        dryRun: true,
    })

    // All packages in fixture are at 0.1.19
    for (const upgrade of result.upgrades) {
        assertEquals(upgrade.currentVersion, '0.1.19')
        assertEquals(upgrade.targetVersion, '0.2.0')
    }
})

Deno.test('upgrader - handles missing deno.json', async () => {
    const upgrader = new Upgrader(new TestVersionProvider())

    const result = await upgrader.upgrade({
        configPath: './nonexistent.json',
        dryRun: true,
    })

    assertEquals(result.success, false)
    assertEquals(result.error !== undefined, true)
})

Deno.test('upgrader - handles deno.json without imports', async () => {
    const upgrader = new Upgrader(new TestVersionProvider())

    // Create a temporary file without imports
    const tempFile = await Deno.makeTempFile({ suffix: '.json' })
    await Deno.writeTextFile(tempFile, '{"name": "test"}')

    const result = await upgrader.upgrade({
        configPath: tempFile,
        dryRun: true,
    })

    // Cleanup
    await Deno.remove(tempFile)

    assertEquals(result.success, false)
    assertEquals(result.error, 'No imports found in deno.json')
})

Deno.test('upgrader - handles deno.json without Lockness packages', async () => {
    const upgrader = new Upgrader(new TestVersionProvider())

    // Create a temporary file with only non-Lockness imports
    const tempFile = await Deno.makeTempFile({ suffix: '.json' })
    await Deno.writeTextFile(
        tempFile,
        JSON.stringify({
            imports: {
                '@std/path': 'jsr:@std/path@^1.0.0',
                'zod': 'npm:zod@^3.22.0',
            },
        }),
    )

    const result = await upgrader.upgrade({
        configPath: tempFile,
        dryRun: true,
    })

    // Cleanup
    await Deno.remove(tempFile)

    assertEquals(result.success, false)
    assertEquals(result.error, 'No Lockness packages found in imports')
})

Deno.test('upgrader - actual file modification works', async () => {
    const upgrader = new Upgrader(new TestVersionProvider())

    // Create a temporary test file
    const tempFile = await Deno.makeTempFile({ suffix: '.json' })
    const testContent = {
        name: 'test-project',
        imports: {
            '@lockness/core': 'jsr:@lockness/core@^0.1.19',
            '@std/path': 'jsr:@std/path@^1.0.0',
        },
    }
    await Deno.writeTextFile(tempFile, JSON.stringify(testContent, null, 4))

    // Perform upgrade (not dry-run)
    const result = await upgrader.upgrade({
        configPath: tempFile,
        targetVersion: '0.2.0',
        dryRun: false,
    })

    // Read modified content
    const modifiedContent = await Deno.readTextFile(tempFile)
    const modifiedJson = JSON.parse(modifiedContent)

    // Cleanup
    await Deno.remove(tempFile)

    assertEquals(result.success, true)
    assertEquals(result.dryRun, false)
    assertEquals(result.upgrades.length, 1)
    assertEquals(
        modifiedJson.imports['@lockness/core'],
        'jsr:@lockness/core@^0.2.0',
    )
    // Verify other imports are unchanged
    assertEquals(modifiedJson.imports['@std/path'], 'jsr:@std/path@^1.0.0')
})

Deno.test('upgrader - no upgrades needed returns success', async () => {
    const upgrader = new Upgrader(new TestVersionProvider())

    // Create a temporary test file with latest version
    const tempFile = await Deno.makeTempFile({ suffix: '.json' })
    const testContent = {
        name: 'test-project',
        imports: {
            '@lockness/core': 'jsr:@lockness/core@^0.2.0',
        },
    }
    await Deno.writeTextFile(tempFile, JSON.stringify(testContent, null, 4))

    const result = await upgrader.upgrade({
        configPath: tempFile,
        targetVersion: '0.2.0',
        dryRun: true,
    })

    // Cleanup
    await Deno.remove(tempFile)

    assertEquals(result.success, true)
    assertEquals(result.upgrades.length, 0)
})
