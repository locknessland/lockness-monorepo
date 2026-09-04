/**
 * @fileoverview The `make:command` scaffolding command.
 *
 * Scaffolds a CLI command.
 *
 * @module @lockness/cli/commands/make/command
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../mod.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:command` command definition.
 *
 * Scaffolds a CLI command.
 */
export const makeCommand: MakeCommand = {
    name: 'make:command',
    description: 'Create a new CLI command',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a command name (e.g., Greet)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const commandName = name.toLowerCase()
        const fileName = `${name.toLowerCase()}_command.ts`
        const dirPath = `./app/command`
        const filePath = `${dirPath}/${fileName}`

        try {
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'command',
                {
                    className,
                    commandName,
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Command created at ${filePath}`)
            console.log(`💡 Run it with: deno task cli ${commandName}`)
        } catch (error) {
            console.error(
                `❌ Failed to create command: ${(error as Error).message}`,
            )
        }
    },
}
