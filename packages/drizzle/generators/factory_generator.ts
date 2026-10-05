/**
 * @fileoverview The `make:factory` scaffolding handler.
 *
 * Lives in its own module (not inline in `cli_commands.ts`) so the 4th generator
 * does not grow that already-large file (architecture A-F5). It reuses
 * `cli_commands.ts`'s `processStub`/`createFile` helpers, so the stub-render
 * logic is not duplicated.
 *
 * @module @lockness/drizzle/generators/factory_generator
 * @since 0.2.1
 */

import { CommandFailedError } from '@lockness/cli/command-failure'
import { createFile, processStub } from '../cli_commands.ts'

/**
 * Handle `make:factory <Name>` — scaffold a faker-backed model factory under
 * `./database/factories`.
 *
 * A failure is thrown, never printed: `Cli.dispatch()` prints it once and
 * exits non-zero (#436). A write that fails is not caught here, so it reaches
 * the dispatcher's catch-all with its frames.
 *
 * @param args - CLI args; `args[0]` is the factory name (e.g. `User`).
 * @throws {CommandFailedError} When no factory name is given.
 */
export async function handleMakeFactory(args: string[]): Promise<void> {
    const name = args[0]
    if (!name) {
        throw new CommandFailedError(
            'Please provide a factory name (e.g., User)',
        )
    }

    const className = name.charAt(0).toUpperCase() + name.slice(1)
    const fileName = `${name.toLowerCase()}_factory.ts`
    const filePath = `./database/factories/${fileName}`

    const content = await processStub('factory', { className })
    await createFile(filePath, content)
    console.log(`✅ Factory created at ${filePath}`)
}
