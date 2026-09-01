/**
 * @fileoverview Blog index page — the list of posts.
 *
 * Renders each post as a card linking to its own page via the named route
 * `blog.post`. A "Draft" badge is shown whenever `post.draft === true`; the
 * service guarantees a draft only ever reaches this view in development, so the
 * view performs **no** environment check (plan §5, A3).
 *
 * @module @view/pages/blog/index
 */

import type { FC } from '@lockness/core'
import { route } from '@lockness/core'
import { Badge, Card, CardContent } from '@lockness/ui/components'
import { BlogLayout } from '@view/layouts/blog_layout.tsx'
import type { Post } from '@model/post.ts'
import { formatDate } from '@view/pages/blog/render.tsx'

/**
 * Props for {@link BlogIndexPage}.
 */
export interface BlogIndexPageProps {
    /** Posts to list, already ordered newest-first by the repository. */
    posts: readonly Post[]
}

/**
 * Blog index page.
 *
 * @example
 * ```tsx
 * return c.html(<BlogIndexPage posts={posts} />)
 * ```
 */
export const BlogIndexPage: FC<BlogIndexPageProps> = ({ posts }) => {
    return (
        <BlogLayout
            title='Blog'
            description='Announcements and release notes from the Lockness team.'
        >
            <header class='mb-8'>
                <h1 class='text-3xl font-bold text-foreground'>Blog</h1>
                <p class='mt-2 text-muted-foreground'>
                    Announcements and release notes from the Lockness team.
                </p>
            </header>

            {posts.length === 0
                ? (
                    <p class='text-muted-foreground'>
                        No posts have been published yet. Check back soon.
                    </p>
                )
                : (
                    <ul class='space-y-4'>
                        {posts.map((post) => (
                            <li key={post.slug}>
                                <a
                                    href={route('blog.post', {
                                        slug: post.slug,
                                    })}
                                    class='block'
                                >
                                    <Card class='transition-colors hover:border-primary/50'>
                                        <CardContent class='p-5'>
                                            <div class='flex items-center gap-3'>
                                                <h2 class='text-xl font-semibold text-foreground'>
                                                    {post.title}
                                                </h2>
                                                {post.draft && (
                                                    <Badge variant='outline'>
                                                        Draft
                                                    </Badge>
                                                )}
                                            </div>
                                            <time class='mt-1 block text-sm text-muted-foreground'>
                                                {formatDate(post.date)}
                                            </time>
                                        </CardContent>
                                    </Card>
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
        </BlogLayout>
    )
}
