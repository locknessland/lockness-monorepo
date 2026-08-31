/**
 * @fileoverview Make commands for scaffolding application components.
 *
 * Provides commands to generate controllers, middleware, services, views,
 * components, jobs, error handlers, and actions from stub templates.
 *
 * @module @lockness/cli/commands/make
 */

import { type Cli, Stub } from '../mod.ts'
import { dirname, fromFileUrl, join } from '@std/path'

/**
 * Path to CLI stubs directory.
 * Handles both local file:// and remote https:// URLs (JSR).
 * @internal
 */
let STUBS_PATH: string

/**
 * Path to Drizzle stubs directory.
 * @internal
 */
let DRIZZLE_STUBS_PATH: string

if (import.meta.url.startsWith('file://')) {
    const currentDir = dirname(fromFileUrl(import.meta.url))
    STUBS_PATH = join(currentDir, '..', 'stubs')
    DRIZZLE_STUBS_PATH = join(currentDir, '..', '..', 'drizzle', 'stubs')
} else {
    // When running from JSR, use relative URLs
    STUBS_PATH = new URL('../stubs', import.meta.url).href
    DRIZZLE_STUBS_PATH = new URL('../../drizzle/stubs', import.meta.url).href
}

/**
 * Register all make:* commands.
 *
 * Commands registered:
 * - make:controller - Create a new controller
 * - make:middleware - Create a new middleware
 * - make:service - Create a new service
 * - make:view - Create a new view page
 * - make:component - Create a new UI component
 * - make:job - Create a new queue job
 * - make:command - Create a new CLI command
 * - make:error - Create a new error handler
 * - make:action - Create a controller action
 * - make:model - Create a Drizzle model
 * - make:seeder - Create a database seeder
 *
 * @param cli - The CLI instance to register commands on
 */
export function registerMakeCommands(cli: Cli): void {
    cli.register('make:controller', async (args) => {
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
    }, 'Create a new controller class')

    cli.register('make:middleware', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a middleware name (e.g., Auth)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const middlewareName = name.toLowerCase()
        const fileName = `${name.toLowerCase()}_middleware.ts`
        const dirPath = `./app/middleware`
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

    cli.register('make:service', async (args) => {
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
    }, 'Create a new service class')

    cli.register('make:view', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a view name (e.g., Post)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = name.toLowerCase()
        const dirPath = `./app/view/pages`
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

    cli.register('make:component', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a component name (e.g., Button)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = name.toLowerCase()
        const dirPath = `./app/view/components`
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

    cli.register('make:command', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a command name (e.g., Greet)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const commandName = name.toLowerCase()
        const fileName = `${name.toLowerCase()}_command.ts`
        const dirPath = `./app/command`
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
            console.log(`💡 Run it with: deno task cli ${commandName}`)
        } catch (error) {
            console.error(
                `❌ Failed to create command: ${(error as Error).message}`,
            )
        }
    }, 'Create a new CLI command')

    cli.register('make:job', async (args) => {
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
    }, 'Create a new background job')

    cli.register('make:error-pages', async () => {
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
    }, 'Generate all error pages (404, 401, 403, 500)')

    cli.register('make:crud', async (args) => {
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
            const modelPath = `./app/model/${fileName}.ts`
            const modelStubContent = await Deno.readTextFile(
                join(DRIZZLE_STUBS_PATH, 'model.stub'),
            )
            const modelContent = modelStubContent
                .replace(/\{\{ModelName\}\}/g, modelName)
                .replace(/\{\{tableName\}\}/g, tableName)

            await Deno.mkdir('./app/model', { recursive: true })
            await Deno.writeTextFile(modelPath, modelContent)
            files.push(`✅ Model: ${modelPath}`)

            // 2. Repository (using drizzle stub)
            const repoPath = `./app/repository/${fileName}_repository.ts`
            const repoStubContent = await Deno.readTextFile(
                join(DRIZZLE_STUBS_PATH, 'repository.stub'),
            )
            const repoContent = repoStubContent
                .replace(/\{\{ModelName\}\}/g, modelName)
                .replace(/\{\{tableName\}\}/g, tableName)
                .replace(/\{\{fileName\}\}/g, fileName)
                .replace(/\{\{RepositoryName\}\}/g, repositoryName)

            await Deno.mkdir('./app/repository', { recursive: true })
            await Deno.writeTextFile(repoPath, repoContent)
            files.push(`✅ Repository: ${repoPath}`)

            // 3. Service (using cli stub)
            const servicePath = `./app/service/${fileName}_service.ts`
            const serviceContent = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'service',
                { className: `${modelName}Service` },
            )
            await Deno.mkdir('./app/service', { recursive: true })
            await Deno.writeTextFile(servicePath, serviceContent)
            files.push(`✅ Service: ${servicePath}`)

            // 4. Controller (using cli stub)
            const controllerPath = `./app/controller/${fileName}_controller.tsx`
            const controllerContent = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'controller',
                {
                    className: `${modelName}Controller`,
                    route: route,
                },
            )
            await Deno.mkdir('./app/controller', { recursive: true })
            await Deno.writeTextFile(controllerPath, controllerContent)
            files.push(`✅ Controller: ${controllerPath}`)

            // 5. Views (index, show)
            const viewsDir = `./app/view/pages/${fileName}`
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
            console.log(`   3. Add routes in app/kernel.tsx:`)
            console.log(`      app.route('/${route}', ${modelName}Controller)`)
            console.log(
                `   4. Run "deno task db:generate" to create migrations`,
            )
            console.log(
                `   5. Run "deno task routes:generate" to update routes registry\n`,
            )

            // Auto-regenerate routes.ts for production builds
            try {
                const { generateRoutesFile } = await import(
                    '@lockness/contract'
                )
                await generateRoutesFile('./app/controller', './app/routes.ts')
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

    cli.register('make:action', async (args) => {
        const controllerName = args[0]
        const actionName = args[1]

        if (!controllerName || !actionName) {
            console.error('❌ Usage: make:action <ControllerName> <actionName>')
            console.error('   Example: make:action User show')
            console.error(
                '   Options: --method=get|post|put|delete|patch (default: get)',
            )
            console.error('            --view (render a view instead of JSON)')
            return
        }

        // Parse options
        const methodArg = args.find((arg) => arg.startsWith('--method='))
        const method = methodArg ? methodArg.split('=')[1].toLowerCase() : 'get'
        const withView = args.includes('--view')

        if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
            console.error(
                '❌ Invalid method. Use: get, post, put, delete, or patch',
            )
            return
        }

        const className = controllerName.charAt(0).toUpperCase() +
            controllerName.slice(1)
        const controllerFileName =
            `${controllerName.toLowerCase()}_controller.tsx`
        const controllerPath = `./app/controller/${controllerFileName}`

        try {
            // Check if controller exists
            const controllerContent = await Deno.readTextFile(controllerPath)

            // Determine route path and name based on RESTful conventions
            const route = controllerName.toLowerCase()
            let path = '/'
            const routeName = `${route}.${actionName}`

            // RESTful path patterns
            const restfulPaths: Record<string, string> = {
                'index': '/',
                'create': '/create',
                'store': '/',
                'show': '/:id',
                'edit': '/:id/edit',
                'update': '/:id',
                'destroy': '/:id',
            }

            if (restfulPaths[actionName]) {
                path = restfulPaths[actionName]
            } else {
                path = `/${actionName}`
            }

            // Generate method body
            let body = ''
            if (withView) {
                // Create view if it doesn't exist
                const viewClassName = `${className}${
                    actionName.charAt(0).toUpperCase() + actionName.slice(1)
                }`
                const viewFileName =
                    `${controllerName.toLowerCase()}/${actionName.toLowerCase()}`
                const viewDirPath =
                    `./app/view/pages/${controllerName.toLowerCase()}`
                const viewFilePath =
                    `${viewDirPath}/${actionName.toLowerCase()}.tsx`

                try {
                    await Deno.mkdir(viewDirPath, { recursive: true })
                    const viewContent = await Stub.renderFrom(
                        STUBS_PATH,
                        'make',
                        'view',
                        {
                            className: viewClassName,
                            fileName: viewFileName,
                        },
                    )
                    await Deno.writeTextFile(viewFilePath, viewContent)
                    console.log(`✅ View created at ${viewFilePath}`)
                } catch {
                    // View already exists or failed to create
                }

                body = `return c.html(<${viewClassName} />)`
            } else if (
                actionName === 'show' || actionName === 'edit' ||
                actionName === 'update' || actionName === 'destroy'
            ) {
                body =
                    `const id = c.req.param('id')\n        return c.json({ message: '${actionName} ${className} ' + id })`
            } else if (actionName === 'store' || actionName === 'update') {
                body =
                    `const body = await c.req.json()\n        return c.json({ message: '${className} ${actionName}d', data: body })`
            } else {
                body =
                    `return c.json({ message: '${actionName} from ${className}Controller' })`
            }

            // Generate the action method
            const actionContent = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                `action-${method}`,
                {
                    path,
                    routeName,
                    methodName: actionName,
                    body,
                },
            )

            // Find the last closing brace of the class
            const lines = controllerContent.split('\n')
            let lastBraceIndex = -1
            for (let i = lines.length - 1; i >= 0; i--) {
                if (lines[i].trim() === '}') {
                    lastBraceIndex = i
                    break
                }
            }

            if (lastBraceIndex === -1) {
                console.error(
                    '❌ Could not find class closing brace in controller',
                )
                return
            }

            // Insert the new method before the last brace
            lines.splice(lastBraceIndex, 0, actionContent)
            const newContent = lines.join('\n')

            // Add import for the decorator if needed
            let finalContent = newContent
            const decoratorImports = ['Get', 'Post', 'Put', 'Delete', 'Patch']
            const decoratorName = method.charAt(0).toUpperCase() +
                method.slice(1)

            if (
                !controllerContent.includes(decoratorName) &&
                decoratorImports.includes(decoratorName)
            ) {
                // Add to imports
                finalContent = finalContent.replace(
                    /import\s*{([^}]+)}\s*from\s*['"]lockness['"]/,
                    (_match, imports) => {
                        const importList = imports.split(',').map((i: string) =>
                            i.trim()
                        )
                        if (!importList.includes(decoratorName)) {
                            importList.push(decoratorName)
                        }
                        return `import { ${
                            importList.join(', ')
                        } } from 'lockness/core'`
                    },
                )
            }

            // Add view import if needed
            if (withView) {
                const viewClassName = `${className}${
                    actionName.charAt(0).toUpperCase() + actionName.slice(1)
                }`
                const viewImport =
                    `import { ${viewClassName} } from '@view/pages/${controllerName.toLowerCase()}/${actionName.toLowerCase()}.tsx'\n`

                // Add after the lockness import
                finalContent = finalContent.replace(
                    /(import\s*{[^}]+}\s*from\s*['"]lockness['"])/,
                    `$1\n${viewImport}`,
                )
            }

            await Deno.writeTextFile(controllerPath, finalContent)
            console.log(`✅ Action '${actionName}' added to ${controllerPath}`)
            console.log(
                `   Route: ${method.toUpperCase()} ${path} → ${routeName}`,
            )
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                console.error(`❌ Controller not found: ${controllerPath}`)
                console.error(
                    '   Create it first with: make:controller ${controllerName}',
                )
            } else {
                console.error(
                    `❌ Failed to add action: ${(error as Error).message}`,
                )
            }
        }
    }, 'Add a new action (method) to an existing controller')

    cli.register('make:event', async (args) => {
        const name = args[0]
        if (!name) {
            console.error(
                '❌ Please provide an event name (e.g., UserRegistered)',
            )
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        // Convert PascalCase to snake_case for filename
        const fileName = `${
            name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
        }.ts`
        const dirPath = `./app/events`
        const filePath = `${dirPath}/${fileName}`

        try {
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'event',
                {
                    className,
                    description: className.replace(/([A-Z])/g, ' $1').trim()
                        .toLowerCase(),
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Event created at ${filePath}`)
            console.log(`\n💡 Next steps:`)
            console.log(`   1. Define event properties in the constructor`)
            console.log(
                `   2. Emit the event: await dispatcher().emit(new ${className}(...))`,
            )
            console.log(
                `   3. Create a listener with: deno task cli make:listener ${className}Listener`,
            )
        } catch (error) {
            console.error(
                `❌ Failed to create event: ${(error as Error).message}`,
            )
        }
    }, 'Create a new event class')

    cli.register('make:listener', async (args) => {
        const name = args[0]
        if (!name) {
            console.error(
                '❌ Please provide a listener name (e.g., OrderListener)',
            )
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        // Convert PascalCase to snake_case for filename
        const fileName = `${
            name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
        }.ts`
        const dirPath = `./app/listener`
        const filePath = `${dirPath}/${fileName}`

        try {
            const content = await Stub.renderFrom(
                STUBS_PATH,
                'make',
                'listener',
                {
                    className,
                    description: className.replace(/Listener$/, '').replace(
                        /([A-Z])/g,
                        ' $1',
                    ).trim().toLowerCase(),
                },
            )

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Listener created at ${filePath}`)
            console.log(`\n💡 Next steps:`)
            console.log(`   1. Import your event class`)
            console.log(`   2. Add @Listener(YourEvent) decorator to methods`)
            console.log(`   3. Listeners are auto-discovered on app boot`)
        } catch (error) {
            console.error(
                `❌ Failed to create listener: ${(error as Error).message}`,
            )
        }
    }, 'Create a new event listener class')

    cli.register('make:schedule', async (args) => {
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
    }, 'Create a new scheduled task class')
}
