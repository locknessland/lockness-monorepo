/**
 * Test Helpers for CLI
 *
 * Utility functions for testing CLI commands
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
 * Run an CLI command and capture output
 */
export async function runAceCommand(
    command: string,
    args: string[] = [],
): Promise<{ success: boolean; output: string }> {
    const cmd = new Deno.Command('deno', {
        args: ['task', 'cli', command, ...args],
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

/** Every `console.log` / `console.error` call recorded by {@link captureConsole}. */
export interface CapturedConsole<T> {
    /** What the captured function returned. */
    readonly result: T
    /** The arguments of each `console.log` call, in order. */
    readonly log: unknown[][]
    /** The arguments of each `console.error` call, in order. */
    readonly error: unknown[][]
}

/**
 * Run `fn` with `console.log` and `console.error` recorded instead of printed,
 * restoring both afterwards — how a test counts the lines a failed command
 * printed.
 */
export async function captureConsole<T>(
    fn: () => Promise<T>,
): Promise<CapturedConsole<T>> {
    const log: unknown[][] = []
    const error: unknown[][] = []
    const original = { log: console.log, error: console.error }
    console.log = (...args: unknown[]) => void log.push(args)
    console.error = (...args: unknown[]) => void error.push(args)
    try {
        const result = await fn()
        return { result, log, error }
    } finally {
        console.log = original.log
        console.error = original.error
    }
}

/**
 * Run `fn` with a fresh temporary directory as the working directory,
 * restoring the previous one and removing the directory afterwards.
 * `Deno.chdir` is process-global, so this relies on `deno test` running a
 * file's tests sequentially.
 */
export async function inTempDir<T>(
    fn: (dir: string) => Promise<T>,
): Promise<T> {
    const previous = Deno.cwd()
    const dir = await Deno.makeTempDir({ prefix: 'lockness-cli-test-' })
    Deno.chdir(dir)
    try {
        return await fn(dir)
    } finally {
        Deno.chdir(previous)
        await Deno.remove(dir, { recursive: true })
    }
}
