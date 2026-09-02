/**
 * Tests for the production build config and the lockness() factory (#113).
 *
 * @module @lockness/vite/tests/build
 */

import { assert, assertEquals } from '@std/assert'
import { buildConfig, buildConfigPlugin } from '../src/build_config.ts'
import { lockness } from '../src/lockness.ts'
import { DEFAULTS } from '../src/shared.ts'

Deno.test('buildConfig - enables the manifest and points at clientEntry/outDir, no SSR', () => {
    const { build } = buildConfig(DEFAULTS)
    assertEquals(build.manifest, true)
    assertEquals(build.outDir, DEFAULTS.outDir)
    assertEquals(build.emptyOutDir, false)
    assertEquals(build.rollupOptions.input, DEFAULTS.clientEntry)
    assert(!('ssr' in build), 'no SSR build artifact')
})

Deno.test('buildConfigPlugin - config() returns the build fragment', () => {
    const plugin = buildConfigPlugin({ config: { outDir: 'dist' } })
    const out =
        (plugin.config as unknown as () => { build: { outDir: string } })()
    assertEquals(out.build.outDir, 'dist')
})

Deno.test('lockness - returns the full, ordered plugin set (aggregate root)', () => {
    const plugins = lockness({ app: { fetch: () => new Response('') } })
    const names = plugins.map((p) => p.name)
    assertEquals(names, [
        'lockness:deno-resolver',
        'lockness:client-entry',
        'lockness:css',
        'lockness:dev-server-bridge',
        'lockness:hmr',
        'lockness:build-config',
    ])
})
