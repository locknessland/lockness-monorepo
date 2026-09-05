/**
 * @fileoverview The `make:job` scaffolding command.
 *
 * Scaffolds a background job.
 *
 * @module @lockness/cli/commands/make/job
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:job` command definition.
 *
 * Scaffolds a background job.
 */
export const makeJob: MakeCommand = {
    name: 'make:job',
    description: 'Create a new background job',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error(
                '❌ Please provide a job name (e.g., SendWelcomeEmail)',
            )
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const jobName = name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(
            /^-/,
            '',
        )
        const fileName = `${name.toLowerCase()}_job.ts`
        const dirPath = `./app/job`
        const filePath = `${dirPath}/${fileName}`

        try {
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'job',
                {
                    className,
                    jobName,
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Job created at ${filePath}`)
            console.log(`💡 Dispatch with: dispatch(new ${className}({ ... }))`)
        } catch (error) {
            console.error(
                `❌ Failed to create job: ${(error as Error).message}`,
            )
        }
    },
}
