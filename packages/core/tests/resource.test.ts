/**
 * @fileoverview Tests for the API Resource layer — opt-in projection, the
 * fails-closed base, the never-serialise denylist, and paginated collections.
 *
 * @module @lockness/core/tests/resource
 */

import { assertEquals } from '@std/assert'
import { NEVER_SERIALISE, Resource, ResourceCollection } from '../mod.ts'
import { paginateOffset } from '@lockness/contract'

interface User {
    id: number
    name: string
    passwordHash: string
    token: string
}

class UserResource extends Resource<User> {
    override toArray(): Record<string, unknown> {
        return { id: this.model.id, name: this.model.name }
    }
}

// A resource that names nothing exposes nothing — opt-in, fails closed.
class EmptyResource extends Resource<User> {
    override toArray(): Record<string, unknown> {
        return {}
    }
}

// A resource that MISTAKENLY names a secret — the denylist must still strip it.
class LeakyResource extends Resource<User> {
    override toArray(): Record<string, unknown> {
        return { id: this.model.id, passwordHash: this.model.passwordHash }
    }
}

const user: User = {
    id: 1,
    name: 'Ada',
    passwordHash: 'HASH',
    token: 'SECRET',
}

Deno.test('Resource exposes only named fields — model internals stay off the wire', () => {
    assertEquals(new UserResource(user).toJSON(), { id: 1, name: 'Ada' })
})

Deno.test('a no-field resource emits {} (opt-in fails closed)', () => {
    assertEquals(new EmptyResource(user).toJSON(), {})
})

Deno.test('the never-serialise denylist strips a mistakenly-named secret', () => {
    // toArray() named passwordHash, but toJSON() (the wire path) drops it.
    assertEquals(new LeakyResource(user).toJSON(), { id: 1 })
    // The denylist is the documented set.
    assertEquals(NEVER_SERIALISE.includes('passwordHash'), true)
    assertEquals(NEVER_SERIALISE.includes('token'), true)
})

Deno.test('ResourceCollection without pagination serialises to { data }', () => {
    const coll = new ResourceCollection([
        new UserResource(user),
        new UserResource({ ...user, id: 2, name: 'Grace' }),
    ])
    assertEquals(coll.toJSON(), {
        data: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }],
    })
})

Deno.test('ResourceCollection.paginated carries meta + links from the envelope', () => {
    const env = paginateOffset<User>([user], {
        total: 25,
        page: 1,
        perPage: 10,
        baseUrl: '/users',
    })
    const coll = ResourceCollection.paginated(env, (u) => new UserResource(u))
    const body = coll.toJSON()

    assertEquals(body.data, [{ id: 1, name: 'Ada' }])
    assertEquals(body.meta, env.meta)
    assertEquals(body.links, env.links)
})
