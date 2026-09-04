/**
 * @fileoverview Optional role/permission (RBAC) layer on top of the gate.
 *
 * Roles group permissions; a permission is an ability pattern (exact, a
 * single-segment `ns.*` wildcard, or the global `*`). RBAC integrates with the
 * {@link Gate} as a **fallback resolver** ({@link Gate.fallback}): it is
 * consulted only when no explicit ability or policy has decided a check, so an
 * ownership/tenancy policy is never bypassed. RBAC only ever grants — it can
 * never turn an allow into a deny.
 *
 * The layer is **opt-in**: nothing is registered until an app calls
 * {@link useRbac} (or `gate.fallback(rbacResolver(repo))`). Storage is the
 * app's concern via the {@link RoleRepository} port; the in-memory
 * {@link StaticRoleRepository} ships for tests and simple apps.
 *
 * @module @lockness/auth/rbac
 *
 * @example
 * ```typescript
 * import { gate, StaticRoleRepository, useRbac } from '@lockness/auth'
 *
 * const repo = new StaticRoleRepository(new Map([
 *   [1, [{ name: 'editor', permissions: ['post.*'] }]],
 * ]))
 * useRbac(gate, repo)
 *
 * await gate.can(user, 'post.update') // true when the user holds the role
 * ```
 */

import type { Authenticatable } from './types.ts'
import type { Gate, GateFallback } from './gate.ts'

/**
 * A permission: an ability pattern a role grants. One of — an exact ability
 * (`post.update`); a single-segment wildcard (`post.*`, matching `post.update`
 * but not `post.comment.delete`); or the global `*` (every ability).
 */
export type Permission = string

/**
 * A role: a named group of {@link Permission}s. `name` is its identity.
 */
export interface Role {
    /** The role's stable name, e.g. `'editor'`. */
    name: string
    /** The ability patterns this role grants. */
    permissions: Permission[]
}

/**
 * The stable identity RBAC needs to resolve a user's roles. Deliberately
 * narrow — only the `id` — so a {@link RoleRepository} is never handed a full
 * user record (which may carry a password hash or other sensitive fields).
 */
export interface RbacIdentity {
    /** The user's unique identifier. */
    id: Authenticatable['id']
}

/**
 * The port that resolves a user's roles. Apps back it with their store
 * (Drizzle, HTTP, cache); the framework ships {@link StaticRoleRepository}.
 */
export interface RoleRepository {
    /**
     * Resolve the roles held by the identified user.
     *
     * @param identity - The user's stable identity (id only).
     * @returns The user's roles (empty when they hold none).
     */
    rolesFor(identity: RbacIdentity): Promise<Role[]>
}

/**
 * An in-memory {@link RoleRepository} backed by a `Map` of user id → roles.
 * Suitable for tests and small/static role assignments.
 *
 * @example
 * ```typescript
 * const repo = new StaticRoleRepository(new Map([
 *   [1, [{ name: 'admin', permissions: ['*'] }]],
 * ]))
 * ```
 */
export class StaticRoleRepository implements RoleRepository {
    readonly #roles: Map<Authenticatable['id'], Role[]>

    /**
     * @param roles - A map of user id to the roles that user holds.
     */
    constructor(roles: Map<Authenticatable['id'], Role[]> = new Map()) {
        this.#roles = roles
    }

    /**
     * Resolve the roles held by the identified user.
     *
     * @param identity - The user's stable identity.
     * @returns The user's roles, or an empty array when none are assigned.
     */
    rolesFor(identity: RbacIdentity): Promise<Role[]> {
        return Promise.resolve(this.#roles.get(identity.id) ?? [])
    }
}

/**
 * Whether a permission pattern matches a requested ability. Plain string
 * operations only — no `RegExp`, so a literal `.` is never a wildcard.
 *
 * The single home of the match rule (see the feature decision table); the
 * fallback resolver, the repository and any caller ask it, none re-implement it.
 *
 * @param pattern - The granted permission pattern.
 * @param ability - The requested ability.
 * @returns `true` when the pattern grants the ability.
 */
function permissionMatches(pattern: Permission, ability: string): boolean {
    if (pattern === '*') return true
    if (pattern === ability) return true
    if (pattern.endsWith('.*')) {
        const namespace = pattern.slice(0, -2)
        if (!ability.startsWith(namespace + '.')) return false
        const rest = ability.slice(namespace.length + 1)
        // Exactly one further segment: non-empty and containing no more dots.
        return rest.length > 0 && !rest.includes('.')
    }
    return false
}

/**
 * The union of the permission patterns across a set of roles (deduplicated).
 * The single home of the "effective permissions" rule.
 *
 * @param roles - The roles a user holds.
 * @returns The distinct permission patterns they grant.
 */
function effectivePermissions(roles: Role[]): Permission[] {
    const set = new Set<Permission>()
    for (const role of roles) {
        for (const permission of role.permissions) set.add(permission)
    }
    return [...set]
}

/**
 * Build a {@link GateFallback} that grants an ability when the user's roles
 * carry a matching permission. Grants (`true`) or abstains (`undefined`) —
 * never denies. A repository rejection propagates (it is never swallowed, and
 * never converted into a grant).
 *
 * @typeParam User - The authenticated user type.
 * @param repository - The role source.
 * @returns A fallback resolver for {@link Gate.fallback}.
 * @throws Whatever the repository's `rolesFor` rejects with — propagated, never
 *   swallowed and never converted into a grant (the gate then denies).
 */
export function rbacResolver<User extends Authenticatable>(
    repository: RoleRepository,
): GateFallback<User> {
    return async (user, ability) => {
        const roles = await repository.rolesFor({ id: user.id })
        const permissions = effectivePermissions(roles)
        const granted = permissions.some((p) => permissionMatches(p, ability))
        return granted ? true : undefined
    }
}

/**
 * Wire the optional RBAC layer onto a gate: registers {@link rbacResolver} as a
 * fallback. After this, a role's permissions grant abilities that have no
 * explicit rule; explicit abilities and policies remain authoritative.
 *
 * Note: {@link Gate.reset} clears fallbacks, so `useRbac` must be re-applied
 * after a reset (e.g. in test isolation or hot reload). Unrelated: a `before`
 * hook that returns `false` makes hook registration order significant — RBAC
 * itself never denies.
 *
 * @typeParam User - The authenticated user type.
 * @param gate - The gate to extend.
 * @param repository - The role source.
 *
 * @example
 * ```typescript
 * useRbac(gate, new StaticRoleRepository(new Map([
 *   [1, [{ name: 'editor', permissions: ['post.*'] }]],
 * ])))
 * ```
 */
export function useRbac<User extends Authenticatable>(
    gate: Gate<User>,
    repository: RoleRepository,
): void {
    gate.fallback(rbacResolver<User>(repository))
}
