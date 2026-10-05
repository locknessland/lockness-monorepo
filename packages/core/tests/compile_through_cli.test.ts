/**
 * @fileoverview `compile` fails through a real `Cli`, the way `./nessy
 * compile` runs it (#436, SC-004).
 *
 * `compile_command.test.ts` calls `CompileCommand.handle()` directly, so it
 * cannot see what the dispatcher does with the failure. Here the command is
 * registered by core's own `registerCoreCommands` — the function
 * `loadPackageCommands` finds on `@lockness/core` in production — on a real
 * `Cli`, and `cli.dispatch(['compile'])` runs in an empty directory: the
 * status is 1 and the user sees exactly one line, with no stack.
 *
 * `@lockness/cli` is declared in core's `deno.json` for tests only; the
 * dependency scan skips `tests/`.
 *
 * @module @lockness/core/tests/compile_through_cli
 */

import { assertEquals } from '@std/assert'
import { Cli } from '@lockness/cli'
import { registerCoreCommands } from '../mod.ts'

Deno.test('compile - through a real Cli, no kernel file exits 1 with one ❌ line', async () => {
    const dir = await Deno.makeTempDir({ prefix: 'lockness-compile-cli-' })
    const previous = Deno.cwd()
    const original = { log: console.log, error: console.error }
    const errors: unknown[][] = []
    try {
        const cli = new Cli()
        await registerCoreCommands(cli)
        Deno.chdir(dir)
        console.log = () => {}
        console.error = (...args: unknown[]) => void errors.push(args)
        const status = await cli.dispatch(['compile'])
        console.log = original.log
        console.error = original.error

        assertEquals(status, 1)
        assertEquals(errors, [[
            '❌ Kernel file not found (tried app/kernel.ts, app/kernel.tsx)',
        ]])
    } finally {
        console.log = original.log
        console.error = original.error
        Deno.chdir(previous)
        await Deno.remove(dir, { recursive: true })
    }
})
