/**
 * @fileoverview The `make:controller` scaffolding command.
 *
 * Scaffolds a controller class, optionally with a paired view.
 *
 * @module @lockness/cli/commands/make/controller
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../mod.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:controller` command definition.
 *
 * Scaffolds a controller class, optionally with a paired view.
 */
export const makeController: MakeCommand = {
    name: 'make:controller',
    description: 'Create a new controller class',
    handler: async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a controller name (e.g., User)')
            return
        }

        // Check for --view flag
        const withView = args.includes('--view')

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = `${name.toLowerCase()}_controller.tsx`
        const dirPath = `./app/controller`
        const filePath = `${dirPath}/${fileName}`

        try {
            // If --view flag is present, create the view first
            let viewCreated = false
            if (withView) {
                const viewClassName = className
                const viewFileName = name.toLowerCase()
                const viewDirPath = `./app/view/pages`
                const viewFilePath = `${viewDirPath}/${viewFileName}.tsx`

                try {
                    const viewContent = await Stub.renderFrom(
                        STUBS_PATH,
                        'make',
                        'view',
                        {
                            className: viewClassName,
                            fileName: viewFileName,
                        },
                    )

                    await Deno.mkdir(viewDirPath, { recursive: true })
                    await Deno.writeTextFile(viewFilePath, viewContent)
                    console.log(`✅ View created at ${viewFilePath}`)
                    viewCreated = true
                } catch (error) {
                    console.error(
                        `⚠️  Failed to create view: ${
                            (error as Error).message
                        }`,
                    )
                }
            }

            // Create controller with appropriate stub
            const stubName = withView && viewCreated
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
            try {
                const { generateRoutesFile } = await import(
                    '@lockness/contract'
                )
                await generateRoutesFile('./app/controller', './app/routes.ts')
                console.log('✅ Routes registry updated')
            } catch {
                console.log(
                    'ℹ️  Run "deno task routes:generate" to update routes registry',
                )
            }
        } catch (error) {
            console.error(
                `❌ Failed to create controller: ${(error as Error).message}`,
            )
        }
    },
}
