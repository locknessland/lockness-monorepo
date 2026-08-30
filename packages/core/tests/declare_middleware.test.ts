/**
 * Tests for @DeclareMiddleware and @UseMiddleware decorators
 */

// deno-lint-ignore-file no-unused-vars require-await

import { assertEquals, assertExists } from '@std/assert'
import {
    Controller,
    DeclareMiddleware,
    Get,
    type MiddlewareContract,
    type Next,
    UseMiddleware,
} from '../mod.ts'
import type { Context } from '../types.ts'
import {
    declaredMiddlewares,
    MIDDLEWARE_NAME_KEY,
} from '../routing/decorators.ts'

Deno.test('@DeclareMiddleware - registers middleware in global registry', () => {
    // Clear registry before test
    declaredMiddlewares.clear()

    @DeclareMiddleware('test-auth')
    class TestAuthMiddleware implements MiddlewareContract {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    // Verify middleware is registered
    assertEquals(declaredMiddlewares.size, 1)
    assertEquals(declaredMiddlewares.has('test-auth'), true)
    assertExists(declaredMiddlewares.get('test-auth'))
})

Deno.test('@DeclareMiddleware - multiple middlewares can be registered', () => {
    declaredMiddlewares.clear()

    @DeclareMiddleware('auth')
    class AuthMiddleware implements MiddlewareContract {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    @DeclareMiddleware('admin')
    class AdminMiddleware implements MiddlewareContract {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    @DeclareMiddleware('rate-limit')
    class RateLimitMiddleware implements MiddlewareContract {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    assertEquals(declaredMiddlewares.size, 3)
    assertEquals(declaredMiddlewares.has('auth'), true)
    assertEquals(declaredMiddlewares.has('admin'), true)
    assertEquals(declaredMiddlewares.has('rate-limit'), true)
})

Deno.test('@DeclareMiddleware - stores name as metadata on class', () => {
    declaredMiddlewares.clear()

    @DeclareMiddleware('metadata-test')
    class MetadataMiddleware implements MiddlewareContract {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    // @ts-ignore - accessing internal metadata
    assertEquals(MetadataMiddleware[MIDDLEWARE_NAME_KEY], 'metadata-test')
})

Deno.test('@UseMiddleware - applies named middleware to controller method', () => {
    declaredMiddlewares.clear()

    @DeclareMiddleware('method-auth')
    class MethodAuthMiddleware implements MiddlewareContract {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    @Controller('/test')
    class TestController {
        @Get('/protected')
        @UseMiddleware('method-auth')
        protectedRoute(_c: Context) {
            return new Response('protected')
        }
    }

    // Create instance to trigger addInitializer
    new TestController()

    // Verify middleware is registered on the method
    const middlewares = (TestController as unknown as {
        _middlewares: Record<string, string[]>
    })
        ._middlewares || {}
    assertEquals('protectedRoute' in middlewares, true)
    assertEquals(middlewares['protectedRoute'].length, 1)
    assertEquals(middlewares['protectedRoute'][0], 'method-auth')
})

Deno.test('@UseMiddleware - multiple named middlewares can stack', () => {
    declaredMiddlewares.clear()

    @DeclareMiddleware('auth')
    class Auth implements MiddlewareContract {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    @DeclareMiddleware('admin')
    class Admin implements MiddlewareContract {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    @DeclareMiddleware('rate-limit')
    class RateLimit implements MiddlewareContract {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    @Controller('/admin')
    class AdminController {
        @Get('/users')
        @UseMiddleware('auth')
        @UseMiddleware('admin')
        @UseMiddleware('rate-limit')
        listUsers(_c: Context) {
            return new Response('users')
        }
    }

    // Create instance to trigger addInitializer
    new AdminController()

    const middlewares = (AdminController as unknown as {
        _middlewares: Record<string, string[]>
    })
        ._middlewares || {}
    assertEquals(middlewares['listUsers'].length, 3)
    assertEquals(middlewares['listUsers'][0], 'auth')
    assertEquals(middlewares['listUsers'][1], 'admin')
    assertEquals(middlewares['listUsers'][2], 'rate-limit')
})

// This test requires file system permissions and must be run with --allow-read --allow-write
// It's skipped in CI or when run without full permissions
Deno.test({
    name: 'Middleware discovery - imports trigger registration',
    ignore: Deno.permissions.querySync?.({ name: 'write' }).state !== 'granted',
    fn: async () => {
        declaredMiddlewares.clear()

        // Create temporary middleware file
        const tempDir = await Deno.makeTempDir()
        const middlewareFile = `${tempDir}/temp_middleware.ts`

        // Get absolute path to the decorators module
        const decoratorsPath = import.meta.resolve('../routing/decorators.ts')
        const typesPath = import.meta.resolve('../types.ts')

        await Deno.writeTextFile(
            middlewareFile,
            `
import { DeclareMiddleware } from '${decoratorsPath}'
import type { MiddlewareContract, Context, Next } from '${typesPath}'

@DeclareMiddleware('temp-auth')
export class TempAuthMiddleware implements MiddlewareContract {
    async handle(_c: Context, next: Next) {
        return next()
    }
}
        `,
        )

        // Import the file
        await import(middlewareFile)

        // Verify middleware was registered
        assertEquals(declaredMiddlewares.has('temp-auth'), true)

        // Cleanup
        await Deno.remove(tempDir, { recursive: true })
    },
})
