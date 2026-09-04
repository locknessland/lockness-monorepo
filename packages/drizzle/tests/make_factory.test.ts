/**
 * @fileoverview Tests for the make:factory generator — stub content (explicit,
 * faker-backed, opt-in) and command registration.
 *
 * @module @lockness/drizzle/tests/make_factory
 */

import { assert, assertStringIncludes } from '@std/assert'
import { registerDrizzleCommands } from '../mod.ts'
import { processStub } from '../cli_commands.ts'

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
