import { Stub } from './stubs.ts'

export { registerCoreCommands } from './core_commands.ts'
export {
    addPackage,
    loadPackageCommands,
    removePackage,
} from './package_loader.ts'

/**
 * Register multiple command registration functions at once
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
    registerFunctions: Array<(cli: Cli) => void | Promise<void>>,
): void {
    for (const registerFn of registerFunctions) {
        registerFn(cli)
    }
}

/**
 * Command context passed to command handlers
 */
export interface CommandContext {
    /** Command arguments (after the command name) */
    args: string[]
    /** Get a specific argument by index */
    arg(index: number): string | undefined
    /** Check if a flag is present (e.g., --force, -f) */
    hasFlag(name: string): boolean
    /** Get a flag value (e.g., --name=value) */
    getFlag(name: string): string | undefined
}

/**
 * Command class interface
 */
export interface ICommand {
    handle(ctx: CommandContext): Promise<void>
}

/**
 * Command metadata stored on the class
 */
export interface CommandMetadata {
    _commandName?: string
    _commandDescription?: string
}

export type CommandClass = (new () => ICommand) & CommandMetadata

/**
 * Decorator to mark a class as a CLI command
 */
export function Command(
    name: string,
    description: string = '',
): ClassDecorator {
    // deno-lint-ignore no-explicit-any
    return (target: any) => {
        target._commandName = name
        target._commandDescription = description
    }
}

/**
 * Create a CommandContext from args array
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

export class Cli {
    private commands: Map<
        string,
        { handler: (args: string[]) => Promise<void>; description: string }
    > = new Map()

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

    register(
        name: string,
        handler: (args: string[]) => Promise<void>,
        description: string = '',
    ) {
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
export * from './routes_generator.ts'
