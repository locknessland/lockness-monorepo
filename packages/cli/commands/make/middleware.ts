/**
 * @fileoverview The `make:middleware` scaffolding command.
 *
 * Scaffolds a middleware class.
 *
 * @module @lockness/cli/commands/make/middleware
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../mod.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:middleware` command definition.
 *
 * Scaffolds a middleware class.
 */
export const makeMiddleware: MakeCommand = {
    name: 'make:middleware',
    description: 'Create a new middleware class',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a middleware name (e.g., Auth)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const middlewareName = name.toLowerCase()
        const fileName = `${name.toLowerCase()}_middleware.ts`
        const dirPath = `./app/middleware`
        const filePath = `${dirPath}/${fileName}`

        try {
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
        } catch (error) {
            console.error(
                `❌ Failed to create middleware: ${(error as Error).message}`,
            )
        }
    },
}
