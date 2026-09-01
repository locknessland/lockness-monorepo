/**
 * @fileoverview Blog post model — Drizzle table, Zod schemas and inferred types.
 *
 * The `posts` table backs the SSR blog (`/blog` and `/blog/{slug}`). `slug` is
 * the unique natural key exposed in URLs; the surrogate `id` is never surfaced.
 * The `draft` flag is the single input to the "hidden in production" rule, which
 * is applied by {@link app/service/post_service.ts | PostService}, never here.
 *
 * @module @model/post
 */

import { boolean, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { z } from '@lockness/validator'

/**
 * The `posts` table.
 *
 * `slug` carries the DB-level uniqueness constraint (the single home of slug
 * uniqueness — plan §5). `draft` defaults to `true` so nothing is published by
 * accident (Q5). `date` is the publication timestamp used for ordering (Q4);
 * `created_at`/`updated_at` are audit columns.
 */
export const posts = pgTable('posts', {
    /** Surrogate primary key — never exposed in URLs. */
    id: serial('id').primaryKey(),
    /** URL-safe unique natural key (lowercase kebab-case). */
    slug: text('slug').notNull().unique(),
    /** Human-readable post title. */
    title: text('title').notNull(),
    /** Publication timestamp — list/show order is newest-first on this column. */
    date: timestamp('date').notNull(),
    /** Draft flag — a draft is never served in production. */
    draft: boolean('draft').notNull().default(true),
    /** Free-form labels; stored but not surfaced in v1 (Q3). */
    tags: text('tags').array(),
    /** Markdown source, rendered through the shared pipeline only. */
    bodyMd: text('body_md').notNull(),
    /** Row creation timestamp (audit). */
    createdAt: timestamp('created_at').defaultNow(),
    /** Row update timestamp (audit). */
    updatedAt: timestamp('updated_at').defaultNow(),
})

/**
 * Slug pattern: lowercase alphanumeric words separated by single hyphens (Q7).
 *
 * @example
 * ```ts
 * slugPattern.test('hello-world')  // true
 * slugPattern.test('Hello_World')  // false
 * ```
 */
export const slugPattern: RegExp = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Validation schema for inserting a post.
 *
 * Enforces a lowercase-kebab `slug` (Q7) and a non-empty `title`/`bodyMd`.
 * `draft`, `tags`, `date` and the audit timestamps are optional at the
 * application layer (the DB supplies defaults for `draft` and the timestamps).
 *
 * @example
 * ```ts
 * insertPostSchema.parse({
 *   slug: 'hello-world',
 *   title: 'Hello, world',
 *   bodyMd: '# Hello',
 * })
 * ```
 */
export const insertPostSchema = z.object({
    slug: z
        .string()
        .min(1, 'Slug is required')
        .regex(slugPattern, 'Slug must be lowercase kebab-case'),
    title: z.string().min(1, 'Title is required'),
    date: z.date().optional(),
    draft: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    bodyMd: z.string().min(1, 'Body is required'),
})

/** A persisted blog post row. */
export type Post = typeof posts.$inferSelect

/** A blog post ready to be inserted. */
export type NewPost = typeof posts.$inferInsert
