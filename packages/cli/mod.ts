/**
 * @fileoverview Lockness CLI framework for building command-line tools.
 *
 * Provides a simple API for registering and running CLI commands with
 * support for arguments, flags, and command discovery.
 *
 * @module @lockness/cli
 *
 * @example
 * ```ts
 * import { Cli, registerCoreCommands } from '@lockness/cli'
 *
 * const cli = new Cli()
 * registerCoreCommands(cli)
 *
 * // Register custom command
 * cli.register('greet', async (args) => {
 *   console.log(`Hello, ${args[0] || 'World'}!`)
 * }, 'Greet someone')
 *
 * await cli.run(Deno.args)
 * ```
 */

import { Stub } from './stubs.ts'

export { registerCoreCommands } from './core_commands.ts'
export {
    addPackage,
    loadPackageCommands,
    removePackage,
} from './package_loader.ts'

/**
 * Register multiple command registration functions at once.
 *
 * Convenience function to batch register commands from multiple packages.
 *
 * @param cli - The CLI instance to register commands on
 * @param registerFunctions - Array of registration functions to call
 *
 * @example
 * ```ts
 * import { Cli, registerAll, registerCoreCommands } from '@lockness/cli'
 * import { registerDrizzleCommands } from '@lockness/drizzle'
 *
 * const cli = new Cli()
 * registerAll(cli, [registerCoreCommands, registerDrizzleCommands])
 * ```
 */
export function registerAll(
    cli: Cli,
    registerFunctions: ReadonlyArray<(cli: Cli) => void | Promise<void>>,
): void {
    for (const registerFn of registerFunctions) {
        registerFn(cli)
    }
}

/**
 * Context passed to command handlers.
 *
 * Provides access to command arguments and flags.
 *
 * @example
 * ```ts
 * cli.register('greet', async (args, ctx) => {
 *   const name = ctx.arg(0) || 'World'
 *   const loud = ctx.hasFlag('loud')
 *   console.log(loud ? `HELLO, ${name}!` : `Hello, ${name}`)
 * })
 * ```
 */
export interface CommandContext {
    /** Command arguments (excluding flags starting with -) */
    readonly args: string[]

    /**
     * Get a specific argument by index.
     * @param index - Zero-based argument index
     * @returns The argument value or undefined if not present
     */
    arg(index: number): string | undefined

    /**
     * Check if a flag is present.
     * Supports `--flag`, `-f` (first char), and `--flag=value` formats.
     * @param name - The flag name (without dashes)
     * @returns True if the flag is present
     */
    hasFlag(name: string): boolean

    /**
     * Get a flag value from `--name=value` format.
     * @param name - The flag name (without dashes)
     * @returns The flag value or undefined if not present
     */
    getFlag(name: string): string | undefined
}

/**
 * Interface for command class implementations.
 *
 * Classes implementing this interface can be registered using `registerCommand()`.
 *
 * @example
 * ```ts
 * @Command('greet', 'Greet someone')
 * class GreetCommand implements ICommand {
 *   async handle(ctx: CommandContext): Promise<void> {
 *     console.log(`Hello, ${ctx.arg(0) || 'World'}!`)
 *   }
 * }
 * ```
 */
export interface ICommand {
    /**
     * Execute the command.
     * @param ctx - The command context with arguments and flags
     */
    handle(ctx: CommandContext): Promise<void>
}

/**
 * Metadata attached to command classes by the @Command decorator.
 * @internal
 */
export interface CommandMetadata {
    /** The command name (e.g., 'make:controller') */
    readonly _commandName?: string
    /** The command description shown in help */
    readonly _commandDescription?: string
}

/**
 * Type for command class constructors with metadata.
 */
export type CommandClass = (new () => ICommand) & CommandMetadata

/**
 * Decorator to mark a class as a CLI command.
 *
 * Attaches command metadata to the class for registration.
 *
 * @param name - The command name (e.g., 'make:controller')
 * @param description - Description shown in command list
 * @returns A class decorator
 *
 * @example
 * ```ts
 * @Command('greet', 'Greet someone by name')
 * class GreetCommand implements ICommand {
 *   async handle(ctx: CommandContext): Promise<void> {
 *     console.log(`Hello, ${ctx.arg(0)}!`)
 *   }
 * }
 * ```
 */
export function Command(
    name: string,
    description: string = '',
): ClassDecorator {
    // deno-lint-ignore no-explicit-any -- Required for decorator metadata
    return (target: any) => {
        target._commandName = name
        target._commandDescription = description
    }
}

/**
 * Create a CommandContext from raw arguments array.
 * @param args - Raw command line arguments
 * @returns A CommandContext instance
 * @internal
 */
function createContext(args: string[]): CommandContext {
    return {
        args: args.filter((a) => !a.startsWith('-')),
        arg(index: number) {
            return this.args[index]
        },
        hasFlag(name: string) {
            return args.some(
                (a) =>
                    a === `--${name}` ||
                    a === `-${name.charAt(0)}` ||
                    a.startsWith(`--${name}=`),
            )
        },
        getFlag(name: string) {
            const flag = args.find((a) => a.startsWith(`--${name}=`))
            return flag ? flag.split('=')[1] : undefined
        },
    }
}

/**
 * Command handler function type.
 */
type CommandHandler = (args: string[]) => Promise<void>

/**
 * Registered command with handler and metadata.
 * @internal
 */
interface RegisteredCommand {
    readonly handler: CommandHandler
    readonly description: string
}

/**
 * CLI application for registering and running commands.
 *
 * @example
 * ```ts
 * const cli = new Cli()
 *
 * cli.register('hello', async (args) => {
 *   console.log(`Hello, ${args[0]}!`)
 * }, 'Say hello')
 *
 * await cli.run(['hello', 'World'])
 * ```
 */
export class Cli {
    /** @internal Registered commands */
    private readonly commands: Map<string, RegisteredCommand> = new Map()

    constructor() {
        this.register(
            'list',
            () => {
                console.log('Available commands:')
                const sortedCommands = [...this.commands.entries()].sort(
                    (a, b) => a[0].localeCompare(b[0]),
                )
                for (const [name, { description }] of sortedCommands) {
                    if (description) {
                        console.log(`  ${name.padEnd(20)} ${description}`)
                    } else {
                        console.log(`  ${name}`)
                    }
                }
                return Promise.resolve()
            },
            'List all available commands',
        )
    }

    /**
     * Register a command with a handler function.
     *
     * @param name - The command name (e.g., 'make:controller')
     * @param handler - Async function to handle the command
     * @param description - Description shown in command list
     *
     * @example
     * ```ts
     * cli.register('greet', async (args) => {
     *   console.log(`Hello, ${args[0]}!`)
     * }, 'Greet someone')
     * ```
     */
    register(
        name: string,
        handler: CommandHandler,
        description: string = '',
    ): void {
        this.commands.set(name, { handler, description })
    }

    /**
     * Register a command class decorated with @Command
     */
    registerCommand(CommandClass: CommandClass) {
        const name = CommandClass._commandName
        const description = CommandClass._commandDescription || ''

        if (!name) {
            console.warn('⚠️ Command class missing @Command decorator')
            return
        }

        this.register(
            name,
            async (args) => {
                const instance = new CommandClass()
                const ctx = createContext(args)
                await instance.handle(ctx)
            },
            description,
        )
    }

    /**
     * Discover and register commands from a directory
     */
    async discoverCommands(dirPath: string) {
        try {
            for await (const entry of Deno.readDir(dirPath)) {
                if (
                    entry.isFile &&
                    (entry.name.endsWith('_command.ts') ||
                        entry.name.endsWith('_command.js'))
                ) {
                    const filePath =
                        `file://${Deno.cwd()}/${dirPath}/${entry.name}`
                    try {
                        const module = await import(filePath)
                        for (const key in module) {
                            const Exported = module[key]
                            if (
                                typeof Exported === 'function' &&
                                Exported._commandName
                            ) {
                                this.registerCommand(Exported as CommandClass)
                            }
                        }
                    } catch (e) {
                        console.warn(
                            `⚠️ Failed to load command ${entry.name}: ${
                                (e as Error).message
                            }`,
                        )
                    }
                }
            }
        } catch (_e) {
            // Directory doesn't exist, skip silently
        }
    }

    async run(args: string[]) {
        const [commandName, ...rest] = args

        if (!commandName) {
            await this.commands.get('list')!.handler([])
            return
        }

        const command = this.commands.get(commandName)
        if (command) {
            await command.handler(rest)
        } else {
            console.error(`❌ Unknown command: ${commandName}`)
            await this.commands.get('list')!.handler([])
        }
    }
}

export const cli: Cli = new Cli()
export { Stub }
