/**
 * Tests for defineViteConfig() and DEFAULTS (#107).
 *
 * @module @lockness/vite/tests/define_config
 */

import { assertEquals, assertNotStrictEquals } from '@std/assert'
import { defineViteConfig } from '../src/define_config.ts'
import { DEFAULTS } from '../src/shared.ts'

Deno.test('defineViteConfig - no args returns all DEFAULTS', () => {
    assertEquals(defineViteConfig(), DEFAULTS)
})

Deno.test('defineViteConfig - a partial config overrides only the provided keys', () => {
    const result = defineViteConfig({ port: 3000, outDir: 'dist' })
    assertEquals(result.port, 3000)
    assertEquals(result.outDir, 'dist')
    // Every other key stays at its DEFAULTS value.
    assertEquals(result.serverEntry, DEFAULTS.serverEntry)
    assertEquals(result.clientEntry, DEFAULTS.clientEntry)
    assertEquals(result.manifestPath, DEFAULTS.manifestPath)
    assertEquals(result.devServerUrl, DEFAULTS.devServerUrl)
    assertEquals(result.cssInput, DEFAULTS.cssInput)
    assertEquals(result.routeDir, DEFAULTS.routeDir)
})

Deno.test('defineViteConfig - does not mutate DEFAULTS', () => {
    const before = { ...DEFAULTS }
    const result = defineViteConfig({ port: 9999 })
    assertNotStrictEquals(result, DEFAULTS)
    assertEquals(DEFAULTS, before)
})

Deno.test('DEFAULTS - manifestPath sits under outDir', () => {
    // The manifest lives inside the asset output tree (plan invariant).
    assertEquals(DEFAULTS.manifestPath.startsWith(DEFAULTS.outDir + '/'), true)
})

Deno.test('defineViteConfig - explicit undefined keeps the default (Required<> intact)', () => {
    const result = defineViteConfig({ port: undefined, outDir: undefined })
    assertEquals(result.port, DEFAULTS.port)
    assertEquals(result.outDir, DEFAULTS.outDir)
})
