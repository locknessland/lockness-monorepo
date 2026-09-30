/**
 * @fileoverview The `db:fresh` reset policy (#435): what "empty" means per
 * dialect, the catalogue reads, the pure planners that turn catalogue rows
 * into statements, and every refusal made before anything is dropped.
 *
 * "Fresh" empties a **managed scope**, not "what the migrations created" —
 * that cannot be computed. The mechanism (sessions, transactions, the
 * migrator) lives in `drivers.ts`; this module only decides.
 *
 * @module @lockness/drizzle/reset
 * @since 0.4.1
 */

/**
 * `db:fresh` refused to act, and nothing was dropped.
 *
 * Every refusal happens before the first `DROP`: a configuration it cannot
 * act on, migrations it could not re-apply, a connection without the
 * maintenance capability, or a scope it cannot empty safely.
 *
 * @example
 * ```ts
 * throw new FreshRefusedError('`out` is not set in drizzle.config.ts')
 * ```
 */
export class FreshRefusedError extends Error {
    /**
     * @param reason - Why, in one sentence without a trailing period.
     * @param options - The underlying failure, when there is one.
     */
    constructor(reason: string, options?: ErrorOptions) {
        super(`db:fresh refused: ${reason}. Nothing was dropped.`, options)
        this.name = 'FreshRefusedError'
    }
}
