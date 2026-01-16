/**
 * Tests for RouteRegistry - specifically testing path building logic
 */

import { assertEquals } from '@std/assert'
import { Hono } from 'hono'
import { Controller, Get, Post } from '../decorators.ts'
import { RouteRegistry } from '../route_registry.ts'
import { namedRoutes } from '../router.ts'

// Mock middleware resolver
const mockMiddlewareResolver = {
    resolve: () => null,
}

/**
 * Helper to get registered path from RouteRegistry
 */
function getRegisteredPaths(
    registry: RouteRegistry,
    ControllerClass: new () => unknown,
): string[] {
    const hono = new Hono()
    registry.registerControllers(hono, [ControllerClass as any])
    return registry.getRoutes().map((r) => r.path)
}

// ============================================================================
// Tests for controller index routes (routePath = "/")
// ============================================================================

Deno.test('RouteRegistry - controller index route should not have trailing slash', () => {
    @Controller('/docs')
    class DocsController {
        @Get('/')
        index() {
            return 'index'
        }
    }

    const registry = new RouteRegistry(mockMiddlewareResolver)
    const paths = getRegisteredPaths(registry, DocsController)

    assertEquals(paths, ['/docs'])
})

Deno.test('RouteRegistry - root controller index should be just /', () => {
    @Controller('/')
    class HomeController {
        @Get('/')
        index() {
            return 'home'
        }
    }

    const registry = new RouteRegistry(mockMiddlewareResolver)
    const paths = getRegisteredPaths(registry, HomeController)

    assertEquals(paths, ['/'])
})

Deno.test('RouteRegistry - nested controller index should not have trailing slash', () => {
    @Controller('/api/v1/users')
    class UsersController {
        @Get('/')
        list() {
            return 'users'
        }
    }

    const registry = new RouteRegistry(mockMiddlewareResolver)
    const paths = getRegisteredPaths(registry, UsersController)

    assertEquals(paths, ['/api/v1/users'])
})

// ============================================================================
// Tests for regular routes (routePath != "/")
// ============================================================================

Deno.test('RouteRegistry - regular route paths should not have trailing slash', () => {
    @Controller('/docs')
    class DocsController {
        @Get('/installation')
        installation() {
            return 'installation'
        }

        @Get('/getting-started')
        gettingStarted() {
            return 'getting-started'
        }
    }

    const registry = new RouteRegistry(mockMiddlewareResolver)
    const paths = getRegisteredPaths(registry, DocsController)

    assertEquals(paths.sort(), ['/docs/getting-started', '/docs/installation'])
})

Deno.test('RouteRegistry - route with explicit trailing slash should keep it', () => {
    @Controller('/api')
    class ApiController {
        @Get('/users/')
        listUsers() {
            return 'users'
        }
    }

    const registry = new RouteRegistry(mockMiddlewareResolver)
    const paths = getRegisteredPaths(registry, ApiController)

    assertEquals(paths, ['/api/users/'])
})

// ============================================================================
// Tests for mixed routes in same controller
// ============================================================================

Deno.test('RouteRegistry - mixed index and regular routes', () => {
    @Controller('/docs')
    class DocsController {
        @Get('/')
        index() {
            return 'index'
        }

        @Get('/installation')
        installation() {
            return 'installation'
        }

        @Post('/submit')
        submit() {
            return 'submit'
        }
    }

    const registry = new RouteRegistry(mockMiddlewareResolver)
    const paths = getRegisteredPaths(registry, DocsController)

    assertEquals(paths.sort(), ['/docs', '/docs/installation', '/docs/submit'])
})

// ============================================================================
// Tests for named routes registration
// ============================================================================

Deno.test('RouteRegistry - named routes should be registered with correct path', () => {
    namedRoutes.clear()

    @Controller('/docs')
    class DocsController {
        @Get('/', { name: 'docs.index' })
        index() {
            return 'index'
        }

        @Get('/installation', { name: 'docs.installation' })
        installation() {
            return 'installation'
        }
    }

    const registry = new RouteRegistry(mockMiddlewareResolver)
    const hono = new Hono()
    registry.registerControllers(hono, [DocsController as any])

    assertEquals(namedRoutes.get('docs.index'), '/docs')
    assertEquals(namedRoutes.get('docs.installation'), '/docs/installation')
})

// ============================================================================
// Tests for edge cases
// ============================================================================

Deno.test('RouteRegistry - controller without leading slash', () => {
    @Controller('api')
    class ApiController {
        @Get('/')
        index() {
            return 'api'
        }

        @Get('/users')
        users() {
            return 'users'
        }
    }

    const registry = new RouteRegistry(mockMiddlewareResolver)
    const paths = getRegisteredPaths(registry, ApiController)

    assertEquals(paths.sort(), ['/api', '/api/users'])
})

Deno.test('RouteRegistry - route without leading slash', () => {
    @Controller('/api')
    class ApiController {
        @Get('users')
        users() {
            return 'users'
        }
    }

    const registry = new RouteRegistry(mockMiddlewareResolver)
    const paths = getRegisteredPaths(registry, ApiController)

    assertEquals(paths, ['/api/users'])
})

Deno.test('RouteRegistry - double slashes should be normalized', () => {
    @Controller('/api/')
    class ApiController {
        @Get('/users')
        users() {
            return 'users'
        }
    }

    const registry = new RouteRegistry(mockMiddlewareResolver)
    const paths = getRegisteredPaths(registry, ApiController)

    assertEquals(paths, ['/api/users'])
})

Deno.test('RouteRegistry - parameterized routes', () => {
    @Controller('/users')
    class UsersController {
        @Get('/')
        list() {
            return 'list'
        }

        @Get('/:id')
        show() {
            return 'show'
        }

        @Get('/:id/posts')
        posts() {
            return 'posts'
        }
    }

    const registry = new RouteRegistry(mockMiddlewareResolver)
    const paths = getRegisteredPaths(registry, UsersController)

    assertEquals(paths.sort(), ['/users', '/users/:id', '/users/:id/posts'])
})
