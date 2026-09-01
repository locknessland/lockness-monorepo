/**
 * @fileoverview Blog controller — thin HTTP surface for `/blog`.
 *
 * Delegates all reads to {@link PostService}; it holds **no** draft/environment
 * logic (that lives only in the service, plan §5). The show route returns
 * `c.notFound()` when the service yields nothing — the single home of the
 * unknown/hidden → 404 rule (US4). It deliberately does **not** wrap the body
 * in `try/catch → notFound` (S6): a persistence error must propagate to the
 * central 500 handler with no stack trace in production (FR-006).
 *
 * @module @controller/blog_controller
 */

import { Cache, type Context, Controller, Get, Inject } from '@lockness/core'
import { PostService } from '@service/post_service.ts'
import { plaintextExcerpt, renderPostBody } from '@view/pages/blog/render.tsx'
import { BlogIndexPage } from '@view/pages/blog/index.tsx'
import { BlogShowPage } from '@view/pages/blog/show.tsx'

/**
 * HTTP controller for the SSR blog.
 */
@Controller('/blog')
export class BlogController {
    /** Application service deciding which posts are visible. */
    @Inject(PostService)
    accessor postService!: PostService

    /**
     * Blog index — lists posts (published only in production).
     *
     * @param c - The request context.
     * @returns The rendered index page.
     */
    @Get('/', { name: 'blog.index' })
    @Cache({ strategy: 'both', ttl: 3600 })
    async index(c: Context) {
        const posts = await this.postService.list()
        return c.html(<BlogIndexPage posts={posts} />)
    }

    /**
     * Single post page — 404 when the slug is unknown or hidden.
     *
     * @param c - The request context carrying the `slug` param.
     * @returns The rendered post page, or a 404 response.
     */
    @Get('/:slug', { name: 'blog.post' })
    @Cache({ strategy: 'both', ttl: 3600 })
    async show(c: Context) {
        const slug = c.req.param('slug')
        const post = await this.postService.get(slug)

        if (!post) {
            return c.notFound()
        }

        const body = await renderPostBody(post.bodyMd)
        const excerpt = plaintextExcerpt(post.bodyMd)
        return c.html(
            <BlogShowPage post={post} body={body} excerpt={excerpt} />,
        )
    }
}
