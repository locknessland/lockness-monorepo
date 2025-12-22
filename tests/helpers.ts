/**
 * Test Helpers
 *
 * Utility functions for testing Lockness framework
 */

import { existsSync } from '@std/fs'

/** Temporary test directory */
export const TEST_DIR = './.test-output'

/**
 * Setup test environment - create temp directory
 */
export async function setupTestDir(): Promise<void> {
    await cleanupTestDir()
    await Deno.mkdir(TEST_DIR, { recursive: true })
}

/**
 * Cleanup test environment - remove temp directory
 */
export async function cleanupTestDir(): Promise<void> {
    if (existsSync(TEST_DIR)) {
        await Deno.remove(TEST_DIR, { recursive: true })
    }
}

/**
 * Check if a file exists
 */
export function fileExists(path: string): boolean {
    return existsSync(path)
}

/**
 * Read file content
 */
export async function readFile(path: string): Promise<string> {
    return await Deno.readTextFile(path)
}

/**
 * Run an ACE command and capture output
 */
export async function runAceCommand(
    command: string,
    args: string[] = [],
): Promise<{ success: boolean; output: string }> {
    const cmd = new Deno.Command('deno', {
        args: ['task', 'ace', command, ...args],
        stdout: 'piped',
        stderr: 'piped',
        cwd: Deno.cwd(),
    })

    const { code, stdout, stderr } = await cmd.output()
    const output = new TextDecoder().decode(stdout) +
        new TextDecoder().decode(stderr)

    return {
        success: code === 0,
        output,
    }
}

/**
 * Check if generated TypeScript file is syntactically valid
 */
export async function isValidTypeScript(filePath: string): Promise<boolean> {
    const cmd = new Deno.Command('deno', {
        args: ['check', filePath],
        stdout: 'piped',
        stderr: 'piped',
    })

    const { code } = await cmd.output()
    return code === 0
}
