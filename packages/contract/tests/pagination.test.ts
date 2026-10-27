/**
 * @fileoverview Tests for the DB-agnostic paginator — offset + cursor envelopes,
 * the single-home clamps, request-param reading, and the UI props mapping.
 *
 * @module @lockness/contract/tests/pagination
 */

import { assertEquals } from '@std/assert'
import {
    clampPage,
    clampPerPage,
    DEFAULT_PER_PAGE,
    MAX_PER_PAGE,
    paginateCursor,
    paginateOffset,
    readPaginationParams,
    toPaginationProps,
} from '../pagination/mod.ts'

Deno.test('clampPerPage bounds to [1, max] with a default', () => {
    assertEquals(clampPerPage(1_000_000), MAX_PER_PAGE)
    assertEquals(clampPerPage(undefined), DEFAULT_PER_PAGE)
    assertEquals(clampPerPage(0), 1)
    assertEquals(clampPerPage(-5), 1)
    assertEquals(clampPerPage(20), 20)
    assertEquals(clampPerPage(NaN), DEFAULT_PER_PAGE)
    assertEquals(clampPerPage(20, 10), 10)
})

Deno.test('clampPage floors to >=1 and caps to lastPage', () => {
    assertEquals(clampPage(0), 1)
    assertEquals(clampPage(-3), 1)
    assertEquals(clampPage(undefined), 1)
    assertEquals(clampPage(9_999, 12), 12)
    assertEquals(clampPage(3, 12), 3)
    assertEquals(clampPage(5, 0), 1)
})

Deno.test('paginateOffset computes meta and relative links', () => {
    const env = paginateOffset([{ id: 16 }, { id: 17 }], {
        total: 57,
        page: 2,
        perPage: 15,
        baseUrl: '/users',
    })
    assertEquals(env.meta.strategy, 'offset')
    assertEquals(env.meta.total, 57)
    assertEquals(env.meta.perPage, 15)
    assertEquals(env.meta.currentPage, 2)
    assertEquals(env.meta.lastPage, 4)
    assertEquals(env.meta.from, 16)
    assertEquals(env.meta.to, 30)
    assertEquals(env.links.first, '/users?page=1')
    assertEquals(env.links.last, '/users?page=4')
    assertEquals(env.links.prev, '/users?page=1')
    assertEquals(env.links.next, '/users?page=3')
    assertEquals(env.links.self, '/users?page=2')
})

Deno.test('paginateOffset links are relative — a host in baseUrl is stripped', () => {
    const env = paginateOffset([], {
        total: 0,
        page: 1,
        perPage: 15,
        baseUrl: 'https://evil.example/users?q=x',
    })
    // Host never reflected; only pathname + query survive.
    assertEquals(env.links.self, '/users?q=x&page=1')
    assertEquals(env.links.prev, null)
    assertEquals(env.links.next, null)
})

Deno.test('paginateOffset on an empty set: coherent meta, null from/to', () => {
    const env = paginateOffset([], {
        total: 0,
        page: 1,
        perPage: 15,
        baseUrl: '/users',
    })
    assertEquals(env.meta.total, 0)
    assertEquals(env.meta.lastPage, 1)
    assertEquals(env.meta.from, null)
    assertEquals(env.meta.to, null)
    assertEquals(env.data, [])
})

Deno.test('paginateOffset caps an oversized page to lastPage', () => {
    const env = paginateOffset([], {
        total: 30,
        page: 1_000_000,
        perPage: 10,
        baseUrl: '/users',
    })
    assertEquals(env.meta.lastPage, 3)
    assertEquals(env.meta.currentPage, 3)
})

Deno.test('paginateCursor omits total, exposes hasMore + opaque tokens', () => {
    const env = paginateCursor([{ id: 1 }, { id: 2 }], {
        perPage: 2,
        hasMore: true,
        nextCursor: 'TOKEN_NEXT',
        prevCursor: null,
        baseUrl: '/feed',
    })
    assertEquals(env.meta.strategy, 'cursor')
    assertEquals(env.meta.perPage, 2)
    assertEquals(env.meta.hasMore, true)
    assertEquals(env.meta.nextCursor, 'TOKEN_NEXT')
    assertEquals(env.meta.prevCursor, null)
    assertEquals(env.links.next, '/feed?cursor=TOKEN_NEXT')
    assertEquals(env.links.prev, null)
    assertEquals(env.links.self, '/feed')
    // No `total` on cursor meta.
    assertEquals('total' in env.meta, false)
})

Deno.test('paginateCursor on the last page: nextCursor null, hasMore false', () => {
    const env = paginateCursor([{ id: 9 }], {
        perPage: 15,
        hasMore: false,
        nextCursor: 'IGNORED',
        prevCursor: 'PREV',
        baseUrl: '/feed',
    })
    assertEquals(env.meta.hasMore, false)
    assertEquals(env.meta.nextCursor, null)
    assertEquals(env.links.next, null)
    assertEquals(env.links.prev, '/feed?cursor=PREV')
})

Deno.test('readPaginationParams reads + bounds query params', () => {
    assertEquals(readPaginationParams({}), {
        page: 1,
        perPage: DEFAULT_PER_PAGE,
        cursor: undefined,
    })
    assertEquals(readPaginationParams({ page: '3', perPage: '25' }), {
        page: 3,
        perPage: 25,
        cursor: undefined,
    })
    assertEquals(
        readPaginationParams({ page: '0', perPage: '999999' }),
        { page: 1, perPage: MAX_PER_PAGE, cursor: undefined },
    )
    assertEquals(
        readPaginationParams(new URLSearchParams('cursor=abc')),
        { page: 1, perPage: DEFAULT_PER_PAGE, cursor: 'abc' },
    )
})

Deno.test('toPaginationProps forwards pageParam so links cannot diverge', () => {
    const env = paginateOffset([], {
        total: 30,
        page: 2,
        perPage: 10,
        baseUrl: '/users',
        pageParam: 'p',
    })
    const props = toPaginationProps(env.meta, '/users', 'p')
    assertEquals(props, {
        currentPage: 2,
        totalPages: 3,
        baseUrl: '/users',
        pageParam: 'p',
    })
})
