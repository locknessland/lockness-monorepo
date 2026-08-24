/**
 * Tests for the mount-pattern builder.
 *
 * These tests exist because the obvious implementation is silently wrong.
 * See the A1 finding in
 * `.specnaut/specs/001-fix-i18n-mount-ambiguity/plan.md`.
 */

import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import { codeConstraint, constrainedParam } from '../routing/mount_pattern.ts'

// --- T003: the grouping is non-negotiable (FR-002) ---

Deno.test('codeConstraint - emits a non-capturing group, never a bare alternation', () => {
    const out = codeConstraint(['en', 'fr'])

    assertEquals(out, '(?:en|fr)')
    assertStringIncludes(out, '(?:')

    // The A1 defect: an unanchored `en|fr` compiles into Hono's RegExpRouter
    // without a group boundary and mis-captures across segment content.
    assertEquals(out.startsWith('en|'), false)
})

Deno.test('codeConstraint - a single code still gets its group', () => {
    assertEquals(codeConstraint(['en']), '(?:en)')
})

Deno.test('constrainedParam - wraps the group in Hono param-constraint syntax', () => {
    assertEquals(
        constrainedParam('langId', ['en', 'fr', 'es', 'de', 'ja']),
        ':langId{(?:en|fr|es|de|ja)}',
    )
})

// --- T004: validate positively, then escape (FR-003) ---

Deno.test('codeConstraint - rejects codes carrying regex or Hono metacharacters', () => {
    for (
        const bad of [
            'a}b',
            'a}/c',
            'a|b',
            'a(b',
            'a.b',
            'a*b',
            'a\\b',
            'a/b',
            'a{b',
        ]
    ) {
        assertThrows(
            () => codeConstraint(['en', bad]),
            Error,
            'index 1',
            `expected "${bad}" to be rejected, naming its index`,
        )
    }
})

Deno.test('codeConstraint - rejects an empty code and an over-long code', () => {
    assertThrows(() => codeConstraint(['en', '']), Error, 'index 1')
    assertThrows(() => codeConstraint(['en', 'abcdefghi']), Error, 'index 1')
})

Deno.test('codeConstraint - accepts the allowlisted shape', () => {
    assertEquals(codeConstraint(['en', 'pt-BR', 'x9']), '(?:en|pt\\-BR|x9)')
})

// --- T005: bounds (FR-003b) ---

Deno.test('codeConstraint - throws on an empty list rather than emitting an empty group', () => {
    assertThrows(() => codeConstraint([]), Error, 'at least one')
})

Deno.test('codeConstraint - throws, never truncates, past the length cap', () => {
    const tooMany = Array.from({ length: 257 }, (_, i) => `c${i}`)
    assertThrows(() => codeConstraint(tooMany), Error, '256')

    // The boundary itself is legal.
    const atCap = Array.from({ length: 256 }, (_, i) => `c${i}`)
    assertStringIncludes(codeConstraint(atCap), '(?:c0|c1|')
})

Deno.test('constrainedParam - rejects a param name that is not a bare identifier', () => {
    assertThrows(() => constrainedParam('lang-Id', ['en']), Error, 'param name')
    assertThrows(() => constrainedParam('', ['en']), Error, 'param name')
})
