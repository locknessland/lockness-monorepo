/**
 * @fileoverview The `make:view` scaffolding command.
 *
 * Scaffolds a view page.
 *
 * @module @lockness/cli/commands/make/view
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../mod.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:view` command definition.
 *
 * Scaffolds a view page.
 */
export const makeView: MakeCommand = {
    name: 'make:view',
    description: 'Create a new view page',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a view name (e.g., Post)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = name.toLowerCase()
        const dirPath = `./app/view/pages`
        const filePath = `${dirPath}/${fileName}.tsx`

        try {
            const content = await Stub.renderFrom(STUBS_PATH, 'make', 'view', {
                className,
                fileName,
            })

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ View created at ${filePath}`)
        } catch (error) {
            console.error(
                `❌ Failed to create view: ${(error as Error).message}`,
            )
        }
    },
}
