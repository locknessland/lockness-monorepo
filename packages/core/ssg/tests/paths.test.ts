/**
 * `outputPathFor` — the URL→file mapping for the SSG build (#54), and its
 * path-containment guard (security S1 / plan R6).
 *
 * This is the single home for "the output path for a rendered URL". It maps a
 * route path to a clean-URL `index.html` under `dist/`, and — because a param or
 * locale segment could carry `..`, an absolute segment, or a control char — it
 * normalizes, allowlists each segment, and asserts the result stays inside the
 * resolved `dist/` root. A violation throws; nothing is written outside `dist/`.
 *
 * @module @lockness/core/ssg/tests/paths
 */

import { assertEquals, assertThrows } from '@std/assert'
import { join, resolve } from '@std/path'
import { outputPathFor } from '../paths.ts'

const DIST = resolve('dist')

Deno.test('outputPathFor - root maps to dist/index.html', () => {
    assertEquals(outputPathFor('/', DIST), join(DIST, 'index.html'))
})

Deno.test('outputPathFor - nested path maps to a directory index', () => {
    assertEquals(
        outputPathFor('/x/y', DIST),
        join(DIST, 'x', 'y', 'index.html'),
    )
})

Deno.test('outputPathFor - a locale prefix nests correctly', () => {
    assertEquals(
        outputPathFor('/en/us/docs', DIST),
        join(DIST, 'en', 'us', 'docs', 'index.html'),
    )
})

Deno.test('outputPathFor - trailing slash is ignored', () => {
    assertEquals(
        outputPathFor('/docs/', DIST),
        join(DIST, 'docs', 'index.html'),
    )
})

Deno.test('outputPathFor - rejects a .. traversal segment', () => {
    assertThrows(
        () => outputPathFor('/../etc/passwd', DIST),
        Error,
        'segment',
    )
})

Deno.test('outputPathFor - rejects an embedded .. segment', () => {
    assertThrows(() => outputPathFor('/docs/../../x', DIST), Error)
})

Deno.test('outputPathFor - rejects an absolute-looking / control-char segment', () => {
    // A NUL byte in a segment.
    assertThrows(() => outputPathFor('/do\x00cs', DIST), Error)
})

Deno.test('outputPathFor - rejects an uppercase / space / disallowed char segment', () => {
    assertThrows(() => outputPathFor('/Docs', DIST), Error)
    assertThrows(() => outputPathFor('/a b', DIST), Error)
})

Deno.test('outputPathFor - rejects a leading-dot segment (hidden/.., ., .git)', () => {
    assertThrows(() => outputPathFor('/.git/config', DIST), Error)
})

Deno.test('outputPathFor - a file-like last segment is written literally', () => {
    // A route like /docs/llms.txt must land at dist/docs/llms.txt, not
    // dist/docs/llms.txt/index.html (which no plain host serves at that URL).
    assertEquals(
        outputPathFor('/docs/llms.txt', DIST),
        join(DIST, 'docs', 'llms.txt'),
    )
    assertEquals(outputPathFor('/sitemap.xml', DIST), join(DIST, 'sitemap.xml'))
})

Deno.test('outputPathFor - allows the allowlisted characters', () => {
    // Dotted last segment → literal file (consistent with the file-like rule).
    assertEquals(outputPathFor('/a-b_c.2', DIST), join(DIST, 'a-b_c.2'))
    // Dot in a non-final segment keeps the directory-index convention.
    assertEquals(
        outputPathFor('/a.b/c', DIST),
        join(DIST, 'a.b', 'c', 'index.html'),
    )
})
