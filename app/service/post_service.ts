/**
 * @fileoverview Blog post service — the single home of the draft/environment rule.
 *
 * This is the *only* place that decides whether drafts are visible: given the
 * injected {@link Environment} signal, it asks the repository for the published
 * set in production and the full set (including drafts) in development
 * (plan §5, row 1). The environment is **received** by injection, never read
 * here (A1) — so both branches are testable with a fake env. No caller of the
 * repository other than this service may make that choice.
 *
 * @module @service/post_service
 */

import { Inject, Service } from '@lockness/core'
import { PostRepository } from '@repository/post_repository.ts'
import { Environment } from '@service/environment.ts'
import type { Post } from '@model/post.ts'

/**
 * Application service for reading blog posts.
 */
@Service()
export class PostService {
    /** Persistence for posts (the only permitted caller of the repository). */
    @Inject(PostRepository)
    accessor repository!: PostRepository

    /** Injected environment signal — received, never read from config here (A1). */
    @Inject(Environment)
    accessor environment!: Environment

    /**
     * List posts for the blog index, newest first.
     *
     * In production only published posts are returned; in development drafts are
     * included so authors can preview them (SC-002).
     *
     * @returns The posts to render on the index, ordered by the repository.
     */
    list(): Promise<Post[]> {
        return this.environment.isProduction
            ? this.repository.findAllPublished()
            : this.repository.findAllIncludingDrafts()
    }

    /**
     * Fetch a single post by slug for its own page.
     *
     * In production the query fails closed on drafts (S1), so a draft slug is
     * indistinguishable from a missing one (Q9). In development drafts resolve
     * so they can be previewed.
     *
     * @param slug - The URL slug to look up.
     * @returns The post, or `null` when nothing should be shown.
     */
    get(slug: string): Promise<Post | null> {
        return this.environment.isProduction
            ? this.repository.findPublishedBySlug(slug)
            : this.repository.findBySlug(slug)
    }
}
