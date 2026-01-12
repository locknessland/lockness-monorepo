/**
 * Init Command Tests
 *
 * Tests for the project scaffolding functionality
 */

import { afterEach, beforeEach, describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { existsSync } from '@std/fs'

const TEST_DIR = './.test-init-output'

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
        const { registerInitCommand } = await import('../mod.ts')

        let registeredName = ''
        const cliMock = {
            register: (name: string, _handler: unknown) => {
                registeredName = name
            },
        }

        registerInitCommand(cliMock as never)
        expect(registeredName).toBe('init')
    })

    it('scaffolds project with correct structure', async () => {
        const { registerInitCommand } = await import('../mod.ts')

        let capturedHandler: ((args: string[]) => Promise<void>) | null = null
        const cliMock = {
            register: (
                _name: string,
                handler: (args: string[]) => Promise<void>,
            ) => {
                capturedHandler = handler
            },
        }

        registerInitCommand(cliMock as never)

        // Change to test dir before running
        const originalCwd = Deno.cwd()
        Deno.chdir(TEST_DIR)

        try {
            await capturedHandler!(['test-project'])

            // Check that main directories exist
            expect(existsSync('test-project')).toBe(true)
            expect(existsSync('test-project/app')).toBe(true)
            expect(existsSync('test-project/public')).toBe(true)
            expect(existsSync('test-project/scripts')).toBe(true)

            // Check that optional directories are not created by default
            expect(existsSync('test-project/app/model')).toBe(false)
            expect(existsSync('test-project/app/service')).toBe(false)
            expect(existsSync('test-project/app/middleware')).toBe(false)
            expect(existsSync('test-project/app/repository')).toBe(false)

            // Check that static directory is not created
            expect(existsSync('test-project/static')).toBe(false)
        } finally {
            Deno.chdir(originalCwd)
        }
    })

    it('creates deno.json with correct structure', async () => {
        const { registerInitCommand } = await import('../mod.ts')

        let capturedHandler: ((args: string[]) => Promise<void>) | null = null
        const cliMock = {
            register: (
                _name: string,
                handler: (args: string[]) => Promise<void>,
            ) => {
                capturedHandler = handler
            },
        }

        registerInitCommand(cliMock as never)

        const originalCwd = Deno.cwd()
        Deno.chdir(TEST_DIR)

        try {
            await capturedHandler!(['my-awesome-app'])

            const denoJson = JSON.parse(
                await Deno.readTextFile('my-awesome-app/deno.json'),
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
        const { registerInitCommand } = await import('../mod.ts')

        let capturedHandler: ((args: string[]) => Promise<void>) | null = null
        const cliMock = {
            register: (
                _name: string,
                handler: (args: string[]) => Promise<void>,
            ) => {
                capturedHandler = handler
            },
        }

        registerInitCommand(cliMock as never)

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
        const { registerInitCommand } = await import('../mod.ts')

        let capturedHandler: ((args: string[]) => Promise<void>) | null = null
        const cliMock = {
            register: (
                _name: string,
                handler: (args: string[]) => Promise<void>,
            ) => {
                capturedHandler = handler
            },
        }

        registerInitCommand(cliMock as never)

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

    it('creates Dockerfile with correct content', async () => {
        const { registerInitCommand } = await import('../mod.ts')

        let capturedHandler: ((args: string[]) => Promise<void>) | null = null
        const cliMock = {
            register: (
                _name: string,
                handler: (args: string[]) => Promise<void>,
            ) => {
                capturedHandler = handler
            },
        }

        registerInitCommand(cliMock as never)

        const originalCwd = Deno.cwd()
        Deno.chdir(TEST_DIR)

        try {
            await capturedHandler!(['docker-test'])

            expect(existsSync('docker-test/Dockerfile')).toBe(true)

            const dockerfile = await Deno.readTextFile(
                'docker-test/Dockerfile',
            )

            // Check for multi-stage build
            expect(dockerfile).toContain('FROM denoland/deno')
            expect(dockerfile).toContain('AS builder')
            expect(dockerfile).toContain('AS production')

            // Check for DENO_VERSION arg
            expect(dockerfile).toContain('ARG DENO_VERSION=')

            // Check for non-root user
            expect(dockerfile).toContain('USER lockness')

            // Check for health check
            expect(dockerfile).toContain('HEALTHCHECK')

            // Check for correct port
            expect(dockerfile).toContain('EXPOSE 8888')
        } finally {
            Deno.chdir(originalCwd)
        }
    })

    it('creates .dockerignore with correct content', async () => {
        const { registerInitCommand } = await import('../mod.ts')

        let capturedHandler: ((args: string[]) => Promise<void>) | null = null
        const cliMock = {
            register: (
                _name: string,
                handler: (args: string[]) => Promise<void>,
            ) => {
                capturedHandler = handler
            },
        }

        registerInitCommand(cliMock as never)

        const originalCwd = Deno.cwd()
        Deno.chdir(TEST_DIR)

        try {
            await capturedHandler!(['dockerignore-test'])

            expect(existsSync('dockerignore-test/.dockerignore')).toBe(true)

            const dockerignore = await Deno.readTextFile(
                'dockerignore-test/.dockerignore',
            )

            // Check for common ignores
            expect(dockerignore).toContain('node_modules')
            expect(dockerignore).toContain('.git')
            expect(dockerignore).toContain('.env')
            expect(dockerignore).toContain('coverage')
        } finally {
            Deno.chdir(originalCwd)
        }
    })

    it('creates binary files (favicon, images) correctly', async () => {
        const { registerInitCommand } = await import('../mod.ts')

        let capturedHandler: ((args: string[]) => Promise<void>) | null = null
        const cliMock = {
            register: (
                _name: string,
                handler: (args: string[]) => Promise<void>,
            ) => {
                capturedHandler = handler
            },
        }

        registerInitCommand(cliMock as never)

        const originalCwd = Deno.cwd()
        Deno.chdir(TEST_DIR)

        try {
            await capturedHandler!(['binary-test'])

            // Check that binary files exist
            expect(existsSync('binary-test/public/favicon.ico')).toBe(true)
            expect(existsSync('binary-test/public/favicon-16x16.png')).toBe(true)
            expect(existsSync('binary-test/public/favicon-32x32.png')).toBe(true)
            expect(existsSync('binary-test/public/apple-touch-icon.png')).toBe(true)
            expect(existsSync('binary-test/public/android-chrome-192x192.png')).toBe(true)
            expect(existsSync('binary-test/public/android-chrome-512x512.png')).toBe(true)

            // Verify that files are not empty (basic check)
            const faviconStats = await Deno.stat('binary-test/public/favicon.ico')
            expect(faviconStats.size).toBeGreaterThan(0)
        } finally {
            Deno.chdir(originalCwd)
        }
    })
})
