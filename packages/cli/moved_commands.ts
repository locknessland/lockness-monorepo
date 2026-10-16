/**
 * @fileoverview Commands that used to be built into `@lockness/cli` and now
 * come from another package, so an unknown-command error can say where they
 * went instead of only "unknown" (#592).
 *
 * Internal: no `exports` entry lists it.
 *
 * @module @lockness/cli/moved-commands
 * @internal
 */

/** One family of commands that moved out of `@lockness/cli`. */
interface MovedCommands {
    /** The command-name prefix, e.g. `queue:`. */
    readonly prefix: string
    /** The package that provides them now. */
    readonly packageName: string
}

/** Every family that moved, by prefix. */
const MOVED: readonly MovedCommands[] = [
    { prefix: 'queue:', packageName: '@lockness/queue' },
]

/**
 * The hint to print after `❌ Unknown command: <name>` when the name belongs
 * to a family that moved out of `@lockness/cli`.
 *
 * @param commandName - The command the user typed.
 * @returns The hint line, or `undefined` when the name moved nowhere.
 *
 * @example
 * ```ts
 * movedCommandHint('queue:work')
 * // 'ℹ️  queue:* commands come from @lockness/queue: declare it in your deno.json "imports" (deno add jsr:@lockness/queue)'
 * ```
 */
export function movedCommandHint(commandName: string): string | undefined {
    const moved = MOVED.find(({ prefix }) => commandName.startsWith(prefix))
    if (moved === undefined) return undefined
    return `ℹ️  ${moved.prefix}* commands come from ${moved.packageName}: ` +
        `declare it in your deno.json "imports" (deno add jsr:${moved.packageName})`
}
