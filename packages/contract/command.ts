/**
 * @fileoverview The command contribution port: what a Lockness package needs
 * to add commands to `./nessy`, without importing `@lockness/cli`.
 *
 * A package exports a `register<Name>Commands(cli: CommandRegistry)` function
 * and calls the registry; `@lockness/cli`'s `Cli` implements the port. The
 * port exists so `core`, `queue`, `features`, `i18n`, `mail`, `notification`
 * and `search` can contribute commands while their dependency policy forbids
 * an edge to `cli` (plan 274 §5, #576). Before it, each of them copied a
 * local `interface Cli`, and `core` took `any`.
 *
 * A handler reports failure by **throwing**. The dispatcher recognises an
 * expected failure by shape — {@link CommandFailure}, an `Error` carrying an
 * integer `exitCode` — prints its message once and exits with that status.
 * The shape is defined here, once; `@lockness/cli`'s `CommandFailedError` is
 * one implementation of it, and a package that may not import `cli` throws a
 * local subclass of `Error` that meets it.
 *
 * Types only: nothing here emits code.
 *
 * @example
 * ```ts
 * import type { CommandRegistry } from '@lockness/contract/command'
 *
 * export function registerDemoCommands(cli: CommandRegistry): void {
 *     cli.register('demo:hello', async (args) => {
 *         console.log(`Hello, ${args[0] ?? 'world'}`)
 *     }, 'Say hello')
 * }
 * ```
 *
 * @module @lockness/contract/command
 */

/**
 * A command handler: receives the arguments after the command name, flags
 * included, and resolves when the command has finished.
 *
 * @param args - The raw arguments passed after the command name.
 * @returns A promise that resolves when the command has finished.
 * @throws {CommandFailure} When the command did not do its job.
 */
export type CommandHandler = (args: string[]) => Promise<void>

/**
 * Parsed view of a command's arguments, handed to a class command's
 * {@link CommandContract.handle}.
 *
 * @example
 * ```ts
 * const name = ctx.arg(0) ?? 'World'
 * const loud = ctx.hasFlag('loud')
 * ```
 */
export interface CommandContext {
    /** Command arguments, excluding flags (anything starting with `-`). */
    readonly args: string[]

    /**
     * Get a positional argument by index.
     *
     * @param index - Zero-based argument index.
     * @returns The argument, or `undefined` when absent.
     */
    arg(index: number): string | undefined

    /**
     * Whether a flag is present: `--flag`, `-f` (first character) or
     * `--flag=value`.
     *
     * @param name - The flag name, without dashes.
     * @returns `true` when the flag is present.
     */
    hasFlag(name: string): boolean

    /**
     * The value of a `--name=value` flag.
     *
     * @param name - The flag name, without dashes.
     * @returns The value, or `undefined` when the flag is absent.
     */
    getFlag(name: string): string | undefined
}

/**
 * A class command: an instance whose {@link handle} runs the command.
 *
 * @example
 * ```ts
 * class GreetCommand implements CommandContract {
 *     static readonly _commandName = 'greet'
 *     async handle(ctx: CommandContext): Promise<void> {
 *         console.log(`Hello, ${ctx.arg(0) ?? 'World'}!`)
 *     }
 * }
 * ```
 */
export interface CommandContract {
    /**
     * Execute the command.
     *
     * @param ctx - The parsed arguments and flags.
     * @returns A promise that resolves when the command has finished.
     * @throws {CommandFailure} When the command did not do its job.
     */
    handle(ctx: CommandContext): Promise<void>
}

/**
 * Metadata a class command carries as static fields — set by `@lockness/cli`'s
 * `@Command` decorator, or written by hand by a package that may not import
 * `cli` (core's `compile` and `ssg:build`).
 */
export interface CommandMetadata {
    /** The command name, e.g. `make:controller`. */
    readonly _commandName?: string
    /** The one-line description shown by `list`. */
    readonly _commandDescription?: string
}

/** A class command's constructor, with its {@link CommandMetadata}. */
export type CommandClass = (new () => CommandContract) & CommandMetadata

/**
 * Where a package contributes its commands. Implemented by `@lockness/cli`'s
 * `Cli`; a test passes any object with these two methods.
 *
 * @example
 * ```ts
 * export function registerQueueCommands(cli: CommandRegistry): void {
 *     cli.register('queue:clear', clearHandler, 'Clear all jobs from a queue')
 * }
 * ```
 */
export interface CommandRegistry {
    /**
     * Register a command handled by a function.
     *
     * @param name - The command name, e.g. `queue:work`.
     * @param handler - Runs the command; throws a {@link CommandFailure} to fail.
     * @param description - The one-line description shown by `list`.
     */
    register(name: string, handler: CommandHandler, description?: string): void

    /**
     * Register a class command, named by its static `_commandName`.
     *
     * @param command - The command class.
     */
    registerCommand(command: CommandClass): void
}

/**
 * The exit contract: an expected command failure is an `Error` with an
 * integer `exitCode` (`1`–`255`). The dispatcher prints `❌ <message>` once,
 * then the rendered `cause` when there is one, and exits with `exitCode`.
 *
 * Recognised by shape, never by class, so it survives two copies of a
 * package loaded side by side and needs no import of `@lockness/cli`.
 *
 * @example
 * ```ts
 * class QueueCommandError extends Error implements CommandFailure {
 *     readonly exitCode = 1
 * }
 * ```
 */
export type CommandFailure = Error & { readonly exitCode: number }
