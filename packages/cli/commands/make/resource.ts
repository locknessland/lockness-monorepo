/**
 * @fileoverview The `make:resource` scaffolding command.
 *
 * Scaffolds an API Resource — an explicit, opt-in projection of a model into
 * its wire shape. The stub body names fields explicitly (never `{ ...model }`),
 * so a freshly generated, unedited resource is opt-in by default (security S2).
 *
 * Imports `Stub` from its defining module (`../../stubs.ts`) rather than the
 * `cli/mod.ts` barrel, so it does not re-widen the reverse-edge refactor #244
 * is filed to shrink (architecture A3).
 *
 * @module @lockness/cli/commands/make/resource
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:resource` command definition.
 *
 * Scaffolds an API Resource class under `./app/resource`.
 */
export const makeResource: MakeCommand = {
    name: 'make:resource',
    description: 'Create a new API Resource class',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a resource name (e.g., User)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = `${name.toLowerCase()}_resource.ts`
        const dirPath = `./app/resource`
        const filePath = `${dirPath}/${fileName}`

        try {
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'resource',
                {
                    className,
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Resource created at ${filePath}`)
        } catch (error) {
            console.error(
                `❌ Failed to create resource: ${(error as Error).message}`,
            )
        }
    },
}
