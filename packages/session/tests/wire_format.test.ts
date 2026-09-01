/**
 * The sealed cookie format — `v1.<base64(salt ‖ iv ‖ ciphertext)>`.
 *
 * The controls, in the order they run, and which one actually does the work:
 *
 * - The `v1.` prefix is **format discrimination**, not security. It is public,
 *   an attacker prepends it for free, and a conforming forgery then dies on the
 *   GCM tag. Its real value is that it lets a wrong format be rejected before
 *   `atob` is ever called.
 * - **FR-001 is the control**: there is no path that encodes without a key. If
 *   that were ever softened back to a compatibility read, the prefix would
 *   protect nothing.
 * - The salt is fresh per cookie, so each derived key encrypts exactly one
 *   message. That is why the ~2³² random-96-bit-IV ceiling does not apply —
 *   and why caching the derived key would silently reinstate it.
 */

import {
    assertEquals,
    assertNotEquals,
    assertRejects,
    assertThrows,
} from '@std/assert'
import type { SessionConfig } from '../types.ts'
import {
    assertUsableSecret,
    decodeBase64,
    encodeBase64,
    generateAppKey,
    SessionSecretError,
} from '../secret.ts'
import {
    CookieSessionDriver,
    lastRejection,
    open,
    seal,
    WIRE_VERSION,
} from '../drivers/cookie.ts'

const BASE_CONFIG: SessionConfig = {
    driver: 'cookie',
    cookieName: 'lockness_session',
    lifetime: 7200,
    path: '/',
    secure: false,
    httpOnly: true,
    sameSite: 'Lax',
}

const KEY = generateAppKey()
const OTHER = generateAppKey()

/** The exact value from #137's report: base64 of `{"auth_web":1}`. */
const FORGERY = 'JTdCJTIyYXV0aF93ZWIlMjIlM0ExJTdE'

Deno.test('wire - a sealed payload round-trips', async () => {
    const sealed = await seal(KEY, { auth_web: 1 }, 3600)

    assertEquals(await open(KEY, sealed), { auth_web: 1 })
})

Deno.test('wire - the #137 forgery is rejected', async () => {
    assertEquals(await open(KEY, FORGERY), null)
})

Deno.test('wire - the #137 forgery with the version prefix prepended is rejected', async () => {
    // The prefix is public. Prepending it is free, and it must buy nothing.
    assertEquals(await open(KEY, WIRE_VERSION + FORGERY), null)
})

Deno.test('wire - a cookie sealed under another key is rejected', async () => {
    const sealed = await seal(OTHER, { auth_web: 1 }, 3600)

    assertEquals(await open(KEY, sealed), null)
})

Deno.test('wire - a bit-flipped ciphertext is rejected', async () => {
    const sealed = await seal(KEY, { auth_web: 1 }, 3600)
    const tail = sealed.slice(-4)
    const flipped = sealed.slice(0, -4) + (tail === 'AAAA' ? 'BBBB' : 'AAAA')

    assertEquals(await open(KEY, flipped), null)
})

Deno.test('wire - a truncated payload is rejected before any crypto call', async () => {
    // Structural, by decision. Relying on OperationError means the rejection is
    // an accident of the crypto API, and narrowing the catch later turns it into
    // a 500 instead of an empty session.
    //
    // The rejection CLASS is asserted, not just the null. `=== null` alone is
    // also satisfied by a tag mismatch, so it stays green with the structural
    // check deleted — which is the defect this test exists to prevent.
    const sealed = await seal(KEY, { auth_web: 1 }, 3600)
    const short = sealed.slice(0, WIRE_VERSION.length + 8)

    assertEquals(await open(KEY, short), null)
    assertEquals(lastRejection(), 'too-short')
})

Deno.test('wire - an over-long cookie is rejected on length', async () => {
    assertEquals(await open(KEY, WIRE_VERSION + 'A'.repeat(5000)), null)
    assertEquals(lastRejection(), 'too-long')
})

Deno.test('wire - a value with no version prefix is rejected', async () => {
    assertEquals(await open(KEY, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), null)
    assertEquals(lastRejection(), 'bad-prefix')
})

Deno.test('wire - an expired payload is rejected', async () => {
    // maxAge is a browser hint an attacker ignores, and the cookie driver keeps
    // no server-side record — so without exp inside the ciphertext a captured
    // cookie authenticates for ever, across the victim's logout.
    const sealed = await seal(KEY, { auth_web: 1 }, -1)

    assertEquals(await open(KEY, sealed), null)
    assertEquals(lastRejection(), 'expired')
})

Deno.test('wire - two seals of the same data differ', async () => {
    const a = await seal(KEY, { auth_web: 1 }, 3600)
    const b = await seal(KEY, { auth_web: 1 }, 3600)

    assertNotEquals(a, b)
})

Deno.test('wire - no two seals share a salt', async () => {
    // Invariant 2, worded as it should be: overwhelming probability from 16
    // random bytes, not a guarantee. Asserted over a sample.
    const salts = new Set<string>()
    for (let i = 0; i < 32; i++) {
        const sealed = await seal(KEY, { i }, 3600)
        salts.add(atob(sealed.slice(WIRE_VERSION.length)).slice(0, 16))
    }

    assertEquals(salts.size, 32)
})

Deno.test('wire - the derived key is never cached', async () => {
    // Invariant 5. The first optimisation anyone proposes on seeing HKDF called
    // per request is "cache the derived key" — which, with a per-cookie salt,
    // reinstates the nonce-collision bound the design exists to avoid.
    const source = await Deno.readTextFile(
        new URL('../drivers/cookie.ts', import.meta.url),
    )

    // Matched on the SHAPE of module-level mutable state, not on four names a
    // future author has no reason to pick. `const keys = new Map()` passed the
    // name list, and a Map is the most likely way somebody would cache this.
    assertEquals(
        /^(?:let|const)\s+\w*(?:[Kk]ey|[Cc]ache)\w*\s*(?::|=)/m.test(source),
        false,
        'cookie.ts declares module-level key/cache state',
    )
    assertEquals(
        /new (?:Weak)?Map<[^>]*CryptoKey/.test(source),
        false,
        'cookie.ts maps something to a CryptoKey',
    )
})

Deno.test('wire - the derivation is HKDF, and no iteration count survives', async () => {
    // SC-005, asserted on the algorithm rather than the clock. A wall-clock
    // threshold is the classic three-cycles-later `ignore: true`.
    //
    // Matched against *code*, not prose: the module comment explains why PBKDF2
    // was replaced, and a bare substring search for the word flags that
    // explanation as the defect it documents.
    const source = await Deno.readTextFile(
        new URL('../drivers/cookie.ts', import.meta.url),
    )

    assertEquals(/name:\s*'HKDF'/.test(source), true, 'HKDF is the derivation')
    assertEquals(/name:\s*'PBKDF2'/.test(source), false, 'PBKDF2 is gone')
    assertEquals(/^\s*iterations:/m.test(source), false, 'no iteration count')
})

Deno.test('wire - sealing a large payload does not blow the stack', async () => {
    // String.fromCharCode(...bytes) throws RangeError between 125k and 200k
    // arguments — measured — and session payloads are application-influenced.
    // The encoder must survive it. Whether the result is a *usable* cookie is
    // the next test's question, and the answer is no.
    const sealed = await seal(KEY, { blob: 'x'.repeat(200_000) }, 3600)

    assertEquals(sealed.startsWith(WIRE_VERSION), true)
})

Deno.test('wire - an over-large sealed payload is refused on the way back in', async () => {
    // A browser caps a cookie near 4 KB, so a value this size was never issued
    // by us and is bounded before atob rather than decoded and mapped.
    const sealed = await seal(KEY, { blob: 'x'.repeat(200_000) }, 3600)

    assertEquals(await open(KEY, sealed), null)
})

Deno.test('wire - sealing without a secret throws, it does not fall back', async () => {
    // Found by negative-testing: reintroducing `if (!secret) return btoa(...)`
    // in seal() left every test above green, because they all pass a real key.
    // The base64 fallback WAS #137, and nothing exercised its absence.
    for (const absent of [undefined, '']) {
        await assertRejects(
            () => seal(absent, { auth_web: 1 }, 3600),
            SessionSecretError,
        )
        await assertRejects(
            () => open(absent, 'v1.whatever'),
            SessionSecretError,
        )
    }
})

Deno.test('wire - the cookie driver refuses to construct without a usable secret', () => {
    // The request path is the wrong place to discover a configuration error.
    // deno-lint-ignore no-explicit-any
    const context = {} as any

    assertThrows(
        () => new CookieSessionDriver(context, { ...BASE_CONFIG }),
        SessionSecretError,
    )
    assertThrows(
        () =>
            new CookieSessionDriver(context, {
                ...BASE_CONFIG,
                secret: 'change-me-in-production',
            }),
        SessionSecretError,
    )
})

Deno.test('wire - the version is bound to the tag, not merely prepended', async () => {
    // Found by negative-testing: removing `additionalData` from BOTH encrypt and
    // decrypt kept every test green, because a symmetric removal still
    // round-trips. The property that matters is the binding itself, and it is
    // asserted in both directions — a payload opens under its own version
    // marker and under no other. Without that positive half, an implementation
    // that binds nothing at all would still pass.
    //
    // There is no v2 yet. That is exactly why this is written now: the day one
    // exists, an unbound version byte makes a v2 -> v1 downgrade free.
    const sealed = await seal(KEY, { auth_web: 1 }, 3600)
    const raw = decodeBase64(sealed.slice(WIRE_VERSION.length))
    const salt = raw.subarray(0, 16)
    const iv = raw.subarray(16, 28)
    const ciphertext = raw.subarray(28)

    const keyFor = async () => {
        const material = await crypto.subtle.importKey(
            'raw',
            assertUsableSecret(KEY, 'config') as BufferSource,
            'HKDF',
            false,
            ['deriveKey'],
        )
        return await crypto.subtle.deriveKey(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: salt as BufferSource,
                info: new TextEncoder().encode('lockness/session/cookie/v1'),
            },
            material,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt'],
        )
    }

    const decryptWith = (aad: string) =>
        crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv as BufferSource,
                additionalData: new TextEncoder().encode(aad) as BufferSource,
            },
            key,
            ciphertext as BufferSource,
        )

    const key = await keyFor()

    // The positive half: it opens under its OWN marker. Fails if nothing is bound.
    const plaintext = new TextDecoder().decode(await decryptWith(WIRE_VERSION))
    assertEquals(JSON.parse(plaintext).d, { auth_web: 1 })

    // The negative half: it does not open under any other. Fails if the marker
    // is merely prepended.
    // Typed. An untyped assertRejects is also satisfied by a TypeError from the
    // test's own setup, which would make the negative half pass for a reason
    // that has nothing to do with the binding.
    await assertRejects(() => decryptWith('v2.'), DOMException)
})

Deno.test('wire - a tampered SALT is rejected', async () => {
    // The salt is an HKDF input, so perturbing it derives a different key and
    // the tag fails. Asserted rather than assumed: the existing tamper test
    // flips the ciphertext tail, which exercises a different byte range
    // entirely.
    const sealed = await seal(KEY, { auth_web: 1 }, 3600)
    const raw = decodeBase64(sealed.slice(WIRE_VERSION.length))
    raw[0] ^= 0xff

    assertEquals(await open(KEY, WIRE_VERSION + encodeBase64(raw)), null)
    assertEquals(lastRejection(), 'tag-mismatch')
})

Deno.test('wire - a tampered IV is rejected', async () => {
    const sealed = await seal(KEY, { auth_web: 1 }, 3600)
    const raw = decodeBase64(sealed.slice(WIRE_VERSION.length))
    raw[16] ^= 0xff

    assertEquals(await open(KEY, WIRE_VERSION + encodeBase64(raw)), null)
    assertEquals(lastRejection(), 'tag-mismatch')
})

Deno.test('wire - invalid base64 after the prefix is rejected on the base64 branch', async () => {
    // The `bad-base64` class had no test at all, so the branch could have been
    // deleted and every remaining assertion would still have passed.
    assertEquals(await open(KEY, WIRE_VERSION + '@@@not base64@@@'), null)
    assertEquals(lastRejection(), 'bad-base64')
})

Deno.test('wire - a well-formed v2 marker over a real v1 body is rejected', async () => {
    // Not the same test as prepending the marker to garbage. This is a genuine,
    // openable payload relabelled — the shape a downgrade actually takes — and
    // it must die on the tag because the version is additionalData.
    const sealed = await seal(KEY, { auth_web: 1 }, 3600)
    const relabelled = 'v2.' + sealed.slice(WIRE_VERSION.length)

    assertEquals(await open(KEY, relabelled), null)
    assertEquals(lastRejection(), 'bad-prefix')
})

Deno.test('wire - a payload whose data is not an object is rejected', async () => {
    // `exp` was guarded and `d` was not. The tag already proves we wrote it, so
    // this is asymmetry rather than a hole — but a future change to what gets
    // sealed would otherwise hand a string to SessionStore as if it were a
    // record.
    const forged = await sealRaw(
        KEY,
        JSON.stringify({
            d: 'not-an-object',
            iat: 0,
            exp: Math.floor(Date.now() / 1000) + 60,
        }),
    )

    assertEquals(await open(KEY, forged), null)
})

/**
 * Seal arbitrary plaintext under the real format.
 *
 * Needed because `seal()` always writes a well-formed payload, so the shape
 * guard inside `open()` is unreachable through the public path. This is the
 * attacker's position only if they hold the key — which is the point: the guard
 * is defence against a future change to what gets sealed, not against forgery.
 */
async function sealRaw(secret: string, plaintext: string): Promise<string> {
    const keyBytes = assertUsableSecret(secret, 'config')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const material = await crypto.subtle.importKey(
        'raw',
        keyBytes as BufferSource,
        'HKDF',
        false,
        ['deriveKey'],
    )
    const key = await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: salt as BufferSource,
            info: new TextEncoder().encode('lockness/session/cookie/v1'),
        },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt'],
    )
    const ct = new Uint8Array(
        await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv as BufferSource,
                additionalData: new TextEncoder().encode(
                    WIRE_VERSION,
                ) as BufferSource,
            },
            key,
            new TextEncoder().encode(plaintext) as BufferSource,
        ),
    )
    const out = new Uint8Array(28 + ct.byteLength)
    out.set(salt)
    out.set(iv, 16)
    out.set(ct, 28)
    return WIRE_VERSION + encodeBase64(out)
}
