/**
 * @fileoverview Tests for the version bump script.
 *
 * Tests the helper functions used to update versions across
 * the Lockness monorepo.
 *
 * @module tests/bump_test
 */

import { assertEquals } from '@std/assert'
import {
    getErrorMessage,
    isLocknessImport,
    LOCKNESS_VERSION_PATTERN,
    SEMVER_PATTERN,
    updateImportVersion,
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
    const replaced = content.replace(LOCKNESS_VERSION_PATTERN, '$1@$20.2.0')
    assertEquals(replaced, 'jsr:@lockness/core@^0.2.0')
})
