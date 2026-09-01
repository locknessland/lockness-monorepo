/**
 * Post model schema tests (review H1).
 *
 * Covers the new public exports `slugPattern` and `insertPostSchema` — the home
 * of the Q7 lowercase-kebab slug rule. Without these, the regex shipped with no
 * behavioural coverage and a regression would be invisible until a write path
 * exists.
 */

import { assert, assertEquals } from '@std/assert'
import { insertPostSchema, slugPattern } from '../../app/model/post.ts'

const validSlugs = ['hello', 'hello-world', 'a', 'post-2', '2026-release-notes']
const invalidSlugs = [
    'Hello-World', // uppercase
    'hello_world', // underscore
    '', // empty
    '-leading', // leading hyphen
    'trailing-', // trailing hyphen
    'double--hyphen', // consecutive hyphens
    'has space', // whitespace
    'accentué', // non-ascii
]

Deno.test('slugPattern - accepts lowercase kebab-case slugs', () => {
    for (const slug of validSlugs) {
        assert(slugPattern.test(slug), `expected "${slug}" to be valid`)
    }
})

Deno.test('slugPattern - rejects non-kebab slugs', () => {
    for (const slug of invalidSlugs) {
        assert(!slugPattern.test(slug), `expected "${slug}" to be rejected`)
    }
})

Deno.test('insertPostSchema - parses a well-formed post', () => {
    const post = insertPostSchema.parse({
        slug: 'hello-world',
        title: 'Hello, world',
        bodyMd: '# Hello',
    })
    assertEquals(post.slug, 'hello-world')
    assertEquals(post.title, 'Hello, world')
})

Deno.test('insertPostSchema - rejects every invalid slug form (Q7)', () => {
    for (const slug of invalidSlugs) {
        const result = insertPostSchema.safeParse({
            slug,
            title: 'Title',
            bodyMd: 'Body',
        })
        assert(!result.success, `expected slug "${slug}" to be rejected`)
    }
})

Deno.test('insertPostSchema - requires a non-empty title and body', () => {
    assert(
        !insertPostSchema.safeParse({ slug: 'ok', title: '', bodyMd: 'x' })
            .success,
        'empty title must be rejected',
    )
    assert(
        !insertPostSchema.safeParse({ slug: 'ok', title: 'x', bodyMd: '' })
            .success,
        'empty body must be rejected',
    )
})
