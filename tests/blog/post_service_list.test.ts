/**
 * PostService.list tests (T012).
 *
 * Both branches of the draft/env rule are exercised with a fake environment and
 * a fake repository (SC-002, now testable via the injected env port, A1):
 * production lists only published posts; development includes drafts.
 */

import { assertEquals } from '@std/assert'
import { PostService } from '../../app/service/post_service.ts'
import type { PostRepository } from '../../app/repository/post_repository.ts'
import type { Environment } from '../../app/service/environment.ts'
import type { Post } from '../../app/model/post.ts'

const published: Post = {
    id: 1,
    slug: 'published',
    title: 'Published',
    date: new Date('2026-01-02'),
    draft: false,
    tags: null,
    bodyMd: '# Published',
    createdAt: null,
    updatedAt: null,
}

const draft: Post = {
    ...published,
    id: 2,
    slug: 'draft',
    title: 'Draft',
    draft: true,
}

/** Fake repository that records which method the service chose. */
function fakeRepository(): { repo: PostRepository; calls: string[] } {
    const calls: string[] = []
    const repo = {
        findAllPublished: () => {
            calls.push('findAllPublished')
            return Promise.resolve([published])
        },
        findAllIncludingDrafts: () => {
            calls.push('findAllIncludingDrafts')
            return Promise.resolve([published, draft])
        },
        findPublishedBySlug: () => Promise.resolve(null),
        findBySlug: () => Promise.resolve(null),
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

Deno.test('list - production returns published only via findAllPublished', async () => {
    const { service, calls } = makeService(true)
    const posts = await service.list()

    assertEquals(calls, ['findAllPublished'])
    assertEquals(posts.map((p) => p.slug), ['published'])
})

Deno.test('list - development includes drafts via findAllIncludingDrafts', async () => {
    const { service, calls } = makeService(false)
    const posts = await service.list()

    assertEquals(calls, ['findAllIncludingDrafts'])
    assertEquals(posts.map((p) => p.slug), ['published', 'draft'])
})
