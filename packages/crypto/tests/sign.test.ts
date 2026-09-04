/**
 * @fileoverview Tests for `sign`/`verify` — round-trip + tamper/wrong-key fail.
 *
 * @module @lockness/crypto/tests/sign
 */

import { assertEquals } from '@std/assert'
import { sign, verify } from '../mod.ts'
import { generateAppKey } from '@lockness/contract'

const KEY = generateAppKey()

Deno.test('sign/verify round-trip', async () => {
    const msg = '/verify?id=1&expires=1780000000'
    const sig = await sign(msg, KEY)
    assertEquals(await verify(msg, sig, KEY), true)
})

Deno.test('a tampered message fails verification', async () => {
    const sig = await sign('/verify?id=1', KEY)
    assertEquals(await verify('/verify?id=2', sig, KEY), false)
})

Deno.test('a wrong key fails verification', async () => {
    const sig = await sign('msg', KEY)
    assertEquals(await verify('msg', sig, generateAppKey()), false)
})

Deno.test('a malformed signature returns false, never throws', async () => {
    assertEquals(await verify('msg', 'not!!base64url', KEY), false)
})
