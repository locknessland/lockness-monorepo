import type { Context, Next } from 'hono'
import { type IMiddleware, Middleware } from 'lockness'

/**
 * Logger middleware - logs all incoming requests
 */
@Middleware()
export class LoggerMiddleware implements IMiddleware {
    async handle(c: Context, next: Next) {
        const start = Date.now()
        console.log(`→ ${c.req.method} ${c.req.path}`)

        await next()

        const duration = Date.now() - start
        console.log(
            `← ${c.req.method} ${c.req.path} ${c.res.status} (${duration}ms)`,
        )
    }
}
