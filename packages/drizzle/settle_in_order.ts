/**
 * @fileoverview Run release steps in order, keep the first failure, and
 * report every later one — the composed `close()` of the default maintenance
 * opener (#447), and the helper #573 wires into the `db:*` handlers.
 *
 * Internal: no `exports` entry lists this module. Its test imports it by
 * relative path.
 *
 * @module @lockness/drizzle/settle-in-order
 */

import { renderError } from '@lockness/contract'

/** One step: what it does, in words for the log, and the step itself. */
export interface SettleStep {
    /** What the step does, as a verb phrase: `close the database`. */
    readonly what: string
    /** The step. */
    readonly run: () => Promise<void>
}

/**
 * Run every step, in order, whether or not an earlier one failed, then throw
 * the **first** failure, unchanged.
 *
 * A later failure is never dropped and never replaces the first: it is logged
 * at WARN, rendered by `renderError` (head only, the shared redaction net
 * applied), because the first failure is what the caller acts on — the error
 * a refusal or a failed migrate is framed by. The first failure keeps its
 * identity, so `instanceof` still holds for whoever catches it.
 *
 * @param steps - The steps, in the order they run.
 * @returns Resolves once every step ran and none failed.
 * @throws The first step failure, after every step ran.
 *
 * @example
 * ```ts
 * await settleInOrder([
 *     { what: 'close the maintenance connection', run: () => connection.close() },
 *     { what: 'close the database', run: () => db.close() },
 * ])
 * ```
 */
export async function settleInOrder(
    steps: readonly SettleStep[],
): Promise<void> {
    let first: { readonly error: unknown } | undefined
    for (const step of steps) {
        try {
            await step.run()
        } catch (error) {
            if (first === undefined) {
                first = { error }
                continue
            }
            // Not silent: the first failure is re-thrown below, and this one
            // is reported here rather than masking it.
            console.warn(
                `⚠️  Could not ${step.what} either: ${
                    renderError(error, { followCause: false })
                }`,
            )
        }
    }
    if (first !== undefined) throw first.error
}
