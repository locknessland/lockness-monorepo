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
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
    assertEquals,
    assertMatch,
    assertNotMatch,
    assertThrows,
} from '@std/assert'
import {
    findTsconfig,
    readCompilerOptions,
    transpileForBuild,
    transpileForLoad,
} from '../transform.ts'

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

test('transpileForLoad lowers a TC39 decorator for a target Node can run', () => {
    const out = transpileForLoad(DECORATED, '/app/greeter.ts', {
        target: 9, // ES2022
    })
    assertMatch(out, /__esDecorate/)
    assertNotMatch(out, /@tag/)
    assertNotMatch(out, /: string/)
})

test('transpileForLoad always emits an ES module, whatever module kind tsconfig names', () => {
    const dir = appWith({
        compilerOptions: {
            target: 'es2022',
            module: 'nodenext',
            moduleResolution: 'nodenext',
        },
    })
    try {
        const options = readCompilerOptions(join(dir, 'tsconfig.json'))
        const out = transpileForLoad(
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
        const out = transpileForLoad(
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
        const out = transpileForLoad(
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
        () => transpileForLoad('export const el = <p/>\n', '/app/view.tsx', {}),
        Error,
        '/app/view.tsx',
    )
    assertMatch(error.message, /jsx/)
})

test('a syntax error throws, with the file, line and column', () => {
    const error = assertThrows(
        () =>
            transpileForLoad('const x = ;\n', '/app/broken.ts', { target: 9 }),
        Error,
        '/app/broken.ts:1:11',
    )
    assertMatch(error.message, /Expression expected/)
})

/** A module importing relative `.ts` / `.tsx`, a bare package and a `.d.ts`. */
const IMPORTS = [
    'import { a } from "./a.ts"',
    'import b from "pkg"',
    'import "./types.d.ts"',
    'import c from "../c.tsx"',
    'const d = await import("./d.ts")',
    'export const x: number = a + b + c + d',
    '',
].join('\n')

/** The JSON of a data-URL source map at the end of an emit. */
function inlineMap(code: string): { sources: string[] } {
    const match =
        /\/\/# sourceMappingURL=data:application\/json;base64,(\S+)\s*$/
            .exec(code)
    if (match === null) throw new Error(`no inline source map in:\n${code}`)
    return JSON.parse(atob(match[1]))
}

test('the load emit keeps ./a.ts specifiers and inlines a data-URL source map', () => {
    const out = transpileForLoad(IMPORTS, '/app/src/main.ts', { target: 9 })
    assertMatch(out, /^import \{ a \} from "\.\/a\.ts";/m)
    assertMatch(out, /^import c from "\.\.\/c\.tsx";/m)
    assertMatch(out, /await import\("\.\/d\.ts"\)/)
    assertEquals(inlineMap(out).sources, ['main.ts'])
    assertNotMatch(out, /sourceMappingURL=main\.js\.map/)
})

test('rewriteRelativeImportExtensions in tsconfig.json leaves the load emit unchanged', () => {
    const dir = appWith({
        compilerOptions: {
            target: 'es2022',
            rewriteRelativeImportExtensions: true,
            allowImportingTsExtensions: true,
        },
    })
    try {
        const file = join(dir, 'main.ts')
        const withOption = transpileForLoad(
            IMPORTS,
            file,
            readCompilerOptions(join(dir, 'tsconfig.json')),
        )
        assertEquals(withOption, transpileForLoad(IMPORTS, file, { target: 9 }))
        assertMatch(withOption, /from "\.\/a\.ts"/)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('layout options in tsconfig.json do not move the emit or its map', () => {
    const plain = transpileForLoad(IMPORTS, '/app/src/main.ts', { target: 9 })
    const laidOut = transpileForLoad(IMPORTS, '/app/src/main.ts', {
        target: 9,
        outDir: '/elsewhere',
        rootDir: '/',
        sourceRoot: 'https://example.test/',
        mapRoot: 'https://example.test/maps/',
        sourceMap: true,
        declaration: true,
        emitDeclarationOnly: true,
        noEmit: true,
    })
    assertEquals(laidOut, plain)
})

test('the build emit rewrites .ts/.tsx to .js and leaves bare and .d.ts specifiers alone', () => {
    const { code } = transpileForBuild(
        IMPORTS,
        '/app/src/main.ts',
        '/app/dist/src/main.js',
        // A runnable jsx emit, as every app with .tsx files has: under
        // "preserve" TypeScript would name a .tsx module's output .jsx.
        { target: 9, jsx: 4 },
    )
    assertMatch(code, /^import \{ a \} from "\.\/a\.js";/m)
    assertMatch(code, /^import c from "\.\.\/c\.js";/m)
    assertMatch(code, /await import\("\.\/d\.js"\)/)
    assertMatch(code, /^import b from "pkg";/m)
    assertMatch(code, /^import "\.\/types\.d\.ts";/m)
    assertNotMatch(code, /data:application\/json/)
    assertMatch(code, /\/\/# sourceMappingURL=main\.js\.map\s*$/)
})

test('the build emit of a .tsx file names its output .js', () => {
    const { code, map } = transpileForBuild(
        'export const el = <p>hi</p>\n',
        '/app/src/view.tsx',
        '/app/dist/view.js',
        { target: 9, jsx: 4 },
    )
    assertMatch(code, /jsx-runtime/)
    assertEquals(JSON.parse(map).file, 'view.js')
})

test("the build map's sourceRoot resolves to the source file", () => {
    for (
        const [source, outFile] of [
            ['/app/src/deep/main.ts', '/app/dist/src/deep/main.js'],
            ['/app/main.ts', '/app/main.js'],
            ['/app/src/main.ts', '/out/main.js'],
        ]
    ) {
        const { map } = transpileForBuild(IMPORTS, source, outFile, {
            target: 9,
        })
        const parsed = JSON.parse(map)
        assertEquals(parsed.file, 'main.js')
        assertEquals(parsed.sources.length, 1)
        const resolved = new URL(
            `${parsed.sourceRoot}${parsed.sources[0]}`,
            pathToFileURL(`${outFile}.map`),
        )
        assertEquals(fileURLToPath(resolved), source, `${source} → ${outFile}`)
    }
})

test('the build refuses an output name the rewritten imports would not reach', () => {
    assertThrows(
        () =>
            transpileForBuild(IMPORTS, '/app/main.ts', '/app/dist/other.js', {
                target: 9,
            }),
        Error,
        'main.js',
    )
})

test('lib: ["deno.ns"] loads, directly and through extends', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lockness-transform-unit-'))
    try {
        writeFileSync(
            join(dir, 'base.json'),
            JSON.stringify({
                compilerOptions: { lib: ['deno.ns', 'esnext'], types: [1] },
            }),
        )
        writeFileSync(
            join(dir, 'tsconfig.json'),
            JSON.stringify({
                extends: './base.json',
                compilerOptions: { target: 'es2022', lib: ['deno.ns'] },
            }),
        )
        const options = readCompilerOptions(join(dir, 'tsconfig.json'))
        assertEquals(options.target, 9)
        assertMatch(
            transpileForLoad(
                'export const x: number = 1\n',
                '/app/m.ts',
                options,
            ),
            /^export const x = 1;/m,
        )

        // Through extends alone: the child sets nothing about lib.
        writeFileSync(
            join(dir, 'tsconfig.json'),
            JSON.stringify({ extends: './base.json' }),
        )
        readCompilerOptions(join(dir, 'tsconfig.json'))
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('an unknown option or an invalid value is fatal, naming the file', () => {
    for (
        const [compilerOptions, located] of [
            [{ target: 'es2099' }, /"es2099"|--target/],
            [{ tagret: 'es2022' }, /tagret/],
            [{ jsx: 'precompile' }, /--jsx/],
            // The lib exception covers lib's value only, not its neighbours.
            [{ lib: ['deno.ns'], tagret: 'es2022' }, /tagret/],
            [{ types: [1], jsx: 'precompile' }, /--jsx/],
        ] as const
    ) {
        const dir = appWith({ compilerOptions })
        try {
            const error = assertThrows(
                () => readCompilerOptions(join(dir, 'tsconfig.json')),
                Error,
                join(dir, 'tsconfig.json'),
            )
            assertMatch(error.message, located)
            // Located to line and column in the tsconfig.json.
            assertMatch(error.message, /tsconfig\.json:1:\d+ TS\d+/)
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    }
})

test('an invalid value inherited through extends is fatal too', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lockness-transform-unit-'))
    try {
        writeFileSync(
            join(dir, 'base.json'),
            JSON.stringify({ compilerOptions: { jsx: 'precompile' } }),
        )
        writeFileSync(
            join(dir, 'tsconfig.json'),
            JSON.stringify({ extends: './base.json' }),
        )
        assertThrows(
            () => readCompilerOptions(join(dir, 'tsconfig.json')),
            Error,
            'base.json',
        )
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('a tsconfig.json that is not valid JSONC is fatal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lockness-transform-unit-'))
    try {
        writeFileSync(join(dir, 'tsconfig.json'), '{ "compilerOptions": { ')
        assertThrows(
            () => readCompilerOptions(join(dir, 'tsconfig.json')),
            Error,
            join(dir, 'tsconfig.json'),
        )
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
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

test('findTsconfig accepts a group-writable tsconfig.json (umask 002)', {
    skip: POSIX_ONLY,
}, () => {
    const dir = appWith({ compilerOptions: {} })
    try {
        chmodSync(join(dir, 'tsconfig.json'), 0o664)
        assertEquals(findTsconfig(dir), join(dir, 'tsconfig.json'))
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('findTsconfig refuses a tsconfig.json others can write', {
    skip: POSIX_ONLY,
}, () => {
    for (const mode of [0o646, 0o666]) {
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
