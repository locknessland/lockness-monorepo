/**
 * @fileoverview Declarative caching decorators for method return values.
 *
 * `@lockness/cache` already exposes an imperative API (`get` / `set` /
 * `remember` / `flushByTag`). These decorators put the same behaviour on a
 * method without the call-site ceremony.
 *
 * @module
 */

import { parseTimeWindow } from '@lockness/contract'
import { cache } from './store.ts'
import { flushByTag, forget } from './api.ts'

/**
 * A time-to-live.
 *
 * A **bare number is seconds**, matching the imperative API — `set(key, value,
 * 3600)` caches for an hour. String shorthand carries its own unit.
 *
 * This differs from `@Throttle`, where a bare number is milliseconds; each
 * follows the convention of the API it decorates.
 *
 * @example
 * ```ts
 * const a: CacheTtl = '5m'
 * const b: CacheTtl = 300 // seconds
 * ```
 */
export type CacheTtl =
    | number
    | `${number}s`
    | `${number}m`
    | `${number}h`
    | `${number}d`

/**
 * Full configuration for {@link Cached}.
 *
 * @typeParam Args - The decorated method's argument tuple, so `key` and
 * `condition` receive exactly the arguments the method receives.
 */
export interface CachedOptions<Args extends unknown[] = unknown[]> {
    /** How long to keep the value. Omit to cache without expiry. */
    ttl?: CacheTtl
    /**
     * A fixed key, or a function deriving one from the arguments. Omit to
     * derive `ClassName.method(args)` automatically.
     */
    key?: string | ((...args: Args) => string)
    /** Tags for group invalidation through `flushByTag`. */
    tags?: string[]
    /** Return `false` to bypass the cache for this call. */
    condition?: (...args: Args) => boolean
}

/**
 * Configuration for {@link CacheInvalidate}.
 */
export interface CacheInvalidateOptions<Args extends unknown[] = unknown[]> {
    /** A fixed key to drop, or one derived from the arguments. */
    key?: string | ((...args: Args) => string)
    /** Tags to flush. */
    tags?: string[]
    /**
     * Whether to invalidate before or after the method runs. Defaults to
     * `'after'`, so a failed write leaves the cache intact.
     */
    timing?: 'before' | 'after'
}

/** Seconds per shorthand unit, relative to what `parseTimeWindow` returns. */
const MS_PER_SECOND = 1_000

/**
 * Resolve a {@link CacheTtl} to seconds.
 *
 * @param ttl - The value to resolve.
 * @returns The TTL in seconds, or `undefined` when none was given.
 * @throws {TypeError} If the value is not a positive number or a valid
 * shorthand string.
 */
function resolveTtl(ttl?: CacheTtl): number | undefined {
    if (ttl === undefined) return undefined
    if (typeof ttl === 'number') {
        if (!Number.isFinite(ttl) || ttl <= 0) {
            throw new TypeError(
                `@Cached ttl must be a finite positive number of seconds, received ${ttl}.`,
            )
        }
        return ttl
    }
    // Strings share the grammar `parseTimeWindow` already validates; it answers
    // in milliseconds, and this API counts in seconds.
    return parseTimeWindow(ttl) / MS_PER_SECOND
}

/**
 * Serialise a value so that two structurally equal arguments produce the same
 * string.
 *
 * Object keys are sorted, because `{a: 1, b: 2}` and `{b: 2, a: 1}` describe
 * the same call and must not occupy two cache entries.
 *
 * @param value - The value to serialise.
 * @returns A stable string form.
 */
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`
    }
    const entries = Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    return `{${entries.join(',')}}`
}

/**
 * Build the cache key for one call.
 *
 * @param key - The configured key or key generator, if any.
 * @param className - The instance's constructor name.
 * @param methodName - The decorated method's name.
 * @param args - The call arguments.
 * @returns The key to read and write.
 */
function buildKey<Args extends unknown[]>(
    key: CachedOptions<Args>['key'],
    className: string,
    methodName: string,
    args: Args,
): string {
    if (typeof key === 'function') return key(...args)
    if (typeof key === 'string') return key
    return `${className}.${methodName}(${args.map(stableStringify).join(',')})`
}

/**
 * Cache a method's return value.
 *
 * The first call runs the method and stores the result; later calls with the
 * same arguments return the stored value without running it.
 *
 * **The decorated method must be `async`.** A TC39 method decorator may only
 * return a replacement with the same signature, and reading the cache is
 * asynchronous — so a synchronous method cannot be wrapped without changing
 * its type, which the language forbids. Decorating one is a compile error.
 *
 * A `null` result is **not** cached — the store cannot distinguish a stored
 * `null` from a miss, so caching it would make every subsequent call a miss
 * anyway, while hiding that fact.
 *
 * @param ttlOrOptions - A TTL shorthand, or the full options object.
 * @returns A method decorator.
 * @throws {TypeError} At decoration time if the TTL is malformed.
 *
 * @example
 * ```ts
 * class ReportService {
 *   @Cached('5m')
 *   async monthly(year: number, month: number) {
 *     return await db.expensiveAggregate(year, month)
 *   }
 *
 *   @Cached({ ttl: '1h', tags: ['reports'], condition: (id) => id > 0 })
 *   async byId(id: number) {
 *     return await db.report(id)
 *   }
 * }
 * ```
 */
export function Cached<Args extends unknown[], Return>(
    ttlOrOptions?: CacheTtl | CachedOptions<Args>,
): <This>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<
        This,
        (this: This, ...args: Args) => Promise<Return>
    >,
) => (this: This, ...args: Args) => Promise<Return> {
    const options: CachedOptions<Args> =
        ttlOrOptions === undefined || typeof ttlOrOptions === 'number' ||
            typeof ttlOrOptions === 'string'
            ? { ttl: ttlOrOptions as CacheTtl | undefined }
            : ttlOrOptions

    // Validate now rather than on first call: a malformed TTL is an authoring
    // mistake and should surface when the class is defined, not under load.
    const ttl = resolveTtl(options.ttl)

    return function <This>(
        target: (this: This, ...args: Args) => Promise<Return>,
        context: ClassMethodDecoratorContext<
            This,
            (this: This, ...args: Args) => Promise<Return>
        >,
    ): (this: This, ...args: Args) => Promise<Return> {
        const methodName = String(context.name)

        return async function (this: This, ...args: Args): Promise<Return> {
            if (options.condition && !options.condition(...args)) {
                return await target.apply(this, args)
            }

            const className =
                (this as { constructor?: { name?: string } })?.constructor
                    ?.name ?? 'Anonymous'
            const key = buildKey(options.key, className, methodName, args)
            const store = options.tags?.length
                ? cache(...options.tags)
                : cache()

            const hit = await store.get<Return>(key)
            if (hit !== null) return hit

            const result = await target.apply(this, args)
            if (result !== null && result !== undefined) {
                await store.set(key, result, ttl)
            }
            return result
        }
    }
}

/**
 * Drop cache entries around a method call.
 *
 * Use it on the writes that make cached reads stale.
 *
 * @param options - What to invalidate, and when.
 * @returns A method decorator.
 *
 * @example
 * ```ts
 * class ReportService {
 *   @CacheInvalidate({ tags: ['reports'] })
 *   async publish(id: number) {
 *     await db.publish(id)
 *   }
 * }
 * ```
 */
export function CacheInvalidate<Args extends unknown[], Return>(
    options: CacheInvalidateOptions<Args>,
): <This>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<
        This,
        (this: This, ...args: Args) => Promise<Return>
    >,
) => (this: This, ...args: Args) => Promise<Return> {
    const timing = options.timing ?? 'after'

    return function <This>(
        target: (this: This, ...args: Args) => Promise<Return>,
        context: ClassMethodDecoratorContext<
            This,
            (this: This, ...args: Args) => Promise<Return>
        >,
    ): (this: This, ...args: Args) => Promise<Return> {
        const methodName = String(context.name)

        return async function (this: This, ...args: Args): Promise<Return> {
            const invalidate = async (): Promise<void> => {
                if (options.key !== undefined) {
                    const className =
                        (this as { constructor?: { name?: string } })
                            ?.constructor?.name ?? 'Anonymous'
                    await forget(
                        buildKey(options.key, className, methodName, args),
                    )
                }
                for (const tag of options.tags ?? []) {
                    await flushByTag(tag)
                }
            }

            if (timing === 'before') await invalidate()
            const result = await target.apply(this, args)
            // 'after' runs only on success: a method that threw did not change
            // anything, so the cache is still correct.
            if (timing === 'after') await invalidate()
            return result
        }
    }
}
