import {
    type Context,
    DeclareMiddleware,
    type IMiddleware,
    type Next,
} from '@lockness/core'

/**
 * Admin middleware - checks if user has admin role
 *
 * This middleware is automatically registered as 'admin' via the @DeclareMiddleware decorator.
 * Use it in controllers with @UseMiddleware('admin')
 *
 * @example
 * ```ts
 * @Controller('/admin')
 * @UseMiddleware('auth')  // First require authentication
 * export class AdminController {
 *     @Get('/users')
 *     @UseMiddleware('admin')  // Then require admin role
 *     listUsers(c: Context) {
 *         return c.json({ users: [] })
 *     }
 * }
 * ```
 */
@DeclareMiddleware('admin')
export class AdminMiddleware implements IMiddleware {
    async handle(c: Context, next: Next) {
        // Example: Check if user has admin role
        // In a real app, you'd get this from the context after auth middleware
        const user = c.get('user') as { role?: string } | undefined

        if (!user || user.role !== 'admin') {
            return c.json({ error: 'Forbidden - Admin access required' }, 403)
        }

        await next()
    }
}
