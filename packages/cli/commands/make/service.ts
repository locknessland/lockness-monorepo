/**
 * @fileoverview The `make:service` scaffolding command.
 *
 * Scaffolds a service class.
 *
 * @module @lockness/cli/commands/make/service
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import { CommandFailedError } from '../../command_failure.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:service` command definition.
 *
 * Scaffolds a service class.
 *
 * @throws {CommandFailedError} When no name is given. A failed write is not
 * caught: it reaches `Cli.dispatch()`, which prints it with its frames.
 */
export const makeService: MakeCommand = {
    name: 'make:service',
    description: 'Create a new service class',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            throw new CommandFailedError(
                'Please provide a service name (e.g., Auth)',
            )
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = `${name.toLowerCase()}_service.ts`
        const dirPath = `./app/service`
        const filePath = `${dirPath}/${fileName}`

        const content = await Stub.renderFrom(
            STUBS_PATH,
            'make',
            'service',
            {
                className,
            },
        )

        await Deno.mkdir(dirPath, { recursive: true })
        await Deno.writeTextFile(filePath, content)
        console.log(`✅ Service created at ${filePath}`)
    },
}
