/**
 * @fileoverview Construction-time check on the `db` resolver every provider
 * takes. Internal: not re-exported from any entry point.
 *
 * @module
 * @internal
 */

/**
 * Refuse a `db` option that is not a function.
 *
 * Providers call `db()` on every lookup and never at construction, so a
 * provider built per request touches nothing until a lookup runs. The type
 * already rejects the pre-v0.5.0 `db: database.db` instance at compile time;
 * this check is for the JavaScript caller, so the mistake surfaces when the
 * provider is built rather than as `db is not a function` on the first
 * authenticated request.
 *
 * @param db - The candidate `db` option.
 * @throws {TypeError} When `db` is not a function.
 *
 * @example
 * ```ts
 * assertDbResolver(() => database.db) // passes
 * assertDbResolver(database.db) // TypeError
 * ```
 */
export function assertDbResolver(
    db: unknown,
): asserts db is () => unknown {
    if (typeof db !== 'function') {
        throw new TypeError(
            '`db` must be a function returning the database instance, e.g. db: () => database.db',
        )
    }
}
