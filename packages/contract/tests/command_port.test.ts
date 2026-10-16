/**
 * @fileoverview The command contribution port (`@lockness/contract/command`)
 * and the package setup port (`@lockness/contract/setup`), #592.
 *
 * Both are types, so most of what is pinned here is pinned by `deno check`: a
 * structural registry satisfies {@link CommandRegistry}, a value with no
 * `register` / `registerCommand` does not (`@ts-expect-error`), and a command
 * failure is recognised by shape. The runtime assertions prove the fakes are
 * actually driven, so a test that type-checks but never runs cannot pass.
 *
 * @module @lockness/contract/tests/command_port
 */

import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import type {
    CommandClass,
    CommandContext,
    CommandFailure,
    CommandHandler,
    CommandRegistry,
} from '../command.ts'
import type { PackageSetup, SetupContext } from '../setup.ts'

/** A registry that records what a package contributes. */
class RecordingRegistry implements CommandRegistry {
    readonly handlers = new Map<string, CommandHandler>()
    readonly descriptions = new Map<string, string>()
    readonly classes: CommandClass[] = []

    register(name: string, handler: CommandHandler, description = ''): void {
        this.handlers.set(name, handler)
        this.descriptions.set(name, description)
    }

    registerCommand(command: CommandClass): void {
        this.classes.push(command)
    }
}

test('CommandRegistry - a package contributes a handler with its description', async () => {
    const registry = new RecordingRegistry()
    const seen: string[][] = []
    const contribute = (cli: CommandRegistry): void => {
        cli.register('demo:run', (args) => {
            seen.push(args)
            return Promise.resolve()
        }, 'Run the demo')
    }

    contribute(registry)
    await registry.handlers.get('demo:run')?.(['--flag'])

    assertEquals(registry.descriptions.get('demo:run'), 'Run the demo')
    assertEquals(seen, [['--flag']])
})

test('CommandRegistry - a command class carries its own name and description', async () => {
    const handled: string[] = []
    class DemoCommand {
        static readonly _commandName = 'demo:class'
        static readonly _commandDescription = 'A class command'
        handle(ctx: CommandContext): Promise<void> {
            handled.push(ctx.arg(0) ?? '')
            return Promise.resolve()
        }
    }
    const registry = new RecordingRegistry()

    registry.registerCommand(DemoCommand)
    const [registered] = registry.classes
    const context: CommandContext = {
        args: ['x'],
        arg: (index) => ['x'][index],
        hasFlag: () => false,
        getFlag: () => undefined,
    }
    await new registered().handle(context)

    assertEquals(registered._commandName, 'demo:class')
    assertEquals(handled, ['x'])
})

test('CommandRegistry - a value without the registry methods does not type-check', () => {
    const accept = (_registry: CommandRegistry): boolean => true
    // @ts-expect-error -- no `register` / `registerCommand`: not a registry (#576)
    const rejected = accept({ run: () => Promise.resolve() })
    assertEquals(rejected, true)
})

test('CommandFailure - any Error with an integer exitCode meets the shape', () => {
    class LocalFailure extends Error implements CommandFailure {
        readonly exitCode = 3
    }
    const failure: CommandFailure = new LocalFailure('no')
    assertEquals(failure.exitCode, 3)
    // @ts-expect-error -- a plain Error carries no exitCode
    const plain: CommandFailure = new Error('plain')
    assertEquals(plain instanceof Error, true)
})

test('SetupContext - a setup registers its package and works under the project root', async () => {
    const registered: string[] = []
    const context: SetupContext = {
        root: '/app',
        registerPackage: (name) => {
            registered.push(name)
            return Promise.resolve()
        },
    }
    const setup: PackageSetup = async (ctx) => {
        await ctx.registerPackage('demo')
        registered.push(ctx.root)
    }

    await setup(context)

    assertEquals(registered, ['demo', '/app'])
})
