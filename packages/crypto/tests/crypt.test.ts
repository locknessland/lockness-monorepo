/**
 * @fileoverview Tests for `Crypt` — round-trip, tamper-fails-closed, and
 * fresh-salt-per-call (SC-001).
 *
 * @module @lockness/crypto/tests/crypt
 */

import { assert, assertEquals } from '@std/assert'
import { Crypt } from '../mod.ts'
import { decodeBase64, encodeBase64, generateAppKey } from '@lockness/contract'

// Wire layout: 'c1.' + base64( salt(16) ‖ iv(12) ‖ ciphertext‖tag ).
const WIRE_PREFIX = 'c1.'
const CIPHERTEXT_OFFSET = 16 + 12 // past the salt and IV, into ciphertext/tag

const KEY = generateAppKey()

Deno.test('SC-001: decrypt(encrypt(x)) === x', async () => {
    const plain = 'the quick brown fox — üñîçødé 🦊'
    const token = await Crypt.encrypt(plain, KEY)
    assertEquals(await Crypt.decrypt(token, KEY), plain)
})

Deno.test('SC-001: a flipped ciphertext/tag byte fails the GCM tag — no plaintext', async () => {
    const token = await Crypt.encrypt('secret', KEY)
    const combined = decodeBase64(token.slice(WIRE_PREFIX.length))
    // Deterministically mutate a byte INSIDE the ciphertext/tag region (past the
    // salt+IV), so the GCM authentication path is the one exercised.
    combined[CIPHERTEXT_OFFSET] = (combined[CIPHERTEXT_OFFSET] + 1) & 0xff
    const tampered = WIRE_PREFIX + encodeBase64(combined)
    assertEquals(await Crypt.decrypt(tampered, KEY), null)
})

Deno.test('SC-001: two encryptions of the same input differ (fresh salt+IV)', async () => {
    const a = await Crypt.encrypt('same', KEY)
    const b = await Crypt.encrypt('same', KEY)
    assert(a !== b, 'ciphertexts must differ')
    assertEquals(await Crypt.decrypt(a, KEY), 'same')
    assertEquals(await Crypt.decrypt(b, KEY), 'same')
})

Deno.test('decrypt returns null for a wrong key, bad version, and malformed wire', async () => {
    const token = await Crypt.encrypt('secret', KEY)
    assertEquals(await Crypt.decrypt(token, generateAppKey()), null) // wrong key
    assertEquals(await Crypt.decrypt('v9.' + token.slice(3), KEY), null) // bad version
    assertEquals(await Crypt.decrypt('c1.!!!not-base64', KEY), null) // malformed
    assertEquals(await Crypt.decrypt('c1.', KEY), null) // too short
})
