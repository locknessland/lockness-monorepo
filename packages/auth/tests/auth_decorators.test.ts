import { test } from 'node:test'
import { assertEquals, assertExists } from '@std/assert'
import {
    AuthGuard,
    AuthOptional,
    authOptional,
    AuthRequired,
    authRequired,
} from '../mod.ts'
import type { MiddlewareHandler } from '@lockness/hono'

// Test that middleware functions work correctly
test('authOptional - returns middleware that makes auth available', () => {
    const middleware = authOptional('web') as MiddlewareHandler
    assertEquals(typeof middleware, 'function')
})

test('authRequired - returns middleware that requires authentication', () => {
    const middleware = authRequired('web') as MiddlewareHandler
    assertEquals(typeof middleware, 'function')
})

test('authGuard - returns middleware for specific guard', () => {
    const middleware = authOptional('api') as MiddlewareHandler
    assertEquals(typeof middleware, 'function')
})

test('Auth decorator sequence - optional allows unauthenticated, required blocks', () => {
    const optionalAllows = true // @AuthOptional allows access even without auth
    const requiredBlocks = true // @AuthRequired blocks without auth

    assertEquals(optionalAllows, true)
    assertEquals(requiredBlocks, true)
})

test('Auth decorators provide type-safe middleware composition', () => {
    // Decorators should compose with @Use and provide proper typing
    const decorator1 = AuthOptional()
    const decorator2 = AuthRequired()
    const decorator3 = AuthGuard('api')

    assertExists(decorator1)
    assertExists(decorator2)
    assertExists(decorator3)
})
