/**
 * Blog index route tests (T015).
 *
 * Boots a real App with the BlogController and a fake PostService registered in
 * the container. Asserts `/blog` returns 200 and lists posts in the order the
 * service yields them, and that an empty result renders an empty state (not an
 * error).
 */

import { assert, assertEquals } from '@std/assert'
import { App, CacheServiceToken, container } from '@lockness/core'
import { cache } from '@lockness/cache'
import { BlogController } from '../../app/controller/blog_controller.tsx'
import { PostService } from '../../app/service/post_service.ts'
import type { Post } from '../../app/model/post.ts'

function post(slug: string, title: string, date: string, draft = false): Post {
    return {
        id: slug.length,
        slug,
        title,
        date: new Date(date),
        draft,
        tags: null,
        bodyMd: `# ${title}\n\nBody of ${title}.`,
        createdAt: null,
        updatedAt: null,
    }
}

/** Register a fake PostService returning `posts` from `list()`. */
function useFakeService(posts: Post[]) {
    container.set(CacheServiceToken, cache())
    container.set(
        PostService,
        {
            list: () => Promise.resolve(posts),
            get: () => Promise.resolve(null),
        } as unknown as PostService,
    )
}

async function bootApp() {
    // The @Cache store is a process-global singleton keyed by URL; flush it so
    // one test's cached /blog response cannot bleed into the next.
    await cache().flush()
    const app = new App()
    await app.init({ controllers: [BlogController] })
    return app
}

Deno.test('GET /blog - 200 and lists posts newest-first', async () => {
    useFakeService([
        post('newest', 'Newest', '2026-03-01'),
        post('older', 'Older', '2026-01-01'),
    ])
    const app = await bootApp()

    const res = await app.fetch(new Request('http://localhost/blog'))
    assertEquals(res.status, 200)

    const html = await res.text()
    assert(html.includes('Newest'), 'the newest post must be listed')
    assert(html.includes('Older'), 'the older post must be listed')
    assert(
        html.indexOf('Newest') < html.indexOf('Older'),
        'posts must appear in the order the service yields them',
    )
    assert(html.includes('/blog/newest'), 'each post links to its own page')
})

Deno.test('GET /blog - empty result renders an empty state, not an error', async () => {
    useFakeService([])
    const app = await bootApp()

    const res = await app.fetch(new Request('http://localhost/blog'))
    assertEquals(res.status, 200)

    const html = await res.text()
    assert(
        html.includes('No posts'),
        'the empty state message must be shown',
    )
})
