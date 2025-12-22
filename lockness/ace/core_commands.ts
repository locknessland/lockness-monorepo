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
                            const name = module.default.name || entry.name.replace('.ts', '')
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
        const keys = Object.keys(context).filter(k => k !== 'help')
        if (keys.length === 0) {
            console.log('  (none loaded)')
        } else {
            keys.forEach(k => {
                const val = context[k]
                const type = typeof val === 'function'
                    ? (val.toString().startsWith('class') ? 'class' : 'function')
                    : typeof val
                console.log(`  ${k}: ${type}`)
            })
        }
        console.log('')
    }

    // Show loaded context
    const loaded = Object.keys(context).filter(k => k !== 'help')
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
                    (context.help as () => void)()
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
