import { type Ace, Stub } from '../ace.ts'
import { dirname, fromFileUrl, join } from '@std/path'
import { generateRoutesFile } from '../routes_generator.ts'

const currentDir = dirname(fromFileUrl(import.meta.url))
const STUBS_PATH = join(currentDir, '..', 'stubs')
const DRIZZLE_STUBS_PATH = join(currentDir, '..', '..', 'drizzle', 'stubs')

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

    ace.register('make:crud', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a resource name (e.g., Post)')
            return
        }

        // Naming conventions (same as make:model)
        const modelName = name.charAt(0).toUpperCase() + name.slice(1) // Post
        const tableName = name.toLowerCase() + 's' // posts
        const fileName = name.toLowerCase() // post
        const route = tableName // posts
        const repositoryName = `${modelName}Repository`

        console.log(`\n🚀 Generating CRUD for ${modelName}...\n`)

        const files = []

        try {
            // 1. Model (using drizzle stub)
            const modelPath = `./src/model/${fileName}.ts`
            const modelStubContent = await Deno.readTextFile(
                join(DRIZZLE_STUBS_PATH, 'model.stub'),
            )
            const modelContent = modelStubContent
                .replace(/\{\{ModelName\}\}/g, modelName)
                .replace(/\{\{tableName\}\}/g, tableName)

            await Deno.mkdir('./src/model', { recursive: true })
            await Deno.writeTextFile(modelPath, modelContent)
            files.push(`✅ Model: ${modelPath}`)

            // 2. Repository (using drizzle stub)
            const repoPath = `./src/repository/${fileName}_repository.ts`
            const repoStubContent = await Deno.readTextFile(
                join(DRIZZLE_STUBS_PATH, 'repository.stub'),
            )
            const repoContent = repoStubContent
                .replace(/\{\{ModelName\}\}/g, modelName)
                .replace(/\{\{tableName\}\}/g, tableName)
                .replace(/\{\{fileName\}\}/g, fileName)
                .replace(/\{\{RepositoryName\}\}/g, repositoryName)

            await Deno.mkdir('./src/repository', { recursive: true })
            await Deno.writeTextFile(repoPath, repoContent)
            files.push(`✅ Repository: ${repoPath}`)

            // 3. Service (using ace stub)
            const servicePath = `./src/service/${fileName}_service.ts`
            const serviceContent = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'service',
                { className: `${modelName}Service` },
            )
            await Deno.mkdir('./src/service', { recursive: true })
            await Deno.writeTextFile(servicePath, serviceContent)
            files.push(`✅ Service: ${servicePath}`)

            // 4. Controller (using ace stub)
            const controllerPath = `./src/controller/${fileName}_controller.tsx`
            const controllerContent = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'controller',
                {
                    className: `${modelName}Controller`,
                    route: route,
                },
            )
            await Deno.mkdir('./src/controller', { recursive: true })
            await Deno.writeTextFile(controllerPath, controllerContent)
            files.push(`✅ Controller: ${controllerPath}`)

            // 5. Views (index, show)
            const viewsDir = `./src/view/pages/${fileName}`
            await Deno.mkdir(viewsDir, { recursive: true })

            const indexPath = `${viewsDir}/index.tsx`
            const indexContent = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'view',
                {
                    className: `${modelName}Index`,
                    fileName: 'index',
                },
            )
            await Deno.writeTextFile(indexPath, indexContent)
            files.push(`✅ View: ${indexPath}`)

            const showPath = `${viewsDir}/show.tsx`
            const showContent = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'view',
                {
                    className: `${modelName}Show`,
                    fileName: 'show',
                },
            )
            await Deno.writeTextFile(showPath, showContent)
            files.push(`✅ View: ${showPath}`)

            console.log(files.join('\n'))
            console.log(`\n🎉 CRUD scaffolding complete!\n`)
            console.log(`💡 Next steps:`)
            console.log(`   1. Define schema in ${modelPath}`)
            console.log(
                `   2. Implement methods in ${repoPath} and ${servicePath}`,
            )
            console.log(`   3. Add routes in src/kernel.tsx:`)
            console.log(`      app.route('/${route}', ${modelName}Controller)`)
            console.log(
                `   4. Run "deno task db:generate" to create migrations`,
            )
            console.log(
                `   5. Run "deno task routes:generate" to update routes registry\n`,
            )

            // Auto-regenerate routes.ts for production builds
            try {
                await generateRoutesFile('./src/controller', './src/routes.ts')
                console.log('✅ Routes registry updated')
            } catch {
                // Silently fail, user can run manually
            }
        } catch (error) {
            console.error(
                `\n❌ Failed to generate CRUD: ${(error as Error).message}`,
            )
        }
    }, 'Scaffold complete CRUD (model, repository, service, controller, views)')
}
