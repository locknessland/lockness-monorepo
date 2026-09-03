/**
 * @fileoverview Tests for the authorization Gate primitive (#192).
 *
 * @module @lockness/auth/tests/gate
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { AuthorizationError, Gate } from '../mod.ts'
import type { Authenticatable } from '../mod.ts'

interface User extends Authenticatable {
    id: number
    email: string
    role?: string
}

const alice: User = { id: 1, email: 'alice@example.com' }
const bob: User = { id: 2, email: 'bob@example.com' }

function newGate(): Gate<User> {
    const gate = new Gate<User>()
    gate.define(
        'update-post',
        (user, post) => user.id === (post as { authorId: number }).authorId,
    )
    return gate
}

Deno.test('can - allows when the ability callback returns true', async () => {
    const gate = newGate()
    assert(await gate.can(alice, 'update-post', { authorId: 1 }))
})

Deno.test('can - denies when the ability callback returns false', async () => {
    const gate = newGate()
    assertEquals(await gate.can(bob, 'update-post', { authorId: 1 }), false)
})

Deno.test('can - fails closed for an unknown ability', async () => {
    const gate = newGate()
    assertEquals(await gate.can(alice, 'nonexistent'), false)
})

Deno.test('can - fails closed for a missing user', async () => {
    const gate = newGate()
    assertEquals(await gate.can(null, 'update-post', { authorId: 1 }), false)
    assertEquals(
        await gate.can(undefined, 'update-post', { authorId: 1 }),
        false,
    )
})

Deno.test('cannot - is the negation of can', async () => {
    const gate = newGate()
    assertEquals(await gate.cannot(bob, 'update-post', { authorId: 1 }), true)
    assertEquals(
        await gate.cannot(alice, 'update-post', { authorId: 1 }),
        false,
    )
})

Deno.test('authorize - throws AuthorizationError (403) when denied', async () => {
    const gate = newGate()
    const error = await assertRejects(
        () => gate.authorize(bob, 'update-post', { authorId: 1 }),
        AuthorizationError,
    )
    assertEquals(error.status, 403)
})

Deno.test('authorize - resolves silently when allowed', async () => {
    const gate = newGate()
    await gate.authorize(alice, 'update-post', { authorId: 1 })
})

Deno.test('before - short-circuits to allow (admin bypass)', async () => {
    const gate = newGate()
    gate.before((user) => (user.role === 'admin' ? true : undefined))
    const admin: User = { id: 9, email: 'admin@example.com', role: 'admin' }
    // Admin is allowed even though the ability callback would deny.
    assert(await gate.can(admin, 'update-post', { authorId: 1 }))
    // A non-admin still falls through to the ability callback.
    assertEquals(await gate.can(bob, 'update-post', { authorId: 1 }), false)
})

Deno.test('before - short-circuits to deny', async () => {
    const gate = newGate()
    gate.before(() => false)
    // Even the rightful author is denied once a before hook says no.
    assertEquals(await gate.can(alice, 'update-post', { authorId: 1 }), false)
})

Deno.test('define - supports async callbacks', async () => {
    const gate = new Gate<User>()
    gate.define('async-check', (user) => Promise.resolve(user.id === 1))
    assert(await gate.can(alice, 'async-check'))
    assertEquals(await gate.can(bob, 'async-check'), false)
})

Deno.test('reset - clears abilities and hooks', async () => {
    const gate = newGate()
    gate.reset()
    assertEquals(gate.has('update-post'), false)
    assertEquals(await gate.can(alice, 'update-post', { authorId: 1 }), false)
})
