/**
 * @fileoverview Cookie-based session driver — the sealed wire format.
 *
 * **The format**: `v1.` + base64(`salt ‖ iv ‖ ciphertext`), where the salt is 16
 * random bytes, the IV is 12, and the ciphertext carries an AES-256-GCM tag over
 * a plaintext of `{ d, iat, exp }`.
 *
 * Which part does what, because it is easy to credit the wrong one:
 *
 * - **The `v1.` prefix is format discrimination, not a security control.** It is
 *   public, an attacker prepends it for free, and a conforming forgery then dies
 *   on the GCM tag. Its value is that a wrong format is rejected *before* `atob`
 *   is called, which is also where the length ceiling lives. It is passed as GCM
 *   `additionalData` as well, so the day a `v2.` exists a downgrade is not free.
 * - **The control is that there is no unencrypted path.** This driver previously
 *   fell back to `btoa` when the secret was empty — which was the package
 *   default — so the cookie was attacker-writable by design. That branch is
 *   gone, and nothing may reintroduce it: a "read the old format too"
 *   compatibility path is a window in which forged cookies still work.
 * - **`exp` lives inside the ciphertext.** `maxAge` on the cookie is a browser
 *   hint an attacker ignores, and this driver keeps no server-side record, so
 *   without an authenticated expiry a captured cookie authenticates for ever —
 *   across the victim's logout, since `destroy()` can only delete the client's
 *   copy.
 * - **The salt is fresh per cookie, so each derived key encrypts exactly one
 *   message.** That is why the ~2³² random-96-bit-IV ceiling does not apply
 *   here. Caching the derived key — the first optimisation anyone proposes on
 *   seeing HKDF called per request — silently reinstates that bound. Do not.
 *
 * @module @lockness/session/drivers/cookie
 */

import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from '@lockness/hono'
import type { SessionConfig, SessionData, SessionDriver } from '../types.ts'
import { assertUsableSecret, decodeBase64, encodeBase64 } from '../secret.ts'
import type { RevocationStore } from './revocation_store.ts'

/** The wire-format marker. Public by design; see the module note. */
export const WIRE_VERSION = 'v1.'

/**
 * The first-issuance identity of a session, preserved across re-seals.
 *
 * `iat` and `jti` are one concept — both minted when a session is first issued,
 * both carried unchanged through every re-seal, both reset on `regenerate()`. So
 * they travel as one value object, not two parallel fields. `iat` anchors the
 * absolute-lifetime cap (measured from first issuance, not from the last write);
 * `jti` is the per-session nonce the revocation set keys on.
 */
export interface IssuedIdentity {
    /** Epoch seconds of first issuance — the absolute cap is measured from here. */
    iat: number
    /** A ≥128-bit CSPRNG session nonce, the revocation key. */
    jti: string
}

/** Mint a fresh 128-bit session nonce (hex), from the same CSPRNG as salt/IV. */
function mintJti(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 16 bytes of HKDF salt, fresh per cookie. */
const SALT_BYTES = 16
/** 12 bytes of AES-GCM IV, fresh per cookie. */
const IV_BYTES = 12
/** The AES-GCM authentication tag, at the end of the ciphertext. */
const TAG_BYTES = 16
/**
 * The largest cookie value this driver will look at.
 *
 * Browsers cap a cookie at roughly 4 KB, so anything larger was never issued by
 * us. Bounding it before `atob` keeps an oversized header from being decoded and
 * mapped on every request.
 */
const MAX_COOKIE_CHARS = 4096

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const AAD = encoder.encode(WIRE_VERSION)
const INFO = encoder.encode('lockness/session/cookie/v1')

/**
 * Why a cookie was refused.
 *
 * A **closed union of literals**, which is why nothing here needs an encoder:
 * the only thing reaching the log is one of these six compile-time constants.
 * The moment any contextual field is added — the offending value being the
 * obvious temptation — it is attacker-controlled, post-`decodeURIComponent`,
 * CR/LF included, and it must go through `safeForLog` first.
 */
type Rejection =
    | 'bad-prefix'
    | 'too-long'
    | 'bad-base64'
    | 'too-short'
    | 'tag-mismatch'
    | 'expired'
    // The idle `exp` passed. Kept distinct from `absolute-expired` so an operator
    // can tell an idle timeout from a hard-cap eviction in the summary line.
    | 'absolute-expired'
    // The session's `jti` is in the revocation set, or the revocation store could
    // not be read (fail-closed — a store outage refuses, never authenticates).
    | 'revoked'

/**
 * Bounded rejection reporting.
 *
 * A rejected cookie is a tamper signal and must not be swallowed — but a log
 * line per rejection is a flooding vector the attacker controls, and warning
 * only once per process turns a sustained campaign into a single line for the
 * lifetime of the process. So: warn on the first, then a rolling summary while
 * the rate is non-zero. The rejection *class* is reported; the value never is.
 */
const rejections = new Map<Rejection, number>()
let firstWarned = false
let windowStartedAt = 0
let flushTimer: ReturnType<typeof setTimeout> | undefined
let lastReason: Rejection | undefined
const WINDOW_MS = 60_000

function flush(): void {
    flushTimer = undefined
    if (rejections.size === 0) return

    const total = [...rejections.values()].reduce((a, b) => a + b, 0)
    const classes = [...rejections.entries()]
        .map(([k, n]) => `${k}=${n}`)
        .join(' ')
    console.warn(
        `⚠️  ${total} session cookies rejected in the last ${
            Math.round((Date.now() - windowStartedAt) / 1000)
        }s — ${classes}`,
    )
    rejections.clear()
}

function reportRejection(reason: Rejection): void {
    lastReason = reason
    const now = Date.now()

    if (!firstWarned) {
        firstWarned = true
        windowStartedAt = now
        console.warn(
            `⚠️  Session cookie rejected (${reason}). ` +
                'This is a tamper or a stale cookie from before a key rotation.',
        )
        // Returns WITHOUT counting it. The first rejection is reported on its
        // own line; also counting it would put it in the next summary's total
        // as well, and a count that reports one event twice is worse than no
        // count — somebody sizes an incident from it.
        return
    }

    rejections.set(reason, (rejections.get(reason) ?? 0) + 1)

    // Drained by a timer, not by the next rejection.
    //
    // Draining only when another rejection arrives means a burst followed by
    // silence — what a probe that gives up looks like, and the shape most worth
    // seeing — is never reported at all, and the eventual line mislabels an
    // interval that has long since passed.
    //
    // `unrefTimer` keeps this from holding the process open, so it needs no
    // shutdown hook and cannot delay an exit.
    if (flushTimer === undefined) {
        windowStartedAt = now
        const timer = setTimeout(flush, WINDOW_MS)
        Deno.unrefTimer(timer)
        flushTimer = timer
    }
}

/**
 * Why the last cookie was refused.
 *
 * **Test-only, and deliberately absent from `mod.ts`.** `open()` returns `null`
 * for every rejection class, which is right for a caller and useless for a test:
 * an assertion that a truncated payload yields `null` is equally satisfied by a
 * tag mismatch, so it stays green with the structural check deleted. This makes
 * the class observable without putting it on the package's surface.
 *
 * @returns The most recent rejection class, or `undefined` if there has been none.
 * @internal
 *
 * @example
 * ```typescript
 * await open(key, 'garbage')
 * assertEquals(lastRejection(), 'bad-prefix')
 * ```
 */
export function lastRejection(): Rejection | undefined {
    return lastReason
}

/**
 * Rejections counted but not yet summarised.
 *
 * **Test-only, and deliberately absent from `mod.ts`.** The counts only reach a
 * human 60 seconds later, so without this the first-rejection accounting is
 * unobservable: reporting that one event both on its own line and again in the
 * next summary's total is a real defect — somebody sizes an incident from that
 * number — and no test could see it.
 *
 * @returns The pending count per rejection class.
 * @internal
 *
 * @example
 * ```typescript
 * assertEquals(pendingRejections(), {})
 * ```
 */
export function pendingRejections(): Readonly<Record<string, number>> {
    return Object.fromEntries(rejections)
}

/**
 * Clear the rejection reporter's state.
 *
 * **Test-only, and deliberately absent from `mod.ts`.** The reporter's state is
 * process-wide, which is right for it — the signal that matters is "rejections
 * across this process just went from 0/hour to 40k/hour" — and wrong for a test
 * suite, where one file's first rejection silently consumes the first-warning
 * branch for every file after it.
 *
 * @internal
 *
 * @example
 * ```typescript
 * resetRejectionReporter()
 * await open(key, 'garbage')
 * assertEquals(lastRejection(), 'bad-prefix')
 * ```
 */
export function resetRejectionReporter(): void {
    rejections.clear()
    firstWarned = false
    windowStartedAt = 0
    lastReason = undefined
    if (flushTimer !== undefined) {
        clearTimeout(flushTimer)
        flushTimer = undefined
    }
}

/**
 * Derive this cookie's AES key.
 *
 * HKDF, not PBKDF2: the secret is required to be 32 bytes of real key material
 * (see `secret.ts`), so there is nothing to stretch, and PBKDF2 at 100 000
 * iterations cost 13.45 ms per call on this runtime — twice per request, an
 * unauthenticated client's denial-of-service amplifier.
 *
 * @param keyBytes - The 32 validated key bytes.
 * @param salt - This cookie's salt.
 * @returns An AES-256-GCM key for exactly one message.
 */
async function deriveKey(
    keyBytes: Uint8Array,
    salt: Uint8Array,
): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey(
        'raw',
        keyBytes as BufferSource,
        'HKDF',
        false,
        ['deriveKey'],
    )

    return await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: salt as BufferSource,
            info: INFO,
        },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    )
}

/**
 * Seal session data into a cookie value.
 *
 * @param secret - The application key, in `base64:` form.
 * @param data - The session contents.
 * @param lifetime - Seconds until the payload's idle `exp`, authenticated inside
 *   it. Refreshed on every call.
 * @param issued - The session's first-issuance identity (`iat`/`jti`) to
 *   preserve across a re-seal. Omit for a brand-new session — a fresh `iat` and a
 *   128-bit `jti` are minted.
 * @returns The cookie value.
 * @throws {SessionSecretError} When the secret is absent or not key material.
 *
 * @example
 * ```typescript
 * const value = await seal(config.secret, { userId: 1 }, 7200)
 * ```
 */
export async function seal(
    secret: string | undefined,
    data: SessionData,
    lifetime: number,
    issued?: IssuedIdentity,
): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    // First-issuance identity is PRESERVED across re-seals: an already-issued
    // session keeps its original `iat` (so the absolute cap measures real age,
    // not time-since-last-write) and its `jti` (so a re-seal cannot shed a
    // revocation). A brand-new session mints both. `exp` — the idle window — is
    // always fresh.
    const iat = issued?.iat ?? now
    const jti = issued?.jti ?? mintJti()
    return await sealPayload(secret, { d: data, iat, exp: now + lifetime, jti })
}

/** Encrypt an arbitrary payload object into a cookie value (the seal internals). */
async function sealPayload(
    secret: string | undefined,
    payload: unknown,
): Promise<string> {
    const keyBytes = assertUsableSecret(secret, 'config')
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))

    const plaintext = encoder.encode(JSON.stringify(payload))
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as BufferSource, additionalData: AAD },
            await deriveKey(keyBytes, salt),
            plaintext as BufferSource,
        ),
    )

    const combined = new Uint8Array(
        SALT_BYTES + IV_BYTES + ciphertext.byteLength,
    )
    combined.set(salt)
    combined.set(iv, SALT_BYTES)
    combined.set(ciphertext, SALT_BYTES + IV_BYTES)

    return WIRE_VERSION + encodeBase64(combined)
}

/**
 * Seal an arbitrary payload object, bypassing {@link seal}'s `{ d, iat, exp, jti }`
 * construction.
 *
 * **Test-only, and deliberately absent from `mod.ts`.** It exists so a test can
 * craft a GCM-valid cookie with a missing or non-numeric `iat` — a shape a real
 * `seal()` never produces — to prove `open()`'s absolute-cap `iat`-present gate
 * fails closed. Without it that fail-closed branch could be deleted with the
 * suite still green.
 *
 * @param secret - The application key.
 * @param payload - The exact object to seal (no fields are added).
 * @returns The cookie value.
 * @internal
 */
export function sealArbitrary(
    secret: string | undefined,
    payload: unknown,
): Promise<string> {
    return sealPayload(secret, payload)
}

/**
 * Open a sealed cookie value, or refuse it.
 *
 * Every rejection is a **decision**, taken before the crypto call where it can
 * be — the length ceiling, the prefix, the minimum structural size. The
 * `try/catch` is a backstop, not the mechanism: relying on `OperationError` to
 * reject a truncated payload means a narrowed catch later turns an empty session
 * into a 500.
 *
 * @param secret - The application key, in `base64:` form.
 * @param value - The attacker-controlled cookie value.
 * @param absoluteLifetime - When a number, the hard ceiling: the payload is
 *   refused if `now - iat` exceeds it or if `iat` is missing/non-numeric. Gated
 *   on `typeof === 'number'`, so `0` enforces rather than disables. Omit to skip
 *   the cap.
 * @returns The session contents, or `null` for anything not authentically ours.
 * @throws {SessionSecretError} When the secret is absent or not key material.
 *
 * @example
 * ```typescript
 * const data = await open(config.secret, cookieValue)
 * ```
 */
export async function open(
    secret: string | undefined,
    value: string,
    absoluteLifetime?: number,
): Promise<SessionData | null> {
    const opened = await openSealed(secret, value, absoluteLifetime)
    return opened ? opened.data : null
}

/**
 * One opened, verified sealed payload — the fields the driver needs beyond the
 * data itself.
 */
export interface OpenedPayload {
    /** The session contents. */
    data: SessionData
    /** First-issuance epoch seconds (the absolute-cap anchor). */
    iat: number
    /** Idle-expiry epoch seconds. */
    exp: number
    /** The session nonce, absent on a pre-feature (jti-less) cookie. */
    jti?: string
}

/**
 * Decrypt, verify and surface a sealed cookie — the same checks {@link open}
 * makes, but returning `iat`/`exp`/`jti` so the driver can preserve the identity
 * across re-seals and run the revocation check. **Pure and offline**: it does no
 * I/O and takes no store — the revocation decision lives in the driver's
 * `read()`, not here (an offline crypto function must not grow a network call).
 *
 * @param secret - The application key.
 * @param value - The raw cookie value.
 * @param absoluteLifetime - When a number, the hard ceiling: the payload is
 *   refused if `now - iat` exceeds it, or if `iat` is missing/non-numeric. The
 *   gate is `typeof === 'number'`, never truthiness — `0` does not disable it.
 * @returns The opened payload, or `null` for any rejection.
 */
export async function openSealed(
    secret: string | undefined,
    value: string,
    absoluteLifetime?: number,
): Promise<OpenedPayload | null> {
    const keyBytes = assertUsableSecret(secret, 'config')

    if (value.length > MAX_COOKIE_CHARS) return refuse('too-long')
    if (!value.startsWith(WIRE_VERSION)) return refuse('bad-prefix')

    let combined: Uint8Array
    try {
        combined = decodeBase64(value.slice(WIRE_VERSION.length))
    } catch {
        return refuse('bad-base64')
    }

    if (combined.byteLength < SALT_BYTES + IV_BYTES + TAG_BYTES) {
        return refuse('too-short')
    }

    const salt = combined.subarray(0, SALT_BYTES)
    const iv = combined.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES)
    const ciphertext = combined.subarray(SALT_BYTES + IV_BYTES)

    let plaintext: ArrayBuffer
    try {
        plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv as BufferSource, additionalData: AAD },
            await deriveKey(keyBytes, salt),
            ciphertext as BufferSource,
        )
    } catch {
        return refuse('tag-mismatch')
    }

    let payload: { d?: SessionData; exp?: number; iat?: number; jti?: string }
    try {
        payload = JSON.parse(decoder.decode(plaintext))
    } catch {
        return refuse('tag-mismatch')
    }

    if (
        typeof payload.exp !== 'number' ||
        payload.exp <= Math.floor(Date.now() / 1000)
    ) {
        return refuse('expired')
    }
    // The absolute cap: enforced iff a numeric `absoluteLifetime` is configured
    // (never truthiness — `0` must not silently disable it). A cap-enforced
    // payload whose `iat` is missing or non-numeric is refused, so a future
    // `seal()` change cannot let a session skip the ceiling by omission.
    if (typeof absoluteLifetime === 'number') {
        if (typeof payload.iat !== 'number') return refuse('absolute-expired')
        if (Math.floor(Date.now() / 1000) - payload.iat > absoluteLifetime) {
            return refuse('absolute-expired')
        }
    }
    if (
        typeof payload.d !== 'object' || payload.d === null ||
        Array.isArray(payload.d)
    ) {
        // `exp` was guarded and `d` was not, which is an asymmetry rather than a
        // hole — the GCM tag already proves we wrote this. It is checked anyway
        // because the alternative is that a future change to what gets sealed
        // hands a string or an array to `SessionStore` as if it were a record.
        return refuse('tag-mismatch')
    }

    return {
        data: payload.d,
        // `iat` is present on every cookie #137+ sealed; when the cap is off it
        // may be absent on a pre-cap cookie — fall back to `exp - lifetime` is
        // not knowable here, so default to `exp` (a conservative, never-younger
        // anchor). The driver only uses it to preserve across re-seals.
        iat: typeof payload.iat === 'number' ? payload.iat : payload.exp,
        exp: payload.exp,
        jti: typeof payload.jti === 'string' ? payload.jti : undefined,
    }
}

function refuse(reason: Rejection): null {
    reportRejection(reason)
    return null
}

/**
 * Cookie-based session driver.
 *
 * Stores session data directly in a sealed cookie (stateless). Best for small
 * session payloads — a browser caps a cookie at roughly 4 KB, and the sealed
 * format costs 28 bytes plus base64 expansion.
 *
 * **A secret is mandatory.** There is no unencrypted mode; see the module note.
 *
 * @example
 * ```typescript
 * const driver = new CookieSessionDriver(context, config)
 * await driver.write('session-id', { userId: 123 }, 3600)
 * ```
 */
export class CookieSessionDriver implements SessionDriver {
    private readonly context: Context
    private readonly config: SessionConfig
    /**
     * The process-shared revocation store, injected by the registry when
     * revocation is enabled. The driver holds only a reference — it never opens a
     * KV handle itself, so it stays per-request without leaking a handle per
     * request. Absent when revocation is off.
     */
    readonly #store?: RevocationStore
    /**
     * The first-issuance identity read from the incoming cookie, preserved so a
     * re-seal in the same request keeps the original `iat`/`jti`. Undefined for a
     * brand-new session (the next `write` mints a fresh one).
     */
    #issued?: IssuedIdentity
    /**
     * Set once `destroy()` has run, so a trailing `write()` from `save()` in the
     * same request does not re-seal a just-revoked/just-deleted session.
     */
    #destroyed = false

    /**
     * @param context - The Hono request context.
     * @param config - The resolved session configuration.
     * @param revocationStore - The process-shared revocation store, when
     *   revocation is enabled (injected by the driver registry).
     * @throws {SessionSecretError} When the configured secret is unusable.
     */
    constructor(
        context: Context,
        config: SessionConfig,
        revocationStore?: RevocationStore,
    ) {
        // Asked here, decided in secret.ts. Constructing a driver that cannot
        // seal is a configuration error, and the request path is the wrong place
        // to discover it.
        assertUsableSecret(config.secret, 'config')
        this.context = context
        this.config = config
        this.#store = revocationStore
    }

    /**
     * The TTL for a revocation entry: a full absolute-cap window from now. Longer
     * than the cookie's remaining life, so the entry always outlives every use of
     * the cookie — and raising `absoluteLifetime` later cannot expire an entry
     * before the cookie it revokes (a fixed window, not one derived from the live
     * config at read time).
     */
    #revocationTtl(): number {
        return this.config.absoluteLifetime ?? this.config.lifetime
    }

    /**
     * Read the session out of the cookie.
     *
     * The session id is ignored: this driver keeps no server-side record, so the
     * cookie *is* the session.
     *
     * @param _sessionId - Unused; the cookie carries the data.
     * @returns The session contents, or `null` for an absent, forged, tampered
     * or expired cookie. Never throws on cookie content.
     *
     * @example
     * ```typescript
     * const data = await driver.read(sessionId)
     * ```
     */
    async read(_sessionId: string): Promise<SessionData | null> {
        const value = getCookie(this.context, this.config.cookieName)
        if (!value) return null

        const opened = await openSealed(
            this.config.secret,
            value,
            this.config.absoluteLifetime,
        )
        if (!opened) return null

        // Preserve the first-issuance identity so a re-seal in this request keeps
        // the original `iat` (cap anchor) and `jti` (revocation key). A
        // pre-feature cookie with no `jti` mints one now, so it becomes revocable
        // from its next write on; its `iat` is preserved either way.
        this.#issued = { iat: opened.iat, jti: opened.jti ?? mintJti() }

        // Revocation check — fail CLOSED. Only when opted in, a store is present,
        // and the cookie carries a `jti` (a jti-less pre-feature cookie has no
        // revocation entry and is bounded by the absolute cap instead).
        if (this.config.revocation && this.#store && opened.jti) {
            let revoked: boolean
            try {
                revoked = await this.#store.isRevoked(opened.jti)
            } catch {
                // A store outage must never let a possibly-revoked cookie
                // authenticate: refuse, do not treat the error as "not revoked".
                return refuse('revoked')
            }
            if (revoked) return refuse('revoked')
        }

        return opened.data
    }

    /**
     * Seal the session into the cookie.
     *
     * @param _sessionId - Unused; the cookie carries the data.
     * @param data - The session contents.
     * @param lifetime - Seconds until expiry, authenticated inside the payload
     * as well as set as `maxAge`. Only the former binds an attacker.
     * @throws {SessionSecretError} When the configured secret is unusable.
     *
     * @example
     * ```typescript
     * await driver.write(sessionId, { userId: 1 }, 7200)
     * ```
     */
    async write(
        _sessionId: string,
        data: SessionData,
        lifetime: number,
    ): Promise<void> {
        // `destroy()` already emitted a deletion and revoked the session; the
        // middleware's trailing `save()` (the session is dirty after logout) must
        // NOT re-seal it back to life with the just-revoked identity.
        if (this.#destroyed) return
        setCookie(
            this.context,
            this.config.cookieName,
            // Preserve the issued identity across the re-seal (undefined ⇒ a fresh
            // one is minted for a new session).
            await seal(this.config.secret, data, lifetime, this.#issued),
            {
                path: this.config.path,
                domain: this.config.domain,
                secure: this.config.secure,
                httpOnly: this.config.httpOnly,
                sameSite: this.config.sameSite,
                maxAge: lifetime,
            },
        )
    }

    /**
     * Delete the client's copy of the cookie and, when revocation is enabled,
     * revoke the session so a captured copy can no longer authenticate.
     *
     * With revocation **off** this is the original stateless behaviour — it drops
     * the client cookie and a copy captured beforehand keeps working until the
     * cap or idle `exp`. With revocation **on**, the current session's `jti` is
     * added to the revocation set (the write propagates on failure — a logout
     * that silently fails to revoke is worse than one that errors), and the
     * trailing re-seal from `save()` is suppressed so the deletion stands.
     *
     * @param _sessionId - Unused; the cookie carries the identity.
     * @throws When revocation is on and the store write fails (fail-closed).
     *
     * @example
     * ```typescript
     * await driver.destroy(sessionId)
     * ```
     */
    async destroy(_sessionId: string): Promise<void> {
        if (this.config.revocation && this.#store && this.#issued?.jti) {
            await this.#store.revoke(this.#issued.jti, this.#revocationTtl())
        }
        deleteCookie(this.context, this.config.cookieName, {
            path: this.config.path,
            domain: this.config.domain,
        })
        // Suppress the trailing re-seal (see write()): the session is gone.
        this.#destroyed = true
    }

    /**
     * Rotate the session identity.
     *
     * With revocation **off** this stays a stateless no-op beyond resetting the
     * preserved identity, so the next {@link write} mints a fresh `iat`/`jti`
     * (a fresh absolute clock — correct for a login). With revocation **on**, the
     * OLD `jti` is revoked first, so a cookie captured before the rotation can no
     * longer authenticate. **Not symmetric with `destroy()`**: `regenerate()`
     * resets the identity so the session continues under a new one; `destroy()`
     * suppresses the re-seal so the session ends.
     *
     * @param _oldId - Unused.
     * @param _newId - Unused.
     * @param _lifetime - Unused: the cookie carries its own expiry.
     * @throws When revocation is on and the store write fails (fail-closed).
     *
     * @example
     * ```typescript
     * await driver.regenerate(oldId, newId, lifetime)
     * ```
     */
    async regenerate(
        _oldId: string,
        _newId: string,
        _lifetime: number,
    ): Promise<void> {
        if (this.config.revocation && this.#store && this.#issued?.jti) {
            await this.#store.revoke(this.#issued.jti, this.#revocationTtl())
        }
        // Reset so the next write mints a fresh identity (new clock, new nonce).
        this.#issued = undefined
    }
}
