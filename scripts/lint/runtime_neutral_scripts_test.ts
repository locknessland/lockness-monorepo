/**
 * Tests for the runtime-neutral script list (#596, plan 274 FR-016): every
 * entry names an existing script, the list is sorted and duplicate-free, and
 * every listed script passes `lockness-runtime/no-deno` as linted today.
 */

import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import plugin from './runtime_neutral.ts'
import { RUNTIME_NEUTRAL_SCRIPTS } from './runtime_neutral_scripts.ts'
import { REPO_ROOT } from './repo_path.ts'

test('runtime-neutral scripts - every entry is an existing script', () => {
    for (const path of RUNTIME_NEUTRAL_SCRIPTS) {
        assertEquals(/^scripts\/.+\.tsx?$/.test(path), true, path)
        assertEquals(Deno.statSync(`${REPO_ROOT}${path}`).isFile, true, path)
    }
})

test('runtime-neutral scripts - the list is sorted and has no duplicate', () => {
    const sorted = [...new Set(RUNTIME_NEUTRAL_SCRIPTS)].sort()
    assertEquals([...RUNTIME_NEUTRAL_SCRIPTS], sorted)
})

test('runtime-neutral scripts - every listed script passes the rule', () => {
    for (const path of RUNTIME_NEUTRAL_SCRIPTS) {
        const file = `${REPO_ROOT}${path}`
        const found = Deno.lint.runPlugin(
            plugin,
            file,
            Deno.readTextFileSync(file),
        ).filter((d) => d.id === 'lockness-runtime/no-deno')
        assertEquals(found.length, 0, path)
    }
})
