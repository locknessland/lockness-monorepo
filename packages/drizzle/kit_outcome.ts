/**
 * @fileoverview The verdict on one `drizzle-kit` run (#445): did the step
 * work, and if not, what the command says.
 *
 * drizzle-kit 0.31.10's exit code does not report what `generate` and `push`
 * did. On postgres and sqlite their catch-alls log the error with
 * `console.error` and the process exits 0, so a refused rename or a failed
 * `ALTER` looks exactly like success. This module reads the signal that does
 * carry the outcome: what the child wrote to stderr, which the runner keeps
 * clean of Deno's own output by spawning with `deno run -q`.
 *
 * Pure: it never spawns, prints or reads anything. The runner reports
 * `{ code, stderr }` and decides nothing; the command throws what this module
 * returns.
 *
 * @module @lockness/drizzle/kit-outcome
 * @internal
 */

import type { CommandResult } from './cli_commands.ts'

/** The `drizzle-kit` subcommands the `db:*` commands run. */
export type KitSubcommand = 'generate' | 'push' | 'studio' | 'check'

/**
 * The sentence drizzle-kit's prompt library throws when stdin or stdout is not
 * a TTY. It only picks the **wording** of a failure, never **whether** the run
 * failed: a pin bump that rewords it loses the hint, not the failure.
 */
const TTY_REFUSAL = 'Interactive prompts require a TTY terminal'

/**
 * What a TTY refusal means, for either judged subcommand. kits:smoke and the
 * live-postgres push suite look for it in a real run against the pinned
 * drizzle-kit.
 *
 * @internal Exported for those checks.
 */
export const NEEDED_A_TERMINAL =
    'drizzle-kit needed an answer only a terminal can ' +
    'give (a rename, or a data-loss confirmation) and this run had none'

/**
 * The subcommands judged on stderr as well as on the exit code — the two whose
 * catch-alls were read in drizzle-kit 0.31.10's source and measured. `check`
 * and `studio` keep the exit-code rule until someone measures them: their
 * stderr is still shown, just not judged.
 */
type JudgedSubcommand = Extract<KitSubcommand, 'generate' | 'push'>

/** For each judged subcommand: what a refusal left undone, and the way on. */
const REFUSAL: Readonly<
    Record<
        JudgedSubcommand,
        { readonly outcome: string; readonly next: string }
    >
> = {
    generate: {
        outcome: 'no migration was written',
        next: 'Run db:generate in a terminal and commit the migration; ' +
            'generate has no non-interactive option for renames.',
    },
    push: {
        outcome: 'nothing was applied',
        next: 'Run db:push in a terminal, or for CI run db:generate locally ' +
            'and db:migrate in CI.',
    },
}

/**
 * Whether a subcommand's stderr is judged.
 *
 * @param subcommand - The drizzle-kit subcommand.
 * @returns True for `generate` and `push`.
 */
function judgesStderr(
    subcommand: KitSubcommand,
): subcommand is JudgedSubcommand {
    return Object.hasOwn(REFUSAL, subcommand)
}

/**
 * What `push` adds to a swallowed error: `pgPush` runs its statements one at a
 * time, outside a transaction, so the ones before the failure stay applied.
 */
const PARTIAL_PUSH = ' The schema may be partly pushed: drizzle-kit runs its ' +
    'statements one at a time, outside a transaction.'

/**
 * Judge one `drizzle-kit` run.
 *
 * A run fails when it exits non-zero, or — for `generate` and `push` — when it
 * exits 0 but wrote anything other than whitespace to stderr. The child's
 * stderr has already reached the terminal through the runner, so a message
 * never repeats it.
 *
 * @param subcommand - The drizzle-kit subcommand that ran.
 * @param failure - The step's failure phrase, e.g.
 *   `'Failed to push schema'`; every message starts with it.
 * @param result - What the runner observed.
 * @returns The message the command fails with, or `undefined` when the run
 *   passed.
 *
 * @example
 * ```ts
 * kitFailure('push', 'Failed to push schema', { code: 0, stderr: '' })
 * // undefined
 * kitFailure('push', 'Failed to push schema', { code: 2, stderr: '' })
 * // 'Failed to push schema (drizzle-kit push exited 2)'
 * ```
 */
export function kitFailure(
    subcommand: KitSubcommand,
    failure: string,
    result: CommandResult,
): string | undefined {
    if (result.code !== 0) {
        return `${failure} (drizzle-kit ${subcommand} exited ${result.code})`
    }
    if (!judgesStderr(subcommand) || result.stderr.trim() === '') {
        return undefined
    }
    if (result.stderr.includes(TTY_REFUSAL)) {
        const refusal = REFUSAL[subcommand]
        return `${failure}: ${NEEDED_A_TERMINAL}, so ${refusal.outcome}. ` +
            refusal.next
    }
    const swallowed = `${failure} (drizzle-kit ${subcommand} exited 0 after ` +
        'reporting an error; see above)'
    return subcommand === 'push' ? `${swallowed}.${PARTIAL_PUSH}` : swallowed
}
