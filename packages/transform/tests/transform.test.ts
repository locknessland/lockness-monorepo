/**
 * @fileoverview `transform.ts` as pure functions: the emit, and the compiler
 * options it reads from an app's `tsconfig.json` (plan 274 §5, audit A10).
 *
 * @module @lockness/transform/tests/transform
 */

import { test } from 'node:test'
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import process from 'node:process'
import {
    assertEquals,
    assertMatch,
    assertNotMatch,
    assertThrows,
} from '@std/assert'
import { findTsconfig, readCompilerOptions, transpile } from '../transform.ts'

/**
 * The skip reason for a test of POSIX ownership or mode bits, or `false`
 * where they exist (#618 keeps the Windows behaviour unchanged).
 */
const POSIX_ONLY: string | false = process.platform === 'win32'
    ? 'POSIX ownership and mode bits do not exist on Windows'
    : false

/** A fresh directory holding a `tsconfig.json` with the given content. */
function appWith(tsconfig: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), 'lockness-transform-unit-'))
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(tsconfig))
    return dir
}

const DECORATED = [
    'function tag(value: unknown, _context: ClassMethodDecoratorContext) {',
    '    return value',
    '}',
    'export class Greeter {',
    '    @tag greet(): string { return "hi" }',
    '}',
    '',
].join('\n')

test('transpile lowers a TC39 decorator for a target Node can run', () => {
    const out = transpile(DECORATED, '/app/greeter.ts', {
        target: 9, // ES2022
    })
    assertMatch(out, /__esDecorate/)
    assertNotMatch(out, /@tag/)
    assertNotMatch(out, /: string/)
})

test('transpile always emits an ES module, whatever module kind tsconfig names', () => {
    const dir = appWith({
        compilerOptions: {
            target: 'es2022',
            module: 'nodenext',
            moduleResolution: 'nodenext',
        },
    })
    try {
        const options = readCompilerOptions(join(dir, 'tsconfig.json'))
        const out = transpile(
            'import { x } from "./x.ts"\nexport const y = x\n',
            join(dir, 'main.ts'),
            options,
        )
        assertMatch(out, /^import \{ x \} from "\.\/x\.ts";/m)
        assertMatch(out, /^export const y = x;/m)
        assertNotMatch(out, /require\(|exports\./)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('a .tsx file follows the jsx options of tsconfig.json (react-jsx)', () => {
    const dir = appWith({
        compilerOptions: {
            target: 'es2022',
            jsx: 'react-jsx',
            jsxImportSource: '@lockness/core',
        },
    })
    try {
        const options = readCompilerOptions(join(dir, 'tsconfig.json'))
        const out = transpile(
            'export const el = <p id="x">hi</p>\n',
            join(dir, 'view.tsx'),
            options,
        )
        assertMatch(out, /from "@lockness\/core\/jsx-runtime"/)
        assertMatch(out, /_jsx\("p", \{ id: "x", children: "hi" \}\)/)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('a .tsx file follows the jsx options of tsconfig.json (classic factory)', () => {
    const dir = appWith({
        compilerOptions: { target: 'es2022', jsx: 'react', jsxFactory: 'h' },
    })
    try {
        const options = readCompilerOptions(join(dir, 'tsconfig.json'))
        const out = transpile(
            'export const el = <p>hi</p>\n',
            join(dir, 'view.tsx'),
            options,
        )
        assertMatch(out, /h\("p", null, "hi"\)/)
        assertNotMatch(out, /jsx-runtime/)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('a .tsx file under a tsconfig with no runnable jsx emit is refused, naming the option', () => {
    const error = assertThrows(
        () => transpile('export const el = <p/>\n', '/app/view.tsx', {}),
        Error,
        '/app/view.tsx',
    )
    assertMatch(error.message, /jsx/)
})

test('a syntax error throws, with the file, line and column', () => {
    const error = assertThrows(
        () => transpile('const x = ;\n', '/app/broken.ts', { target: 9 }),
        Error,
        '/app/broken.ts:1:11',
    )
    assertMatch(error.message, /Expression expected/)
})

test('readCompilerOptions reads JSONC, follows extends, and lists no input files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lockness-transform-unit-'))
    try {
        writeFileSync(
            join(dir, 'base.json'),
            JSON.stringify({ compilerOptions: { target: 'es2022' } }),
        )
        // A comment and a trailing comma: tsconfig.json is JSONC.
        writeFileSync(
            join(dir, 'tsconfig.json'),
            '{\n  // inherited target\n  "extends": "./base.json",\n  "compilerOptions": { "jsx": "react-jsx", },\n}\n',
        )
        const options = readCompilerOptions(join(dir, 'tsconfig.json'))
        assertEquals(options.target, 9)
        assertEquals(options.jsx, 4)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('readCompilerOptions throws on an invalid option, naming the file', () => {
    const dir = appWith({ compilerOptions: { target: 'es2099' } })
    try {
        assertThrows(
            () => readCompilerOptions(join(dir, 'tsconfig.json')),
            Error,
            join(dir, 'tsconfig.json'),
        )
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('readCompilerOptions throws when the file does not exist', () => {
    assertThrows(
        () =>
            readCompilerOptions(join(tmpdir(), 'no-such-dir', 'tsconfig.json')),
        Error,
        'tsconfig.json',
    )
})

test('findTsconfig returns the nearest tsconfig.json walking up', () => {
    const dir = appWith({ compilerOptions: {} })
    try {
        const deep = join(dir, 'app', 'controller')
        mkdirSync(deep, { recursive: true })
        assertEquals(findTsconfig(deep), join(dir, 'tsconfig.json'))

        writeFileSync(join(dir, 'app', 'tsconfig.json'), '{}')
        assertEquals(findTsconfig(deep), join(dir, 'app', 'tsconfig.json'))
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('findTsconfig stops at the nearest package.json or deno.json', () => {
    for (const marker of ['package.json', 'deno.json', 'deno.jsonc']) {
        const outer = appWith({ compilerOptions: { jsx: 'react-jsx' } })
        try {
            const pkg = join(outer, 'pkg')
            const src = join(pkg, 'src')
            mkdirSync(src, { recursive: true })
            writeFileSync(join(pkg, marker), '{}')
            // The tsconfig above the package boundary is not picked up.
            assertEquals(findTsconfig(src), null, marker)
            assertEquals(findTsconfig(pkg), null, marker)

            // One beside the boundary marker is the app's, and is found.
            writeFileSync(join(pkg, 'tsconfig.json'), '{}')
            assertEquals(findTsconfig(src), join(pkg, 'tsconfig.json'))
        } finally {
            rmSync(outer, { recursive: true, force: true })
        }
    }
})

test('findTsconfig refuses a tsconfig.json group or others can write', {
    skip: POSIX_ONLY,
}, () => {
    for (const mode of [0o664, 0o646, 0o666]) {
        const dir = appWith({ compilerOptions: {} })
        try {
            chmodSync(join(dir, 'tsconfig.json'), mode)
            assertThrows(
                () => findTsconfig(dir),
                Error,
                join(dir, 'tsconfig.json'),
            )
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    }
})

test('findTsconfig refuses a tsconfig.json that belongs to another user', {
    skip: POSIX_ONLY,
}, () => {
    const dir = appWith({ compilerOptions: {} })
    const original = process.getuid
    try {
        const uid = process.getuid!()
        process.getuid = () => uid + 1
        assertThrows(() => findTsconfig(dir), Error, 'another user')
    } finally {
        process.getuid = original
        rmSync(dir, { recursive: true, force: true })
    }
})

test('findTsconfig returns null when the walk reaches the root with none found', (t) => {
    // The filesystem root is where the walk ends, and the only directory
    // whose ancestors are known to hold no tsconfig.json.
    const root = parse(tmpdir()).root
    if (existsSync(join(root, 'tsconfig.json'))) {
        t.skip(`${root}tsconfig.json exists on this machine`)
        return
    }
    assertEquals(findTsconfig(root), null)
})
