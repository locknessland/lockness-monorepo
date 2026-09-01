/**
 * Blog show route tests (T020).
 *
 * A known published slug renders 200 + body; an unknown slug and a draft-in-prod
 * slug both 404 identically (Q9 — no enumeration oracle); a persistence error
 * surfaces as a 500 with no stack trace in the body (FR-006/S6).
 */

import { assert, assertEquals } from '@std/assert'
import { App, CacheServiceToken, container } from '@lockness/core'
import { cache } from '@lockness/cache'
import { BlogController } from '../../app/controller/blog_controller.tsx'
import { PostService } from '../../app/service/post_service.ts'
import type { Post } from '../../app/model/post.ts'

const published: Post = {
    id: 1,
    slug: 'hello-world',
    title: 'Hello, world',
    date: new Date('2026-02-01'),
    draft: false,
    tags: null,
    bodyMd: '# Hello, world\n\nThis is the **first** post.',
    createdAt: null,
    updatedAt: null,
}

/** Register a fake PostService whose `get` runs `getImpl`. */
function useFakeGet(getImpl: (slug: string) => Promise<Post | null>) {
    container.set(CacheServiceToken, cache())
    container.set(
        PostService,
        {
            list: () => Promise.resolve([]),
            get: (slug: string) => getImpl(slug),
        } as unknown as PostService,
    )
}

async function bootApp() {
    await cache().flush()
    const app = new App()
    await app.init({ controllers: [BlogController] })
    return app
}

Deno.test('GET /blog/:slug - published slug returns 200 + rendered body', async () => {
    useFakeGet((slug) =>
        Promise.resolve(slug === published.slug ? published : null)
    )
    const app = await bootApp()

    const res = await app.fetch(
        new Request('http://localhost/blog/hello-world'),
    )
    assertEquals(res.status, 200)

    const html = await res.text()
    assert(html.includes('Hello, world'), 'the title must render')
    assert(html.includes('first'), 'the rendered markdown body must appear')
})

Deno.test('GET /blog/:slug - unknown slug returns 404', async () => {
    useFakeGet(() => Promise.resolve(null))
    const app = await bootApp()

    const res = await app.fetch(new Request('http://localhost/blog/nope'))
    assertEquals(res.status, 404)
})

Deno.test('GET /blog/:slug - a draft in prod is 404, identical to missing (Q9)', async () => {
    // The prod service path (findPublishedBySlug) yields null for a draft, so
    // the controller sees exactly what it sees for a missing post.
    useFakeGet(() => Promise.resolve(null))
    const app = await bootApp()

    const missing = await app.fetch(new Request('http://localhost/blog/nope'))
    const draftInProd = await app.fetch(
        new Request('http://localhost/blog/secret-draft'),
    )

    assertEquals(missing.status, 404)
    assertEquals(draftInProd.status, 404)
})

Deno.test('GET /blog/:slug - persistence error is a 500 with no stack trace (FR-006/S6)', async () => {
    const secret = 'connection refused at 10.0.0.5 SECRET_STACK'
    useFakeGet(() => Promise.reject(new Error(secret)))
    const app = await bootApp()

    const res = await app.fetch(
        new Request('http://localhost/blog/hello-world'),
    )
    assertEquals(res.status, 500)

    const html = await res.text()
    assert(
        !html.includes('SECRET_STACK'),
        'the error message/stack must not leak into the response body',
    )
})
