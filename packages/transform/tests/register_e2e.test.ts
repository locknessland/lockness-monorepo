/**
 * @fileoverview `node --import <register>` on a real app: a TC39-decorated
 * class and a `.tsx` view run, the cache is written 0700 beside the app's
 * `tsconfig.json`, and `APP_ENV=production` refuses to start (plan 274 §5).
 *
 * Under Node (the Node lane) it spawns the Node running the tests, so it
 * always runs there. Under Deno or Bun it needs a real `node` ≥ 24 on PATH;
 * without one, each test skips and says why — it never passes without
 * running Node.
 *
 * @module @lockness/transform/tests/register_e2e
 */

import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import {
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { assertEquals, assertMatch, assertNotEquals } from '@std/assert'
import { cacheDirFor } from '../cache.ts'

/** The entry under test, as a path Node's `--import` accepts. */
const REGISTER = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'register.ts',
)

/** The oldest Node major `engines.node` admits, and the lanes run. */
const MINIMUM_MAJOR = 24

/**
 * Whether this file itself runs under Node — the Node lane. There the e2e
 * spawns the very Node running the tests, so it can never skip for want of
 * one: the lane fails instead of passing without having run it.
 */
const UNDER_NODE = typeof (globalThis as { Deno?: unknown }).Deno ===
        'undefined' &&
    typeof (globalThis as { Bun?: unknown }).Bun === 'undefined'

/** The Node binary under test. */
const NODE = UNDER_NODE ? process.execPath : 'node'

/**
 * Why the e2e tests cannot run here, or `false` when they can.
 *
 * Under Deno or Bun the probe asks the `node` on PATH for its version **and**
 * whether `Deno` / `Bun` exist in it: Deno's `child_process` answers a `node`
 * it cannot find with Deno itself (reporting a Node-compatible
 * `process.versions.node`), and that is not the runtime under test.
 *
 * @returns A reason naming what is missing, or `false`.
 */
function nodeUnavailable(): string | false {
    if (UNDER_NODE) {
        const major = Number(process.versions.node.split('.')[0])
        if (major >= MINIMUM_MAJOR) return false
        return `node ${process.version} predates the ${MINIMUM_MAJOR} floor of engines.node — the Node e2e tests did not run`
    }
    const probe = spawnSync(
        NODE,
        [
            '-p',
            'JSON.stringify([process.versions.node, typeof Deno, typeof Bun])',
        ],
        { encoding: 'utf8' },
    )
    if (probe.error !== undefined || probe.status !== 0) {
        return 'no `node` on PATH — the Node e2e tests did not run'
    }
    const answer = /^\["(\d+)\.[^"]*","(\w+)","(\w+)"\]$/.exec(
        probe.stdout.trim(),
    )
    if (answer === null) {
        return `unrecognised answer from \`node\`: ${probe.stdout}`
    }
    if (answer[2] !== 'undefined' || answer[3] !== 'undefined') {
        return 'no real `node` on PATH (Deno or Bun answered for it) — the Node e2e tests did not run'
    }
    if (Number(answer[1]) < MINIMUM_MAJOR) {
        return `node ${
            answer[1]
        } predates the ${MINIMUM_MAJOR} floor of engines.node — the Node e2e tests did not run`
    }
    return false
}

const SKIP = nodeUnavailable()
if (SKIP !== false) console.warn(`[transform e2e] skipped: ${SKIP}`)

/**
 * A temp app: `tsconfig.json` (ES2022 target, react-jsx with a local import
 * source), a decorated class, a `.tsx` view and a tiny JSX runtime under
 * `node_modules`.
 */
function writeApp(): string {
    const root = mkdtempSync(join(tmpdir(), 'lockness-transform-e2e-'))
    const files: Record<string, string> = {
        'package.json': JSON.stringify({ type: 'module', private: true }),
        'tsconfig.json': JSON.stringify({
            compilerOptions: {
                target: 'es2022',
                jsx: 'react-jsx',
                jsxImportSource: 'tiny-jsx',
                allowImportingTsExtensions: true,
                noEmit: true,
            },
        }),
        'node_modules/tiny-jsx/package.json': JSON.stringify({
            name: 'tiny-jsx',
            type: 'module',
            exports: { './jsx-runtime': './jsx-runtime.js' },
        }),
        'node_modules/tiny-jsx/jsx-runtime.js': [
            'export function jsx(type, props) { return { type, props } }',
            'export const jsxs = jsx',
            'export const Fragment = Symbol("Fragment")',
            '',
        ].join('\n'),
        'app/view.tsx': [
            'export function View(props: { name: string }) {',
            '    return <p id="greeting">hello {props.name}</p>',
            '}',
            '',
        ].join('\n'),
        'app/greeter.ts': [
            'const calls: string[] = []',
            'function logged<T extends (this: unknown, ...a: never[]) => unknown>(',
            '    method: T,',
            '    context: ClassMethodDecoratorContext,',
            '): T {',
            '    calls.push(String(context.name))',
            '    return method',
            '}',
            'export class Greeter {',
            '    @logged greet(): string { return "hi" }',
            '}',
            'export { calls }',
            '',
        ].join('\n'),
        // A relative `.ts` import beside main.ts: the load emit keeps the
        // specifier, and Node resolves it to the next file the hook takes.
        'b.ts': 'export const b: string = "from b.ts"\n',
        'main.ts': [
            'import { b } from "./b.ts"',
            'import { calls, Greeter } from "./app/greeter.ts"',
            'import { View } from "./app/view.tsx"',
            'const view = View({ name: "node" })',
            'console.log(JSON.stringify({',
            '    greet: new Greeter().greet(),',
            '    decorated: calls,',
            '    view,',
            '    b,',
            '}))',
            '',
        ].join('\n'),
    }
    for (const [name, content] of Object.entries(files)) {
        // 0755 whatever the umask: the cache refuses a group-writable parent.
        mkdirSync(dirname(join(root, name)), { recursive: true, mode: 0o755 })
        writeFileSync(join(root, name), content)
    }
    return root
}

/** Run `node --import <register> main.ts` in the app, APP_ENV as given. */
function runApp(root: string, appEnv?: string) {
    const env: Record<string, string> = { ...process.env } as Record<
        string,
        string
    >
    delete env.APP_ENV
    // The child runs exactly the flags below: an inherited NODE_OPTIONS
    // (another --import, a loader) would test something else.
    delete env.NODE_OPTIONS
    if (appEnv !== undefined) env.APP_ENV = appEnv
    return spawnSync(NODE, ['--import', REGISTER, 'main.ts'], {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 60_000,
    })
}

test('node --import register runs a TC39-decorated class and a .tsx view', {
    skip: SKIP,
}, () => {
    const root = writeApp()
    try {
        const result = runApp(root)
        assertEquals(result.status, 0, result.stderr)
        assertEquals(JSON.parse(result.stdout), {
            greet: 'hi',
            decorated: ['greet'],
            view: {
                type: 'p',
                props: { id: 'greeting', children: ['hello ', 'node'] },
            },
            b: 'from b.ts',
        })

        // One entry per transformed file (main, b, greeter, view); the JSX
        // runtime under node_modules is not one of them.
        const cache = cacheDirFor(root)
        assertEquals(readdirSync(cache).length, 4)
        if (process.platform !== 'win32') {
            assertEquals(statSync(cache).mode & 0o777, 0o700)
        }

        // A second run is served from the cache and prints the same thing.
        const again = runApp(root)
        assertEquals(again.status, 0, again.stderr)
        assertEquals(again.stdout, result.stdout)
        assertEquals(readdirSync(cache).length, 4)
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test('node --import register refuses to start when APP_ENV=production', {
    skip: SKIP,
}, () => {
    const root = writeApp()
    try {
        const result = runApp(root, 'production')
        assertNotEquals(result.status, 0)
        assertMatch(result.stderr, /refuses to run when APP_ENV=production/)
        assertEquals(result.stdout, '')
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})
