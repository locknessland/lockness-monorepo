/**
 * @fileoverview The one refusal the schema commands share (#442): a
 * configuration or a connection `db:migrate` and `db:fresh` will not act on.
 *
 * The error carries only the reason. The command that caught it adds its own
 * name and its own "nothing was done" sentence, because those belong to the
 * command, not to whoever threw: the settings loader is shared, and it must
 * not have to know which command called it.
 *
 * Internal: not exported from `mod.ts`.
 *
 * @module @lockness/drizzle/refusal
 * @since 0.5.0
 */

/**
 * A schema command refused to act, before it changed anything.
 *
 * @example
 * ```ts
 * throw new RefusedError('drizzle.config.ts: `out` (the migrations folder) is not set')
 * throw new RefusedError("drizzle.config.ts: `driver` is 'pglite'", { kitOnly: true })
 * ```
 */
export class RefusedError extends Error {
    /** Why, in one sentence without a trailing period. Quotes no credential. */
    readonly reason: string
    /** drizzle-kit can run this configuration; Lockness cannot. */
    readonly kitOnly: boolean

    /**
     * @param reason - Why, in one sentence without a trailing period.
     * @param options - The underlying failure, when there is one, and whether
     *   drizzle-kit can still run the configuration.
     */
    constructor(
        reason: string,
        options?: ErrorOptions & { readonly kitOnly?: boolean },
    ) {
        super(reason, options)
        this.name = 'RefusedError'
        this.reason = reason
        this.kitOnly = options?.kitOnly ?? false
    }
}
