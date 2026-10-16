/**
 * @fileoverview `registerCoreCommands` takes the command port, not `any`
 * (#576).
 *
 * The `@ts-expect-error` lines are the assertion: under the old `cli: any`
 * they were unused, which `deno check` reports as an error, so this file
 * failed to type-check until the parameter was typed.
 *
 * @module @lockness/core/tests/register_core_commands
 */

import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import type { CommandClass, CommandRegistry } from '@lockness/contract/command'
import { registerCoreCommands } from '../mod.ts'

test('registerCoreCommands - registers compile and ssg:build on any registry', async () => {
    const names: (string | undefined)[] = []
    const registry: CommandRegistry = {
        register: () => {},
        registerCommand: (command: CommandClass) => {
            names.push(command._commandName)
        },
    }

    await registerCoreCommands(registry)

    assertEquals(names, ['compile', 'ssg:build'])
})

test('registerCoreCommands - a value without registerCommand is a compile error', async () => {
    const calls: string[] = []
    const notARegistry = {
        register: (name: string) => void calls.push(name),
    }
    // @ts-expect-error -- no `registerCommand`: not a CommandRegistry (#576)
    const pending = registerCoreCommands(notARegistry)
    // At run time the same call fails, which is what the type now prevents.
    const failure = await pending.then(() => undefined, (error) => error)
    assertEquals(failure instanceof TypeError, true)
    assertEquals(calls, [])
})
