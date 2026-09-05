/**
 * @fileoverview Tests for the make:factory generator — stub content (explicit,
 * faker-backed, opt-in) and command registration.
 *
 * @module @lockness/drizzle/tests/make_factory
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { registerDrizzleCommands } from '../mod.ts'
import { processStub } from '../cli_commands.ts'
import { handleMakeFactory } from '../generators/factory_generator.ts'

Deno.test('make:factory stub is a faker-backed Factory subclass with explicit fields', async () => {
    const content = await processStub('factory', { className: 'User' })
    assertStringIncludes(content, 'export class UserFactory extends Factory')
    assertStringIncludes(content, "import { Factory } from '@lockness/drizzle'")
    assertStringIncludes(content, "import { faker } from '@faker-js/faker'")
    assertStringIncludes(content, 'protected definition()')
    // Opt-in: it never spreads a model.
    assert(!content.includes('...'))
})

Deno.test('make:factory is registered by registerDrizzleCommands', () => {
    const names: string[] = []
    const fakeCli = {
        register(name: string, _handler: unknown, _description?: string) {
            names.push(name)
        },
    }
    // deno-lint-ignore no-explicit-any -- minimal fake CLI for registration capture
    registerDrizzleCommands(fakeCli as any)
    assert(names.includes('make:factory'))
})

Deno.test('handleMakeFactory end-to-end', async (t) => {
    await t.step(
        'empty-name guard prints usage and writes no file',
        async () => {
            // The guard runs before any path is built, so nothing is written.
            // Run in an isolated temp dir and assert the factories directory
            // never comes into existence. Capture console.error to confirm the
            // observable contract (usage message), and restore it in finally.
            const dir = await Deno.makeTempDir()
            const prevCwd = Deno.cwd()
            const originalError = console.error
            const errors: string[] = []
            console.error = (...parts: unknown[]) => {
                errors.push(parts.map((p) => String(p)).join(' '))
            }
            Deno.chdir(dir)
            try {
                await handleMakeFactory([])

                assert(
                    errors.some((line) =>
                        line.includes('provide a factory name')
                    ),
                    'expected a usage message on the empty-name guard',
                )
                await assertRejects(
                    () => Deno.stat(`${dir}/database/factories`),
                    Deno.errors.NotFound,
                )
            } finally {
                console.error = originalError
                Deno.chdir(prevCwd)
                await Deno.remove(dir, { recursive: true })
            }
        },
    )

    await t.step(
        'capitalizes the class name, writes to ./database/factories/<name>_factory.ts, and fills the stub',
        async () => {
            // Lowercase input exercises the capitalization branch: `user` must
            // produce class `UserFactory`, while the file name is lowercased.
            const dir = await Deno.makeTempDir()
            const prevCwd = Deno.cwd()
            Deno.chdir(dir)
            try {
                await handleMakeFactory(['user'])

                const filePath = `${dir}/database/factories/user_factory.ts`
                // AC4: the createFile write branch ran — the file exists.
                const stat = await Deno.stat(filePath)
                assert(stat.isFile)

                const written = await Deno.readTextFile(filePath)
                // AC2: className was capitalized from `user` to `User`.
                assertStringIncludes(
                    written,
                    'export class UserFactory extends Factory',
                )
                // AC4: the stub content was rendered into the file.
                assertStringIncludes(
                    written,
                    "import { faker } from '@faker-js/faker'",
                )
            } finally {
                Deno.chdir(prevCwd)
                await Deno.remove(dir, { recursive: true })
            }
        },
    )

    await t.step(
        'builds the output path from the raw name, lowercased',
        async () => {
            // AC3: an already-capitalized name yields the lowercased file name
            // `user_factory.ts` under ./database/factories.
            const dir = await Deno.makeTempDir()
            const prevCwd = Deno.cwd()
            Deno.chdir(dir)
            try {
                await handleMakeFactory(['User'])

                const stat = await Deno.stat(
                    `${dir}/database/factories/user_factory.ts`,
                )
                assertEquals(stat.isFile, true)
            } finally {
                Deno.chdir(prevCwd)
                await Deno.remove(dir, { recursive: true })
            }
        },
    )
})
