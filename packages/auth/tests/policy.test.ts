/**
 * @fileoverview Tests for gate policies — dotted-ability resolution (#193).
 *
 * @module @lockness/auth/tests/policy
 */

import { test } from 'node:test'
import { assert, assertEquals } from '@std/assert'
import { Gate } from '../mod.ts'
import type { Authenticatable } from '../mod.ts'

interface User extends Authenticatable {
    id: number
    email: string
}

const alice: User = { id: 1, email: 'a@b.c' }
const bob: User = { id: 2, email: 'b@b.c' }

function gateWithPostPolicy(): Gate<User> {
    const gate = new Gate<User>()
    gate.policy('post', {
        view: () => true,
        update: (user, post) =>
            user.id === (post as { authorId: number }).authorId,
    })
    return gate
}

test('policy - a dotted ability resolves to the policy method', async () => {
    const gate = gateWithPostPolicy()
    assert(await gate.can(alice, 'post.update', { authorId: 1 }))
    assertEquals(await gate.can(bob, 'post.update', { authorId: 1 }), false)
    assert(await gate.can(alice, 'post.view', {}))
})

test('policy - an unknown method fails closed', async () => {
    const gate = gateWithPostPolicy()
    assertEquals(await gate.can(alice, 'post.destroy', {}), false)
})

test('policy - an unknown namespace fails closed', async () => {
    const gate = gateWithPostPolicy()
    assertEquals(await gate.can(alice, 'comment.update', {}), false)
})

test('policy - flat abilities still work alongside policies', async () => {
    const gate = gateWithPostPolicy()
    gate.define('access-admin', (user) => user.id === 1)
    assert(await gate.can(alice, 'access-admin'))
    assertEquals(await gate.can(bob, 'access-admin'), false)
})

test('policies - bulk registration', async () => {
    const gate = new Gate<User>()
    gate.policies({
        post: {
            update: (u, p) => u.id === (p as { authorId: number }).authorId,
        },
        comment: { delete: () => false },
    })
    assert(await gate.can(alice, 'post.update', { authorId: 1 }))
    assertEquals(await gate.can(alice, 'comment.delete', {}), false)
})
