/**
 * @fileoverview The token lifecycle `TokenProviderBase` owns (#452).
 *
 * The base is a Template Method: it decides issue, expiry, ownership,
 * fail-closed and last-use, and delegates only five storage steps to a
 * binding. These tests drive it through an in-memory binding whose steps can
 * be made to fail or to misbehave, so every policy decision is asserted
 * without a database — the live api-kit suite covers the Drizzle binding.
 *
 * @module @lockness/auth-provider/tests/token_provider_base
 */

import {
    assert,
    assertEquals,
    assertFalse,
    assertNotEquals,
    assertRejects,
    assertThrows,
} from '@std/assert'
import { FakeTime } from '@std/testing/time'
import { stub } from '@std/testing/mock'
import { setup } from './memory_token_provider.ts'

const MINUTE = 60_000
const YEAR = 365 * 24 * 60 * MINUTE

/** SHA-256, lowercase hex — the format the base promises to store. */
async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(value),
    )
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

// -----------------------------------------------------------------------------
// Issue
// -----------------------------------------------------------------------------

Deno.test('createToken stores only the SHA-256 hash, never the plaintext', async () => {
    const { provider, alice } = setup()
    const token = await provider.createToken(alice, 'cli')

    assertEquals(token.value.length, 80, '40 random bytes, hex')
    assert(/^[0-9a-f]+$/.test(token.value), 'opaque hex, no id prefix')
    assertEquals(provider.rows.size, 1)
    const [row] = [...provider.rows.values()]
    assertEquals(row.hash, await sha256(token.value))
    assertEquals(token.hash, row.hash)
    for (const [field, stored] of Object.entries(row)) {
        assertNotEquals(stored, token.value, `${field} holds the plaintext`)
    }
    assertEquals(row.userId, 1)
    assertEquals(row.name, 'cli')
    assertEquals(row.lastUsedAt, null)
    assertEquals(token.identifier, row.id)
})

Deno.test('createToken writes an expiry — one year by default, expiresIn milliseconds otherwise', async () => {
    using _time = new FakeTime(new Date('2026-01-01T00:00:00Z'))
    const { provider, alice } = setup()

    const yearly = await provider.createToken(alice, 'default')
    assertEquals(
        yearly.expiresAt?.getTime(),
        Date.parse('2026-01-01T00:00:00Z') + YEAR,
    )
    assertEquals(yearly.createdAt.getTime(), Date.now())

    const hourly = await provider.createToken(alice, 'hour', 60 * MINUTE)
    assertEquals(hourly.expiresAt?.getTime(), Date.now() + 60 * MINUTE)
})

Deno.test('createToken refuses an expiresIn that is not a finite positive duration', async () => {
    const { provider, alice } = setup()
    for (const bad of [0, -1, Number.NaN, Infinity, 8.64e15 + 1]) {
        await assertRejects(
            () => provider.createToken(alice, 'bad', bad),
            RangeError,
        )
    }
    assertEquals(provider.rows.size, 0, 'nothing stored on refusal')
})

Deno.test('a tokenLength under 16 bytes is refused, a larger one honoured', async () => {
    assertThrows(() => setup({ tokenLength: 15 }), RangeError)
    assertThrows(() => setup({ tokenLength: 16.5 }), RangeError)
    const { provider, alice } = setup({ tokenLength: 16 })
    const token = await provider.createToken(alice, 'short')
    assertEquals(token.value.length, 32)
})

// -----------------------------------------------------------------------------
// Verify — allow
// -----------------------------------------------------------------------------

Deno.test('a minted token verifies, and the verified token carries no plaintext', async () => {
    const { provider, alice } = setup()
    const issued = await provider.createToken(alice, 'cli')

    const result = await provider.verifyToken(issued.value)
    assert(result, 'a freshly minted token must verify')
    assertEquals(result.user, alice)
    assertEquals(result.token.value, '')
    assertEquals(result.token.identifier, issued.identifier)
    assertEquals(result.token.userId, 1)
    assertEquals(result.token.name, 'cli')
})

// -----------------------------------------------------------------------------
// Verify — deny
// -----------------------------------------------------------------------------

Deno.test('an unknown, empty or non-string token does not verify', async () => {
    const { provider, alice } = setup()
    await provider.createToken(alice, 'cli')
    assertEquals(await provider.verifyToken('never-issued'), null)
    assertEquals(await provider.verifyToken(''), null)
    assertEquals(
        await provider.verifyToken(undefined as unknown as string),
        null,
    )
})

Deno.test('an expired token does not verify — including exactly at expiresAt', async () => {
    using time = new FakeTime(new Date('2026-01-01T00:00:00Z'))
    const { provider, alice } = setup()
    const issued = await provider.createToken(alice, 'cli', MINUTE)

    time.tick(MINUTE - 1)
    assert(await provider.verifyToken(issued.value), 'live 1 ms before')

    time.tick(1)
    assertEquals(await provider.verifyToken(issued.value), null, 'at expiry')

    time.tick(MINUTE)
    assertEquals(await provider.verifyToken(issued.value), null, 'after')
    assertEquals(provider.rows.size, 1, 'expired rows are not deleted')
})

Deno.test('a row with a null or Invalid Date expiry does not verify', async () => {
    const { provider, alice } = setup()
    const issued = await provider.createToken(alice, 'cli')

    provider.setExpiry(issued.identifier, null)
    assertEquals(await provider.verifyToken(issued.value), null)

    provider.setExpiry(issued.identifier, new Date('not a date'))
    assertEquals(await provider.verifyToken(issued.value), null)
})

Deno.test('deleteToken revokes, and only the owner can revoke', async () => {
    const { provider, alice, bob } = setup()
    const issued = await provider.createToken(alice, 'cli')

    // Bob names Alice's token id: no effect, no error.
    await provider.deleteToken(bob, issued.identifier)
    assert(await provider.verifyToken(issued.value), 'cross-user delete')

    // A missing id is an idempotent no-op.
    await provider.deleteToken(alice, 9_999)

    await provider.deleteToken(alice, issued.identifier)
    assertEquals(await provider.verifyToken(issued.value), null)
})

Deno.test("deleteAllTokens revokes every token of that user and leaves other users' tokens live", async () => {
    const { provider, alice, bob } = setup()
    const a1 = await provider.createToken(alice, 'one')
    const a2 = await provider.createToken(alice, 'two')
    const b1 = await provider.createToken(bob, 'bob')

    await provider.deleteAllTokens(alice)
    assertEquals(await provider.verifyToken(a1.value), null)
    assertEquals(await provider.verifyToken(a2.value), null)
    assert(await provider.verifyToken(b1.value), "bob's token stays live")
})

Deno.test('an orphan token (its user is gone) does not verify', async () => {
    const { provider, alice } = setup()
    const issued = await provider.createToken(alice, 'cli')
    provider.users.delete(1)
    assertEquals(await provider.verifyToken(issued.value), null)
})

Deno.test('a lookup that returns a row with another hash does not verify', async () => {
    const { provider, alice } = setup()
    const victim = await provider.createToken(alice, 'cli')
    provider.wrongRow = { ...[...provider.rows.values()][0] }

    // A wrong-row binding hands back Alice's live row for any value.
    assertEquals(await provider.verifyToken('attacker-guess'), null)
    // The right value still matches the row it was minted for.
    assert(await provider.verifyToken(victim.value))
})

Deno.test('a throwing lookup makes verifyToken reject, never allow', async () => {
    const { provider, alice } = setup()
    const issued = await provider.createToken(alice, 'cli')
    provider.failLookup = true
    await assertRejects(
        () => provider.verifyToken(issued.value),
        Error,
        'access_tokens unreachable',
    )
})

Deno.test('a throwing findById makes verifyToken reject, never allow', async () => {
    const { provider, alice } = setup()
    const issued = await provider.createToken(alice, 'cli')
    provider.failFindById = true
    await assertRejects(
        () => provider.verifyToken(issued.value),
        Error,
        'users table unreachable',
    )
})

// -----------------------------------------------------------------------------
// Last use
// -----------------------------------------------------------------------------

Deno.test('a failed last-use write still verifies, and warns once without the plaintext', async () => {
    const { provider, alice } = setup()
    const issued = await provider.createToken(alice, 'cli')
    provider.failTouch = true

    const warn = stub(console, 'warn')
    try {
        const result = await provider.verifyToken(issued.value)
        assert(result, 'a bookkeeping failure does not deny')
        assertEquals(warn.calls.length, 1)
        const logged = warn.calls[0].args.map(String).join(' ')
        assertFalse(logged.includes(issued.value), 'plaintext logged')
        assert(logged.includes(String(issued.identifier)), 'row id logged')
    } finally {
        warn.restore()
    }
})

Deno.test('lastUsedAt is written on first use, then at most once a minute', async () => {
    using time = new FakeTime(new Date('2026-01-01T00:00:00Z'))
    const { provider, alice } = setup()
    const issued = await provider.createToken(alice, 'cli')

    const first = await provider.verifyToken(issued.value)
    assertEquals(provider.touches.length, 1, 'null lastUsedAt is written')
    assertEquals(first?.token.lastUsedAt?.getTime(), Date.now())

    time.tick(30_000)
    await provider.verifyToken(issued.value)
    assertEquals(provider.touches.length, 1, 'not again within 60 s')

    time.tick(31_000)
    const later = await provider.verifyToken(issued.value)
    assertEquals(provider.touches.length, 2, 'written again after 61 s')
    assertEquals(later?.token.lastUsedAt?.getTime(), Date.now())
})
