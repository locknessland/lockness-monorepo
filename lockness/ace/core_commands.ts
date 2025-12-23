import { type Ace, Stub } from './cli.ts'
import { dirname, fromFileUrl, join } from '@std/path'

const currentDir = dirname(fromFileUrl(import.meta.url))
const STUBS_PATH = join(currentDir, 'stubs')

export function registerCoreCommands(ace: Ace) {
    ace.register('make:controller', async (args) => {

        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a controller name (e.g., User)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = `${name.toLowerCase()}_controller.ts`
        const dirPath = `./src/controller`
        const filePath = `${dirPath}/${fileName}`

        try {
            // Stubs path
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
        const middlewareName = name.toLowerCase() // for named middleware registration
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

        // Generate props interface name
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
            // Stubs path
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

    ace.register('router:list', async () => {
        try {
            // Load controllers from src/controller directory
            const controllerDir = join(Deno.cwd(), 'src', 'controller')
            const controllers: any[] = []

            try {
                for await (const entry of Deno.readDir(controllerDir)) {
                    if (
                        entry.isFile &&
                        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
                    ) {
                        const filePath = `file://${join(controllerDir, entry.name)}`
                        try {
                            const module = await import(/* @vite-ignore */ filePath)

                            for (const key in module) {
                                const Exported = module[key]
                                if (
                                    typeof Exported === 'function' &&
                                    (Exported as any)._basePath !== undefined
                                ) {
                                    controllers.push(Exported)
                                }
                            }
                        } catch (importError) {
                            console.warn(`⚠️  Could not import ${entry.name}: ${(importError as Error).message}`)
                        }
                    }
                }
            } catch (e) {
                console.error('❌ Could not read src/controller directory')
                console.error(`   ${(e as Error).message}`)
                return
            }

            if (controllers.length === 0) {
                console.log('⚠️  No controllers found in src/controller/')
                return
            }

            // Collect all routes from controllers
            interface RouteInfo {
                method: string
                path: string
                controller: string
                action: string
                middlewares: string[]
            }

            const routes: RouteInfo[] = []

            for (const Controller of controllers) {
                const basePath = (Controller as any)._basePath || ''
                const controllerRoutes = (Controller as any)._routes || []
                const middlewares = (Controller as any)._middlewares || {}
                const validators = (Controller as any)._validators || {}
                const controllerName = Controller.name

                // Check for class-level decorators
                const classAuthRequired = (Controller as any)._authRequired === true
                const classGuestRequired = (Controller as any)._guestRequired === true

                for (const route of controllerRoutes) {
                    let fullPath = `/${basePath}/${route.path}`.replace(/\/+/g, '/')
                    if (fullPath.length > 1 && fullPath.endsWith('/')) {
                        fullPath = fullPath.slice(0, -1)
                    }

                    // Collect middleware names
                    const middlewareNames: string[] = []

                    // Check method-level auth decorators
                    const instance = new Controller()
                    const methodRef = (instance as any)[route.methodName]
                    const methodAuth = methodRef?._auth
                    const methodGuest = methodRef?._guest

                    if (methodAuth?.required || classAuthRequired) {
                        middlewareNames.push('@Auth')
                    } else if (methodGuest?.required || classGuestRequired) {
                        middlewareNames.push('@Guest')
                    }

                    // Validators
                    if (validators[route.methodName]?.length > 0) {
                        middlewareNames.push('@Validate')
                    }

                    // Regular middlewares
                    const routeMiddlewares = middlewares[route.methodName] || []
                    for (const m of routeMiddlewares) {
                        if (typeof m === 'string') {
                            middlewareNames.push(m)
                        } else if (typeof m === 'function') {
                            middlewareNames.push(m.name)
                        }
                    }

                    routes.push({
                        method: route.method.toUpperCase(),
                        path: fullPath,
                        controller: controllerName,
                        action: route.methodName,
                        middlewares: middlewareNames,
                    })
                }
            }

            if (routes.length === 0) {
                console.log('⚠️  No routes registered.')
                return
            }

            console.log(`\n📋 Registered Routes (${routes.length} total)\n`)

            // Calculate column widths
            const methodWidth = Math.max(6, ...routes.map((r) => r.method.length))
            const pathWidth = Math.max(20, ...routes.map((r) => r.path.length))
            const controllerWidth = Math.max(15, ...routes.map((r) => r.controller.length))
            const actionWidth = Math.max(10, ...routes.map((r) => r.action.length))

            // Print header
            const header =
                `┃ ${'METHOD'.padEnd(methodWidth)} ┃ ${'PATH'.padEnd(pathWidth)} ┃ ${'CONTROLLER'.padEnd(controllerWidth)} ┃ ${'ACTION'.padEnd(actionWidth)} ┃ MIDDLEWARES`
            const separator = '━'.repeat(header.length)

            console.log(separator)
            console.log(header)
            console.log(separator)

            // Print each route
            for (const route of routes) {
                const method = route.method.padEnd(methodWidth)
                const path = route.path.padEnd(pathWidth)
                const controller = route.controller.padEnd(controllerWidth)
                const action = route.action.padEnd(actionWidth)
                const middlewares = route.middlewares.length > 0
                    ? route.middlewares.join(', ')
                    : '-'

                // Color code by HTTP method
                let methodColor = '\x1b[0m'
                if (route.method === 'GET') methodColor = '\x1b[32m'
                else if (route.method === 'POST') methodColor = '\x1b[33m'
                else if (route.method === 'PUT') methodColor = '\x1b[34m'
                else if (route.method === 'PATCH') methodColor = '\x1b[36m'
                else if (route.method === 'DELETE') methodColor = '\x1b[31m'

                console.log(
                    `┃ ${methodColor}${method}\x1b[0m ┃ ${path} ┃ ${controller} ┃ ${action} ┃ ${middlewares}`,
                )
            }

            console.log(separator)
            console.log()
        } catch (error) {
            console.error(`❌ Error listing routes: ${(error as Error).message}`)
        }
    }, 'Display all registered routes')

    ace.register('nessy:install', async () => {
        console.log('')
        console.log('🦕 Installing Nessy - Your Lockness CLI companion!')
        console.log('')

        try {
            // Check if ace.ts exists
            const acePath = join(Deno.cwd(), 'ace.ts')
            try {
                await Deno.stat(acePath)
            } catch {
                console.error('❌ ace.ts not found in the current directory')
                console.error('   Make sure you run this command from your project root')
                return
            }

            // Determine the OS to create appropriate wrapper
            const isWindows = Deno.build.os === 'windows'
            const scriptName = isWindows ? 'nessy.cmd' : 'nessy'
            const scriptPath = join(Deno.cwd(), scriptName)

            console.log(`📝 Creating ${scriptName} wrapper...`)
            console.log('')

            // Load wrapper script from stub
            const stubName = isWindows ? 'nessy.cmd' : 'nessy'
            const scriptContent = await Stub.renderFrom(
                STUBS_PATH,
                'nessy',
                stubName,
                {},
            )

            await Deno.writeTextFile(scriptPath, scriptContent)

            // Make executable on Unix systems
            if (!isWindows) {
                await Deno.chmod(scriptPath, 0o755)
            }

            console.log('✅ Nessy wrapper created successfully!')
            console.log('')
            console.log('🎉 You can now use Nessy for ALL commands:')
            console.log('')

            if (isWindows) {
                console.log('   .\\nessy list')
                console.log('   .\\nessy make:controller User')
                console.log('   .\\nessy db:migrate')
                console.log('   .\\nessy router:list')
            } else {
                console.log('   ./nessy list')
                console.log('   ./nessy make:controller User')
                console.log('   ./nessy db:migrate')
                console.log('   ./nessy router:list')
            }

            console.log('')
            console.log('💡 Tip: Add nessy to your PATH for even easier access!')
            console.log('')

            // Check if .gitignore exists and warn if nessy is not ignored
            try {
                const gitignorePath = join(Deno.cwd(), '.gitignore')
                const gitignoreContent = await Deno.readTextFile(gitignorePath)

                if (!gitignoreContent.includes('nessy')) {
                    console.log('⚠️  Remember to add "nessy" to your .gitignore file')
                    console.log('')
                }
            } catch {
                // .gitignore doesn't exist, no problem
            }

        } catch (error) {
            console.error(`❌ Error installing Nessy: ${(error as Error).message}`)
        }
    }, 'Install Nessy CLI wrapper for faster commands')

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

    ace.register(
        'make:auth',
        async (args) => {
            const includeSocial = args.includes('--social') ||
                args.includes('-s')

            console.log('🔐 Scaffolding authentication system...\n')

            const files = [
                {
                    stub: 'auth_controller',
                    output: './src/controller/auth_controller.ts',
                    name: 'AuthController',
                },
                {
                    stub: 'user_provider',
                    output: './src/provider/user_provider.ts',
                    name: 'UserProvider',
                },
            ]

            // Add social auth controller if requested
            if (includeSocial) {
                files.push({
                    stub: 'social_auth_controller',
                    output: './src/controller/social_auth_controller.ts',
                    name: 'SocialAuthController',
                })
            }

            for (const file of files) {
                try {
                    const content = await Stub.renderFrom(
                        STUBS_PATH,
                        'auth',
                        file.stub,
                        {
                            className: '',
                        },
                    )

                    const dirPath = file.output.substring(
                        0,
                        file.output.lastIndexOf('/'),
                    )
                    await Deno.mkdir(dirPath, { recursive: true })
                    await Deno.writeTextFile(file.output, content)
                    console.log(`✅ ${file.name} created at ${file.output}`)
                } catch (error) {
                    console.error(
                        `❌ Failed to create ${file.name}: ${(error as Error).message
                        }`,
                    )
                }
            }

            console.log('\n📝 Next steps:')
            console.log(
                '1. Ensure you have a User model with email and password fields',
            )
            console.log('2. Configure auth in your kernel.ts:')
            console.log('')
            console.log("   import { configureAuth } from 'lockness'")
            console.log(
                "   import { UserProvider } from '@provider/user_provider.ts'",
            )
            console.log('')
            console.log('   configureAuth({')
            console.log('       userProvider: container.get(UserProvider),')
            console.log("       redirectTo: '/auth/login',")
            console.log('   })')
            console.log('')

            if (includeSocial) {
                console.log(
                    '3. Configure socialite providers in your kernel.ts:',
                )
                console.log('')
                console.log("   import { configureSocialite } from 'lockness'")
                console.log('')
                console.log('   configureSocialite({')
                console.log('       google: {')
                console.log(
                    "           clientId: Deno.env.get('GOOGLE_CLIENT_ID')!,",
                )
                console.log(
                    "           clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,",
                )
                console.log(
                    "           redirectUri: Deno.env.get('APP_URL') + '/auth/google/callback',",
                )
                console.log('       },')
                console.log('       // Add github, discord, etc.')
                console.log('   })')
                console.log('')
                console.log('4. Add to your .env:')
                console.log('   GOOGLE_CLIENT_ID=your-google-client-id')
                console.log('   GOOGLE_CLIENT_SECRET=your-google-client-secret')
                console.log('   APP_URL=http://localhost:3000')
                console.log('')
                console.log('5. Use @Auth() decorator on protected routes')
            } else {
                console.log('3. Use @Auth() decorator on protected routes')
                console.log('')
                console.log(
                    '💡 Tip: Run `deno task ace make:auth --social` to add OAuth providers',
                )
            }
            console.log('')
        },
        'Scaffold authentication (controller + provider). Use --social for OAuth',
    )

    ace.register('queue:work', async (args) => {
        // Dynamic import to avoid loading queue module at CLI startup
        const { QueueWorker, configureQueue, registerJob } = await import(
            '@lockness/core'
        )

        // Parse flags from args
        const parseFlag = (name: string, def: string): string => {
            const flag = args.find((a) => a.startsWith(`--${name}=`))
            return flag ? flag.split('=')[1] : def
        }
        const queue = parseFlag('queue', 'default')
        const sleep = Number(parseFlag('sleep', '1000'))
        const maxJobs = Number(parseFlag('max-jobs', '0'))
        const once = args.includes('--once')

        // Configure queue driver from env
        const driver = (Deno.env.get('QUEUE_DRIVER') as 'memory' | 'deno-kv') ||
            'memory'
        configureQueue({ driver })

        // Auto-discover and register jobs from src/job/
        try {
            for await (const entry of Deno.readDir('./src/job')) {
                if (entry.isFile && entry.name.endsWith('.ts')) {
                    const modulePath = `${Deno.cwd()}/src/job/${entry.name}`
                    const module = await import(modulePath)
                    for (const key in module) {
                        const Exported = module[key]
                        if (
                            typeof Exported === 'function' &&
                            Exported.prototype?.handle
                        ) {
                            registerJob(Exported)
                        }
                    }
                }
            }
        } catch {
            // No jobs directory
        }

        const worker = new QueueWorker({
            queues: queue.split(','),
            sleep,
            maxJobs,
            stopWhenEmpty: once,
        })

        // Handle graceful shutdown
        const controller = new AbortController()
        Deno.addSignalListener('SIGINT', () => {
            console.log('\n🛑 Shutting down worker...')
            worker.stop()
            controller.abort()
        })

        await worker.start()
    }, 'Process jobs from the queue')

    ace.register('queue:clear', async (args) => {
        const { clearQueue, configureQueue } = await import('@lockness/core')

        const queue = args[0] || 'default'
        const driver = (Deno.env.get('QUEUE_DRIVER') as 'memory' | 'deno-kv') ||
            'memory'
        configureQueue({ driver })

        await clearQueue(queue)
        console.log(`✅ Queue '${queue}' cleared`)
    }, 'Clear all jobs from a queue')

    ace.register('tinker', async () => {
        console.log('\n🔮 Lockness Tinker - Interactive REPL')
        console.log('Type ".help" for commands, ".exit" to quit\n')

        // Build the context with common imports
        const context: Record<string, unknown> = {
            // Will be populated with user's models, services, etc.
        }

        // Try to auto-import common modules
        await loadTinkerContext(context)

        // Start REPL
        await startRepl(context)
    }, 'Start an interactive REPL session')
}

async function loadTinkerContext(context: Record<string, unknown>) {
    const dirs = [
        { path: './src/model', prefix: '' },
        { path: './src/service', prefix: '' },
        { path: './src/repository', prefix: '' },
    ]

    for (const { path } of dirs) {
        try {
            for await (const entry of Deno.readDir(path)) {
                if (entry.isFile && entry.name.endsWith('.ts')) {
                    try {
                        const modulePath = `${Deno.cwd()}/${path}/${entry.name}`
                        const module = await import(modulePath)

                        // Export all named exports to context
                        for (const [key, value] of Object.entries(module)) {
                            if (key !== 'default') {
                                context[key] = value
                            }
                        }

                        // Also export default if it's a class/function
                        if (module.default) {
                            const name = module.default.name ||
                                entry.name.replace('.ts', '')
                            context[name] = module.default
                        }
                    } catch {
                        // Skip modules that fail to import
                    }
                }
            }
        } catch {
            // Directory doesn't exist, skip
        }
    }

    // Try to import drizzle db
    try {
        const drizzleModule = await import(`${Deno.cwd()}/src/kernel.ts`)
        if (drizzleModule.db) {
            context.db = drizzleModule.db
        }
        if (drizzleModule.kernel) {
            context.kernel = drizzleModule.kernel
        }
    } catch {
        // No drizzle setup
    }

    // Add helper utilities
    context.help = () => {
        console.log('\n📦 Available in context:')
        const keys = Object.keys(context).filter((k) => k !== 'help')
        if (keys.length === 0) {
            console.log('  (none loaded)')
        } else {
            keys.forEach((k) => {
                const val = context[k]
                const type = typeof val === 'function'
                    ? (val.toString().startsWith('class')
                        ? 'class'
                        : 'function')
                    : typeof val
                console.log(`  ${k}: ${type}`)
            })
        }
        console.log('')
    }

    // Show loaded context
    const loaded = Object.keys(context).filter((k) => k !== 'help')
    if (loaded.length > 0) {
        console.log('📦 Loaded:', loaded.join(', '))
        console.log('')
    }
}

async function startRepl(context: Record<string, unknown>) {
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    // Multiline support
    let buffer = ''
    let isMultiline = false

    const prompt = () => {
        const prefix = isMultiline ? '...  ' : '>>> '
        Deno.stdout.writeSync(encoder.encode(prefix))
    }

    prompt()

    // Read line by line
    const reader = Deno.stdin.readable.getReader()
    let inputBuffer = ''

    while (true) {
        const { value, done } = await reader.read()
        if (done) break

        inputBuffer += decoder.decode(value)

        // Process complete lines
        while (inputBuffer.includes('\n')) {
            const newlineIndex = inputBuffer.indexOf('\n')
            const line = inputBuffer.slice(0, newlineIndex)
            inputBuffer = inputBuffer.slice(newlineIndex + 1)

            // Handle special commands
            if (line === '.exit' || line === '.quit') {
                console.log('👋 Bye!')
                reader.releaseLock()
                return
            }

            if (line === '.help') {
                console.log('\n📖 REPL Commands:')
                console.log('  .help     Show this help')
                console.log('  .exit     Exit the REPL')
                console.log('  .clear    Clear the screen')
                console.log('  .context  Show available variables')
                console.log('  {         Start multiline mode')
                console.log('')
                prompt()
                continue
            }

            if (line === '.clear') {
                console.clear()
                prompt()
                continue
            }

            if (line === '.context') {
                if (context.help && typeof context.help === 'function') {
                    ; (context.help as () => void)()
                }
                prompt()
                continue
            }

            // Handle multiline input
            buffer += (buffer ? '\n' : '') + line

            // Check if we need more input (unclosed braces/parens)
            const openBraces = (buffer.match(/{/g) || []).length
            const closeBraces = (buffer.match(/}/g) || []).length
            const openParens = (buffer.match(/\(/g) || []).length
            const closeParens = (buffer.match(/\)/g) || []).length

            if (openBraces > closeBraces || openParens > closeParens) {
                isMultiline = true
                prompt()
                continue
            }

            isMultiline = false

            // Empty input
            if (!buffer.trim()) {
                buffer = ''
                prompt()
                continue
            }

            // Evaluate the code
            try {
                const result = await evaluateCode(buffer, context)
                if (result !== undefined) {
                    console.log(formatResult(result))
                }
            } catch (error) {
                console.error(`❌ ${(error as Error).message}`)
            }

            buffer = ''
            prompt()
        }
    }
}

async function evaluateCode(
    code: string,
    context: Record<string, unknown>,
): Promise<unknown> {
    // Wrap in async function to support top-level await
    const contextKeys = Object.keys(context)
    const contextValues = Object.values(context)

    // Create async function with context variables as parameters
    const wrappedCode = `
        return (async () => {
            ${code.includes('return') ? code : `return (${code})`}
        })()
    `

    try {
        const fn = new Function(...contextKeys, wrappedCode)
        return await fn(...contextValues)
    } catch {
        // If expression parsing failed, try as statements
        const statementsCode = `
            return (async () => {
                ${code}
            })()
        `
        const fn = new Function(...contextKeys, statementsCode)
        return await fn(...contextValues)
    }
}

function formatResult(value: unknown): string {
    if (value === null) return '\x1b[90mnull\x1b[0m'
    if (value === undefined) return '\x1b[90mundefined\x1b[0m'

    if (typeof value === 'string') {
        return `\x1b[32m"${value}"\x1b[0m`
    }

    if (typeof value === 'number') {
        return `\x1b[33m${value}\x1b[0m`
    }

    if (typeof value === 'boolean') {
        return `\x1b[33m${value}\x1b[0m`
    }

    if (typeof value === 'function') {
        return `\x1b[36m[Function: ${value.name || 'anonymous'}]\x1b[0m`
    }

    if (Array.isArray(value)) {
        if (value.length === 0) return '[]'
        try {
            return JSON.stringify(value, null, 2)
        } catch {
            return `[Array(${value.length})]`
        }
    }

    if (typeof value === 'object') {
        try {
            return JSON.stringify(value, null, 2)
        } catch {
            return `[Object ${value.constructor?.name || 'Object'}]`
        }
    }

    return String(value)
}

