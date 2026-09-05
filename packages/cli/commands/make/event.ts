/**
 * @fileoverview The `make:event` scaffolding command.
 *
 * Scaffolds an event class.
 *
 * @module @lockness/cli/commands/make/event
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:event` command definition.
 *
 * Scaffolds an event class.
 */
export const makeEvent: MakeCommand = {
    name: 'make:event',
    description: 'Create a new event class',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error(
                '❌ Please provide an event name (e.g., UserRegistered)',
            )
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        // Convert PascalCase to snake_case for filename
        const fileName = `${
            name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
        }.ts`
        const dirPath = `./app/events`
        const filePath = `${dirPath}/${fileName}`

        try {
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'event',
                {
                    className,
                    description: className.replace(/([A-Z])/g, ' $1').trim()
                        .toLowerCase(),
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Event created at ${filePath}`)
            console.log(`\n💡 Next steps:`)
            console.log(`   1. Define event properties in the constructor`)
            console.log(
                `   2. Emit the event: await dispatcher().emit(new ${className}(...))`,
            )
            console.log(
                `   3. Create a listener with: deno task cli make:listener ${className}Listener`,
            )
        } catch (error) {
            console.error(
                `❌ Failed to create event: ${(error as Error).message}`,
            )
        }
    },
}
