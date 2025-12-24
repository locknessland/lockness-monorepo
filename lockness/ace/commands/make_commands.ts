import { type Ace, Stub } from '../ace.ts'
import { dirname, fromFileUrl, join } from '@std/path'
import { generateRoutesFile } from '../routes_generator.ts'

const currentDir = dirname(fromFileUrl(import.meta.url))
const STUBS_PATH = join(currentDir, '..', 'stubs')

export function registerMakeCommands(ace: Ace) {
    ace.register('make:controller', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a controller name (e.g., User)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = `${name.toLowerCase()}_controller.tsx`
        const dirPath = `./src/controller`
        const filePath = `${dirPath}/${fileName}`

        try {
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'controller',
                {
                    className,
                    route: name.toLowerCase(),
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Controller created at ${filePath}`)

            // Auto-regenerate routes.ts for production builds
            try {
                await generateRoutesFile('./src/controller', './src/routes.ts')
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
    }, 'Create a new controller class')

    ace.register('make:middleware', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a middleware name (e.g., Auth)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const middlewareName = name.toLowerCase()
        const fileName = `${name.toLowerCase()}_middleware.ts`
        const dirPath = `./src/middleware`
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
    }, 'Create a new middleware class')

    ace.register('make:service', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a service name (e.g., Auth)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = `${name.toLowerCase()}_service.ts`
        const dirPath = `./src/service`
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
    }, 'Create a new service class')

    ace.register('make:view', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a view name (e.g., Post)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = name.toLowerCase()
        const dirPath = `./src/view/pages`
        const filePath = `${dirPath}/${fileName}.tsx`

        try {
            const content = await Stub.renderFrom(STUBS_PATH, 'make', 'view', {
                className,
                fileName,
            })

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ View created at ${filePath}`)
        } catch (error) {
            console.error(
                `❌ Failed to create view: ${(error as Error).message}`,
            )
        }
    }, 'Create a new view page')

    ace.register('make:component', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a component name (e.g., Button)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = name.toLowerCase()
        const dirPath = `./src/view/components`
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
    }, 'Create a new JSX component')

    ace.register('make:command', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a command name (e.g., Greet)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const commandName = name.toLowerCase()
        const fileName = `${name.toLowerCase()}_command.ts`
        const dirPath = `./src/command`
        const filePath = `${dirPath}/${fileName}`

        try {
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'command',
                {
                    className,
                    commandName,
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Command created at ${filePath}`)
            console.log(`💡 Run it with: deno task ace ${commandName}`)
        } catch (error) {
            console.error(
                `❌ Failed to create command: ${(error as Error).message}`,
            )
        }
    }, 'Create a new CLI command')

    ace.register('make:job', async (args) => {
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
        const dirPath = `./src/job`
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
    }, 'Create a new background job')

    ace.register('make:error-pages', async () => {
        const errorPages = [
            { name: 'not_found', fileName: 'not_found.tsx', stub: 'error_not_found' },
            { name: 'unauthorized', fileName: 'unauthorized.tsx', stub: 'error_unauthorized' },
            { name: 'forbidden', fileName: 'forbidden.tsx', stub: 'error_forbidden' },
            { name: 'server_error', fileName: 'server_error.tsx', stub: 'error_server' },
        ]

        const dirPath = './src/view/pages/errors'

        try {
            await Deno.mkdir(dirPath, { recursive: true })

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

            console.log('\n🎉 All error pages created successfully!')
            console.log('\n💡 Configure error handler in src/kernel.tsx:')
            console.log(`
import { NotFoundPage } from '@view/pages/errors/not_found.tsx'
import { UnauthorizedPage } from '@view/pages/errors/unauthorized.tsx'
import { ForbiddenPage } from '@view/pages/errors/forbidden.tsx'
import { ServerErrorPage } from '@view/pages/errors/server_error.tsx'

const errorHandler = (error: Error, c: Context) => {
    const status = (error as any).status || 500
    switch (status) {
        case 404: return c.html(<NotFoundPage />, 404)
        case 401: return c.html(<UnauthorizedPage />, 401)
        case 403: return c.html(<ForbiddenPage />, 403)
        default: return c.html(<ServerErrorPage error={error} />, 500)
    }
}

// Then add errorHandler to app.init() config
`)
        } catch (error) {
            console.error(
                `❌ Failed to create error pages: ${(error as Error).message}`,
            )
        }
    }, 'Generate all error pages (404, 401, 403, 500)')
}
