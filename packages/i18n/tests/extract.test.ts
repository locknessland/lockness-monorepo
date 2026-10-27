/**
 * @fileoverview Tests for translation-key extraction — SC-006 (extract half).
 *
 * @module @lockness/i18n/tests/extract
 */

import { assert, assertEquals } from '@std/assert'
import { join } from '@std/path'
import { diffKeys, extractKeys, hasDynamicKeys, walkKeys } from '../extract.ts'

Deno.test('extractKeys finds t()/trans() string-literal keys', () => {
    const src = `
        const a = t('auth.failed')
        const b = trans("cart.items", { count })
        const c = t('greet')
    `
    assertEquals([...extractKeys(src)].sort(), [
        'auth.failed',
        'cart.items',
        'greet',
    ])
})

Deno.test('hasDynamicKeys flags a non-literal key, never guesses it', () => {
    assert(hasDynamicKeys('t(key)'))
    assert(hasDynamicKeys('trans(`x`)'))
    assert(!hasDynamicKeys("t('static.key')"))
})

Deno.test('diffKeys reports missing (used not in catalog) and unused (in catalog not used)', () => {
    const used = new Set(['a', 'b', 'c'])
    const catalog = new Set(['b', 'c', 'd'])
    assertEquals(diffKeys(used, catalog), { missing: ['a'], unused: ['d'] })
})

Deno.test('SC-006: walkKeys scans .ts/.tsx under a bounded root', async () => {
    const dir = await Deno.makeTempDir()
    try {
        await Deno.mkdir(join(dir, 'sub'))
        await Deno.writeTextFile(
            join(dir, 'a.ts'),
            "export const x = t('home.title')",
        )
        await Deno.writeTextFile(
            join(dir, 'sub', 'b.tsx'),
            "const y = trans('home.subtitle')",
        )
        await Deno.writeTextFile(join(dir, 'note.md'), "t('ignored.md')")

        const keys = await walkKeys(dir)
        assertEquals([...keys].sort(), ['home.subtitle', 'home.title'])
        assert(!keys.has('ignored.md')) // non-source files skipped
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
