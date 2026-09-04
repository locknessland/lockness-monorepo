/**
 * Tests for {@link Container.registrations} — read-only registration
 * introspection (#128).
 *
 * Three properties are asserted, mapping to the plan's user stories:
 *   US1 — one descriptor per registration, with a display id and the raw token.
 *   US2 — enumeration never constructs and never mutates the container.
 *   US3 — the returned array and its descriptor objects are fresh and inert.
 */

import { assert, assertEquals, assertStrictEquals } from '@std/assert'
import { Container } from '../mod.ts'
import type { ContainerRegistration } from '../mod.ts'

// ============================================================================
// US1 — enumerate registrations for display
// ============================================================================

Deno.test('registrations - empty container returns an empty array', () => {
    const container = new Container()
    assertEquals(container.registrations(), [])
})

Deno.test('registrations - one descriptor per token, across all token kinds', () => {
    const container = new Container()

    class UserService {}
    const LOGGER = Symbol('ILogger')
    const CONFIG = 'config'

    container.get(UserService) // class token → resolved instance
    container.set(LOGGER, { level: 'info' })
    container.set(CONFIG, { debug: true })

    const regs = container.registrations()
    assertEquals(regs.length, 3)

    const byId = new Map(regs.map((r) => [r.id, r]))
    // id is display-ready for every token kind, no cast needed.
    assertEquals(byId.get('UserService')?.resolved, true)
    assertEquals(byId.get('ILogger')?.resolved, true)
    assertEquals(byId.get('config')?.resolved, true)

    // The raw token re-resolves the exact same instance via get().
    const userReg = byId.get('UserService') as ContainerRegistration
    assertStrictEquals(
        container.get(userReg.token as typeof UserService),
        container.get(UserService),
    )
})

Deno.test('registrations - a symbol token with no description falls back to "Symbol()"', () => {
    const container = new Container()
    const TOKEN = Symbol()
    container.set(TOKEN, {})
    const regs = container.registrations()
    assertEquals(regs.length, 1)
    // describeToken falls back to the literal "Symbol()" — a stable display id,
    // never a throw or an empty string.
    assertEquals(regs[0].id, 'Symbol()')
})

Deno.test('registrations - id is display-only, not promised unique (class Foo + Symbol("Foo"))', () => {
    const container = new Container()
    class Foo {}
    const FOO = Symbol('Foo')
    container.get(Foo)
    container.set(FOO, {})

    const regs = container.registrations()
    // Both collide on the display id 'Foo' …
    assertEquals(regs.filter((r) => r.id === 'Foo').length, 2)
    // … but the raw tokens are distinct, so a caller re-resolves each correctly.
    const tokens = new Set(
        regs.filter((r) => r.id === 'Foo').map((r) => r.token),
    )
    assertEquals(tokens.size, 2)
    assert(tokens.has(Foo))
    assert(tokens.has(FOO))
})

Deno.test('registrations - a token set to undefined is still a registration', () => {
    const container = new Container()
    const TOKEN = 'maybe'
    container.set(TOKEN, undefined)
    const regs = container.registrations()
    assertEquals(regs.length, 1)
    assertEquals(regs[0].id, 'maybe')
    assertEquals(regs[0].resolved, true)
})

// ============================================================================
// US2 — reading must not instantiate, and must not mutate
// ============================================================================

Deno.test('registrations - enumerating a registered token never re-constructs it (SC-002/FR-005)', () => {
    const container = new Container()
    let constructed = 0
    let neverBuilt = 0

    class Expensive {
        constructor() {
            constructed++
        }
    }
    class NeverRegistered {
        constructor() {
            neverBuilt++
        }
    }

    // Register exactly one instance up front.
    container.get(Expensive)
    assertEquals(constructed, 1)

    // Enumerate repeatedly. If registrations() ever routed through get() or did
    // `new token()` per entry, the counter would climb — this is the regression
    // an empty-registry test could not catch.
    for (let i = 0; i < 5; i++) {
        const regs = container.registrations()
        assert(regs.some((r) => r.id === 'Expensive' && r.resolved === true))
    }
    assertEquals(
        constructed,
        1,
        'enumeration must not re-construct a registered token',
    )

    // A never-registered class is absent and is never built by enumeration.
    assertEquals(container.has(NeverRegistered), false)
    assertEquals(
        container.registrations().some((r) => r.id === 'NeverRegistered'),
        false,
    )
    assertEquals(
        neverBuilt,
        0,
        'enumeration must not construct an unregistered token',
    )
})

Deno.test('registrations - reading does not mutate the container', () => {
    const container = new Container()
    class A {}
    container.get(A)

    const sizeBefore = container.size
    const first = container.registrations()
    assertEquals(container.size, sizeBefore)

    const second = container.registrations()
    assertEquals(first, second) // equal data across calls
})

// ============================================================================
// US3 — the returned data is inert
// ============================================================================

Deno.test('registrations - mutating the result does not reach the container (SC-003)', () => {
    const container = new Container()
    class A {}
    container.get(A)

    const regs = container.registrations()
    // Mutate the array and a descriptor's own fields.
    regs.push({ id: 'BOGUS', token: 'bogus', resolved: false })
    regs[0].id = 'TAMPERED'
    regs[0].resolved = false

    // A fresh read is unaffected: fresh array + fresh objects per call.
    const fresh = container.registrations()
    assertEquals(fresh.length, 1)
    assertEquals(fresh[0].id, 'A')
    assertEquals(fresh[0].resolved, true)
    assert(!fresh.some((r) => r.id === 'BOGUS'))
})

Deno.test('registrations - each call returns a distinct array instance', () => {
    const container = new Container()
    class A {}
    container.get(A)
    assert(container.registrations() !== container.registrations())
})
