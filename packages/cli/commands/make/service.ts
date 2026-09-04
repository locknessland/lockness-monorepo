/**
 * @fileoverview The `make:service` scaffolding command.
 *
 * Scaffolds a service class.
 *
 * @module @lockness/cli/commands/make/service
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../mod.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:service` command definition.
 *
 * Scaffolds a service class.
 */
export const makeService: MakeCommand = {
    name: 'make:service',
    description: 'Create a new service class',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a service name (e.g., Auth)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = `${name.toLowerCase()}_service.ts`
        const dirPath = `./app/service`
        const filePath = `${dirPath}/${fileName}`

        try {
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
        } catch (error) {
            console.error(
                `❌ Failed to create service: ${(error as Error).message}`,
            )
        }
    },
}
