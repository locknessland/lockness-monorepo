/**
 * Blog render-helper tests (T009).
 *
 * Asserts the shared Markdown pipeline drops executable content (S-affirmed
 * allowlist) and that the meta excerpt is plain, markup-free text (S3).
 */

import { assert, assertEquals } from '@std/assert'
import {
    plaintextExcerpt,
    renderPostBody,
} from '../../app/view/pages/blog/render.tsx'

/** Render a JSX node produced by the markdown pipeline to an HTML string. */
async function toHtml(node: unknown): Promise<string> {
    const result = (node as { toString(): unknown }).toString()
    const resolved = result instanceof Promise ? await result : result
    return String(resolved)
}

Deno.test('renderPostBody - drops <script> from the output (allowlist)', async () => {
    const html = await toHtml(
        await renderPostBody('Hello\n\n<script>alert(1)</script>'),
    )
    assert(!html.includes('<script'), 'no <script> tag may survive')
})

Deno.test('renderPostBody - drops onerror handler attributes (allowlist)', async () => {
    const html = await toHtml(
        await renderPostBody('<img src=x onerror="alert(2)">'),
    )
    assert(!html.includes('onerror'), 'no onerror handler may survive')
})

Deno.test('plaintextExcerpt - strips markdown to plain text (S3)', () => {
    const excerpt = plaintextExcerpt('# Title\n\nHello **world** and `code`.')
    assertEquals(excerpt, 'Hello world and code.')
})

Deno.test('plaintextExcerpt - strips HTML tags so the meta is not markup (S3)', () => {
    const excerpt = plaintextExcerpt('<b>bold</b> visible text')
    assert(!excerpt.includes('<'), 'excerpt must contain no angle brackets')
    assert(!excerpt.includes('>'), 'excerpt must contain no angle brackets')
    assertEquals(excerpt, 'bold visible text')
})

Deno.test('plaintextExcerpt - truncates long bodies with an ellipsis', () => {
    const excerpt = plaintextExcerpt('word '.repeat(100), 20)
    assert(excerpt.length <= 21, 'truncated to the cap plus the ellipsis')
    assert(excerpt.endsWith('…'), 'a truncated excerpt ends with an ellipsis')
})

Deno.test('plaintextExcerpt - keeps link text, drops the URL', () => {
    const excerpt = plaintextExcerpt(
        'See [the docs](https://example.com/path).',
    )
    assertEquals(excerpt, 'See the docs.')
})
