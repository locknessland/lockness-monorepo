/**
 * @fileoverview Run a standalone tool's work under the CLI exit contract.
 *
 * A standalone entry — a tool run with `deno run jsr:@lockness/<pkg>`, not
 * through `Cli` — reports failure the way a command does: by **throwing**.
 * {@link runEntry} prints the throw once, through the same printer as
 * `Cli.dispatch`, and writes the status to `Deno.exitCode`, so the tool exits
 * non-zero without calling `Deno.exit()` and without Deno printing an
 * unredacted `error: Uncaught` with its whole cause chain.
 *
 * It imports the package-internal printer only, never the `@lockness/cli`
 * barrel, so a tool that uses it loads none of the built-in commands.
 *
 * @example
 * ```ts
 * import { runEntry } from '@lockness/cli/entry'
 *
 * if (import.meta.main) await runEntry('upgrade', () => main(Deno.args))
 * ```
 *
 * @module @lockness/cli/entry
 */

import { applyExitStatus, reportThrown } from './report.ts'

/**
 * Run a standalone tool's work, print whatever it throws once, and set the
 * process exit status.
 *
 * | `main`                                  | Status   | Printed                          |
 * | :-------------------------------------- | :------- | :------------------------------- |
 * | resolves                                | `0`      | —                                |
 * | throws a failure-shaped error           | its `exitCode` (`1`–`255`) | `❌ <message>`, then its rendered `cause` |
 * | throws anything else                    | `1`      | `❌ <label> failed:` + the error rendered with its frames |
 *
 * **Any** throw is caught, not only a failure: an escaped throw from a
 * standalone entry would otherwise print its message, source line, stack and
 * cause chain unredacted. The status is set, never forced, so `finally` blocks
 * run and buffered output is not cut off; `0` leaves `Deno.exitCode` as it
 * was.
 *
 * `main` must return the promise of its work: a promise it starts without
 * awaiting escapes this, as it would escape any `try`.
 *
 * @param label - The tool's name, shown as `❌ <label> failed:` for an
 *   unexpected error.
 * @param main - The tool's work. It reports failure by throwing and never
 *   touches process state.
 * @returns The exit status: `0` on success, `1`–`255` on failure.
 *
 * @example
 * ```ts
 * import { runEntry } from '@lockness/cli/entry'
 * import { CommandFailedError } from '@lockness/cli/command-failure'
 *
 * async function main(args: string[]): Promise<void> {
 *     if (args.length === 0) throw new CommandFailedError('A component name is required')
 * }
 *
 * if (import.meta.main) await runEntry('tool', () => main(Deno.args))
 * ```
 */
export async function runEntry(
    label: string,
    main: () => void | Promise<void>,
): Promise<number> {
    let status = 0
    try {
        await main()
    } catch (error) {
        status = reportThrown(label, error)
    }
    applyExitStatus(status)
    return status
}
