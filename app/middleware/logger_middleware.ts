import {
    type Context,
    Middleware,
    type MiddlewareContract,
    type Next,
    safeForLog,
} from '@lockness/core'

/**
 * Logger middleware - logs all incoming requests
 */
@Middleware()
export class LoggerMiddleware implements MiddlewareContract {
    async handle(c: Context, next: Next) {
        const start = Date.now()

        // `c.req.path` is percent-DECODED by Hono's getPath, and decodeURI
        // decodes %0A / %0D / %1B — so an un-encoded path forges log lines and
        // drives the operator's terminal. Encode before it reaches the sink.
        const path = safeForLog(c.req.path)

        console.log(`→ ${c.req.method} ${path}`)

        await next()

        const duration = Date.now() - start
        console.log(
            `← ${c.req.method} ${path} ${c.res.status} (${duration}ms)`,
        )
    }
}
