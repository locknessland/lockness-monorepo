/**
 * Password hashing strength + self-describing hash format (M2, #168).
 *
 * The default PBKDF2 iteration count must meet current OWASP guidance, and the
 * stored hash must carry its own parameters so the count can be raised without
 * breaking previously-stored hashes. Legacy (parameter-less base64) hashes must
 * still verify.
 *
 * @module @lockness/auth/tests/password
 */

import { assert, assertEquals } from '@std/assert'
import {
    getPasswordHashingConfig,
    hashPassword,
    resetPasswordHashingConfig,
    verifyPassword,
} from '../password.ts'

/** Reproduce the OLD parameter-less format: base64(salt(16) + hash(32)) @ 100k. */
async function legacyHash(password: string): Promise<string> {
    const enc = new TextEncoder()
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const km = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits'],
    )
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        km,
        32 * 8,
    )
    const combined = new Uint8Array(16 + 32)
    combined.set(salt)
    combined.set(new Uint8Array(bits), 16)
    return btoa(String.fromCharCode(...combined))
}

Deno.test('default PBKDF2 iterations meet current OWASP guidance (#168)', () => {
    resetPasswordHashingConfig()
    assertEquals(getPasswordHashingConfig().iterations, 600000)
})

Deno.test('hashPassword emits a self-describing hash carrying its parameters (#168)', async () => {
    resetPasswordHashingConfig()
    const h = await hashPassword('correct horse battery staple')
    assert(h.includes('$'), 'new format must be parameterised, not bare base64')
    const parts = h.split('$')
    assertEquals(parts[0], 'pbkdf2')
    assertEquals(
        parts[2],
        '600000',
        'the iteration count travels with the hash',
    )
})

Deno.test('hashPassword/verifyPassword round-trip and reject wrong passwords (#168)', async () => {
    resetPasswordHashingConfig()
    const h = await hashPassword('s3cret')
    assert(await verifyPassword('s3cret', h))
    assert(!(await verifyPassword('wrong', h)))
})

Deno.test('a hash verifies from its embedded params without matching global config (#168)', async () => {
    // Hash at an explicit low count, then verify with default config: the count
    // must be read FROM the hash, not from the current global config.
    resetPasswordHashingConfig()
    const h = await hashPassword('pw', { iterations: 50000 })
    assertEquals(h.split('$')[2], '50000')
    resetPasswordHashingConfig()
    assert(
        await verifyPassword('pw', h),
        'verification must use the params embedded in the hash',
    )
})

Deno.test('a legacy parameter-less 100k hash still verifies (#168)', async () => {
    resetPasswordHashingConfig()
    const legacy = await legacyHash('legacy-pw')
    assert(
        await verifyPassword('legacy-pw', legacy),
        'raising the default must not strand hashes stored in the old format',
    )
    assert(!(await verifyPassword('nope', legacy)))
})
