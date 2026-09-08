/**
 * @fileoverview Tests for the version bump script.
 *
 * Tests the helper functions used to update versions across
 * the Lockness monorepo.
 *
 * @module tests/bump_test
 */

import { assertEquals } from '@std/assert'
import { parse as parseJsonc } from '@std/jsonc'
import {
    getErrorMessage,
    isLocknessImport,
    LOCKNESS_VERSION_PATTERN,
    SEMVER_PATTERN,
    updateImportVersion,
    updateRootJsonc,
    VERSION_EXTRACT_PATTERN,
} from '../scripts/bump.ts'

// =============================================================================
// getErrorMessage Tests
// =============================================================================

Deno.test('getErrorMessage - extracts message from Error instance', () => {
    const error = new Error('Something went wrong')
    assertEquals(getErrorMessage(error), 'Something went wrong')
})

Deno.test('getErrorMessage - converts string to string', () => {
    assertEquals(getErrorMessage('plain string error'), 'plain string error')
})

Deno.test('getErrorMessage - converts number to string', () => {
    assertEquals(getErrorMessage(404), '404')
})

Deno.test('getErrorMessage - converts null to string', () => {
    assertEquals(getErrorMessage(null), 'null')
})

Deno.test('getErrorMessage - converts undefined to string', () => {
    assertEquals(getErrorMessage(undefined), 'undefined')
})

Deno.test('getErrorMessage - converts object to string', () => {
    assertEquals(getErrorMessage({ code: 'ERR' }), '[object Object]')
})

// =============================================================================
// isLocknessImport Tests
// =============================================================================

Deno.test('isLocknessImport - returns true for @lockness/ key', () => {
    assertEquals(
        isLocknessImport('@lockness/core', 'jsr:@lockness/core@^0.1.0'),
        true,
    )
})

Deno.test('isLocknessImport - returns true for jsr:@lockness/ value', () => {
    assertEquals(
        isLocknessImport('core', 'jsr:@lockness/core@^0.1.0'),
        true,
    )
})

Deno.test('isLocknessImport - returns false for non-Lockness import', () => {
    assertEquals(
        isLocknessImport('@std/assert', 'jsr:@std/assert@^1.0.0'),
        false,
    )
})

Deno.test('isLocknessImport - returns false for non-string value', () => {
    assertEquals(isLocknessImport('@lockness/core', null), false)
    assertEquals(isLocknessImport('@lockness/core', undefined), false)
    assertEquals(isLocknessImport('@lockness/core', 123), false)
})

Deno.test('isLocknessImport - returns false for empty strings', () => {
    assertEquals(isLocknessImport('', ''), false)
})

// =============================================================================
// updateImportVersion Tests
// =============================================================================

Deno.test('updateImportVersion - updates caret version', () => {
    const result = updateImportVersion('jsr:@lockness/core@^0.1.0', '0.2.0')
    assertEquals(result, 'jsr:@lockness/core@^0.2.0')
})

Deno.test('updateImportVersion - updates tilde version', () => {
    const result = updateImportVersion('jsr:@lockness/auth@~1.0.0', '1.1.0')
    assertEquals(result, 'jsr:@lockness/auth@~1.1.0')
})

Deno.test('updateImportVersion - preserves package path', () => {
    const result = updateImportVersion(
        'jsr:@lockness/auth-provider@^0.1.0',
        '0.3.0',
    )
    assertEquals(result, 'jsr:@lockness/auth-provider@^0.3.0')
})

Deno.test('updateImportVersion - returns null for non-matching import', () => {
    const result = updateImportVersion('jsr:@std/assert@^1.0.0', '2.0.0')
    assertEquals(result, null)
})

Deno.test('updateImportVersion - returns null for invalid format', () => {
    const result = updateImportVersion('@lockness/core', '0.2.0')
    assertEquals(result, null)
})

Deno.test('updateImportVersion - handles complex versions', () => {
    const result = updateImportVersion(
        'jsr:@lockness/container@^10.20.30',
        '11.0.0',
    )
    assertEquals(result, 'jsr:@lockness/container@^11.0.0')
})

Deno.test('updateImportVersion - preserves a subpath after the version (regression #162)', () => {
    // A specifier whose value carries a subpath export (e.g. the JSX runtime)
    // must keep that subpath after the bump. Dropping it silently rewrites
    // `@lockness/hono/jsx-runtime` to the package's base export and breaks JSX
    // resolution for consumers of `@lockness/ui`.
    assertEquals(
        updateImportVersion('jsr:@lockness/hono@^0.2.0/jsx-runtime', '0.2.1'),
        'jsr:@lockness/hono@^0.2.1/jsx-runtime',
    )
    assertEquals(
        updateImportVersion('jsr:@lockness/hono@~1.0.0/zod-validator', '1.1.0'),
        'jsr:@lockness/hono@~1.1.0/zod-validator',
    )
})

// =============================================================================
// SEMVER_PATTERN Tests
// =============================================================================

Deno.test('SEMVER_PATTERN - matches valid semver', () => {
    assertEquals(SEMVER_PATTERN.test('0.1.0'), true)
    assertEquals(SEMVER_PATTERN.test('1.0.0'), true)
    assertEquals(SEMVER_PATTERN.test('10.20.30'), true)
})

Deno.test('SEMVER_PATTERN - rejects invalid semver', () => {
    assertEquals(SEMVER_PATTERN.test('v0.1.0'), false)
    assertEquals(SEMVER_PATTERN.test('0.1'), false)
    assertEquals(SEMVER_PATTERN.test('0.1.0.0'), false)
    assertEquals(SEMVER_PATTERN.test('abc'), false)
    assertEquals(SEMVER_PATTERN.test(''), false)
})

Deno.test('SEMVER_PATTERN - rejects semver with prerelease', () => {
    assertEquals(SEMVER_PATTERN.test('0.1.0-alpha'), false)
    assertEquals(SEMVER_PATTERN.test('1.0.0-beta.1'), false)
})

// =============================================================================
// VERSION_EXTRACT_PATTERN Tests
// =============================================================================

Deno.test('VERSION_EXTRACT_PATTERN - extracts version parts', () => {
    const match = 'jsr:@lockness/core@^0.1.0'.match(VERSION_EXTRACT_PATTERN)
    assertEquals(match !== null, true)
    assertEquals(match![1], 'jsr:@lockness/core')
    assertEquals(match![2], '^')
    assertEquals(match![3], '0.1.0')
})

Deno.test('VERSION_EXTRACT_PATTERN - extracts tilde prefix', () => {
    const match = 'jsr:@lockness/auth@~1.2.3'.match(VERSION_EXTRACT_PATTERN)
    assertEquals(match !== null, true)
    assertEquals(match![2], '~')
})

Deno.test('VERSION_EXTRACT_PATTERN - does not match non-Lockness', () => {
    const match = 'jsr:@std/assert@^1.0.0'.match(VERSION_EXTRACT_PATTERN)
    assertEquals(match, null)
})

// =============================================================================
// LOCKNESS_VERSION_PATTERN Tests (global regex)
// =============================================================================

Deno.test('LOCKNESS_VERSION_PATTERN - matches multiple imports in content', () => {
    const content = `
import { App } from "jsr:@lockness/core@^0.1.0"
import { Auth } from "jsr:@lockness/auth@~0.1.0"
import { assert } from "jsr:@std/assert@^1.0.0"
`
    const matches = content.match(LOCKNESS_VERSION_PATTERN)
    assertEquals(matches?.length, 2)
})

Deno.test('LOCKNESS_VERSION_PATTERN - can be used for replacement', () => {
    const content = 'jsr:@lockness/core@^0.1.0'
    const replaced = content.replace(LOCKNESS_VERSION_PATTERN, '$1@$20.2.0$4')
    assertEquals(replaced, 'jsr:@lockness/core@^0.2.0')
})

Deno.test('LOCKNESS_VERSION_PATTERN - replacement preserves a subpath (regression #162)', () => {
    const content = 'import x from "jsr:@lockness/hono@^0.1.0/jsx-runtime"'
    const replaced = content.replace(LOCKNESS_VERSION_PATTERN, '$1@$20.2.0$4')
    assertEquals(
        replaced,
        'import x from "jsr:@lockness/hono@^0.2.0/jsx-runtime"',
    )
})

// =============================================================================
// updateRootJsonc Tests — fixture-based comment-preservation
// =============================================================================

Deno.test(
    'updateRootJsonc - preserves comments and only bumps version + @lockness/* imports',
    async () => {
        const fixtureDir = new URL(
            './fixtures/bump/',
            import.meta.url,
        ).pathname
        const input = await Deno.readTextFile(
            `${fixtureDir}deno.jsonc.input`,
        )
        const expected = await Deno.readTextFile(
            `${fixtureDir}deno.jsonc.expected`,
        )

        const result = updateRootJsonc(input, '9.9.9')

        assertEquals(
            result,
            expected,
            'Output must equal expected fixture byte-for-byte',
        )
    },
)

Deno.test(
    'updateRootJsonc - preserves comments when no imports section exists',
    async () => {
        const fixtureDir = new URL(
            './fixtures/bump/',
            import.meta.url,
        ).pathname
        const input = await Deno.readTextFile(
            `${fixtureDir}deno.jsonc.no-imports.input`,
        )
        const expected = await Deno.readTextFile(
            `${fixtureDir}deno.jsonc.no-imports.expected`,
        )

        const result = updateRootJsonc(input, '9.9.9')

        assertEquals(
            result,
            expected,
            'Output must equal expected fixture byte-for-byte (no imports)',
        )
    },
)

Deno.test('the root version is bumped in lockstep with its members', async () => {
    // The rail's break, and the reason it survived to a release attempt: `deno
    // task bump` routes to `scripts/bump-native.ts`, which delegates to `deno
    // bump-version --workspace`. That command rewrites every workspace MEMBER
    // and every cross-package specifier -- and not the root's own `version`,
    // because the workspace root is not one of its members.
    //
    // `.specnaut/scripts/release/tag.sh` reads exactly that field to name the
    // tag. Left stale, the next release computes the PREVIOUS version and is
    // stopped only by that script's refusal to clobber an existing tag. v0.2.0
    // shipped on the legacy script, which did bump the root, so nothing had
    // ever exercised this path.
    //
    // Asserted as an INVARIANT over the checked-in tree rather than by running
    // the bump: it holds after every correct bump and fails after a bump that
    // moved the members without the root, which is the whole defect.
    const rootText = await Deno.readTextFile('deno.jsonc')
    const root = parseJsonc(rootText) as {
        version: string
        workspace: string[]
    }

    const drifted: string[] = []
    for (const member of root.workspace) {
        const manifest = `${member.replace(/^\.\//, '')}/deno.json`
        let raw: string
        try {
            raw = await Deno.readTextFile(manifest)
        } catch {
            continue
        }
        const pkg = JSON.parse(raw) as { name?: string; version?: string }
        // A member with no `version` is deliberately unpublished (the
        // test-support harness). Silence is the right answer for it here; what
        // this test is about is a member that HAS a version and disagrees.
        if (pkg.version === undefined) continue
        if (pkg.version !== root.version) {
            drifted.push(`${pkg.name ?? manifest} = ${pkg.version}`)
        }
    }

    assertEquals(
        drifted,
        [],
        `deno.jsonc says ${root.version}, but these members disagree. Either ` +
            'a bump moved the members and left the root behind -- which makes ' +
            'tag.sh compute the previous tag -- or one member was bumped ' +
            'alone, which lockstep versioning does not permit.',
    )
})
