/**
 * @fileoverview The `make:schedule` scaffolding command.
 *
 * Scaffolds a scheduled task class.
 *
 * @module @lockness/cli/commands/make/schedule
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:schedule` command definition.
 *
 * Scaffolds a scheduled task class.
 */
export const makeSchedule: MakeCommand = {
    name: 'make:schedule',
    description: 'Create a new scheduled task class',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error(
                '❌ Please provide a schedule name (e.g., ReportSchedule)',
            )
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = `${
            name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
        }.ts`
        const dirPath = `./app/schedule`
        const filePath = `${dirPath}/${fileName}`

        const description = className.replace(/Schedule$/, '').replace(
            /([A-Z])/g,
            ' $1',
        ).trim().toLowerCase()

        try {
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'schedule',
                {
                    className,
                    description,
                    // A task name is a map key and a log field, so it is
                    // constrained to [A-Za-z0-9._:-] by the scheduler.
                    taskName: className.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
                        .toLowerCase(),
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Schedule created at ${filePath}`)
            console.log(`\n💡 Next steps:`)
            console.log(`   1. Set the cron expression or preset on @Schedule`)
            console.log(
                `   2. Make the body idempotent — a run can be cut short`,
            )
            console.log(`   3. Schedules are auto-discovered on app boot`)
        } catch (error) {
            console.error(
                `❌ Failed to create schedule: ${(error as Error).message}`,
            )
        }
    },
}
