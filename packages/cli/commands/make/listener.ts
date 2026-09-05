/**
 * @fileoverview The `make:listener` scaffolding command.
 *
 * Scaffolds an event listener class.
 *
 * @module @lockness/cli/commands/make/listener
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:listener` command definition.
 *
 * Scaffolds an event listener class.
 */
export const makeListener: MakeCommand = {
    name: 'make:listener',
    description: 'Create a new event listener class',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error(
                '❌ Please provide a listener name (e.g., OrderListener)',
            )
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        // Convert PascalCase to snake_case for filename
        const fileName = `${
            name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
        }.ts`
        const dirPath = `./app/listener`
        const filePath = `${dirPath}/${fileName}`

        try {
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'listener',
                {
                    className,
                    description: className.replace(/Listener$/, '').replace(
                        /([A-Z])/g,
                        ' $1',
                    ).trim().toLowerCase(),
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Listener created at ${filePath}`)
            console.log(`\n💡 Next steps:`)
            console.log(`   1. Import your event class`)
            console.log(`   2. Add @Listener(YourEvent) decorator to methods`)
            console.log(`   3. Listeners are auto-discovered on app boot`)
        } catch (error) {
            console.error(
                `❌ Failed to create listener: ${(error as Error).message}`,
            )
        }
    },
}
