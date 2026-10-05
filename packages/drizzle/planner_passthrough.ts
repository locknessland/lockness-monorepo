/**
 * @fileoverview Run a maintenance planner through a connection's `execute`
 * so an error the planner throws reaches the caller as itself (#447) — the
 * one rule `resetDatabase` and the redacting `Database.maintenance` both
 * apply.
 *
 * Internal: no `exports` entry lists this module.
 *
 * @module @lockness/drizzle/planner-passthrough
 */

import { renderError } from '@lockness/contract'
import type { MaintenanceConnection, MaintenancePlanner } from './drivers.ts'

/** How deep a cause chain is walked looking for the planner's error. */
const CAUSE_DEPTH = 8

/**
 * Run `planner` through `connection.execute`, so that whatever the
 * connection makes of a planner failure, the caller gets the planner's own
 * error — the `RefusedError` the command frames as "Nothing was dropped".
 *
 * - The planner's error is recorded per call and **cleared when a call
 *   starts**: a connection that retries (a serialization failure) and then
 *   runs a later plan never has the earlier call's refusal rethrown after its
 *   statements ran.
 * - When `execute` **resolves** although the last planner call rejected (a
 *   connection that swallowed it), the planner's error is thrown: a refusal
 *   is never lost.
 * - When `execute` rejects with an error of its own (a failed rollback) while
 *   the planner's error is rethrown, that error is logged at WARN through
 *   `renderError`, never discarded — unless it carries the planner's error
 *   in its cause chain, which says nothing more.
 *
 * @param connection - The connection whose unit the planner runs in.
 * @param planner - The planner.
 * @param failure - Maps an `execute` failure that is not the planner's; the
 *   redacting wrapper redacts it here. The identity by default.
 * @returns Resolves once `execute` resolved and the last planner call did not
 *   reject.
 * @throws The planner's error, unchanged; otherwise `failure` of the
 *   connection's error.
 *
 * @example
 * ```ts
 * await executePassingPlannerErrors(connection, (read) => policy.plan(read, scope))
 * ```
 */
export async function executePassingPlannerErrors(
    connection: Pick<MaintenanceConnection, 'execute'>,
    planner: MaintenancePlanner,
    failure: (error: unknown) => unknown = (error) => error,
): Promise<void> {
    let planned: { readonly error: unknown } | undefined
    try {
        await connection.execute(async (read) => {
            planned = undefined
            try {
                return await planner(read)
            } catch (error) {
                // Recorded, then re-thrown so the driver rolls back.
                planned = { error }
                throw error
            }
        })
    } catch (error) {
        if (planned === undefined) throw failure(error)
        if (!carries(error, planned.error)) {
            // Not silent: the planner's error is re-thrown below, and this
            // one is reported rather than masking it.
            console.warn(
                `⚠️  The maintenance connection also failed after the plan ` +
                    `was refused: ${
                        renderError(failure(error), { followCause: false })
                    }`,
            )
        }
        throw planned.error
    }
    if (planned !== undefined) throw planned.error
}

/**
 * Whether `error` is `target` or holds it in its cause chain, read under a
 * guard: a hostile `cause` getter answers "no", and the caller then logs.
 *
 * @param error - The connection's error.
 * @param target - The planner's error.
 * @returns True when `target` is found within {@link CAUSE_DEPTH} links.
 */
function carries(error: unknown, target: unknown): boolean {
    let current = error
    try {
        for (let depth = 0; depth <= CAUSE_DEPTH; depth++) {
            if (current === target) return true
            if (!(current instanceof Error)) return false
            current = current.cause
        }
    } catch (readError) {
        // The chain could not be read; the error is logged by the caller, so
        // nothing is lost by answering "no".
        console.warn(
            `⚠️  A cause chain could not be read: ${
                renderError(readError, { followCause: false })
            }`,
        )
    }
    return false
}
