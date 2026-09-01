/**
 * @fileoverview Single blog post page.
 *
 * Shows the post title (from the `title` column), its rendered Markdown body
 * (via the shared `renderPostBody` helper), and a "Draft" badge whenever
 * `post.draft === true` — no environment check in the view (plan §5, A3). The
 * plain-text excerpt is passed to {@link BlogLayout} which binds it to a
 * `<meta description>` attribute (S3).
 *
 * @module @view/pages/blog/show
 */

import type { FC } from '@lockness/core'
import { Badge } from '@lockness/ui/components'
import { BlogLayout } from '@view/layouts/blog_layout.tsx'
import type { Post } from '@model/post.ts'
import { formatDate } from '@view/pages/blog/render.tsx'

/**
 * Props for {@link BlogShowPage}.
 */
export interface BlogShowPageProps {
    /** The post being displayed. */
    post: Post
    /** Rendered Markdown body (JSX tree from `renderPostBody`). */
    body: unknown
    /** Plain-text meta description excerpt (S3). */
    excerpt: string
}

/**
 * Single blog post page.
 *
 * @example
 * ```tsx
 * const body = await renderPostBody(post.bodyMd)
 * const excerpt = plaintextExcerpt(post.bodyMd)
 * return c.html(<BlogShowPage post={post} body={body} excerpt={excerpt} />)
 * ```
 */
export const BlogShowPage: FC<BlogShowPageProps> = ({
    post,
    body,
    excerpt,
}) => {
    return (
        <BlogLayout title={post.title} description={excerpt}>
            <article>
                <header class='mb-8 border-b border-border pb-6'>
                    <div class='flex items-center gap-3'>
                        <h1 class='text-3xl font-bold text-foreground'>
                            {post.title}
                        </h1>
                        {post.draft && <Badge variant='outline'>Draft</Badge>}
                    </div>
                    <time class='mt-2 block text-sm text-muted-foreground'>
                        {formatDate(post.date)}
                    </time>
                </header>

                <div class='max-w-none'>
                    {body}
                </div>

                <footer class='mt-12 border-t border-border pt-6'>
                    <a
                        href='/blog'
                        class='text-sm text-muted-foreground hover:text-primary'
                    >
                        ← Back to the blog
                    </a>
                </footer>
            </article>
        </BlogLayout>
    )
}
