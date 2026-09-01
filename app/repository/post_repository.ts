/**
 * @fileoverview Blog post repository — the only place blog SQL is written.
 *
 * Every query orders newest-first (`ORDER BY date DESC`) — the single home of
 * list/show order (plan §5, A2); no caller re-sorts. Two of the four methods
 * fail closed on drafts at the DB (S1); the unfiltered pair carries a
 * legible-risk name (`findAllIncludingDrafts` / `findBySlug`, A6) so a future
 * RSS/sitemap author sees the danger at the call site. `slug` is always bound
 * via `eq()` — never a raw `sql` template — so it is not injectable.
 *
 * @module @repository/post_repository
 */

import { Inject, Service } from '@lockness/core'
import { Database } from '@lockness/drizzle'
import { type Post, posts } from '@model/post.ts'
import { and, desc, eq } from 'drizzle-orm'

/**
 * Persistence for blog posts.
 *
 * Callers other than `PostService` must not use this repository directly: only
 * `PostService` may decide which set (published vs. all) is appropriate for the
 * current environment (plan §5, row 1).
 */
@Service()
export class PostRepository {
    /** Managed Drizzle database connection. */
    @Inject(Database)
    accessor database!: Database

    /**
     * All published posts, newest first.
     *
     * @returns Posts where `draft = false`, ordered by `date` descending.
     */
    async findAllPublished(): Promise<Post[]> {
        return await this.database.db
            .select()
            .from(posts)
            .where(eq(posts.draft, false))
            .orderBy(desc(posts.date))
    }

    /**
     * Every post including drafts, newest first.
     *
     * The name states the risk: this bypasses the draft filter and must only be
     * reached on the development branch of `PostService` (A6).
     *
     * @returns All posts, ordered by `date` descending.
     */
    async findAllIncludingDrafts(): Promise<Post[]> {
        return await this.database.db
            .select()
            .from(posts)
            .orderBy(desc(posts.date))
    }

    /**
     * A single published post by slug — fails closed on drafts at the DB (S1).
     *
     * @param slug - The URL slug to look up.
     * @returns The matching published post, or `null` when none matches.
     */
    async findPublishedBySlug(slug: string): Promise<Post | null> {
        const result = await this.database.db
            .select()
            .from(posts)
            .where(and(eq(posts.slug, slug), eq(posts.draft, false)))
            .orderBy(desc(posts.date))
        return result[0] ?? null
    }

    /**
     * A single post by slug, including drafts.
     *
     * Unfiltered — for the development branch of `PostService` only (A6).
     *
     * @param slug - The URL slug to look up.
     * @returns The matching post, or `null` when none matches.
     */
    async findBySlug(slug: string): Promise<Post | null> {
        const result = await this.database.db
            .select()
            .from(posts)
            .where(eq(posts.slug, slug))
            .orderBy(desc(posts.date))
        return result[0] ?? null
    }
}
