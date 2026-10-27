/**
 * @fileoverview recycleRememberToken preserves the first-issuance origin
 * (#146), through storage (#457).
 *
 * The absolute-lifetime cap in `@lockness/auth` is only as good as the
 * provider's promise to carry `firstIssuedAt` forward on renewal. Before #457
 * the providers only copied it onto the *returned* token: nothing stored it,
 * so the next verification had no origin and the guard re-anchored the cap at
 * the last recycle. These tests assert the origin a **later verification
 * reads back**, not the return value.
 *
 * Since #457 `firstIssuedAt` is NOT NULL, so recycle refuses a token without
 * one, before any write. The guard stays the single place that falls back to
 * `createdAt`, and it always resolves the origin before calling recycle.
 *
 * @module @lockness/auth-provider/tests/remember_preservation
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { FakeTime } from '@std/testing/time'
import { setup } from './memory_remember_token_store.ts'

const HOUR_S = 3600
const T0 = new Date('2026-01-01T00:00:00Z')

Deno.test('recycle persists firstIssuedAt: the renewed token verifies with the original origin (#146)', async () => {
    using time = new FakeTime(T0)
    const { provider, store, alice } = setup()
    const first = await provider.createRememberToken(alice, HOUR_S)

    time.tick(600_000)
    const verified = await provider.verifyRememberToken(first.value)
    assert(verified)
    const renewed = await provider.recycleRememberToken(
        alice,
        verified.token,
        HOUR_S,
    )
    assertEquals(renewed.firstIssuedAt?.getTime(), T0.getTime())
    assertEquals(renewed.createdAt.getTime(), T0.getTime() + 600_000)

    time.tick(600_000)
    const again = await provider.verifyRememberToken(renewed.value)
    assert(again, 'the renewed token verifies')
    assertEquals(
        again.token.firstIssuedAt?.getTime(),
        T0.getTime(),
        'the origin was read back from storage, not re-minted',
    )
    assertEquals(
        store.rows.get(Number(renewed.identifier))?.firstIssuedAt?.getTime(),
        T0.getTime(),
    )
    assertEquals(
        await provider.verifyRememberToken(first.value),
        null,
        'the old token was rotated out',
    )
})

Deno.test('recycle refuses a token without a valid firstIssuedAt, before any write (#146, #457)', async () => {
    for (const firstIssuedAt of [undefined, new Date(Number.NaN)]) {
        const { provider, store, alice } = setup()
        const created = await provider.createRememberToken(alice, HOUR_S)
        const verified = await provider.verifyRememberToken(created.value)
        assert(verified)
        const writesBefore = store.writes.length

        await assertRejects(
            () =>
                provider.recycleRememberToken(
                    alice,
                    { ...verified.token, firstIssuedAt },
                    HOUR_S,
                ),
            TypeError,
            'firstIssuedAt',
        )
        assertEquals(store.writes.length, writesBefore, 'nothing was written')
        assert(
            await provider.verifyRememberToken(created.value),
            'the old token still verifies',
        )
    }
})

Deno.test('recycle refuses an invalid expiresIn, before any write (#457)', async () => {
    const { provider, store, alice } = setup()
    const created = await provider.createRememberToken(alice, HOUR_S)
    const verified = await provider.verifyRememberToken(created.value)
    assert(verified)
    const writesBefore = store.writes.length

    for (const bad of [0, -1, Number.NaN, Infinity, 1e20]) {
        await assertRejects(
            () => provider.recycleRememberToken(alice, verified.token, bad),
            RangeError,
            'seconds',
        )
    }
    assertEquals(store.writes.length, writesBefore, 'nothing was written')
    assert(
        await provider.verifyRememberToken(created.value),
        'the old token still verifies',
    )
})
