/**
 * @fileoverview The `make:view` scaffolding command.
 *
 * Scaffolds a view page.
 *
 * @module @lockness/cli/commands/make/view
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import { CommandFailedError } from '../../command_failure.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:view` command definition.
 *
 * Scaffolds a view page.
 *
 * @throws {CommandFailedError} When no name is given. A failed write is not
 * caught: it reaches `Cli.dispatch()`, which prints it with its frames.
 */
export const makeView: MakeCommand = {
    name: 'make:view',
    description: 'Create a new view page',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            throw new CommandFailedError(
                'Please provide a view name (e.g., Post)',
            )
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = name.toLowerCase()
        const dirPath = `./app/view/pages`
        const filePath = `${dirPath}/${fileName}.tsx`

        const content = await Stub.renderFrom(STUBS_PATH, 'make', 'view', {
            className,
            fileName,
        })

        await Deno.mkdir(dirPath, { recursive: true })
        await Deno.writeTextFile(filePath, content)
        console.log(`✅ View created at ${filePath}`)
    },
}
