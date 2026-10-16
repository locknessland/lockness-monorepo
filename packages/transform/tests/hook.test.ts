/**
 * @fileoverview The Node load hook as a function: which files it takes, the
 * cache it reads through, and the production refusal (plan 274 §5).
 *
 * The hook is called directly with a stub `nextLoad`; `register_e2e.test.ts`
 * proves the same code under a real `node --import`.
 *
 * @module @lockness/transform/tests/hook
 */

import { test } from 'node:test'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LoadFnOutput } from 'node:module'
import { pathToFileURL } from 'node:url'
import {
    assertEquals,
    assertMatch,
    assertStrictEquals,
    assertThrows,
} from '@std/assert'
import { cacheDirFor } from '../cache.ts'
import {
    assertNotProduction,
    createLoadHook,
    shouldTransform,
    TRANSFORMER_VERSION,
} from '../hook.ts'
import { VERSION } from '../version.generated.ts'
import { TYPESCRIPT_VERSION } from '../transform.ts'

/** A `nextLoad` that records its calls and answers a fixed result. */
function recordingNext() {
    const calls: string[] = []
    const result: LoadFnOutput = { format: 'builtin' }
    return {
        calls,
        result,
        next: (url: string) => {
            calls.push(url)
            return result
        },
    }
}

/** A temp app with a tsconfig.json and the given source files. */
function app(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'lockness-transform-hook-'))
    writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { target: 'es2022' } }),
    )
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(dir, name), content)
    }
    return dir
}

const CONTEXT = { conditions: [], format: undefined, importAttributes: {} }

test('the hook takes .ts and .tsx files outside node_modules, and nothing else', () => {
    assertEquals(shouldTransform('file:///app/main.ts'), true)
    assertEquals(shouldTransform('file:///app/view.tsx'), true)
    assertEquals(shouldTransform('file:///app/main.ts?v=2#x'), true)

    assertEquals(
        shouldTransform('file:///app/node_modules/pkg/index.ts'),
        false,
    )
    assertEquals(
        shouldTransform('file:///app/node_modules/.deno/pkg/mod.tsx'),
        false,
    )
    assertEquals(shouldTransform('file:///app/main.js'), false)
    assertEquals(shouldTransform('file:///app/types.d.ts'), false)
    assertEquals(shouldTransform('file:///app/main.mts'), false)
    assertEquals(shouldTransform('node:fs'), false)
    assertEquals(shouldTransform('https://example.test/mod.ts'), false)
    assertEquals(shouldTransform('data:text/javascript,export {}'), false)
})

test('the transformer version names this package and the TypeScript compiler', () => {
    assertEquals(
        TRANSFORMER_VERSION,
        `${VERSION}+typescript@${TYPESCRIPT_VERSION}`,
    )
})

test('a file the hook does not take goes to nextLoad untouched', () => {
    const { calls, next, result } = recordingNext()
    const hook = createLoadHook()
    const answer = hook('node:fs', CONTEXT, next)
    assertStrictEquals(answer, result)
    assertEquals(calls, ['node:fs'])
})

test('a .ts file is emitted as an ES module, short-circuiting nextLoad', () => {
    const dir = app({ 'main.ts': 'export const x: number = 1\n' })
    try {
        const { calls, next } = recordingNext()
        const url = pathToFileURL(join(dir, 'main.ts')).href
        const answer = createLoadHook()(url, CONTEXT, next)
        assertEquals(answer.format, 'module')
        assertEquals(answer.shortCircuit, true)
        assertMatch(String(answer.source), /^export const x = 1;/m)
        assertEquals(calls, [])
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('the hook reads through the cache beside the governing tsconfig.json', () => {
    const dir = app({ 'main.ts': 'export const x: number = 1\n' })
    try {
        const url = pathToFileURL(join(dir, 'main.ts')).href
        createLoadHook()(url, CONTEXT, recordingNext().next)

        const cacheDir = cacheDirFor(dir)
        const entries = readdirSync(cacheDir)
        assertEquals(entries.length, 1)

        // A second hook (a second process) serves the entry without emitting:
        // overwrite it and the overwritten text is what comes back.
        writeFileSync(
            join(cacheDir, entries[0]),
            'export const cached = true\n',
        )
        const again = createLoadHook()(url, CONTEXT, recordingNext().next)
        assertEquals(again.source, 'export const cached = true\n')

        // Changed source bytes miss the cache and emit afresh.
        writeFileSync(join(dir, 'main.ts'), 'export const x: number = 2\n')
        const changed = createLoadHook()(url, CONTEXT, recordingNext().next)
        assertMatch(String(changed.source), /^export const x = 2;/m)
        assertEquals(readdirSync(cacheDir).length, 2)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('a file with no governing tsconfig.json is refused, naming the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lockness-transform-hook-'))
    try {
        writeFileSync(join(dir, 'main.ts'), 'export {}\n')
        const url = pathToFileURL(join(dir, 'main.ts')).href
        const hook = createLoadHook({ findTsconfig: () => null })
        assertThrows(
            () => hook(url, CONTEXT, recordingNext().next),
            Error,
            join(dir, 'main.ts'),
        )
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('the hook refuses to run when APP_ENV is production', () => {
    for (const value of ['production', 'Production', ' production\r']) {
        assertThrows(
            () => assertNotProduction({ APP_ENV: value }),
            Error,
            'APP_ENV=production',
        )
    }
})

test('the hook runs in every other environment', () => {
    for (const value of [undefined, '', 'development', 'test', 'staging']) {
        assertNotProduction({ APP_ENV: value })
    }
    assertNotProduction({})
})
