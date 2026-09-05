/**
 * @fileoverview The credential-folding discipline of the connection-memo key.
 *
 * Two properties are load-bearing (#248): the folded credential is a keyed HMAC
 * under a per-process random key — never a bare SHA-256 an attacker could
 * brute-force offline from a leaked log line — and it still distinguishes two
 * different-credential configs within one process so they never collapse onto
 * one authenticated socket. The hand-rolled synchronous HMAC is cross-checked
 * against WebCrypto's async HMAC so the construction itself is verified.
 *
 * @module @lockness/redis/tests/memo
 */

import { assert, assertEquals, assertNotEquals } from '@std/assert'
import { crypto as stdCrypto } from '@std/crypto'
import { credentialFingerprint, redisMemoKey, sha256Hex } from '../mod.ts'
import { hmacSha256Hex } from '../memo.ts'

/** The plain lowercase-hex SHA-256 of a UTF-8 string, for comparison. */
function plainSha256Hex(input: string): string {
    return Array.from(
        new Uint8Array(
            stdCrypto.subtle.digestSync(
                'SHA-256',
                new TextEncoder().encode(input),
            ),
        ),
        (b) => b.toString(16).padStart(2, '0'),
    ).join('')
}

Deno.test('memo - credentialFingerprint is NOT a bare SHA-256 of the secret', () => {
    const secret = 's3cret'
    // A leaked fingerprint must not be reversible by hashing candidate
    // passwords: it is keyed, so it cannot equal the unsalted digest.
    assertNotEquals(
        credentialFingerprint(secret),
        plainSha256Hex(secret),
        'the folded credential must not be a plain SHA-256 (offline-brute-forceable)',
    )
})

Deno.test('memo - credentialFingerprint is a stable 64-hex within the process', () => {
    const a = credentialFingerprint('alpha')
    const b = credentialFingerprint('alpha')
    assertEquals(
        a,
        b,
        'same secret, same process → same fingerprint (memo-stable)',
    )
    assert(/^[0-9a-f]{64}$/.test(a), 'fingerprint is 64 lowercase hex chars')
})

Deno.test('memo - different secrets fold to different fingerprints', () => {
    assertNotEquals(
        credentialFingerprint('alpha'),
        credentialFingerprint('bravo'),
        'distinct credentials must never collapse onto one authenticated socket',
    )
})

Deno.test('memo - redisMemoKey folds the password through the keyed HMAC, never cleartext or bare SHA-256', () => {
    const key = redisMemoKey({
        hostname: 'h',
        port: 6379,
        db: 0,
        password: 's3cret',
    })
    assertEquals(
        key.includes('s3cret'),
        false,
        'the cleartext password never enters the key',
    )
    assertEquals(
        key.includes(plainSha256Hex('s3cret')),
        false,
        'the key does not carry a bare SHA-256 of the password',
    )
    assertEquals(
        key,
        `redis:h:6379:0:plain:${credentialFingerprint('s3cret')}`,
        'the key folds the password through the keyed credential fingerprint',
    )
})

Deno.test('memo - hmacSha256Hex matches WebCrypto HMAC-SHA256 (construction is correct)', async () => {
    const key = new TextEncoder().encode('per-process-key-material')
    const message = new TextEncoder().encode('a redis password')
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )
    const expected = Array.from(
        new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, message)),
        (b) => b.toString(16).padStart(2, '0'),
    ).join('')
    assertEquals(
        hmacSha256Hex(key, message),
        expected,
        'the synchronous HMAC matches the WebCrypto reference',
    )
})

Deno.test('memo - hmacSha256Hex matches WebCrypto for a key longer than the block size', async () => {
    const key = new TextEncoder().encode('x'.repeat(100))
    const message = new TextEncoder().encode('payload')
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )
    const expected = Array.from(
        new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, message)),
        (b) => b.toString(16).padStart(2, '0'),
    ).join('')
    assertEquals(
        hmacSha256Hex(key, message),
        expected,
        'a > 64-byte key is hashed down first, matching the WebCrypto reference',
    )
})

Deno.test('memo - sha256Hex remains the plain unkeyed digest', () => {
    assertEquals(
        sha256Hex('s3cret'),
        plainSha256Hex('s3cret'),
        'sha256Hex is still an unkeyed SHA-256 (not for folding credentials)',
    )
})
