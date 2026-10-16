/**
 * @fileoverview Invocation for runtime R (plan 274 §5, audits A6 and S12):
 * the argv that runs a script or an npm bin on Deno, Bun or Node, with no
 * shell, the bin as its JS entry under the runtime's executable, and only
 * allowlisted Node flags carried from the parent.
 *
 * The host process is injected, so every runtime's argv is checked on every
 * lane; one row spawns the current runtime for real.
 *
 * @module @lockness/runtime/tests/process
 */

import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertEquals, assertRejects, assertThrows } from '@std/assert'
import {
    binInvocation,
    BinResolutionError,
    carriedExecArgv,
    type HostProcess,
    resolveBinEntry,
    scriptInvocation,
    TRANSFORM_HOOK,
} from '../process.ts'

const DENO_HOST: HostProcess = {
    runtime: 'deno',
    execPath: '/opt/deno',
    execArgv: [],
}
const BUN_HOST: HostProcess = {
    runtime: 'bun',
    execPath: '/opt/bun',
    execArgv: ['--conditions=x'],
}
const NODE_HOST: HostProcess = {
    runtime: 'node',
    execPath: '/opt/node',
    execArgv: [
        '--inspect-brk',
        '--enable-source-maps',
        '--conditions=lockness-source',
        '--max-old-space-size=4096',
    ],
}

test('TRANSFORM_HOOK - names the transform package register entry', () => {
    assertEquals(TRANSFORM_HOOK, '@lockness/transform/register')
})

// ---- carriedExecArgv: the allowlist -----------------------------------------

test('carriedExecArgv - keeps --enable-source-maps', () => {
    assertEquals(carriedExecArgv(['--enable-source-maps']), [
        '--enable-source-maps',
    ])
})

test('carriedExecArgv - keeps --conditions in every spelling, normalised', () => {
    assertEquals(
        carriedExecArgv([
            '--conditions=a',
            '--conditions',
            'b',
            '-C',
            'c',
            '-C=d',
        ]),
        [
            '--conditions=a',
            '--conditions=b',
            '--conditions=c',
            '--conditions=d',
        ],
    )
})

test('carriedExecArgv - keeps --import of the transform hook only', () => {
    assertEquals(
        carriedExecArgv([
            `--import=${TRANSFORM_HOOK}`,
            '--import',
            TRANSFORM_HOOK,
            '--import=./evil.mjs',
            '--import',
            'data:text/javascript,1',
        ]),
        [`--import=${TRANSFORM_HOOK}`, `--import=${TRANSFORM_HOOK}`],
    )
})

test('carriedExecArgv - strips every --inspect flag', () => {
    assertEquals(
        carriedExecArgv([
            '--inspect',
            '--inspect=0.0.0.0:9229',
            '--inspect-brk',
            '--inspect-wait',
            '--inspect-port',
            '9230',
            '--inspect-port=9231',
            '--inspect-publish-uid=http',
        ]),
        [],
    )
})

test('carriedExecArgv - drops anything not allowlisted, values included', () => {
    assertEquals(
        carriedExecArgv([
            '--require',
            './preload.cjs',
            '--loader=./l.mjs',
            '--max-old-space-size=4096',
            '--eval',
            'process.exit(3)',
            '--experimental-strip-types',
        ]),
        [],
    )
})

test('carriedExecArgv - a flag value is consumed, never read as a flag', () => {
    assertEquals(carriedExecArgv(['--import', '--enable-source-maps']), [])
})

test('carriedExecArgv - a trailing value-taking flag with no value is dropped', () => {
    assertEquals(carriedExecArgv(['--conditions']), [])
    assertEquals(carriedExecArgv(['--import']), [])
})

// ---- scriptInvocation ------------------------------------------------------

test('scriptInvocation - Deno: run, the script, then its arguments', () => {
    assertEquals(
        scriptInvocation('cli.ts', { host: DENO_HOST, args: ['a', '--b'] }),
        { command: '/opt/deno', args: ['run', 'cli.ts', 'a', '--b'] },
    )
})

test('scriptInvocation - Deno: allowAll and watch become run flags', () => {
    assertEquals(
        scriptInvocation('main.ts', {
            host: DENO_HOST,
            allowAll: true,
            watch: true,
        }),
        { command: '/opt/deno', args: ['run', '-A', '--watch', 'main.ts'] },
    )
})

test('scriptInvocation - Bun: the script directly, --watch never --hot', () => {
    assertEquals(
        scriptInvocation('main.ts', {
            host: BUN_HOST,
            watch: true,
            allowAll: true,
            args: ['x'],
        }),
        { command: '/opt/bun', args: ['--watch', 'main.ts', 'x'] },
    )
})

test('scriptInvocation - Node: a .ts script loads the transform hook', () => {
    assertEquals(
        scriptInvocation('main.ts', {
            host: { ...NODE_HOST, execArgv: [] },
            allowAll: true,
        }),
        {
            command: '/opt/node',
            args: [`--import=${TRANSFORM_HOOK}`, 'main.ts'],
        },
    )
    assertEquals(
        scriptInvocation('view.tsx', { host: { ...NODE_HOST, execArgv: [] } })
            .args,
        [`--import=${TRANSFORM_HOOK}`, 'view.tsx'],
    )
})

test('scriptInvocation - Node: a JS script gets no hook', () => {
    assertEquals(
        scriptInvocation('dist/main.js', {
            host: { ...NODE_HOST, execArgv: [] },
            watch: true,
        }),
        { command: '/opt/node', args: ['--watch', 'dist/main.js'] },
    )
})

test('scriptInvocation - Node on Node: allowlisted parent flags first, the hook once', () => {
    assertEquals(
        scriptInvocation('cli.ts', {
            host: {
                ...NODE_HOST,
                execArgv: [...NODE_HOST.execArgv, '--import', TRANSFORM_HOOK],
            },
            args: ['db:migrate'],
        }),
        {
            command: '/opt/node',
            args: [
                '--enable-source-maps',
                '--conditions=lockness-source',
                `--import=${TRANSFORM_HOOK}`,
                'cli.ts',
                'db:migrate',
            ],
        },
    )
})

test('scriptInvocation - the current runtime by default', () => {
    const invocation = scriptInvocation('x.js', { host: BUN_HOST })
    assertEquals(invocation.command, '/opt/bun')
})

test('scriptInvocation - another runtime is run by its name on PATH, no parent flags', () => {
    assertEquals(
        scriptInvocation('cli.ts', { host: NODE_HOST, runtime: 'deno' }),
        { command: 'deno', args: ['run', 'cli.ts'] },
    )
    assertEquals(
        scriptInvocation('cli.ts', { host: DENO_HOST, runtime: 'node' }),
        { command: 'node', args: [`--import=${TRANSFORM_HOOK}`, 'cli.ts'] },
    )
    assertEquals(
        scriptInvocation('cli.ts', { host: NODE_HOST, runtime: 'bun' }),
        { command: 'bun', args: ['cli.ts'] },
    )
})

test('scriptInvocation - a Node child of a non-Node parent inherits no flag', () => {
    assertEquals(
        scriptInvocation('a.js', { host: BUN_HOST, runtime: 'node' }),
        { command: 'node', args: ['a.js'] },
    )
})

test('scriptInvocation - Bun on Bun carries no parent flag', () => {
    assertEquals(
        scriptInvocation('a.ts', { host: BUN_HOST }).args,
        ['a.ts'],
    )
})

test('scriptInvocation - a script that reads as a flag is refused', () => {
    assertThrows(
        () => scriptInvocation('--eval', { host: NODE_HOST }),
        TypeError,
        'flag',
    )
    assertThrows(() => scriptInvocation('', { host: NODE_HOST }), TypeError)
})

// ---- binInvocation ---------------------------------------------------------

test('binInvocation - Node: the JS entry under the executable, parent flags kept', () => {
    assertEquals(
        binInvocation('/app/node_modules/drizzle-kit/bin.cjs', {
            host: NODE_HOST,
            args: ['migrate'],
        }),
        {
            command: '/opt/node',
            args: [
                '--enable-source-maps',
                '--conditions=lockness-source',
                '/app/node_modules/drizzle-kit/bin.cjs',
                'migrate',
            ],
        },
    )
})

test('binInvocation - Deno: run the entry, -A when allowed', () => {
    assertEquals(
        binInvocation('/app/node_modules/x/cli.js', {
            host: DENO_HOST,
            allowAll: true,
            args: ['--help'],
        }),
        {
            command: '/opt/deno',
            args: ['run', '-A', '/app/node_modules/x/cli.js', '--help'],
        },
    )
})

test('binInvocation - Bun: the entry directly', () => {
    assertEquals(
        binInvocation('/app/node_modules/x/cli.js', { host: BUN_HOST }),
        { command: '/opt/bun', args: ['/app/node_modules/x/cli.js'] },
    )
})

test('binInvocation - never adds the transform hook, even for a .ts entry', () => {
    assertEquals(
        binInvocation('/app/node_modules/x/cli.ts', {
            host: { ...NODE_HOST, execArgv: [] },
        }).args,
        ['/app/node_modules/x/cli.ts'],
    )
})

test('binInvocation - an entry that reads as a flag is refused', () => {
    assertThrows(
        () => binInvocation('-e', { host: NODE_HOST }),
        TypeError,
        'flag',
    )
})

test('scriptInvocation - the real current runtime runs it, without a shell', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lockness-runtime-'))
    try {
        const script = join(dir, 'echo.mjs')
        writeFileSync(
            script,
            "import process from 'node:process'\n" +
                'console.log(JSON.stringify(process.argv.slice(2)))\n',
        )
        const { command, args } = scriptInvocation(script, {
            allowAll: true,
            args: ['a b', '$HOME', ';', 'echo', 'x'],
        })
        const result = spawnSync(command, args, {
            encoding: 'utf8',
            shell: false,
        })
        assertEquals(result.status, 0, result.stderr)
        assertEquals(
            JSON.parse(result.stdout.trim()),
            ['a b', '$HOME', ';', 'echo', 'x'],
        )
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

// ---- resolveBinEntry -------------------------------------------------------

/** Build `<root>/node_modules/<name>/package.json` holding `manifest`. */
function installPackage(
    root: string,
    name: string,
    manifest: Record<string, unknown> | string,
): string {
    const dir = join(root, 'node_modules', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
        join(dir, 'package.json'),
        typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
    )
    return dir
}

/** Run `body` with a fresh app root, removed afterwards. */
async function withRoot(body: (root: string) => Promise<void>): Promise<void> {
    const root = mkdtempSync(join(tmpdir(), 'lockness-bin-'))
    try {
        await body(root)
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

test('resolveBinEntry - a string bin is the package entry', async () => {
    await withRoot(async (root) => {
        const dir = installPackage(root, 'drizzle-kit', {
            name: 'drizzle-kit',
            bin: './bin.cjs',
        })
        assertEquals(
            await resolveBinEntry(root, 'drizzle-kit'),
            join(dir, 'bin.cjs'),
        )
        assertEquals(
            await resolveBinEntry(root, 'drizzle-kit', 'drizzle-kit'),
            join(dir, 'bin.cjs'),
        )
    })
})

test('resolveBinEntry - a string bin of a scoped package answers its unscoped name', async () => {
    await withRoot(async (root) => {
        const dir = installPackage(root, '@acme/tool', { bin: 'cli.js' })
        assertEquals(
            await resolveBinEntry(root, '@acme/tool', 'tool'),
            join(dir, 'cli.js'),
        )
        await assertRejects(
            () => resolveBinEntry(root, '@acme/tool', 'other'),
            BinResolutionError,
            'other',
        )
    })
})

test('resolveBinEntry - a bin map is read by name; one entry needs no name', async () => {
    await withRoot(async (root) => {
        const dir = installPackage(root, 'one', { bin: { only: 'o.js' } })
        assertEquals(await resolveBinEntry(root, 'one'), join(dir, 'o.js'))
        const many = installPackage(root, 'many', {
            bin: { a: 'a.js', b: 'lib/b.js' },
        })
        assertEquals(
            await resolveBinEntry(root, 'many', 'b'),
            join(many, 'lib', 'b.js'),
        )
        await assertRejects(
            () => resolveBinEntry(root, 'many'),
            BinResolutionError,
            'a, b',
        )
        await assertRejects(
            () => resolveBinEntry(root, 'many', 'c'),
            BinResolutionError,
        )
    })
})

test('resolveBinEntry - an entry outside the package is refused', async () => {
    await withRoot(async (root) => {
        for (const entry of ['../evil.js', '../../x.js', '/etc/passwd']) {
            installPackage(root, 'escape', { bin: entry })
            await assertRejects(
                () => resolveBinEntry(root, 'escape'),
                BinResolutionError,
                'outside',
            )
        }
    })
})

test('resolveBinEntry - a file whose name starts with two dots stays inside', async () => {
    await withRoot(async (root) => {
        const dir = installPackage(root, 'dots', { bin: '..cli.js' })
        assertEquals(await resolveBinEntry(root, 'dots'), join(dir, '..cli.js'))
    })
})

test('resolveBinEntry - a package name that is not an npm name is refused before any read', async () => {
    await withRoot(async (root) => {
        for (
            const name of ['../x', 'a/b', '@scope', '@a/../b', '', '.hidden']
        ) {
            await assertRejects(
                () => resolveBinEntry(root, name),
                BinResolutionError,
                'package name',
            )
        }
    })
})

test('resolveBinEntry - a missing package, a bad manifest or no bin is refused', async () => {
    await withRoot(async (root) => {
        await assertRejects(
            () => resolveBinEntry(root, 'absent'),
            BinResolutionError,
            'absent',
        )
        installPackage(root, 'broken', '{ not json')
        await assertRejects(
            () => resolveBinEntry(root, 'broken'),
            BinResolutionError,
            'broken',
        )
        installPackage(root, 'nobin', { name: 'nobin' })
        await assertRejects(
            () => resolveBinEntry(root, 'nobin'),
            BinResolutionError,
            'no bin',
        )
        installPackage(root, 'badbin', { bin: 42 })
        await assertRejects(
            () => resolveBinEntry(root, 'badbin'),
            BinResolutionError,
            'no bin',
        )
        installPackage(root, 'numentry', { bin: { n: 42 } })
        await assertRejects(
            () => resolveBinEntry(root, 'numentry', 'n'),
            BinResolutionError,
            "no bin 'n'",
        )
        installPackage(root, 'emptyentry', { bin: { e: '' } })
        await assertRejects(
            () => resolveBinEntry(root, 'emptyentry'),
            BinResolutionError,
        )
    })
})

test('BinResolutionError - carries its name', () => {
    assertEquals(new BinResolutionError('x').name, 'BinResolutionError')
})
