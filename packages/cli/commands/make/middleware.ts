/**
 * @fileoverview The `make:middleware` scaffolding command.
 *
 * Scaffolds a middleware class.
 *
 * @module @lockness/cli/commands/make/middleware
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import { CommandFailedError } from '../../command_failure.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:middleware` command definition.
 *
 * Scaffolds a middleware class.
 *
 * @throws {CommandFailedError} When no name is given. A failed write is not
 * caught: it reaches `Cli.dispatch()`, which prints it with its frames.
 */
export const makeMiddleware: MakeCommand = {
    name: 'make:middleware',
    description: 'Create a new middleware class',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            throw new CommandFailedError(
                'Please provide a middleware name (e.g., Auth)',
            )
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const middlewareName = name.toLowerCase()
        const fileName = `${name.toLowerCase()}_middleware.ts`
        const dirPath = `./app/middleware`
        const filePath = `${dirPath}/${fileName}`

        const content = await Stub.renderFrom(
            STUBS_PATH,
            'make',
            'middleware',
            {
                className,
                middlewareName,
            },
        )

        await Deno.mkdir(dirPath, { recursive: true })
        await Deno.writeTextFile(filePath, content)
        console.log(`✅ Middleware created at ${filePath}`)
    },
}
