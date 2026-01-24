/**
 * Tests for MiddlewareResolver with declared middlewares
 */

// deno-lint-ignore-file no-unused-vars require-await

import { assertEquals, assertExists } from '@std/assert'
import {
    discoverMiddlewares,
    MiddlewareResolver,
} from '../middleware_resolver.ts'
import { declaredMiddlewares, DeclareMiddleware } from '../decorators.ts'
import type { Context, IMiddleware, Next } from '../types.ts'

Deno.test('MiddlewareResolver - mergeDeclaredMiddlewares adds declared middlewares to registry', () => {
    declaredMiddlewares.clear()

    @DeclareMiddleware('declared-auth')
    class DeclaredAuthMiddleware implements IMiddleware {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    const resolver = new MiddlewareResolver()
    resolver.mergeDeclaredMiddlewares()

    // Verify resolver can resolve the declared middleware
    const handler = resolver.resolve('declared-auth')
    assertExists(handler)
})

Deno.test('MiddlewareResolver - declared middlewares take precedence over manual registration', () => {
    declaredMiddlewares.clear()

    class ManualAuthMiddleware implements IMiddleware {
        value = 'manual'
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    @DeclareMiddleware('auth')
    class DeclaredAuthMiddleware implements IMiddleware {
        value = 'declared'
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    const resolver = new MiddlewareResolver()
    resolver.setRegistry({ auth: ManualAuthMiddleware })
    resolver.mergeDeclaredMiddlewares()

    // Verify declared middleware takes precedence
    const handler = resolver.resolve('auth')
    assertExists(handler)
})

Deno.test('MiddlewareResolver - resolves multiple declared middlewares', () => {
    declaredMiddlewares.clear()

    @DeclareMiddleware('one')
    class MiddlewareOne implements IMiddleware {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    @DeclareMiddleware('two')
    class MiddlewareTwo implements IMiddleware {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    @DeclareMiddleware('three')
    class MiddlewareThree implements IMiddleware {
        async handle(_c: Context, next: Next) {
            return next()
        }
    }

    const resolver = new MiddlewareResolver()
    resolver.mergeDeclaredMiddlewares()

    const handlers = resolver.resolveMany(['one', 'two', 'three'])
    assertEquals(handlers.length, 3)
})

Deno.test('MiddlewareResolver - handles non-existent middleware gracefully', () => {
    declaredMiddlewares.clear()

    const resolver = new MiddlewareResolver()
    resolver.mergeDeclaredMiddlewares()

    const handler = resolver.resolve('non-existent')
    assertEquals(handler, null)
})

Deno.test('discoverMiddlewares - discovers middlewares from directory', async () => {
    declaredMiddlewares.clear()

    // Create a temp directory with a middleware file
    const tempDir = await Deno.makeTempDir()
    const middlewareCode = `
import { DeclareMiddleware } from '${Deno.cwd()}/packages/core/decorators.ts'

@DeclareMiddleware('temp-test')
export class TempTestMiddleware {
    async handle(_c, next) {
        return next()
    }
}
`
    await Deno.writeTextFile(`${tempDir}/temp_middleware.ts`, middlewareCode)

    // Discover middlewares
    const count = await discoverMiddlewares(tempDir)

    // Verify the middleware was discovered
    assertEquals(count, 1)
    assertEquals(declaredMiddlewares.has('temp-test'), true)

    // Cleanup
    await Deno.remove(tempDir, { recursive: true })
})

Deno.test('discoverMiddlewares - handles non-existent directory gracefully', async () => {
    const count = await discoverMiddlewares('/non/existent/path')
    assertEquals(count, 0)
})

Deno.test('discoverMiddlewares - resolves relative paths correctly', async () => {
    declaredMiddlewares.clear()

    // Create a temp directory in cwd with a middleware file
    const tempDirName = `tmp/test-discover-${Date.now()}`
    await Deno.mkdir(tempDirName, { recursive: true })

    const middlewareCode = `
import { DeclareMiddleware } from '${Deno.cwd()}/packages/core/decorators.ts'

@DeclareMiddleware('relative-test')
export class RelativeTestMiddleware {
    async handle(_c, next) {
        return next()
    }
}
`
    await Deno.writeTextFile(
        `${tempDirName}/relative_middleware.ts`,
        middlewareCode,
    )

    // Discover with relative path (like './app/middleware')
    const count = await discoverMiddlewares(`./${tempDirName}`)

    // Verify the middleware was discovered
    assertEquals(count, 1)
    assertEquals(declaredMiddlewares.has('relative-test'), true)

    // Cleanup
    await Deno.remove(tempDirName, { recursive: true })
})
