/**
 * @fileoverview The `make:policy` scaffolding command.
 *
 * Scaffolds an authorization policy.
 *
 * @module @lockness/cli/commands/make/policy
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:policy` command definition.
 *
 * Scaffolds an authorization policy.
 */
export const makePolicy: MakeCommand = {
    name: 'make:policy',
    description: 'Create an authorization policy',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a policy name (e.g., Post)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const namespace = name.toLowerCase()
        const fileName = `${namespace}_policy.ts`
        const dirPath = `./app/policy`
        const filePath = `${dirPath}/${fileName}`

        try {
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'policy',
                {
                    className,
                    namespace,
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Policy created at ${filePath}`)
        } catch (error) {
            console.error(
                `❌ Failed to create policy: ${(error as Error).message}`,
            )
        }
    },
}
