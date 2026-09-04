/**
 * @fileoverview The `make:error-pages` scaffolding command.
 *
 * Scaffolds the standard error pages (404, 401, 403, 500) and their handler.
 *
 * @module @lockness/cli/commands/make/error_pages
 */

import type { MakeCommand } from './types.ts'
import { Stub } from '../../mod.ts'
import { STUBS_PATH } from './stub_paths.ts'

/**
 * The `make:error-pages` command definition.
 *
 * Scaffolds the standard error pages (404, 401, 403, 500) and their handler.
 */
export const makeErrorPages: MakeCommand = {
    name: 'make:error-pages',
    description: 'Generate all error pages (404, 401, 403, 500)',
    handler: async () => {
        const errorPages = [
            {
                name: 'not_found',
                fileName: 'not_found.tsx',
                stub: 'error_not_found',
            },
            {
                name: 'unauthorized',
                fileName: 'unauthorized.tsx',
                stub: 'error_unauthorized',
            },
            {
                name: 'forbidden',
                fileName: 'forbidden.tsx',
                stub: 'error_forbidden',
            },
            {
                name: 'server_error',
                fileName: 'server_error.tsx',
                stub: 'error_server',
            },
        ]

        const dirPath = './app/view/pages/errors'

        try {
            await Deno.mkdir(dirPath, { recursive: true })

            // Generate error pages
            for (const page of errorPages) {
                const filePath = `${dirPath}/${page.fileName}`
                const content = await Stub.renderFrom(
                    STUBS_PATH,
                    'make',
                    page.stub,
                    {},
                )

                await Deno.writeTextFile(filePath, content)
                console.log(`✅ Created ${filePath}`)
            }

            // Generate error_handler.tsx
            const handlerPath = `${dirPath}/error_handler.tsx`
            const handlerContent = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'error_handler',
                {},
            )
            await Deno.writeTextFile(handlerPath, handlerContent)
            console.log(`✅ Created ${handlerPath}`)

            console.log('\n🎉 All error pages created successfully!')
            console.log('\n💡 Configure error handler in app/kernel.tsx:')
            console.log(`
import { errorHandler } from '@view/pages/errors/error_handler.tsx'

// Then add errorHandler to app.init() config:
app.init({
    errorHandler,
    // ... other config
})
`)
        } catch (error) {
            console.error(
                `❌ Failed to create error pages: ${(error as Error).message}`,
            )
        }
    },
}
