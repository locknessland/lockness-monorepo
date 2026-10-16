/**
 * @fileoverview Tests for `scripts/npm_check.ts` (#595, T017): the content,
 * closure and scope rules as pure functions, then the whole check end to end
 * on a one-package fixture workspace — real `npm pack`, `tar`, `node` and
 * `tsc` — so each rule is proven to fail the step, not just to compute.
 *
 * @module scripts/npm_check_test
 */

import { test } from 'node:test'
import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { fileURLToPath } from 'node:url'
import {
    checkNpm,
    consumerSource,
    exportSpecifiers,
    importProbe,
    listingFaults,
    packedManifestFaults,
    type Runner,
    runtimesToProve,
    scopeFaults,
    sourceFaults,
    spawnCapture,
} from './npm_check.ts'
import { stageAll } from './npm_stage.ts'

/** The repository root: TypeScript and @types/node are installed here. */
const REPO = fileURLToPath(new URL('..', import.meta.url))

test('runtimesToProve - bun and node from engines, never deno', () => {
    assertEquals(runtimesToProve({ engines: { deno: '>=2.2' } }), [])
    assertEquals(
        runtimesToProve({ engines: { node: '>=24', deno: '>=2.2', bun: '1' } }),
        ['bun', 'node'],
    )
})

test('exportSpecifiers - the root export is the name, a subpath is appended', () => {
    assertEquals(
        exportSpecifiers({
            name: '@lockness/transform',
            exports: {
                '.': {
                    'lockness-source': './mod.ts',
                    default: './dist/mod.js',
                },
                './register': {
                    'lockness-source': './register.ts',
                    default: './dist/register.js',
                },
            },
        }),
        ['@lockness/transform', '@lockness/transform/register'],
    )
})

test('scopeFaults - a scoped package with lockness.jsr entries is refused', () => {
    assertEquals(scopeFaults({ name: '@lockness/a' }), [])
    assertEquals(
        scopeFaults({ name: '@lockness/a', lockness: { jsr: {} } }),
        [],
    )
    assertEquals(
        scopeFaults({
            name: '@lockness/a',
            lockness: { jsr: { '@std/path': '^1' } },
        }),
        [
            '@lockness/a: lockness.jsr lists @std/path, but a package whose engines names bun or node has no runtime JSR import (hard rule #2)',
        ],
    )
})

/** A packed manifest that passes every content rule. */
const CLEAN = {
    name: '@lockness/a',
    version: '0.4.0',
    type: 'module',
    exports: { '.': { default: './dist/mod.js' } },
    files: ['dist'],
    dependencies: { typescript: '6.0.3' },
}

test('packedManifestFaults - a clean manifest passes', () => {
    assertEquals(packedManifestFaults('@lockness/a', CLEAN), [])
})

test('packedManifestFaults - each content rule fails on its own', () => {
    const cases: [Record<string, unknown>, string][] = [
        [{ ...CLEAN, files: undefined }, 'has no "files" allowlist'],
        [{ ...CLEAN, files: [] }, 'has no "files" allowlist'],
        [
            { ...CLEAN, scripts: { postinstall: 'node x.js' } },
            'lifecycle script(s) postinstall',
        ],
        [{ ...CLEAN, scripts: { build: 'tsc' } }, 'carries "scripts"'],
        [
            { ...CLEAN, devDependencies: { x: '1' } },
            'carries "devDependencies"',
        ],
        [{ ...CLEAN, lockness: {} }, 'carries "lockness"'],
        [
            { ...CLEAN, peerDependencies: { '@std/assert': 'jsr:1' } },
            'a jsr: specifier in the packed package.json.peerDependencies.@std/assert: jsr:1',
        ],
        [
            { ...CLEAN, dependencies: { '@jsr/std__path': '1.1.6' } },
            'dependencies declares the JSR-only package @jsr/std__path',
        ],
        [
            { ...CLEAN, dependencies: { path: 'npm:@jsr/std__path@1' } },
            'dependencies declares the JSR-only package path',
        ],
    ]
    for (const [manifest, expected] of cases) {
        const faults = packedManifestFaults('@lockness/a', manifest)
        assert(
            faults.some((f) => f.includes(expected)),
            `${JSON.stringify(manifest)} → ${JSON.stringify(faults)}`,
        )
    }
    assertEquals(packedManifestFaults('@lockness/a', []), [
        '@lockness/a: the packed package.json is not a JSON object',
    ])
})

test('listingFaults - tests, fixtures, secrets and build state are refused', () => {
    assertEquals(
        listingFaults('@lockness/a', [
            'package.json',
            'dist/mod.js',
            'dist/mod.d.ts',
            'dist/contest.js',
            'dist/latest/mod.js',
        ]),
        [],
    )
    const forbidden = [
        'tests/a.js',
        'dist/test/a.js',
        'dist/__tests__/a.js',
        'fixtures/a.json',
        'dist/router.test.js',
        'dist/router_test.mjs',
        '.env',
        'dist/.env.production',
        'certs/server.key',
        '.npmrc',
        'dist/tsconfig.tsbuildinfo',
    ]
    const faults = listingFaults('@lockness/a', forbidden)
    assertEquals(faults.length, forbidden.length, JSON.stringify(faults))
})

test('sourceFaults - JSR-only imports and leftover .ts specifiers are refused', () => {
    assertEquals(
        sourceFaults(
            '@lockness/a',
            'dist/mod.js',
            [
                "import { join } from 'node:path'",
                "import ts from 'typescript'",
                "export { a } from './a.js'",
                "export type { B } from './b.d.ts'",
                '// see @std/path in the docs',
            ].join('\n'),
        ),
        [],
    )
    assertEquals(
        sourceFaults(
            '@lockness/a',
            'dist/mod.d.ts',
            [
                "import { join } from '@std/path'",
                'const x = await import("jsr:@std/fs@1")',
                "const y = require('@jsr/std__path')",
                "export { a } from './a.ts'",
            ].join('\n'),
        ),
        [
            '@lockness/a: dist/mod.d.ts imports the JSR-only @std/path',
            '@lockness/a: dist/mod.d.ts imports the JSR-only jsr:@std/fs@1',
            '@lockness/a: dist/mod.d.ts imports the JSR-only @jsr/std__path',
            '@lockness/a: dist/mod.d.ts carries the .ts specifier ./a.ts; npm consumers need .js',
        ],
    )
})

test('importProbe and consumerSource - every export, in order', () => {
    assertEquals(
        importProbe(['@lockness/a', '@lockness/a/b']),
        'await import("@lockness/a")\nawait import("@lockness/a/b")\nconsole.log("imported 2 export(s)")\n',
    )
    assertEquals(
        consumerSource(['@lockness/a', '@lockness/a/b']),
        'import * as e0 from "@lockness/a"\nimport * as e1 from "@lockness/a/b"\nexport const all = [e0, e1]\n',
    )
})

// =============================================================================
// End to end, on a fixture workspace
// =============================================================================

/** What the fixture package is made of. */
interface FixtureOptions {
    /** `dist/mod.js`. */
    js?: string
    /** `dist/mod.d.ts`. */
    dts?: string
    /** Extra fields for `packages/p/package.json`. */
    manifest?: Record<string, unknown>
    /** A third-party package installed at the root, with its manifest. */
    thirdParty?: Record<string, unknown>
}

/**
 * A workspace with one package, `@lockness/p` (engines.node), built and
 * staged.
 *
 * @param options - What to put in it.
 * @returns The fixture root.
 */
async function fixture(options: FixtureOptions = {}): Promise<string> {
    const root = await Deno.makeTempDir({ prefix: 'lockness-npm-check-ws-' })
    const json = (value: unknown) => JSON.stringify(value, null, 4) + '\n'
    await Deno.mkdir(join(root, 'packages/p/dist'), { recursive: true })
    await Deno.writeTextFile(
        join(root, 'package.json'),
        json({ private: true, workspaces: ['packages/p'] }),
    )
    await Deno.writeTextFile(
        join(root, 'packages/p/package.json'),
        json({
            name: '@lockness/p',
            version: '0.4.0',
            license: 'MIT',
            type: 'module',
            exports: {
                '.': {
                    'lockness-source': './mod.ts',
                    default: './dist/mod.js',
                },
            },
            files: ['dist'],
            engines: { deno: '>=2.2', node: '>=22.15' },
            ...options.manifest,
        }),
    )
    await Deno.writeTextFile(
        join(root, 'packages/p/dist/mod.js'),
        options.js ?? 'export const answer = 42\n',
    )
    await Deno.writeTextFile(
        join(root, 'packages/p/dist/mod.d.ts'),
        options.dts ?? 'export declare const answer: number\n',
    )
    if (options.thirdParty !== undefined) {
        const name = options.thirdParty.name as string
        await Deno.mkdir(join(root, 'node_modules', name), { recursive: true })
        await Deno.writeTextFile(
            join(root, 'node_modules', name, 'package.json'),
            json(options.thirdParty),
        )
        await Deno.writeTextFile(
            join(root, 'node_modules', name, 'index.js'),
            'export default 1\n',
        )
    }
    await stageAll(root)
    return root
}

/**
 * Run the check on a fixture and remove it.
 *
 * @param root - The fixture root.
 * @param run - The runner; real processes by default.
 * @returns The faults.
 */
async function checked(
    root: string,
    run: Runner = spawnCapture,
): Promise<string[]> {
    try {
        return await checkNpm(root, { toolsRoot: REPO, run })
    } finally {
        await Deno.remove(root, { recursive: true })
    }
}

test('checkNpm - a clean package packs, installs, imports and type-checks', async () => {
    const faults = await checked(
        await fixture({
            manifest: { dependencies: { 'left-pad-ish': '1.0.0' } },
            thirdParty: {
                name: 'left-pad-ish',
                version: '1.0.0',
                type: 'module',
                main: 'index.js',
            },
            js: "import pad from 'left-pad-ish'\nexport const answer = 41 + pad\n",
        }),
    )
    assertEquals(faults, [])
})

test('checkNpm - a forbidden file in the tarball fails the step', async () => {
    const root = await fixture()
    await Deno.writeTextFile(join(root, '_npm/p/dist/.env'), 'SECRET=1\n')
    const faults = await checked(root)
    assertEquals(faults, [
        '@lockness/p: the tarball carries dist/.env (an .env file)',
    ])
})

test('checkNpm - stale staging fails the step, naming npm:build', async () => {
    const root = await fixture()
    await Deno.writeTextFile(
        join(root, '_npm/p/package.json'),
        JSON.stringify({ name: '@lockness/p', scripts: { postinstall: 'x' } }),
    )
    assertEquals(await checked(root), [
        '@lockness/p: _npm/p/package.json is stale; run deno task npm:build',
    ])
})

test('checkNpm - an export that throws on import fails the step', async () => {
    const faults = await checked(
        await fixture({ js: "throw new Error('boom at import')\n" }),
    )
    assertEquals(faults.length, 1, JSON.stringify(faults))
    assertStringIncludes(faults[0], 'importing @lockness/p on node failed')
    assertStringIncludes(faults[0], 'boom at import')
})

test('checkNpm - a .d.ts that does not type-check fails the step', async () => {
    const faults = await checked(
        await fixture({
            dts: "import type { Nope } from './missing.js'\nexport declare const answer: Nope\n",
        }),
    )
    assertEquals(faults.length, 1, JSON.stringify(faults))
    assertStringIncludes(
        faults[0],
        'does not type-check against the packed .d.ts',
    )
})

test('checkNpm - a JSR-only package in the installed closure fails the step', async () => {
    const faults = await checked(
        await fixture({
            manifest: { dependencies: { 'wraps-std': '1.0.0' } },
            thirdParty: {
                name: 'wraps-std',
                version: '1.0.0',
                dependencies: { '@jsr/std__path': '1.1.6' },
            },
        }),
    )
    assertEquals(faults.length, 1, JSON.stringify(faults))
    assertStringIncludes(
        faults[0],
        '@lockness/p: its dependency closure reaches the JSR-only @jsr/std__path (1.1.6)',
    )
})

test('checkNpm - a dependency missing from the frozen install fails the step', async () => {
    const faults = await checked(
        await fixture({ manifest: { dependencies: { 'not-installed': '1' } } }),
    )
    assertEquals(faults, [
        '@lockness/p: its dependency not-installed is not in the frozen install; run deno install --frozen',
    ])
})

test('checkNpm - lockness.jsr entries in a scoped package fail the step', async () => {
    const faults = await checked(
        await fixture({
            manifest: { lockness: { jsr: { '@std/path': '^1' } } },
        }),
    )
    assertEquals(faults, [
        '@lockness/p: lockness.jsr lists @std/path, but a package whose engines names bun or node has no runtime JSR import (hard rule #2)',
    ])
})

test('checkNpm - a runtime the machine lacks fails the step, naming its pin file', async () => {
    const calls: string[] = []
    const noBun: Runner = (command, args, options) => {
        calls.push(`${command} ${args.join(' ')}`)
        if (command === 'bun') {
            return Promise.resolve({
                code: null,
                stdout: '',
                stderr: 'spawn bun ENOENT',
                missing: true,
            })
        }
        return spawnCapture(command, args, options)
    }
    const faults = await checked(
        await fixture({
            manifest: {
                engines: { deno: '>=2.2', bun: '>=1.4', node: '>=24' },
            },
        }),
        noBun,
    )
    assertEquals(faults, [
        'bun is required by npm:check but is not installed: install the version pinned in .bun-version',
    ])
    // It stops there: nothing was packed, nothing skipped silently.
    assert(!calls.some((c) => c.startsWith('npm pack')), calls.join('\n'))
})

test('checkNpm - no package in scope is a pass with nothing to do', async () => {
    const root = await fixture({ manifest: { engines: { deno: '>=2.2' } } })
    assertEquals(await checked(root), [])
})
