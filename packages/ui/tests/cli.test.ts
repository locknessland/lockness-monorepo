/**
 * CLI Tests for @lockness/ui
 *
 * Tests the CLI functionality including:
 * - Component listing
 * - Component installation
 * - Internal dependency resolution
 * - Import path rewriting
 * - File overwrite protection
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { exists } from '@std/fs/exists'
import { dirname, fromFileUrl, join } from '@std/path'

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a temporary test directory
 */
async function createTempDir(): Promise<string> {
    const tempDir = await Deno.makeTempDir({ prefix: 'lockness_ui_test_' })
    return tempDir
}

/**
 * Clean up temporary directory
 */
async function cleanupTempDir(dir: string): Promise<void> {
    try {
        await Deno.remove(dir, { recursive: true })
    } catch {
        // Ignore cleanup errors
    }
}

/**
 * Run CLI command and capture output
 */
async function runCli(args: string[]): Promise<{
    stdout: string
    stderr: string
    exitCode: number
}> {
    // Get the directory of this test file using fromFileUrl for cross-platform compatibility
    const testDir = dirname(fromFileUrl(import.meta.url))
    // CLI is in the parent directory (packages/ui/mod.ts)
    const cliPath = join(testDir, '..', 'mod.ts')

    const command = new Deno.Command(Deno.execPath(), {
        args: ['run', '-A', cliPath, ...args],
        stdout: 'piped',
        stderr: 'piped',
    })

    const { code, stdout, stderr } = await command.output()

    return {
        stdout: new TextDecoder().decode(stdout),
        stderr: new TextDecoder().decode(stderr),
        exitCode: code,
    }
}

// =============================================================================
// Tests
// =============================================================================

Deno.test('CLI: list command shows all components', async () => {
    const { stdout, exitCode } = await runCli(['list'])

    assertEquals(exitCode, 0)
    assertStringIncludes(stdout, 'Available components')
    assertStringIncludes(stdout, 'utils')
    assertStringIncludes(stdout, 'button')
    assertStringIncludes(stdout, 'card')
    assertStringIncludes(stdout, 'root-layout')
    assertStringIncludes(stdout, 'Class name utility')
})

Deno.test('CLI: add button installs button and utils', async () => {
    const tempDir = await createTempDir()

    try {
        const { stdout, exitCode } = await runCli([
            'add',
            'button',
            '--dir',
            tempDir,
        ])

        assertEquals(exitCode, 0)
        assertStringIncludes(stdout, 'Processing 2 component(s)')
        assertStringIncludes(stdout, 'Added lib/utils.ts')
        assertStringIncludes(stdout, 'Added components/ui/Button.tsx')

        // Verify files were created
        const utilsExists = await exists(join(tempDir, 'lib', 'utils.ts'))
        const buttonExists = await exists(
            join(tempDir, 'components', 'ui', 'Button.tsx'),
        )

        assertEquals(utilsExists, true, 'utils.ts should exist')
        assertEquals(buttonExists, true, 'Button.tsx should exist')
    } finally {
        await cleanupTempDir(tempDir)
    }
})

Deno.test('CLI: import paths are rewritten correctly', async () => {
    const tempDir = await createTempDir()

    try {
        await runCli(['add', 'button', '--dir', tempDir])

        // Read the button component
        const buttonPath = join(tempDir, 'components', 'ui', 'Button.tsx')
        const buttonContent = await Deno.readTextFile(buttonPath)

        // Check that import path is rewritten
        assertStringIncludes(
            buttonContent,
            `from '../../lib/utils.ts'`,
            'Import path should be rewritten to ../../lib/utils.ts',
        )
    } finally {
        await cleanupTempDir(tempDir)
    }
})

Deno.test('CLI: add multiple components at once', async () => {
    const tempDir = await createTempDir()

    try {
        const { stdout, exitCode } = await runCli([
            'add',
            'button',
            'card',
            '--dir',
            tempDir,
        ])

        assertEquals(exitCode, 0)
        assertStringIncludes(stdout, 'Processing 3 component(s)')

        // Verify all files were created
        const utilsExists = await exists(join(tempDir, 'lib', 'utils.ts'))
        const buttonExists = await exists(
            join(tempDir, 'components', 'ui', 'Button.tsx'),
        )
        const cardExists = await exists(
            join(tempDir, 'components', 'ui', 'Card.tsx'),
        )

        assertEquals(utilsExists, true, 'utils.ts should exist')
        assertEquals(buttonExists, true, 'Button.tsx should exist')
        assertEquals(cardExists, true, 'Card.tsx should exist')
    } finally {
        await cleanupTempDir(tempDir)
    }
})

Deno.test('CLI: --force flag overwrites existing files', async () => {
    const tempDir = await createTempDir()

    try {
        // First installation
        await runCli(['add', 'button', '--dir', tempDir])

        // Modify the button file
        const buttonPath = join(tempDir, 'components', 'ui', 'Button.tsx')
        await Deno.writeTextFile(buttonPath, '// Modified content')

        // Second installation without force
        const { stdout: stdout1 } = await runCli([
            'add',
            'button',
            '--dir',
            tempDir,
        ])
        assertStringIncludes(stdout1, 'already exists')

        // Verify file was not overwritten
        let content = await Deno.readTextFile(buttonPath)
        assertStringIncludes(content, '// Modified content')

        // Third installation with force
        const { stdout: stdout2 } = await runCli([
            'add',
            'button',
            '--dir',
            tempDir,
            '--force',
        ])
        assertStringIncludes(stdout2, 'Added components/ui/Button.tsx')

        // Verify file was overwritten
        content = await Deno.readTextFile(buttonPath)
        assertStringIncludes(content, 'export const Button')
    } finally {
        await cleanupTempDir(tempDir)
    }
})

Deno.test('CLI: shows npm dependencies instructions', async () => {
    const tempDir = await createTempDir()

    try {
        const { stdout } = await runCli(['add', 'button', '--dir', tempDir])

        // Should show that dependencies were added or already present
        const hasDepsMessage = stdout.includes('Added clsx') ||
            stdout.includes('All dependencies already present')
        assertEquals(hasDepsMessage, true)
    } finally {
        await cleanupTempDir(tempDir)
    }
})

Deno.test('CLI: root-layout has no internal dependencies', async () => {
    const tempDir = await createTempDir()

    try {
        const { stdout, exitCode } = await runCli([
            'add',
            'root-layout',
            '--dir',
            tempDir,
        ])

        assertEquals(exitCode, 0)
        assertStringIncludes(stdout, 'Processing 1 component(s)')

        // Only root-layout should be installed, not utils
        const layoutExists = await exists(
            join(tempDir, 'components', 'ui', 'RootLayout.tsx'),
        )
        const utilsExists = await exists(join(tempDir, 'lib', 'utils.ts'))

        assertEquals(layoutExists, true, 'RootLayout.tsx should exist')
        assertEquals(utilsExists, false, 'utils.ts should NOT exist')
    } finally {
        await cleanupTempDir(tempDir)
    }
})

Deno.test('CLI: unknown component shows error', async () => {
    const tempDir = await createTempDir()

    try {
        const { stderr, exitCode } = await runCli([
            'add',
            'nonexistent',
            '--dir',
            tempDir,
        ])

        assertEquals(exitCode, 1)
        assertStringIncludes(stderr, 'Unknown component')
    } finally {
        await cleanupTempDir(tempDir)
    }
})

Deno.test('CLI: add without components shows error', async () => {
    const tempDir = await createTempDir()

    try {
        const { stderr, exitCode } = await runCli(['add', '--dir', tempDir])

        assertEquals(exitCode, 1)
        assertStringIncludes(stderr, 'No components specified')
    } finally {
        await cleanupTempDir(tempDir)
    }
})

Deno.test('CLI: help flag shows usage information', async () => {
    const { stdout, exitCode } = await runCli(['--help'])

    assertEquals(exitCode, 0)
    assertStringIncludes(stdout, '@lockness/ui')
    assertStringIncludes(stdout, 'USAGE')
    assertStringIncludes(stdout, 'COMMANDS')
    assertStringIncludes(stdout, 'add')
    assertStringIncludes(stdout, 'list')
})

Deno.test('CLI: unknown command shows error', async () => {
    const { stderr, exitCode } = await runCli(['unknown'])

    assertEquals(exitCode, 1)
    assertStringIncludes(stderr, 'Unknown command')
})

// Note: Remote execution testing (fetching from JSR) is not included here
// as it requires the package to be published to JSR first.
// Manual testing should be performed after publishing:
// deno run -A jsr:@lockness/ui add button
