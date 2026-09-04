/**
 * @fileoverview The `signed` verify middleware — rejects a tampered, unsigned, or
 * expired signed URL with a generic 403 before the handler runs.
 *
 * Recomputes the signature via the **same** {@link canonicalise} the generator
 * used (origin from `APP_URL`, path from `c.req.path` which Hono has decoded,
 * decoded query, duplicates rejected), compares timing-safely (HMAC `verify`),
 * and checks `expires`. The 403 body is generic — no computed signature, no
 * discriminating reason (security S10).
 *
 * @module @lockness/core/http/signed_url_middleware
 * @since 0.2.1
 */

import {
    type Context,
    DeclareMiddleware,
    type MiddlewareContract,
    type Next,
} from '@lockness/contract'
import { verify } from '@lockness/crypto'
import {
    canonicalise,
    EXPIRES_PARAM,
    SIGNATURE_PARAM,
} from '../routing/signed_url.ts'

/**
 * Verifies `signed`-URL requests. Register it on a route with
 * `@UseMiddleware('signed')`.
 *
 * @example
 * ```typescript
 * @Get('/verify/:id')
 * @UseMiddleware('signed')
 * verify(c: Context) { return c.text('ok') }
 * ```
 */
@DeclareMiddleware('signed')
export class SignedUrlMiddleware implements MiddlewareContract {
    /**
     * @param c - The request context.
     * @param next - The downstream handler.
     * @returns A generic 403 when the URL is not a valid, unexpired signed URL.
     */
    async handle(c: Context, next: Next): Promise<Response | void> {
        const forbidden = () => c.json({ error: 'Forbidden' }, 403)

        let url: URL
        try {
            url = new URL(c.req.url)
        } catch {
            return forbidden()
        }
        const params = url.searchParams

        const signature = params.get(SIGNATURE_PARAM)
        if (!signature) return forbidden()

        // Reject a duplicate query key (a split between the signed and the
        // enforced value is the classic bypass).
        const keys = [...params.keys()]
        if (new Set(keys).size !== keys.length) return forbidden()

        // Origin from config, never the request Host header.
        const origin = Deno.env.get('APP_URL') ?? ''

        let canon: string
        try {
            canon = canonicalise(origin, c.req.path, [...params.entries()])
        } catch {
            return forbidden()
        }

        let ok: boolean
        try {
            ok = await verify(canon, signature)
        } catch {
            return forbidden()
        }
        if (!ok) return forbidden()

        const expires = params.get(EXPIRES_PARAM)
        if (expires !== null) {
            const ts = Number(expires)
            if (!Number.isFinite(ts) || Date.now() / 1000 > ts) {
                return forbidden()
            }
        }

        await next()
    }
}
