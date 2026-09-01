import { Database } from '@lockness/drizzle'
import { container } from '@lockness/core'
import { insertPostSchema, type NewPost, posts } from '@model/post.ts'

/**
 * Seeds sample blog posts (Q6) so the blog is demonstrable without a write UI.
 *
 * Ships two published posts and one draft; the draft is visible only in
 * development, which exercises the draft/preview path end to end.
 */
export class PostSeeder {
    private database: Database

    constructor() {
        this.database = container.get<Database>(Database)
    }

    /**
     * Insert the sample posts, skipping any whose slug already exists.
     */
    async run(): Promise<void> {
        console.log('🌱 Running PostSeeder...')

        const samples: NewPost[] = [
            {
                slug: 'introducing-lockness',
                title: 'Introducing Lockness',
                date: new Date('2026-01-15T09:00:00Z'),
                draft: false,
                tags: ['announcement'],
                bodyMd: [
                    '# Introducing Lockness',
                    '',
                    'Lockness is a fullstack **MVC framework** for Deno that pairs',
                    "Laravel's ergonomics with HonoJS speed.",
                    '',
                    '- Class-based controllers and decorators',
                    '- Dependency injection out of the box',
                    '- Native JSX server rendering',
                    '',
                    'Read the [docs](/docs) to get started.',
                ].join('\n'),
            },
            {
                slug: 'release-notes-0-2-0',
                title: 'Release Notes: 0.2.0',
                date: new Date('2026-02-10T09:00:00Z'),
                draft: false,
                tags: ['release', 'changelog'],
                bodyMd: [
                    '# Release Notes: 0.2.0',
                    '',
                    'This release focuses on the developer experience.',
                    '',
                    '## Highlights',
                    '',
                    '1. Faster route discovery',
                    '2. Improved caching decorators',
                    '3. A brand new blog module (you are reading it)',
                ].join('\n'),
            },
            {
                slug: 'whats-next',
                title: "What's Next",
                date: new Date('2026-03-01T09:00:00Z'),
                draft: true,
                tags: ['roadmap'],
                bodyMd: [
                    "# What's Next",
                    '',
                    'A sneak peek at the roadmap. This post is a **draft** — it is',
                    'visible in development only, so you can preview it before',
                    'publishing.',
                ].join('\n'),
            },
        ]

        // Validate the seed data against the same slug/shape rule the app
        // enforces (Q7) before it reaches the database — fails loudly on a
        // malformed sample rather than persisting it.
        for (const sample of samples) insertPostSchema.parse(sample)

        await this.database.db
            .insert(posts)
            .values(samples)
            .onConflictDoNothing()

        console.log('✅ PostSeeder completed')
    }
}
