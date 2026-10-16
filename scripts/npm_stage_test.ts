/**
 * @fileoverview Tests for `scripts/npm_stage.ts`: what `npm:build` stages
 * under `_npm/` for each package in the npm scope (#595).
 *
 * @module scripts/npm_stage_test
 */

import { test } from 'node:test'
import { assert, assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { stageAll } from './npm_stage.ts'

/**
 * A workspace with one scoped package already "built" into dist/.
 *
 * @returns The fixture root.
 */
async function fixture(): Promise<string> {
    const root = await Deno.makeTempDir({ prefix: 'lockness-npm-stage-' })
    const json = (value: unknown) => JSON.stringify(value, null, 4) + '\n'
    await Deno.mkdir(join(root, 'packages/t/dist'), { recursive: true })
    await Deno.mkdir(join(root, 'packages/d'), { recursive: true })
    await Deno.writeTextFile(
        join(root, 'package.json'),
        json({ private: true, workspaces: ['packages/t', 'packages/d'] }),
    )
    await Deno.writeTextFile(
        join(root, 'packages/t/package.json'),
        json({
            name: '@lockness/t',
            version: '0.4.0',
            type: 'module',
            exports: {
                '.': {
                    'lockness-source': './mod.ts',
                    default: './dist/mod.js',
                },
            },
            files: ['dist'],
            engines: { deno: '>=2.2', node: '>=24' },
            devDependencies: { '@std/assert': 'jsr:1' },
            lockness: { versionModule: true },
        }),
    )
    await Deno.writeTextFile(
        join(root, 'packages/d/package.json'),
        json({ name: '@lockness/d', version: '0.4.0', files: ['dist'] }),
    )
    await Deno.writeTextFile(
        join(root, 'packages/t/dist/mod.js'),
        "export { a } from './a.js';\n",
    )
    await Deno.writeTextFile(
        join(root, 'packages/t/dist/mod.d.ts'),
        "export { a } from './a.ts';\n",
    )
    await Deno.writeTextFile(
        join(root, 'packages/t/dist/tsconfig.tsbuildinfo'),
        '{}',
    )
    await Deno.writeTextFile(join(root, 'packages/t/secret.ts'), 'x')
    return root
}

test('stageAll - the published manifest and the files entries, nothing else', async () => {
    const root = await fixture()
    try {
        // A stale package from an earlier scope is cleared.
        await Deno.mkdir(join(root, '_npm/gone'), { recursive: true })
        const lines = await stageAll(root)
        assertEquals(lines, ['@lockness/t → _npm/t (3 files)'])
        const staged: string[] = []
        for await (const entry of Deno.readDir(join(root, '_npm'))) {
            staged.push(entry.name)
        }
        assertEquals(staged, ['t'])
        const manifest = JSON.parse(
            await Deno.readTextFile(join(root, '_npm/t/package.json')),
        )
        assertEquals(manifest.exports, { '.': { default: './dist/mod.js' } })
        assert(!('devDependencies' in manifest))
        assert(!('lockness' in manifest))
        // tsc's declarations ship as emitted, .ts specifiers included.
        assertEquals(
            await Deno.readTextFile(join(root, '_npm/t/dist/mod.d.ts')),
            "export { a } from './a.ts';\n",
        )
        const dist: string[] = []
        for await (const entry of Deno.readDir(join(root, '_npm/t/dist'))) {
            dist.push(entry.name)
        }
        assertEquals(dist.sort(), ['mod.d.ts', 'mod.js'])
    } finally {
        await Deno.remove(root, { recursive: true })
    }
})

test('stageAll - an unbuilt files entry is refused, naming the build', async () => {
    const root = await fixture()
    try {
        await Deno.remove(join(root, 'packages/t/dist'), { recursive: true })
        await assertRejects(
            () => stageAll(root),
            Error,
            'run the tsc step of `deno task npm:build`',
        )
    } finally {
        await Deno.remove(root, { recursive: true })
    }
})

test('stageAll - a package with no files allowlist is refused', async () => {
    const root = await fixture()
    try {
        const path = join(root, 'packages/t/package.json')
        const manifest = JSON.parse(await Deno.readTextFile(path))
        delete manifest.files
        await Deno.writeTextFile(path, JSON.stringify(manifest))
        await assertRejects(() => stageAll(root), Error, '"files" allowlist')
    } finally {
        await Deno.remove(root, { recursive: true })
    }
})
