/**
 * @fileoverview Tests for the optional RBAC role/permission layer (#195).
 *
 * Covers the match grammar (truth table), the effective-permission union, the
 * fallback integration (US1/US2), additive safety (US3 — ownership not
 * overridden, repository errors propagate), and the opt-in guarantee (US4).
 *
 * @module @lockness/auth/tests/rbac
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import {
    Gate,
    type Role,
    type RoleRepository,
    StaticRoleRepository,
    useRbac,
} from '../mod.ts'
import type { Authenticatable } from '../mod.ts'

interface User extends Authenticatable {
    id: number
    email: string
}

const alice: User = { id: 1, email: 'alice@example.com' }
const bob: User = { id: 2, email: 'bob@example.com' }

/** Wire a fresh gate with a static repository mapping user id → roles. */
function gateWithRoles(roles: Record<number, Role[]>): Gate<User> {
    const gate = new Gate<User>()
    const repo = new StaticRoleRepository(
        new Map(Object.entries(roles).map(([id, r]) => [Number(id), r])),
    )
    useRbac(gate, repo)
    return gate
}

// =============================================================================
// US1 — a role grants an ability
// =============================================================================

Deno.test('US1 - a role grants its permission as an ability', async () => {
    const gate = gateWithRoles({
        1: [{ name: 'editor', permissions: ['post.update'] }],
    })
    assert(await gate.can(alice, 'post.update'))
})

Deno.test('US1 - a user with no role is denied', async () => {
    const gate = gateWithRoles({
        1: [{ name: 'editor', permissions: ['post.update'] }],
    })
    assertEquals(await gate.can(bob, 'post.update'), false)
})

Deno.test('US1 - effective permissions are the union across roles', async () => {
    const gate = gateWithRoles({
        1: [
            { name: 'editor', permissions: ['post.update'] },
            { name: 'commenter', permissions: ['comment.create'] },
        ],
    })
    assert(await gate.can(alice, 'post.update'))
    assert(await gate.can(alice, 'comment.create'))
    assertEquals(await gate.can(alice, 'post.delete'), false)
})

// =============================================================================
// US2 — wildcard permissions (match grammar truth table)
// =============================================================================

Deno.test('US2 - exact match only: bare "post" does not grant "post.update"', async () => {
    const gate = gateWithRoles({ 1: [{ name: 'r', permissions: ['post'] }] })
    assert(await gate.can(alice, 'post'))
    assertEquals(await gate.can(alice, 'post.update'), false)
})

Deno.test('US2 - a prefix that is not a segment does not match', async () => {
    const gate = gateWithRoles({ 1: [{ name: 'r', permissions: ['post.up'] }] })
    assertEquals(await gate.can(alice, 'post.update'), false)
})

Deno.test('US2 - "post.*" grants one further segment, not a deeper one', async () => {
    const gate = gateWithRoles({ 1: [{ name: 'r', permissions: ['post.*'] }] })
    assert(await gate.can(alice, 'post.update'))
    assert(await gate.can(alice, 'post.delete'))
    assertEquals(await gate.can(alice, 'post.comment.delete'), false)
    assertEquals(await gate.can(alice, 'comment.delete'), false)
})

Deno.test('US2 - "*" grants any ability (superadmin)', async () => {
    const gate = gateWithRoles({ 1: [{ name: 'admin', permissions: ['*'] }] })
    assert(await gate.can(alice, 'post.update'))
    assert(await gate.can(alice, 'anything.at.all'))
})

Deno.test('US2 - a literal dot is not a wildcard (no regex)', async () => {
    const gate = gateWithRoles({
        1: [{ name: 'r', permissions: ['post.update'] }],
    })
    assertEquals(await gate.can(alice, 'postXupdate'), false)
})

// =============================================================================
// US3 — additive and safe: never override a policy, never swallow an error
// =============================================================================

Deno.test('US3 (SC-005) - a denying ownership policy is not widened by a role grant', async () => {
    const gate = new Gate<User>()
    // Ownership policy: only the author may update.
    gate.policy('post', {
        update: (u, p) => u.id === (p as { authorId: number }).authorId,
    })
    const repo = new StaticRoleRepository(
        new Map([[1, [{ name: 'editor', permissions: ['post.update'] }]]]),
    )
    useRbac(gate, repo)
    // Alice holds the role, but the policy denies her on someone else's post.
    // The explicit policy is authoritative — RBAC must not override it.
    assertEquals(await gate.can(alice, 'post.update', { authorId: 2 }), false)
    // On her own post the policy allows her.
    assert(await gate.can(alice, 'post.update', { authorId: 1 }))
})

Deno.test('US3 (FR-007) - a throwing repository rejects the check, never grants', async () => {
    const gate = new Gate<User>()
    const failing: RoleRepository = {
        rolesFor: () => Promise.reject(new Error('db down')),
    }
    useRbac(gate, failing)
    await assertRejects(() => gate.can(alice, 'post.update'), Error, 'db down')
})

// =============================================================================
// US4 — opt-in: an app that never wires RBAC is unchanged
// =============================================================================

Deno.test('US4 (SC-002) - a fresh gate grants nothing until useRbac is called', async () => {
    const gate = new Gate<User>()
    // No RBAC wired: an ability with no rule is denied by default.
    assertEquals(await gate.can(alice, 'post.update'), false)
})

Deno.test('StaticRoleRepository - returns [] for an unknown user', async () => {
    const repo = new StaticRoleRepository(new Map())
    assertEquals(await repo.rolesFor({ id: 999 }), [])
})

Deno.test('RoleRepository - receives the id only, never the full user record', async () => {
    const gate = new Gate<User>()
    let receivedKeys: string[] = []
    const spy: RoleRepository = {
        rolesFor: (identity) => {
            receivedKeys = Object.keys(identity)
            return Promise.resolve([])
        },
    }
    useRbac(gate, spy)
    // A user carrying a password hash and extra fields must NOT reach the port.
    const withSecret = { id: 1, email: 'a@b.c', password: 'HASH' } as User
    await gate.can(withSecret, 'post.update')
    assertEquals(receivedKeys, ['id'])
})
