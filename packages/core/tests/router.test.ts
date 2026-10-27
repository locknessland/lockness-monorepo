/**
 * Tests for router utility functions
 */

import { assertEquals } from '@std/assert'
import { namedRoutes, route } from '../routing/router.ts'

Deno.test('route - returns path for registered route without params', () => {
    namedRoutes.clear()
    namedRoutes.set('home', '/')

    const result = route('home')

    assertEquals(result, '/')
})

Deno.test('route - replaces single parameter', () => {
    namedRoutes.clear()
    namedRoutes.set('user.show', '/users/:id')

    const result = route('user.show', { id: 123 })

    assertEquals(result, '/users/123')
})

Deno.test('route - replaces multiple parameters', () => {
    namedRoutes.clear()
    namedRoutes.set('post.comment', '/posts/:postId/comments/:commentId')

    const result = route('post.comment', { postId: 42, commentId: 7 })

    assertEquals(result, '/posts/42/comments/7')
})

Deno.test('route - handles string parameters', () => {
    namedRoutes.clear()
    namedRoutes.set('blog.show', '/blog/:slug')

    const result = route('blog.show', { slug: 'hello-world' })

    assertEquals(result, '/blog/hello-world')
})

Deno.test('route - handles numeric parameters', () => {
    namedRoutes.clear()
    namedRoutes.set('api.user', '/api/users/:id')

    const result = route('api.user', { id: 999 })

    assertEquals(result, '/api/users/999')
})

Deno.test('route - throws error for non-existent route', () => {
    namedRoutes.clear()

    let error: Error | undefined
    try {
        route('non.existent')
    } catch (e) {
        error = e as Error
    }

    assertEquals(
        error?.message,
        'Route "non.existent" not found in registered routes',
    )
})

Deno.test('route - returns route path without params when no params provided', () => {
    namedRoutes.clear()
    namedRoutes.set('user.list', '/users')

    const result = route('user.list')

    assertEquals(result, '/users')
})

Deno.test('route - handles routes with query-like params in path', () => {
    namedRoutes.clear()
    namedRoutes.set('search', '/search/:query/page/:page')

    const result = route('search', { query: 'deno', page: 2 })

    assertEquals(result, '/search/deno/page/2')
})

Deno.test('route - only replaces matching parameter names', () => {
    namedRoutes.clear()
    namedRoutes.set('nested', '/users/:userId/posts/:postId')

    const result = route('nested', { userId: 5, postId: 10 })

    assertEquals(result, '/users/5/posts/10')
})

Deno.test('route - leaves unmatched parameters in path', () => {
    namedRoutes.clear()
    namedRoutes.set('partial', '/users/:id/profile')

    const result = route('partial', { id: 123, extra: 'ignored' })

    assertEquals(result, '/users/123/profile')
})

Deno.test('route - handles empty params object', () => {
    namedRoutes.clear()
    namedRoutes.set('about', '/about')

    const result = route('about', {})

    assertEquals(result, '/about')
})

Deno.test('namedRoutes - can be cleared and reused', () => {
    namedRoutes.clear()
    namedRoutes.set('test1', '/path1')

    assertEquals(namedRoutes.get('test1'), '/path1')

    namedRoutes.clear()

    assertEquals(namedRoutes.get('test1'), undefined)
})

Deno.test('namedRoutes - can store multiple routes', () => {
    namedRoutes.clear()
    namedRoutes.set('home', '/')
    namedRoutes.set('about', '/about')
    namedRoutes.set('contact', '/contact')

    assertEquals(namedRoutes.size, 3)
    assertEquals(namedRoutes.get('home'), '/')
    assertEquals(namedRoutes.get('about'), '/about')
    assertEquals(namedRoutes.get('contact'), '/contact')
})

Deno.test('route - handles consecutive parameters', () => {
    namedRoutes.clear()
    namedRoutes.set('api.nested', '/api/:version/:resource/:id')

    const result = route('api.nested', {
        version: 'v1',
        resource: 'users',
        id: 42,
    })

    assertEquals(result, '/api/v1/users/42')
})

Deno.test('route - converts number zero to string', () => {
    namedRoutes.clear()
    namedRoutes.set('item', '/items/:id')

    const result = route('item', { id: 0 })

    assertEquals(result, '/items/0')
})
