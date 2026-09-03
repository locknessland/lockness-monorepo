/**
 * @fileoverview Authorization gates — the "can this user do this?" primitive.
 *
 * A {@link Gate} is a registry of named abilities, each backed by a callback
 * that decides whether a user may perform it (optionally against a subject such
 * as a record). It answers with {@link Gate.can}/{@link Gate.cannot} or enforces
 * with {@link Gate.authorize}, which throws {@link AuthorizationError} (403).
 *
 * The gate is **fail-closed**: an absent user, an unknown ability, or a
 * falsy callback result all deny. `before` hooks run first and can short-circuit
 * (e.g. to allow an administrator everything). This is the low-level primitive;
 * policy classes and controller decorators build on it (#191).
 *
 * @module @lockness/auth/gate
 *
 * @example
 * ```typescript
 * import { gate } from '@lockness/auth'
 *
 * gate.define('update-post', (user, post: { authorId: number }) =>
 *   user.id === post.authorId)
 *
 * if (await gate.can(user, 'update-post', post)) { ... }
 * await gate.authorize(user, 'update-post', post) // throws AuthorizationError if denied
 * ```
 */

import type { Authenticatable } from './types.ts'
import { AuthorizationError } from './errors.ts'

/**
 * A gate ability check: decides whether `user` may perform the ability,
 * optionally against `args` (e.g. the record being acted on).
 *
 * @typeParam User - The authenticated user type.
 */
export type GateCallback<User extends Authenticatable> = (
    user: User,
    ...args: unknown[]
) => boolean | Promise<boolean>

/**
 * A `before` hook: runs ahead of every check. Return a boolean to decide the
 * outcome immediately (short-circuit), or `undefined` to fall through to the
 * ability callbacks.
 *
 * @typeParam User - The authenticated user type.
 */
export type GateBeforeHook<User extends Authenticatable> = (
    user: User,
    ability: string,
    ...args: unknown[]
) => boolean | undefined | Promise<boolean | undefined>

/**
 * A registry of authorization abilities.
 *
 * @typeParam User - The authenticated user type; defaults to
 *   {@link Authenticatable}.
 */
export class Gate<User extends Authenticatable = Authenticatable> {
    readonly #abilities = new Map<string, GateCallback<User>>()
    readonly #beforeHooks: GateBeforeHook<User>[] = []

    /**
     * Register (or replace) an ability.
     *
     * @param ability - The ability name, e.g. `'update-post'`.
     * @param callback - The check to run for it.
     * @returns This gate, for chaining.
     */
    define(ability: string, callback: GateCallback<User>): this {
        this.#abilities.set(ability, callback)
        return this
    }

    /**
     * Register a `before` hook that runs ahead of every check.
     *
     * @param hook - The hook; return a boolean to short-circuit.
     * @returns This gate, for chaining.
     */
    before(hook: GateBeforeHook<User>): this {
        this.#beforeHooks.push(hook)
        return this
    }

    /**
     * Whether an ability has been defined.
     *
     * @param ability - The ability name.
     * @returns `true` when a callback is registered for it.
     */
    has(ability: string): boolean {
        return this.#abilities.has(ability)
    }

    /**
     * Whether `user` may perform `ability`. Fail-closed: a missing user,
     * an unknown ability, or a falsy result all return `false`.
     *
     * @param user - The user, or `null`/`undefined` when unauthenticated.
     * @param ability - The ability name.
     * @param args - Extra arguments passed to the hooks and callback.
     * @returns `true` only when the check explicitly allows.
     */
    async can(
        user: User | null | undefined,
        ability: string,
        ...args: unknown[]
    ): Promise<boolean> {
        if (user === null || user === undefined) return false

        for (const hook of this.#beforeHooks) {
            const verdict = await hook(user, ability, ...args)
            if (verdict !== undefined) return verdict
        }

        const callback = this.#abilities.get(ability)
        if (!callback) return false
        return (await callback(user, ...args)) === true
    }

    /**
     * The negation of {@link can}.
     *
     * @param user - The user, or `null`/`undefined`.
     * @param ability - The ability name.
     * @param args - Extra arguments.
     * @returns `true` when the user may NOT perform the ability.
     */
    async cannot(
        user: User | null | undefined,
        ability: string,
        ...args: unknown[]
    ): Promise<boolean> {
        return !(await this.can(user, ability, ...args))
    }

    /**
     * Enforce an ability, throwing when denied.
     *
     * @param user - The user, or `null`/`undefined`.
     * @param ability - The ability name.
     * @param args - Extra arguments.
     * @throws {AuthorizationError} When the check does not explicitly allow.
     */
    async authorize(
        user: User | null | undefined,
        ability: string,
        ...args: unknown[]
    ): Promise<void> {
        if (!(await this.can(user, ability, ...args))) {
            throw new AuthorizationError(
                `Not authorized to perform "${ability}".`,
            )
        }
    }

    /**
     * Remove every registered ability and hook. Primarily for test isolation.
     */
    reset(): void {
        this.#abilities.clear()
        this.#beforeHooks.length = 0
    }
}

/**
 * The default application-wide gate. Most apps use this singleton; construct a
 * fresh {@link Gate} for isolation (e.g. in tests).
 */
export const gate: Gate = new Gate()
