/**
 * @fileoverview Tests for `scripts/manifests.ts`: each package's
 * `package.json` is the source, and its `deno.json`, `tsconfig.json` and
 * own-version module are generated from it (#591, plan §5 "Package facts").
 *
 * @module tests/manifests_test
 */

import { test } from 'node:test'
import {
    assert,
    assertEquals,
    assertStringIncludes,
    assertThrows,
} from '@std/assert'
import { join } from '@std/path'
import {
    checkManifests,
    denoJsonFor,
    enginesFaults,
    lockfileFaults,
    main,
    type PackageManifest,
    planManifests,
    readWorkspaceMembers,
    tsconfigFor,
    versionModuleFor,
    writeManifests,
} from '../scripts/manifests.ts'

/** A package.json with the shape every published member carries. */
function pkg(overrides: Partial<PackageManifest> = {}): PackageManifest {
    return {
        name: '@lockness/auth',
        version: '0.4.0',
        description: 'Authentication.',
        license: 'MIT',
        type: 'module',
        exports: {
            '.': { 'lockness-source': './mod.ts', default: './dist/mod.js' },
        },
        files: ['dist'],
        engines: { deno: '>=2.2' },
        ...overrides,
    }
}

// =============================================================================
// deno.json
// =============================================================================

test('denoJsonFor - identity fields and exports come from package.json', () => {
    const deno = denoJsonFor(pkg({
        exports: {
            '.': { 'lockness-source': './mod.ts', default: './dist/mod.js' },
            './jsx': {
                'lockness-source': './view/jsx.tsx',
                default: './dist/view/jsx.js',
            },
        },
    }))
    assertEquals(deno.name, '@lockness/auth')
    assertEquals(deno.version, '0.4.0')
    assertEquals(deno.license, 'MIT')
    assertEquals(deno.description, 'Authentication.')
    assertEquals(deno.exports, { '.': './mod.ts', './jsx': './view/jsx.tsx' })
})

test('denoJsonFor - a sibling is a jsr: specifier, an npm package an npm: one', () => {
    const deno = denoJsonFor(pkg({
        dependencies: {
            '@lockness/contract': '^0.4.0',
            'zod': '^3.25.0',
            'hono': '4.11.1',
        },
    }))
    assertEquals(deno.imports, {
        '@lockness/contract': 'jsr:@lockness/contract@^0.4.0',
        'zod': 'npm:zod@^3.25.0',
        'hono': 'npm:hono@4.11.1',
    })
})

test('denoJsonFor - JSR-only packages come from lockness.jsr', () => {
    const deno = denoJsonFor(pkg({
        lockness: { jsr: { '@std/assert': '1', '@libs/markdown': '^2.1.0' } },
    }))
    assertEquals(deno.imports, {
        '@std/assert': 'jsr:@std/assert@1',
        '@libs/markdown': 'jsr:@libs/markdown@^2.1.0',
    })
})

test('denoJsonFor - a jsr: dev dependency is a jsr: import, after lockness.jsr', () => {
    // A test-only JSR package is declared where npm tooling sees it, so
    // `deno install` links it into node_modules for the Bun and Node lanes;
    // the import map keeps Deno on JSR instead of the npm.jsr.io build.
    const deno = denoJsonFor(pkg({
        dependencies: { 'zod': '^3.25.0' },
        devDependencies: {
            '@std/assert': 'jsr:1',
            '@std/testing': 'jsr:^1.0.0',
            '@lockness/testing': '^0.4.0',
        },
        lockness: {
            jsr: { '@libs/markdown': '^2.1.0' },
            imports: { '@std/testing/mock': '@std/testing/mock' },
        },
    }))
    assertEquals(deno.imports, {
        'zod': 'npm:zod@^3.25.0',
        '@libs/markdown': 'jsr:@libs/markdown@^2.1.0',
        '@std/assert': 'jsr:@std/assert@1',
        '@std/testing': 'jsr:@std/testing@^1.0.0',
        '@std/testing/mock': 'jsr:@std/testing@^1.0.0/mock',
    })
})

test('denoJsonFor - a private package declares its runtime JSR imports in dependencies', () => {
    // npm never reads a private package's manifest, so `jsr:` is safe there.
    const deno = denoJsonFor(pkg({
        name: '@lockness/testing',
        private: true,
        dependencies: { '@lockness/hono': '^0.4.0', '@std/assert': 'jsr:1' },
    }))
    assertEquals(deno.imports, {
        '@lockness/hono': 'jsr:@lockness/hono@^0.4.0',
        '@std/assert': 'jsr:@std/assert@1',
    })
})

test('denoJsonFor - a jsr: range in a published package dependencies is refused', () => {
    assertThrows(
        () => denoJsonFor(pkg({ dependencies: { '@std/assert': 'jsr:1' } })),
        Error,
        '@lockness/auth: dependencies["@std/assert"] is "jsr:1"',
    )
})

test('denoJsonFor - the aliased jsr:@scope/name@range form is refused', () => {
    assertThrows(
        () =>
            denoJsonFor(pkg({
                devDependencies: { '@std/assert': 'jsr:@std/assert@1' },
            })),
        Error,
        'devDependencies["@std/assert"] is the aliased form "jsr:@std/assert@1"',
    )
})

test('denoJsonFor - one name declared in two places is refused', () => {
    assertThrows(
        () =>
            denoJsonFor(pkg({
                devDependencies: { '@std/assert': 'jsr:1' },
                lockness: { jsr: { '@std/assert': '1' } },
            })),
        Error,
        '@std/assert is declared in both devDependencies and lockness.jsr',
    )
    assertThrows(
        () =>
            denoJsonFor(pkg({
                private: true,
                dependencies: { '@std/assert': 'jsr:1' },
                devDependencies: { '@std/assert': 'jsr:1' },
            })),
        Error,
        '@std/assert is declared in both dependencies and devDependencies',
    )
})

test('denoJsonFor - an alias or a subpath reuses the declared range', () => {
    const deno = denoJsonFor(pkg({
        dependencies: {
            '@lockness/hono': '^0.4.0',
            'hono': '4.11.1',
            'drizzle-orm': '^0.36.3',
        },
        lockness: {
            imports: {
                'hono-alias': '@lockness/hono',
                '@lockness/hono/jsx-runtime': '@lockness/hono/jsx-runtime',
                'hono/jsx-runtime': 'hono/jsx/jsx-runtime',
                'drizzle-orm/postgres-js': 'drizzle-orm/postgres-js',
            },
        },
    }))
    assertEquals(deno.imports, {
        '@lockness/hono': 'jsr:@lockness/hono@^0.4.0',
        'hono': 'npm:hono@4.11.1',
        'drizzle-orm': 'npm:drizzle-orm@^0.36.3',
        'hono-alias': 'jsr:@lockness/hono@^0.4.0',
        '@lockness/hono/jsx-runtime': 'jsr:@lockness/hono@^0.4.0/jsx-runtime',
        'hono/jsx-runtime': 'npm:hono@4.11.1/jsx/jsx-runtime',
        'drizzle-orm/postgres-js': 'npm:drizzle-orm@^0.36.3/postgres-js',
    })
})

test('denoJsonFor - an alias to an undeclared package is refused', () => {
    assertThrows(
        () =>
            denoJsonFor(pkg({
                lockness: { imports: { 'hono': '@lockness/hono' } },
            })),
        Error,
        '@lockness/hono',
    )
})

test('denoJsonFor - peers and dev dependencies are not import-map entries', () => {
    const deno = denoJsonFor(pkg({
        peerDependencies: { '@lockness/cache': '^0.4.0' },
        peerDependenciesMeta: { '@lockness/cache': { optional: true } },
        devDependencies: { '@lockness/testing': '^0.4.0' },
    }))
    assertEquals(deno.imports, undefined)
})

test('denoJsonFor - a test dependency is an import-map entry only when lockness.imports names it', () => {
    // cli's tests import @lockness/core, and cli's deno.json declares it for
    // them; at run time cli never imports core, so it is not a dependency.
    const deno = denoJsonFor(pkg({
        devDependencies: {
            '@lockness/core': '^0.4.0',
            '@lockness/testing': '^0.4.0',
        },
        lockness: { imports: { '@lockness/core': '@lockness/core' } },
    }))
    assertEquals(deno.imports, {
        '@lockness/core': 'jsr:@lockness/core@^0.4.0',
    })
})

test('denoJsonFor - the generated manifests never reach JSR', () => {
    // package.json and tsconfig.json sit beside deno.json; `deno publish`
    // uploads every file it is not told to skip, and a staged package.json
    // would make publish:check resolve the package's npm dependencies.
    assertEquals(
        denoJsonFor(pkg({ lockness: { publish: { exclude: ['tests/'] } } }))
            .publish,
        { exclude: ['tests/', 'package.json', 'tsconfig.json'] },
    )
    assertEquals(denoJsonFor(pkg()).publish, {
        exclude: ['package.json', 'tsconfig.json'],
    })
    assertEquals(
        denoJsonFor(pkg({
            lockness: { publish: { include: ['mod.ts', 'deno.json'] } },
        })).publish,
        {
            include: ['mod.ts', 'deno.json'],
            exclude: ['package.json', 'tsconfig.json'],
        },
    )
})

test('denoJsonFor - tasks, lint, JSX options and comment keys are carried over', () => {
    const deno = denoJsonFor(pkg({
        '//': 'why the npm: specifiers are allowed',
        lockness: {
            tasks: { test: 'deno test -A tests/' },
            compilerOptions: { jsx: 'precompile', jsxImportSource: 'hono' },
            lint: { rules: { exclude: ['no-explicit-any'] } },
        },
    }))
    assertEquals(deno['//'], 'why the npm: specifiers are allowed')
    assertEquals(deno.tasks, { test: 'deno test -A tests/' })
    assertEquals(deno.compilerOptions, {
        jsx: 'precompile',
        jsxImportSource: 'hono',
    })
    assertEquals(deno.lint, { rules: { exclude: ['no-explicit-any'] } })
})

test('denoJsonFor - a member with no name is an app, not a package', () => {
    // The vite demo: a workspace member `deno publish` does not consider a
    // package. It gets no identity, no exports and no publish filters.
    const deno = denoJsonFor({
        private: true,
        type: 'module',
        dependencies: { vite: '^8' },
        lockness: { tasks: { dev: 'deno run -A npm:vite' } },
    })
    assertEquals(deno, {
        tasks: { dev: 'deno run -A npm:vite' },
        imports: { vite: 'npm:vite@^8' },
    })
})

test('denoJsonFor - an export without a lockness-source entry is refused', () => {
    assertThrows(
        () =>
            denoJsonFor(pkg({
                exports: { '.': { default: './dist/mod.js' } },
            } as unknown as Partial<PackageManifest>)),
        Error,
        'lockness-source',
    )
})

// =============================================================================
// tsconfig.json
// =============================================================================

test('tsconfigFor - references every sibling dependency, in a composite build', () => {
    const tsconfig = tsconfigFor(
        pkg({
            dependencies: {
                '@lockness/contract': '^0.4.0',
                '@lockness/crypto': '^0.4.0',
                'zod': '^3.25.0',
            },
            devDependencies: { '@lockness/testing': '^0.4.0' },
            lockness: { publish: { exclude: ['tests/'] } },
        }),
        new Map([
            ['@lockness/contract', 'packages/contract'],
            ['@lockness/crypto', 'packages/crypto'],
            ['@lockness/testing', 'packages/testing'],
        ]),
        'packages/auth',
    )
    assertEquals(tsconfig.references, [
        { path: '../contract' },
        { path: '../crypto' },
    ])
    assertEquals(tsconfig.compilerOptions.composite, true)
    assertEquals(tsconfig.compilerOptions.outDir, 'dist')
    assertEquals(tsconfig.compilerOptions.rootDir, '.')
    assertEquals(tsconfig.include, ['**/*.ts', '**/*.tsx'])
    assertEquals(tsconfig.exclude, ['dist', 'node_modules', 'tests/'])
})

test('tsconfigFor - JSX packages build with the automatic runtime', () => {
    const tsconfig = tsconfigFor(
        pkg({
            lockness: {
                compilerOptions: { jsx: 'precompile', jsxImportSource: 'hono' },
            },
        }),
        new Map(),
        'packages/ui',
    )
    // `precompile` is Deno's optimisation of the automatic runtime; tsc
    // emits the same import source through `react-jsx`.
    assertEquals(tsconfig.compilerOptions.jsx, 'react-jsx')
    assertEquals(tsconfig.compilerOptions.jsxImportSource, 'hono')
})

test('tsconfigFor - a publish allowlist is the build allowlist', () => {
    const tsconfig = tsconfigFor(
        pkg({
            lockness: {
                publish: { include: ['mod.ts', 'parser.ts', 'README.md'] },
            },
        }),
        new Map(),
        'packages/markdown',
    )
    assertEquals(tsconfig.include, ['mod.ts', 'parser.ts'])
})

// =============================================================================
// Own-version module
// =============================================================================

test('versionModuleFor - only for a package that asks for one', () => {
    assertEquals(versionModuleFor(pkg()), null)
    const source = versionModuleFor(pkg({ lockness: { versionModule: true } }))
    assert(source !== null)
    assertStringIncludes(source, "export const VERSION = '0.4.0'")
    assertStringIncludes(source, '@module')
    assertStringIncludes(source, 'scripts/manifests.ts')
})

test('versionModuleFor - a package with no version cannot ask for one', () => {
    assertThrows(
        () =>
            versionModuleFor(
                pkg({ version: undefined, lockness: { versionModule: true } }),
            ),
        Error,
        'version',
    )
})

// =============================================================================
// Engines monotonic
// =============================================================================

test('enginesFaults - a runtime a dependency is not proven on is a fault', () => {
    const faults = enginesFaults([
        pkg({
            name: '@lockness/auth',
            engines: { deno: '>=2.2', bun: '>=1.4' },
            dependencies: { '@lockness/contract': '^0.4.0' },
        }),
        pkg({ name: '@lockness/contract', engines: { deno: '>=2.2' } }),
    ])
    assertEquals(faults, [
        '@lockness/auth declares engines.bun, but its dependency @lockness/contract does not',
    ])
})

test('enginesFaults - optional peers and test dependencies are edges too', () => {
    const faults = enginesFaults([
        pkg({
            name: '@lockness/core',
            engines: { deno: '>=2.2', node: '>=24' },
            peerDependencies: { '@lockness/cache': '^0.4.0' },
            peerDependenciesMeta: { '@lockness/cache': { optional: true } },
            devDependencies: { '@lockness/testing': '^0.4.0' },
        }),
        pkg({ name: '@lockness/cache', engines: { deno: '>=2.2' } }),
        pkg({ name: '@lockness/testing', engines: { deno: '>=2.2' } }),
    ])
    assertEquals(faults, [
        '@lockness/core declares engines.node, but its optional peer @lockness/cache does not',
        '@lockness/core declares engines.node, but its test dependency @lockness/testing does not',
    ])
})

test('enginesFaults - a subset of every dependency is clean; third parties are ignored', () => {
    assertEquals(
        enginesFaults([
            pkg({
                name: '@lockness/auth',
                engines: { deno: '>=2.2' },
                dependencies: {
                    '@lockness/contract': '^0.4.0',
                    'zod': '^3.25.0',
                },
            }),
            pkg({
                name: '@lockness/contract',
                engines: { deno: '>=2.2', bun: '>=1.4' },
            }),
        ]),
        [],
    )
})

test('enginesFaults - a sibling that is not a workspace member is a fault', () => {
    assertEquals(
        enginesFaults([
            pkg({ dependencies: { '@lockness/gone': '^0.4.0' } }),
        ]),
        ['@lockness/auth depends on @lockness/gone, which is not a workspace member'],
    )
})

// =============================================================================
// Lockfile
// =============================================================================

test('lockfileFaults - an @lockness/* package resolved from a registry is a fault', () => {
    const faults = lockfileFaults({
        version: '5',
        specifiers: {
            'npm:@lockness/core@0.4': '0.4.0',
            'jsr:@lockness/cli@0.4': '0.4.0',
            'npm:zod@^3.25.0': '3.25.76',
        },
        npm: { '@lockness/core@0.4.0': { integrity: 'x' } },
        jsr: { '@lockness/cli@0.4.0': { integrity: 'y' } },
    })
    assertEquals(faults, [
        'deno.lock resolves npm:@lockness/core@0.4 from a registry',
        'deno.lock resolves jsr:@lockness/cli@0.4 from a registry',
        'deno.lock carries the npm package @lockness/core@0.4.0',
        'deno.lock carries the jsr package @lockness/cli@0.4.0',
    ])
})

test('lockfileFaults - a package.json declaration of a sibling is not a resolution', () => {
    // Deno records each member's package.json dependencies under
    // workspace.members.<dir>.packageJson; those name workspace members.
    assertEquals(
        lockfileFaults({
            version: '5',
            specifiers: { 'npm:zod@^3.25.0': '3.25.76' },
            workspace: {
                members: {
                    'packages/b': {
                        dependencies: ['jsr:@lockness/a@0.4'],
                        packageJson: { dependencies: ['npm:@lockness/a@0.4'] },
                    },
                },
            },
        }),
        [],
    )
})

// =============================================================================
// Workspace: plan, write, check
// =============================================================================

/**
 * Write a two-member workspace to a temp directory.
 *
 * @returns The fixture root.
 */
async function fixture(): Promise<string> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness-manifests-' })
    await Deno.mkdir(join(dir, 'packages/a'), { recursive: true })
    await Deno.mkdir(join(dir, 'packages/b'), { recursive: true })
    const json = (value: unknown) => JSON.stringify(value, null, 4) + '\n'
    await Deno.writeTextFile(
        join(dir, 'package.json'),
        json({ private: true, workspaces: ['packages/a', 'packages/b'] }),
    )
    await Deno.writeTextFile(
        join(dir, 'packages/a/package.json'),
        json(pkg({ name: '@lockness/a', lockness: { versionModule: true } })),
    )
    await Deno.writeTextFile(
        join(dir, 'packages/b/package.json'),
        json(pkg({
            name: '@lockness/b',
            dependencies: { '@lockness/a': '^0.4.0' },
        })),
    )
    return dir
}

test('readWorkspaceMembers - the root package.json workspaces list', async () => {
    const dir = await fixture()
    try {
        assertEquals(await readWorkspaceMembers(dir), [
            'packages/a',
            'packages/b',
        ])
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

test('planManifests - one deno.json and tsconfig.json per member, a version module on request', async () => {
    const dir = await fixture()
    try {
        const paths = (await planManifests(dir)).map((f) => f.path)
        assertEquals(paths, [
            'packages/a/deno.json',
            'packages/a/tsconfig.json',
            'packages/a/version.generated.ts',
            'packages/b/deno.json',
            'packages/b/tsconfig.json',
        ])
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

test('planManifests - a dependency cycle is refused before Deno reads it', async () => {
    // Deno parses tsconfig.json references and overflows its stack on a
    // cycle; tsc refuses one too. The generator names the ring instead.
    const dir = await fixture()
    try {
        const a = join(dir, 'packages/a/package.json')
        const manifest = JSON.parse(await Deno.readTextFile(a))
        manifest.dependencies = { '@lockness/b': '^0.4.0' }
        await Deno.writeTextFile(a, JSON.stringify(manifest))
        let message = ''
        try {
            await planManifests(dir)
        } catch (error) {
            message = (error as Error).message
        }
        assertStringIncludes(
            message,
            'dependency cycle: @lockness/a → @lockness/b → @lockness/a',
        )
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

test('checkManifests - clean after a write, stale after a hand edit', async () => {
    const dir = await fixture()
    try {
        assertEquals((await checkManifests(dir)).length > 0, true)
        await writeManifests(dir)
        assertEquals(await checkManifests(dir), [])

        const manifest = join(dir, 'packages/b/deno.json')
        const edited = JSON.parse(await Deno.readTextFile(manifest))
        edited.imports['@std/assert'] = 'jsr:@std/assert@1'
        await Deno.writeTextFile(manifest, JSON.stringify(edited, null, 4))
        assertEquals(await checkManifests(dir), [
            'packages/b/deno.json is stale: edit packages/b/package.json, then run `deno task manifests`',
        ])
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

test('checkManifests - reads deno.lock when there is one', async () => {
    const dir = await fixture()
    try {
        await writeManifests(dir)
        await Deno.writeTextFile(
            join(dir, 'deno.lock'),
            JSON.stringify({
                version: '5',
                specifiers: { 'npm:@lockness/a@0.4': '0.4.0' },
            }),
        )
        assertEquals(await checkManifests(dir), [
            'deno.lock resolves npm:@lockness/a@0.4 from a registry',
        ])
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

test('checkManifests - names the exact file when a version module or tsconfig drifts', async () => {
    const dir = await fixture()
    try {
        await writeManifests(dir)
        await Deno.writeTextFile(
            join(dir, 'packages/a/version.generated.ts'),
            "export const VERSION = '0.0.1'\n",
        )
        const tsconfig = join(dir, 'packages/b/tsconfig.json')
        const edited = JSON.parse(await Deno.readTextFile(tsconfig))
        edited.references = []
        await Deno.writeTextFile(tsconfig, JSON.stringify(edited, null, 4))
        assertEquals(await checkManifests(dir), [
            'packages/a/version.generated.ts is stale: edit packages/a/package.json, then run `deno task manifests`',
            'packages/b/tsconfig.json is stale: edit packages/b/package.json, then run `deno task manifests`',
        ])
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

test('checkManifests - a runtime its dependency is not proven on is reported', async () => {
    const dir = await fixture()
    try {
        const b = join(dir, 'packages/b/package.json')
        const manifest = JSON.parse(await Deno.readTextFile(b))
        manifest.engines = { deno: '>=2.2', bun: '>=1.4' }
        await Deno.writeTextFile(b, JSON.stringify(manifest, null, 4))
        await writeManifests(dir)
        assertEquals(await checkManifests(dir), [
            '@lockness/b declares engines.bun, but its dependency @lockness/a does not',
        ])
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

test('main - 0 when written or current, 1 under --check when stale, 2 on an unknown argument', async () => {
    const dir = await fixture()
    try {
        // Nothing generated yet: --check is red, and writes nothing.
        assertEquals(await main(['--check'], dir), 1)
        assertEquals(await main([], dir), 0)
        assertEquals(await main(['--check'], dir), 0)
        assertEquals(await main(['--chek'], dir), 2)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
