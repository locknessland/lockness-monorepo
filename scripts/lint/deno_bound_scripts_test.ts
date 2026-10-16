/**
 * Tests for the Deno-bound script baseline (#596, plan 274 FR-016): it is
 * sorted and duplicate-free, and it only shrinks — every entry still exists
 * and still fails the `lockness-runtime` lint without its exemption, so a
 * migrated or deleted script must leave the list.
 */

import { after, test } from 'node:test'
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertEquals } from '@std/assert'
import { createRuntimeNeutralPlugin } from './runtime_neutral.ts'
import { DENO_BOUND_SCRIPTS } from './deno_bound_scripts.ts'
import { REPO_ROOT } from './repo_path.ts'

/**
 * The baseline entries that should leave: a file that no longer exists, or
 * one that passes both rules once its own exemption is removed.
 */
function staleEntries(root: string, baseline: readonly string[]): string[] {
    return baseline.filter((entry) => {
        const file = `${root}${entry}`
        if (!existsSync(file)) return true
        const plugin = createRuntimeNeutralPlugin({
            root,
            denoBound: baseline.filter((other) => other !== entry),
        })
        return !Deno.lint.runPlugin(plugin, file, readFileSync(file, 'utf8'))
            .some((d) => d.id.startsWith('lockness-runtime/'))
    })
}

test('deno-bound scripts - the list is sorted, unique scripts', () => {
    for (const path of DENO_BOUND_SCRIPTS) {
        assertEquals(/^scripts\/.+\.tsx?$/.test(path), true, path)
    }
    const sorted = [...new Set(DENO_BOUND_SCRIPTS)].sort()
    assertEquals([...DENO_BOUND_SCRIPTS], sorted)
})

test('deno-bound scripts - every entry exists and still needs its exemption', () => {
    assertEquals(staleEntries(REPO_ROOT, DENO_BOUND_SCRIPTS), [])
})

/** A fixture repository for the shrink check itself. */
const FIXTURE = mkdtempSync(join(tmpdir(), 'deno-bound-'))
    .replaceAll('\\', '/') + '/'
after(() => rmSync(FIXTURE, { recursive: true, force: true }))

test('deno-bound scripts - a complying or missing entry is reported stale', () => {
    mkdirSync(`${FIXTURE}scripts`, { recursive: true })
    writeFileSync(`${FIXTURE}deno.jsonc`, '{ "lint": { "plugins": [] } }')
    writeFileSync(`${FIXTURE}scripts/bound.ts`, 'Deno.exit(0)\n')
    writeFileSync(`${FIXTURE}scripts/importer.ts`, "import './bound.ts'\n")
    writeFileSync(`${FIXTURE}scripts/migrated.ts`, 'process.exitCode = 0\n')
    const baseline = [
        'scripts/bound.ts',
        'scripts/gone.ts',
        'scripts/importer.ts',
        'scripts/migrated.ts',
    ]
    // importer.ts stays: it fails neutral-imports while bound.ts is listed.
    assertEquals(staleEntries(FIXTURE, baseline), [
        'scripts/gone.ts',
        'scripts/migrated.ts',
    ])
})
