import type { Cli } from '../mod.ts'

export function registerTinkerCommand(cli: Cli) {
    cli.register('tinker', async () => {
        console.log('\n🔮 Lockness Tinker - Interactive REPL')
        console.log('Type ".help" for commands, ".exit" to quit\n')

        // Build the context with common imports
        const context: Record<string, unknown> = {}

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
                        const modulePath = `${Deno.cwd()}${path.slice(1)
                            }/${entry.name}`
                        const module = await import(modulePath)

                        // Import all named exports
                        for (const key in module) {
                            if (key !== 'default') {
                                context[key] = module[key]
                            }
                        }
                    } catch {
                        // Skip files that fail to import
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
