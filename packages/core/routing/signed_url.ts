/**
 * @fileoverview Signed / temporary route URLs — a tamper-proof, optionally
 * expiring URL for a named route, and the one canonicalisation both generation
 * and verification share.
 *
 * **The signature covers a single canonical byte-string** (security S1):
 * `origin + pathname + sorted(query minus signature)`, over **decoded** values,
 * so generation and the Hono-decoded verify path see identical bytes. Duplicate
 * query keys are rejected (not silently split). The origin is sourced from
 * `APP_URL`, **never** a request `Host` header.
 *
 * @module @lockness/core/routing/signed_url
 * @since 0.2.1
 */

import { sign } from '@lockness/crypto'
import { route } from './router.ts'

/** The query parameter that carries the signature. */
export const SIGNATURE_PARAM = 'signature'
/** The query parameter that carries the expiry (unix seconds). */
export const EXPIRES_PARAM = 'expires'

/** Thrown when a URL cannot be canonicalised (e.g. a duplicate query key). */
export class SignedUrlError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'SignedUrlError'
    }
}

/**
 * Build the canonical string a signature is computed over: the origin, the
 * decoded pathname, and the query params **sorted by key with `signature`
 * removed**. Rejects a duplicate query key (a split between the signed value and
 * the enforced value is the classic signed-URL bypass).
 *
 * @param origin - The scheme+host from `APP_URL` (or `''` for a relative URL).
 * @param pathname - The decoded path.
 * @param entries - The query entries (decoded).
 * @returns The canonical byte-string.
 * @throws {SignedUrlError} On a duplicate query key.
 */
export function canonicalise(
    origin: string,
    pathname: string,
    entries: readonly (readonly [string, string])[],
): string {
    const seen = new Set<string>()
    const kept: [string, string][] = []
    for (const [key, value] of entries) {
        if (key === SIGNATURE_PARAM) continue
        if (seen.has(key)) {
            throw new SignedUrlError(`duplicate query parameter: ${key}`)
        }
        seen.add(key)
        kept.push([key, value])
    }
    kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    // Percent-encode each key and value before the k=v join, so a `=`/`&` INSIDE
    // a value cannot masquerade as a delimiter — otherwise `?a=b&c=d` and
    // `?a=b%26c%3Dd` would collapse to the same canonical string and share one
    // signature (review HIGH-1). Both sign and verify call this one function, so
    // the encoding stays in agreement.
    const query = kept
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    return `${origin}${pathname}?${query}`
}

/** Options for {@link signedUrl}. */
export interface SignedUrlOptions {
    /** Seconds from now until the URL expires. */
    readonly expiresIn?: number
    /** Absolute unix-seconds expiry (takes precedence over `expiresIn`). */
    readonly expiresAt?: number
    /** Extra query parameters to include (and sign). */
    readonly query?: Record<string, string>
    /** Origin override; defaults to `APP_URL` (or `''` — a relative URL). */
    readonly baseUrl?: string
    /** Signing key override; defaults to `APP_KEY`. */
    readonly key?: string
}

/**
 * Build a signed URL for a named route. The signature covers the origin, path,
 * and every query parameter (including `expires`), so tampering with any of them
 * — or removing the signature — invalidates the URL.
 *
 * @param name - The named route.
 * @param params - Path parameters for {@link route}.
 * @param options - Expiry, extra query, origin/key overrides.
 * @returns The absolute-or-relative signed URL.
 *
 * @example
 * ```typescript
 * const url = await signedUrl('verify-email', { id: 42 }, { expiresIn: 3600 })
 * ```
 */
export async function signedUrl(
    name: string,
    params: Record<string, string | number> = {},
    options: SignedUrlOptions = {},
): Promise<string> {
    const pathname = route(name, params)
    const origin = options.baseUrl ?? Deno.env.get('APP_URL') ?? ''

    const query = new URLSearchParams(options.query ?? {})
    if (options.expiresAt !== undefined) {
        query.set(EXPIRES_PARAM, String(Math.floor(options.expiresAt)))
    } else if (options.expiresIn !== undefined) {
        query.set(
            EXPIRES_PARAM,
            String(Math.floor(Date.now() / 1000 + options.expiresIn)),
        )
    }

    const canon = canonicalise(origin, pathname, [...query.entries()])
    const signature = await sign(canon, options.key)
    query.set(SIGNATURE_PARAM, signature)

    return `${origin}${pathname}?${query.toString()}`
}
