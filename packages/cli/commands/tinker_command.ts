/**
 * @fileoverview Interactive REPL command for exploring the application.
 *
 * Provides a tinker command that starts an interactive session with
 * auto-loaded models, services, and database connections.
 *
 * @module @lockness/cli/commands/tinker
 */

import type { Cli } from '../mod.ts'
import { join } from '@std/path'
import { importAppFile } from '@lockness/contract/app-file/internal'
import { renderError, safeForLog } from '@lockness/contract'

/**
 * Register the tinker REPL command.
 *
 * Commands registered:
 * - tinker - Start an interactive REPL session
 *
 * Auto-loads:
 * - Models from app/model/
 * - Services from app/service/
 * - Repositories from app/repository/
 * - Database connection from kernel.ts
 *
 * @param cli - The CLI instance to register commands on
 *
 * @example
 * ```bash
 * deno task cli tinker
 *
 * # In REPL:
 * > const user = await db.query.users.findFirst()
 * > User.findById(1)
 * ```
 */
export function registerTinkerCommand(cli: Cli): void {
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

/**
 * Fill the REPL context from the app: every named export of its models,
 * services and repositories, then `db` and `kernel` from its `app/kernel.ts`.
 *
 * What is absent is skipped silently — an app need not have every directory,
 * nor a kernel exporting a database. What exists but fails to load is
 * reported, so a missing name in the REPL is never a mystery.
 *
 * @param context - The REPL context, filled in place.
 * @param root - The app root. Defaults to the working directory.
 * @returns Resolves once every file has been tried.
 * @internal Exported for tests.
 *
 * @example
 * ```ts
 * const context: Record<string, unknown> = {}
 * await loadTinkerContext(context)
 * ```
 */
export async function loadTinkerContext(
    context: Record<string, unknown>,
    root: string = Deno.cwd(),
): Promise<void> {
    for (const dir of ['model', 'service', 'repository']) {
        const directory = join(root, 'app', dir)
        const names: string[] = []
        try {
            for await (const entry of Deno.readDir(directory)) {
                if (entry.isFile && entry.name.endsWith('.ts')) {
                    names.push(entry.name)
                }
            }
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
                console.warn(
                    `⚠️  app/${dir} could not be read: ${renderError(error)}`,
                )
            }
            continue
        }

        for (const name of names) {
            try {
                // Through the app root, never this module's URL: from JSR a
                // bare path resolves against the registry (#477).
                const module = await importAppFile(join(directory, name))

                // Import all named exports
                for (const key in module) {
                    if (key !== 'default') {
                        context[key] = module[key]
                    }
                }
            } catch (error) {
                // Not a command failure: the REPL starts without this file.
                // deno-lint-ignore lockness-exit/printed-failure
                console.error(
                    `❌ app/${dir}/${safeForLog(name)} failed to load: ${
                        renderError(error)
                    }`,
                )
            }
        }
    }

    // The kernel may export a drizzle `db` and the `kernel` itself.
    const kernelPath = join(root, 'app', 'kernel.ts')
    let kernelExists = true
    try {
        await Deno.stat(kernelPath)
    } catch (error) {
        kernelExists = false
        if (!(error instanceof Deno.errors.NotFound)) {
            console.warn(
                `⚠️  app/kernel.ts could not be read: ${renderError(error)}`,
            )
        }
    }
    if (kernelExists) {
        try {
            const kernelModule = await importAppFile(kernelPath)
            if (kernelModule.db) {
                context.db = kernelModule.db
            }
            if (kernelModule.kernel) {
                context.kernel = kernelModule.kernel
            }
        } catch (error) {
            // Not a command failure: the REPL starts without db and kernel.
            // deno-lint-ignore lockness-exit/printed-failure
            console.error(
                `❌ app/kernel.ts failed to load, so db and kernel are not available: ${
                    renderError(error)
                }`,
            )
        }
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
                    ;(context.help as () => void)()
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
                // Not a command failure: the user's expression threw, and the
                // REPL prompts for the next one.
                // deno-lint-ignore lockness-exit/printed-failure
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
