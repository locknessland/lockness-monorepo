/**
 * @fileoverview Tests for make:lang + registration — SC-006 (scaffold half, S2).
 *
 * @module @lockness/i18n/tests/cli_commands
 */

import { assert, assertEquals } from '@std/assert'
import {
    type Cli,
    handleMakeLang,
    isContained,
    registerI18nCommands,
} from '../cli_commands.ts'

Deno.test('SC-006: make:lang fr-fr scaffolds resources/lang/fr_fr.ts', async () => {
    const dir = await Deno.makeTempDir()
    const prev = Deno.cwd()
    Deno.chdir(dir)
    try {
        const path = await handleMakeLang(['fr-fr'])
        assertEquals(path, 'resources/lang/fr_fr.ts') // join normalises the leading ./
        const written = await Deno.readTextFile(
            `${dir}/resources/lang/fr_fr.ts`,
        )
        assert(written.includes('export default'))
        assert(written.includes('fr-fr'))
    } finally {
        Deno.chdir(prev)
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('S2: make:lang rejects a traversal locale and writes nothing', async () => {
    const dir = await Deno.makeTempDir()
    const prev = Deno.cwd()
    Deno.chdir(dir)
    try {
        assertEquals(await handleMakeLang(['../../etc/x']), undefined)
        assertEquals(await handleMakeLang(['fr/../../etc']), undefined)
        assertEquals(await handleMakeLang(['EN_US']), undefined) // uppercase/underscore not allowed
        // Nothing scaffolded.
        let created = false
        try {
            await Deno.stat(`${dir}/resources`)
            created = true
        } catch { /* expected: no resources dir */ }
        assert(!created)
    } finally {
        Deno.chdir(prev)
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('isContained rejects escapes and accepts children', () => {
    assert(isContained('./resources/lang', './resources/lang/fr_fr.ts'))
    assert(!isContained('./resources/lang', './resources/lang/../../etc'))
})

Deno.test('registerI18nCommands registers make:lang + i18n:extract', () => {
    const registered: string[] = []
    const cli: Cli = { register: (name) => void registered.push(name) }
    registerI18nCommands(cli)
    assert(registered.includes('make:lang'))
    assert(registered.includes('i18n:extract'))
})
