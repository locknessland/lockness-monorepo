/**
 * @fileoverview The `make:controller` scaffolding command.
 *
 * Scaffolds a controller class, optionally with a paired view.
 *
 * @module @lockness/cli/commands/make/controller
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../stubs.ts'
import {
    CommandFailedError,
    type CommandStep,
    runSteps,
} from '../../command_failure.ts'
import { STUBS_PATH } from './stub_paths.ts'
import { refreshRoutesRegistry } from './routes_registry.ts'

/**
 * The `make:controller` command definition.
 *
 * Scaffolds a controller class, optionally with a paired view. With `--view`,
 * a view that fails to write does not stop the controller: it is written with
 * the plain stub, then the command fails naming the `view` step (#436, P1).
 *
 * @throws {CommandFailedError} When no name is given, or when a step failed
 *   (`<n> of <m> steps failed: <labels>`, the first failure as its cause).
 */
export const makeController: MakeCommand = {
    name: 'make:controller',
    description: 'Create a new controller class',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            throw new CommandFailedError(
                'Please provide a controller name (e.g., User)',
            )
        }

        // Check for --view flag
        const withView = args.includes('--view')

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = `${name.toLowerCase()}_controller.tsx`
        const dirPath = `./app/controller`
        const filePath = `${dirPath}/${fileName}`

        const steps: CommandStep[] = []
        let viewCreated = false
        if (withView) {
            steps.push({
                label: 'view',
                run: async () => {
                    const viewFileName = name.toLowerCase()
                    const viewDirPath = `./app/view/pages`
                    const viewFilePath = `${viewDirPath}/${viewFileName}.tsx`
                    const viewContent = await Stub.renderFrom(
                        STUBS_PATH,
                        'make',
                        'view',
                        {
                            className,
                            fileName: viewFileName,
                        },
                    )

                    await Deno.mkdir(viewDirPath, { recursive: true })
                    await Deno.writeTextFile(viewFilePath, viewContent)
                    console.log(`✅ View created at ${viewFilePath}`)
                    viewCreated = true
                },
            })
        }

        steps.push({
            label: 'controller',
            run: async () => {
                // Without its view, the controller falls back to the plain
                // stub, which renders nothing it cannot find.
                const stubName = viewCreated
                    ? 'controller-with-view'
                    : 'controller'
                const content = await Stub.renderFrom(
                    STUBS_PATH,
                    'make',
                    stubName,
                    {
                        className,
                        route: name.toLowerCase(),
                        viewName: className,
                    },
                )

                await Deno.mkdir(dirPath, { recursive: true })
                await Deno.writeTextFile(filePath, content)
                console.log(`✅ Controller created at ${filePath}`)

                // Auto-regenerate routes.ts for production builds
                await refreshRoutesRegistry()
            },
        })

        await runSteps(steps)
    },
}
