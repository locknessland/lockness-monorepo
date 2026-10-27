/**
 * PostService.get tests (T017).
 *
 * Production reads through the fail-closed query (a draft slug -> null, Q9/S1);
 * development reads through the unfiltered query (a draft slug resolves).
 */

import { assertEquals } from '@std/assert'
import { PostService } from '../../app/service/post_service.ts'
import type { PostRepository } from '../../app/repository/post_repository.ts'
import type { Environment } from '../../app/service/environment.ts'
import type { Post } from '../../app/model/post.ts'

const draft: Post = {
    id: 2,
    slug: 'secret',
    title: 'Secret draft',
    date: new Date('2026-01-01'),
    draft: true,
    tags: null,
    bodyMd: '# Secret',
    createdAt: null,
    updatedAt: null,
}

/**
 * Fake repository: the published-only query hides the draft, the unfiltered one
 * returns it — exactly the DB behaviour the service relies on.
 */
function fakeRepository(): { repo: PostRepository; calls: string[] } {
    const calls: string[] = []
    const repo = {
        findAllPublished: () => Promise.resolve([]),
        findAllIncludingDrafts: () => Promise.resolve([]),
        findPublishedBySlug: (slug: string) => {
            calls.push(`findPublishedBySlug:${slug}`)
            return Promise.resolve(null)
        },
        findBySlug: (slug: string) => {
            calls.push(`findBySlug:${slug}`)
            return Promise.resolve(slug === draft.slug ? draft : null)
        },
    } as unknown as PostRepository
    return { repo, calls }
}

function makeService(isProduction: boolean) {
    const { repo, calls } = fakeRepository()
    const service = new PostService()
    service.repository = repo
    service.environment = { isProduction } as Environment
    return { service, calls }
}

Deno.test('get - production hides a draft (null) via the fail-closed query', async () => {
    const { service, calls } = makeService(true)
    const post = await service.get('secret')

    assertEquals(post, null)
    assertEquals(calls, ['findPublishedBySlug:secret'])
})

Deno.test('get - development resolves a draft via the unfiltered query', async () => {
    const { service, calls } = makeService(false)
    const post = await service.get('secret')

    assertEquals(post?.slug, 'secret')
    assertEquals(calls, ['findBySlug:secret'])
})
