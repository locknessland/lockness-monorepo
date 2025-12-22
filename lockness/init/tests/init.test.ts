/**
 * Init Command Tests
 *
 * Tests for the project scaffolding functionality
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { existsSync } from '@std/fs'

const TEST_DIR = './.test-init-output'
const TEST_PROJECT = `${TEST_DIR}/test-project`

async function cleanupTestDir(): Promise<void> {
    if (existsSync(TEST_DIR)) {
        await Deno.remove(TEST_DIR, { recursive: true })
    }
}

describe('init command', () => {
    beforeEach(async () => {
        await cleanupTestDir()
        await Deno.mkdir(TEST_DIR, { recursive: true })
    })

    afterEach(async () => {
        await cleanupTestDir()
    })

    it('registerInitCommand registers the init command', async () => {
        const { registerInitCommand } = await import('../init.ts')

        let registeredName = ''
        const aceMock = {
            register: (name: string, _handler: unknown) => {
                registeredName = name
            },
        }

        registerInitCommand(aceMock as never)
        expect(registeredName).toBe('init')
    })

    it('scaffolds project with correct structure', async () => {
        const { registerInitCommand } = await import('../init.ts')

        let capturedHandler: ((args: string[]) => Promise<void>) | null = null
        const aceMock = {
            register: (_name: string, handler: (args: string[]) => Promise<void>) => {
                capturedHandler = handler
            },
        }

        registerInitCommand(aceMock as never)

        // Change to test dir before running
        const originalCwd = Deno.cwd()
        Deno.chdir(TEST_DIR)

        try {
            await capturedHandler!(['test-project'])

            // Check that main directories exist
            expect(existsSync('test-project')).toBe(true)
            expect(existsSync('test-project/src')).toBe(true)
            expect(existsSync('test-project/src/model')).toBe(true)
            expect(existsSync('test-project/src/service')).toBe(true)
            expect(existsSync('test-project/src/middleware')).toBe(true)
            expect(existsSync('test-project/src/repository')).toBe(true)
            expect(existsSync('test-project/public')).toBe(true)
        } finally {
            Deno.chdir(originalCwd)
        }
    })

    it('creates deno.json with correct structure', async () => {
        const { registerInitCommand } = await import('../init.ts')

        let capturedHandler: ((args: string[]) => Promise<void>) | null = null
        const aceMock = {
            register: (_name: string, handler: (args: string[]) => Promise<void>) => {
                capturedHandler = handler
            },
        }

        registerInitCommand(aceMock as never)

        const originalCwd = Deno.cwd()
        Deno.chdir(TEST_DIR)

        try {
            await capturedHandler!(['my-awesome-app'])

            const denoJson = JSON.parse(
                await Deno.readTextFile('my-awesome-app/deno.json')
            )
            // Verify deno.json has the expected structure
            expect(denoJson.tasks).toBeDefined()
            expect(denoJson.tasks.dev).toBeDefined()
            expect(denoJson.imports).toBeDefined()
        } finally {
            Deno.chdir(originalCwd)
        }
    })

    it('uses default project name when none provided', async () => {
        const { registerInitCommand } = await import('../init.ts')

        let capturedHandler: ((args: string[]) => Promise<void>) | null = null
        const aceMock = {
            register: (_name: string, handler: (args: string[]) => Promise<void>) => {
                capturedHandler = handler
            },
        }

        registerInitCommand(aceMock as never)

        const originalCwd = Deno.cwd()
        Deno.chdir(TEST_DIR)

        try {
            await capturedHandler!([])

            expect(existsSync('lockness-app')).toBe(true)
        } finally {
            Deno.chdir(originalCwd)
        }
    })

    it('creates .env file from .env.exemple', async () => {
        const { registerInitCommand } = await import('../init.ts')

        let capturedHandler: ((args: string[]) => Promise<void>) | null = null
        const aceMock = {
            register: (_name: string, handler: (args: string[]) => Promise<void>) => {
                capturedHandler = handler
            },
        }

        registerInitCommand(aceMock as never)

        const originalCwd = Deno.cwd()
        Deno.chdir(TEST_DIR)

        try {
            await capturedHandler!(['env-test'])

            // If .env.exemple exists, .env should be created
            if (existsSync('env-test/.env.exemple')) {
                expect(existsSync('env-test/.env')).toBe(true)
            }
        } finally {
            Deno.chdir(originalCwd)
        }
    })
})
