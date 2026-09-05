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
import { Hash } from '@lockness/crypto'
import {
    getPasswordHashingConfig,
    hashPassword,
    resetPasswordHashingConfig,
    verifyPassword,
} from '../password.ts'

/**
 * A self-describing hash for `planted-modern`, produced by the PBKDF2
 * construction `password.ts` shipped BEFORE the #264 convergence (default
 * SHA-256 @ 600000, fixed salt of `0x07` bytes). Its format is byte-identical
 * to `@lockness/crypto`'s `Hash`, so routing verification through the facade
 * must keep it verifiable — the cross-version backward-compat lock.
 */
const PLANTED_MODERN =
    'pbkdf2$SHA-256$600000$BwcHBwcHBwcHBwcHBwcHBw==$0/PFCV+dS+nMo3CjTY5LL0LctrYG38+iSvU8r6/IUD4='

/**
 * A legacy parameter-less hash for `planted-legacy` — `base64(salt(16) +
 * hash(32))` at the historical 100000 iterations, the shape stored before the
 * self-describing format existed. The facade cannot read it, so the auth-local
 * compat path must.
 */
const PLANTED_LEGACY =
    'CQkJCQkJCQkJCQkJCQkJCdL4lKjGd3BfpRgsmjrt3jNWTbb2dZ/sAWR8PMZWoyoC'

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

Deno.test('a hash stored by pre-#264 auth still verifies after crypto convergence (#264)', async () => {
    resetPasswordHashingConfig()
    assert(
        await verifyPassword('planted-modern', PLANTED_MODERN),
        'a self-describing hash from the old code must survive the crypto convergence',
    )
    assert(!(await verifyPassword('wrong', PLANTED_MODERN)))
})

Deno.test('a planted legacy parameter-less hash still verifies after crypto convergence (#264)', async () => {
    resetPasswordHashingConfig()
    assert(
        await verifyPassword('planted-legacy', PLANTED_LEGACY),
        'the auth-local compat path must still read the parameter-less format',
    )
    assert(!(await verifyPassword('wrong', PLANTED_LEGACY)))
})

Deno.test('hashPassword output is verifiable by the @lockness/crypto Hash facade (#264)', async () => {
    resetPasswordHashingConfig()
    const h = await hashPassword('shared-format')
    assert(
        await Hash.check('shared-format', h),
        'auth and crypto must share one hash format — this is the convergence lock',
    )
    assert(!(await Hash.check('nope', h)))
})

Deno.test('a @lockness/crypto Hash.make hash verifies through verifyPassword (#264)', async () => {
    resetPasswordHashingConfig()
    const stored = await Hash.make('crypto-made')
    assert(
        await verifyPassword('crypto-made', stored),
        'verifyPassword must accept hashes produced by the crypto facade',
    )
    assert(!(await verifyPassword('nope', stored)))
})
