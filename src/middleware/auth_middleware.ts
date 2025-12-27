import type { Context, Next } from 'hono'
import { type IMiddleware, Middleware } from '@lockness/core'

/**
 * Auth middleware - checks if user is authenticated
 * Register as named middleware 'auth' in kernel.ts
 */
@Middleware()
export class AuthMiddleware implements IMiddleware {
    async handle(c: Context, next: Next) {
        // Example: Check for Authorization header or session
        const authHeader = c.req.header('Authorization')

        if (!authHeader) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        // TODO: Verify token, get user, attach to context
        // c.set('user', user)

        await next()
    }
}
