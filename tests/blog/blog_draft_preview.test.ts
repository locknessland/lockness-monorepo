/**
 * Draft-preview route tests (T022).
 *
 * Wires the *real* PostService (resolved from the container) to a fake
 * repository and a fake Environment, then drives the routes end to end. In dev
 * the draft is listed, badged, and reachable on its page; in prod it is absent
 * from the index and 404s on its URL (SC-002).
 */

import { assert, assertEquals } from '@std/assert'
import { App, CacheServiceToken, container } from '@lockness/core'
import { cache } from '@lockness/cache'
import { BlogController } from '../../app/controller/blog_controller.tsx'
import { PostRepository } from '../../app/repository/post_repository.ts'
import { Environment } from '../../app/service/environment.ts'
import { PostService } from '../../app/service/post_service.ts'
import type { Post } from '../../app/model/post.ts'

const published: Post = {
    id: 1,
    slug: 'released',
    title: 'Released Feature',
    date: new Date('2026-02-01'),
    draft: false,
    tags: null,
    bodyMd: '# Released Feature\n\nShipped.',
    createdAt: null,
    updatedAt: null,
}

const draftPost: Post = {
    id: 2,
    slug: 'sneak-peek',
    title: 'Sneak Peek',
    date: new Date('2026-03-01'),
    draft: true,
    tags: null,
    bodyMd: '# Sneak Peek\n\nComing soon.',
    createdAt: null,
    updatedAt: null,
}

/** Fake repository honouring the published/draft split, newest-first. */
function fakeRepository(): PostRepository {
    return {
        findAllPublished: () => Promise.resolve([published]),
        findAllIncludingDrafts: () => Promise.resolve([draftPost, published]),
        findPublishedBySlug: (slug: string) =>
            Promise.resolve(slug === published.slug ? published : null),
        findBySlug: (slug: string) =>
            Promise.resolve(
                slug === draftPost.slug
                    ? draftPost
                    : slug === published.slug
                    ? published
                    : null,
            ),
    } as unknown as PostRepository
}

/** Wire the real PostService to fakes for the given environment. */
async function bootApp(isProduction: boolean) {
    await cache().flush()
    container.set(CacheServiceToken, cache())
    container.set(PostRepository, fakeRepository())
    container.set(Environment, { isProduction } as Environment)
    // Force the real PostService to be re-resolved with the current fakes.
    container.set(PostService, new PostService())

    const app = new App()
    await app.init({ controllers: [BlogController] })
    return app
}

Deno.test('dev - draft is listed and badged on the index', async () => {
    const app = await bootApp(false)
    const html = await (await app.fetch(new Request('http://localhost/blog')))
        .text()

    assert(html.includes('Sneak Peek'), 'the draft must be listed in dev')
    assert(html.includes('Draft'), 'the draft must carry a Draft badge')
})

Deno.test('dev - draft is reachable on its own page', async () => {
    const app = await bootApp(false)
    const res = await app.fetch(new Request('http://localhost/blog/sneak-peek'))

    assertEquals(res.status, 200)
    const html = await res.text()
    assert(html.includes('Sneak Peek'), 'the draft page renders in dev')
    assert(html.includes('Draft'), 'the draft page shows the Draft badge')
})

Deno.test('prod - draft is absent from the index', async () => {
    const app = await bootApp(true)
    const html = await (await app.fetch(new Request('http://localhost/blog')))
        .text()

    assert(html.includes('Released Feature'), 'published posts still show')
    assert(!html.includes('Sneak Peek'), 'the draft must not appear in prod')
})

Deno.test('prod - draft 404s on its own page', async () => {
    const app = await bootApp(true)
    const res = await app.fetch(new Request('http://localhost/blog/sneak-peek'))

    assertEquals(res.status, 404)
})

// Negative case for A3: the "Draft" badge is keyed on post.draft, not on the
// environment. A published post must carry NO badge — an always-on or
// env-keyed badge bug would pass every positive test above but fail here.
Deno.test('a published post page carries no Draft badge (A3 negative)', async () => {
    const app = await bootApp(false) // even in dev, a published post is unbadged
    const res = await app.fetch(new Request('http://localhost/blog/released'))

    assertEquals(res.status, 200)
    const html = await res.text()
    assert(html.includes('Released Feature'), 'the published post renders')
    assert(!html.includes('Draft'), 'a published post must not be badged')
})

Deno.test('dev index badges only the draft, not the published post (A3 negative)', async () => {
    const app = await bootApp(false)
    const html = await (await app.fetch(new Request('http://localhost/blog')))
        .text()

    // Both posts are listed in dev; exactly one "Draft" badge — the draft's.
    assert(html.includes('Released Feature') && html.includes('Sneak Peek'))
    assertEquals(
        html.split('Draft').length - 1,
        1,
        'exactly one Draft badge — only the draft post is badged',
    )
})
