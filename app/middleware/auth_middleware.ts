import {
    type Context,
    DeclareMiddleware,
    type IMiddleware,
    type Next,
} from '@lockness/core'

/**
 * Auth middleware - checks if user is authenticated
 *
 * This middleware is automatically registered as 'auth' via the @DeclareMiddleware decorator.
 * Use it in controllers with @UseMiddleware('auth')
 *
 * @example
 * ```ts
 * @Controller('/dashboard')
 * @UseMiddleware('auth')
 * export class DashboardController {
 *     @Get('/')
 *     index(c: Context) {
 *         return c.json({ message: 'Protected route' })
 *     }
 * }
 * ```
 */
@DeclareMiddleware('auth')
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
