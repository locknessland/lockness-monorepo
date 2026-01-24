import { type Context, Controller, Get, UseMiddleware } from '@lockness/core'

/**
 * Example controller demonstrating @UseMiddleware decorator usage.
 *
 * This controller shows how to:
 * - Apply middleware to individual routes
 * - Stack multiple middlewares
 * - Use @DeclareMiddleware decorated middlewares
 */
@Controller('/example')
export class ExampleController {
    /**
     * Public route - no middleware required
     */
    @Get('/public')
    public(c: Context) {
        return c.json({
            message: 'This is a public endpoint',
            middleware: 'none',
        })
    }

    /**
     * Protected route - requires authentication
     */
    @Get('/protected')
    @UseMiddleware('auth')
    protected(c: Context) {
        return c.json({
            message: 'This route is protected by auth middleware',
            middleware: ['auth'],
        })
    }

    /**
     * Admin route - requires both auth and admin middlewares
     * Middlewares are executed in the order they're declared (top to bottom)
     */
    @Get('/admin')
    @UseMiddleware('auth')
    @UseMiddleware('admin')
    admin(c: Context) {
        return c.json({
            message: 'This route requires both auth and admin access',
            middleware: ['auth', 'admin'],
        })
    }

    /**
     * Multiple middleware example
     * Shows how to stack multiple named middlewares
     */
    @Get('/restricted')
    @UseMiddleware('auth')
    @UseMiddleware('admin')
    restricted(c: Context) {
        const user = c.get('user')
        return c.json({
            message: 'Highly restricted endpoint',
            user,
            middleware: ['auth', 'admin'],
        })
    }
}
