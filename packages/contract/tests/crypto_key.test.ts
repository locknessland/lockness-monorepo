/**
 * @fileoverview Tests for the single-home APP_KEY validator (security S3): valid
 * shape accepted; missing / placeholder / degenerate / malformed rejected.
 *
 * @module @lockness/contract/tests/crypto_key
 */

import { assert, assertEquals, assertThrows } from '@std/assert'
import {
    generateAppKey,
    KEY_PREFIX,
    KeyMaterialError,
    REJECTED_KEYS,
    resolveKeyMaterial,
} from '../crypto_key.ts'

Deno.test('a generated key resolves to 32 bytes', () => {
    const bytes = resolveKeyMaterial(generateAppKey())
    assertEquals(bytes.byteLength, 32)
})

Deno.test('missing key is rejected', () => {
    assertThrows(
        () => resolveKeyMaterial(undefined),
        KeyMaterialError,
    )
})

Deno.test('every shipped placeholder is rejected (security S3)', () => {
    for (const placeholder of REJECTED_KEYS) {
        const err = assertThrows(
            () => resolveKeyMaterial(placeholder),
            KeyMaterialError,
        ) as KeyMaterialError
        assertEquals(err.reason, 'known-placeholder')
    }
})

Deno.test('a degenerate (single byte repeated) key is rejected', () => {
    const degenerate = KEY_PREFIX + btoa('\x00'.repeat(32))
    const err = assertThrows(
        () => resolveKeyMaterial(degenerate),
        KeyMaterialError,
    ) as KeyMaterialError
    assertEquals(err.reason, 'degenerate')
})

Deno.test('wrong prefix / length / base64 are each rejected with their reason', () => {
    const noPrefix = assertThrows(
        () => resolveKeyMaterial('AAAA'),
        KeyMaterialError,
    ) as KeyMaterialError
    assertEquals(noPrefix.reason, 'not-prefixed')

    const wrongLen = assertThrows(
        () => resolveKeyMaterial(KEY_PREFIX + btoa('short')),
        KeyMaterialError,
    ) as KeyMaterialError
    assertEquals(wrongLen.reason, 'wrong-length')

    // The error never carries the value.
    assert(!wrongLen.message.includes('short'))
})
