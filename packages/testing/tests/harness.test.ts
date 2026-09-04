/**
 * @fileoverview Tests for the @lockness/testing harness (#185).
 *
 * @module @lockness/testing/tests/harness
 */

import { assert, assertEquals } from '@std/assert'
import { Hono } from 'hono'
import { actingAs, fakeUser } from '../acting_as.ts'
import { testClient } from '../http_client.ts'
import { FakeTable } from '../db_assertions.ts'
import type { Authenticatable } from '@lockness/auth'

// ---- testClient -------------------------------------------------------------

Deno.test('testClient - GET returns the response', async () => {
    const app = new Hono()
    app.get('/ping', (c) => c.text('pong'))
    const res = await testClient(app).get('/ping')
    assertEquals(res.status, 200)
    assertEquals(await res.text(), 'pong')
})

Deno.test('testClient - POST with json sets content-type and body', async () => {
    const app = new Hono()
    app.post('/echo', async (c) => c.json(await c.req.json()))
    const res = await testClient(app).post('/echo', { json: { a: 1 } })
    assertEquals(res.status, 200)
    assertEquals(await res.json(), { a: 1 })
})

Deno.test('testClient - custom headers are forwarded', async () => {
    const app = new Hono()
    app.get('/h', (c) => c.text(c.req.header('x-token') ?? 'none'))
    const res = await testClient(app).get('/h', { headers: { 'x-token': 't' } })
    assertEquals(await res.text(), 't')
})

// ---- actingAs / fakeUser ----------------------------------------------------

Deno.test('actingAs - authenticates the request as the given user', async () => {
    const app = new Hono<{ Variables: { auth: { user?: Authenticatable } } }>()
    app.use('*', actingAs(fakeUser({ id: 42, email: 'a@b.test' })))
    app.get('/me', (c) => c.json({ id: c.get('auth').user?.id }))
    const res = await testClient(app).get('/me')
    assertEquals(await res.json(), { id: 42 })
})

Deno.test('fakeUser - defaults plus overrides, synthetic only', () => {
    const u = fakeUser({ id: 7, isAdmin: true })
    assertEquals(u.id, 7)
    assertEquals(u.email, 'user@example.test')
    assertEquals(u.isAdmin, true)
})

// ---- FakeTable --------------------------------------------------------------

Deno.test('FakeTable - assertHasRow / assertMissingRow / count', () => {
    const t = new FakeTable<{ id: number; email: string }>()
    t.insert({ id: 1, email: 'a@b.test' }).insert({ id: 2, email: 'c@d.test' })
    t.assertHasRow({ email: 'a@b.test' })
    t.assertMissingRow({ id: 99 })
    t.assertRowCount(2)
    assert(t.rows.length === 2)
})

Deno.test('FakeTable - assertHasRow throws when absent', () => {
    const t = new FakeTable()
    let threw = false
    try {
        t.assertHasRow({ id: 1 })
    } catch {
        threw = true
    }
    assert(threw)
})

Deno.test('FakeTable - assertMissingRow throws when the row is present', () => {
    const t = new FakeTable<{ id: number }>()
    t.insert({ id: 1 })
    let threw = false
    try {
        t.assertMissingRow({ id: 1 })
    } catch {
        threw = true
    }
    assert(threw, 'a present row must fail assertMissingRow')
})

Deno.test('FakeTable - assertRowCount throws on the wrong count', () => {
    const t = new FakeTable<{ id: number }>()
    t.insert({ id: 1 })
    let threw = false
    try {
        t.assertRowCount(5)
    } catch {
        threw = true
    }
    assert(threw, 'a wrong count must fail assertRowCount')
})

Deno.test('actingAs - the last middleware wins, overwriting the identity', async () => {
    const app = new Hono<{ Variables: { auth: { user?: Authenticatable } } }>()
    app.use('*', actingAs(fakeUser({ id: 1 })))
    app.use('*', actingAs(fakeUser({ id: 2 })))
    app.get('/me', (c) => c.json({ id: c.get('auth').user?.id }))
    const res = await testClient(app).get('/me')
    assertEquals(await res.json(), { id: 2 })
})
