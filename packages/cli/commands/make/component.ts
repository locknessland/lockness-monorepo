/**
 * @fileoverview The `make:component` scaffolding command.
 *
 * Scaffolds a JSX component.
 *
 * @module @lockness/cli/commands/make/component
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../mod.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:component` command definition.
 *
 * Scaffolds a JSX component.
 */
export const makeComponent: MakeCommand = {
    name: 'make:component',
    description: 'Create a new JSX component',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a component name (e.g., Button)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = name.toLowerCase()
        const dirPath = `./app/view/components`
        const filePath = `${dirPath}/${fileName}.tsx`

        const propsInterface = `{ children?: any }`

        try {
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'component',
                {
                    className,
                    propsInterface,
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Component created at ${filePath}`)
        } catch (error) {
            console.error(
                `❌ Failed to create component: ${(error as Error).message}`,
            )
        }
    },
}
