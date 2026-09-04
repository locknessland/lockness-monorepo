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

import { createFile, processStub } from '../cli_commands.ts'

/**
 * Handle `make:factory <Name>` — scaffold a faker-backed model factory under
 * `./database/factories`.
 *
 * @param args - CLI args; `args[0]` is the factory name (e.g. `User`).
 */
export async function handleMakeFactory(args: string[]): Promise<void> {
    const name = args[0]
    if (!name) {
        console.error('❌ Please provide a factory name (e.g., User)')
        return
    }

    const className = name.charAt(0).toUpperCase() + name.slice(1)
    const fileName = `${name.toLowerCase()}_factory.ts`
    const filePath = `./database/factories/${fileName}`

    try {
        const content = await processStub('factory', { className })
        await createFile(filePath, content)
        console.log(`✅ Factory created at ${filePath}`)
    } catch (error) {
        console.error(
            `❌ Failed to create factory: ${
                error instanceof Error ? error.message : String(error)
            }`,
        )
    }
}
