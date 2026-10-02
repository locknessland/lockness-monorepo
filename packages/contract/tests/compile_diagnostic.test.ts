/**
 * A module that fails to compile or link is rendered as its kind and location,
 * never its source excerpt or headline (#478).
 *
 * Every failure here comes from a REAL file written to a temp directory and
 * imported, never from a hand-written message: the recogniser depends on the
 * runtime's format, and only a real import notices when that format changes.
 * The one derived shape (an excerpt with its location line cut off) starts
 * from a real message too.
 */

import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { isAbsolute, join, toFileUrl } from '@std/path'
import { renderError } from '../logging/sanitize.ts'
import {
    readCompileDiagnostic,
    translateImportFailure,
} from '../logging/compile_diagnostic.ts'
import { AppFileCompileError, importAppFile } from '../app_file.ts'

const HEAD = 'FA' + 'KE'
const TAIL = 'MA' + 'RK'
/** The fake secret a broken source line carries. */
const M = HEAD + TAIL

/** Assert that no part of the marker survived into `out`. */
function assertNoMarker(out: string, context = out): void {
    assert(!out.includes(M), `marker leaked: ${context}`)
    assert(!out.includes(HEAD), `marker head leaked: ${context}`)
    assert(!out.includes(TAIL), `marker tail leaked: ${context}`)
}

/** The broken sources, each quoting the marker somewhere in its failure. */
const BROKEN: Record<string, string> = {
    'excerpt.ts': `export const a = 1\nexport const x = {{ apiKey: "${M}" }\n`,
    'string_headline.ts': `export const x = foo("${M}" "${M}")\n`,
    'identifier_headline.ts': `export const x = foo(a ${M}_ident)\n`,
    'template.ts': `export const x = \`${M}\nline2\nline3\n`,
    'regex.ts': `export const r = /${M}(/\n`,
    'link.ts': `import { ${M} } from './ok.ts'\nexport const y = ${M}\n`,
}

/** The line and column each broken source fails at. */
const LOCATION: Record<string, [number, number]> = {
    'excerpt.ts': [2, 19],
    'string_headline.ts': [1, 33],
    'identifier_headline.ts': [1, 24],
    'template.ts': [1, 18],
    'regex.ts': [1, 18],
    'link.ts': [1, 10],
}

/** Write `files` to a fresh temp directory, run `body`, then remove it. */
async function withFiles(
    files: Record<string, string>,
    body: (dir: string) => Promise<void>,
): Promise<void> {
    const dir = await Deno.makeTempDir({ prefix: 'compile-diagnostic-' })
    try {
        await Deno.writeTextFile(join(dir, 'ok.ts'), 'export const ok = 1\n')
        for (const [name, source] of Object.entries(files)) {
            await Deno.mkdir(join(dir, name, '..'), { recursive: true })
            await Deno.writeTextFile(join(dir, name), source)
        }
        await body(dir)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
}

/** Import a file by its real URL, bypassing `importAppFile`, and return the rejection. */
async function rawFailure(path: string): Promise<Error> {
    try {
        await import(toFileUrl(path).href)
    } catch (error) {
        assertInstanceOf(error, Error)
        return error
    }
    throw new Error(`${path} imported without failing`)
}

Deno.test('#478 renderError keeps only the kind and location of a compile failure', async () => {
    await withFiles(BROKEN, async (dir) => {
        for (const name of Object.keys(BROKEN)) {
            const error = await rawFailure(join(dir, name))
            const out = renderError(error)
            const [line, column] = LOCATION[name]
            assertNoMarker(out, name)
            assertStringIncludes(out, `/${name}:${line}:${column}`, name)
            assertStringIncludes(out, 'SyntaxError at file://', name)
            assert(out.endsWith('[source excerpt withheld]'), out)
        }
    })
})

Deno.test('#478 a parse failure keeps its outer name; a V8 SyntaxError collapses', async () => {
    await withFiles(BROKEN, async (dir) => {
        const parse = renderError(await rawFailure(join(dir, 'excerpt.ts')))
        assert(parse.startsWith('TypeError: SyntaxError at file://'), parse)
        const regex = renderError(await rawFailure(join(dir, 'regex.ts')))
        assert(regex.startsWith('SyntaxError at file://'), regex)
    })
})

Deno.test('#478 the recogniser reports the kind and location of every shape', async () => {
    await withFiles(BROKEN, async (dir) => {
        for (const name of Object.keys(BROKEN)) {
            const error = await rawFailure(join(dir, name))
            const diagnostic = readCompileDiagnostic(error.name, error.message)
            const [line, column] = LOCATION[name]
            assertEquals(diagnostic, {
                kind: 'SyntaxError',
                url: toFileUrl(join(dir, name)).href,
                line,
                column,
            }, name)
        }
    })
})

Deno.test('#478 an excerpt alone is recognised, should the location line ever go', async () => {
    // Derived from a real message, not written by hand: the trailing location
    // is cut off, as a Deno format change might, and the gutter still fires.
    await withFiles(BROKEN, async (dir) => {
        const error = await rawFailure(join(dir, 'excerpt.ts'))
        const cut = error.message.slice(0, error.message.lastIndexOf('\n'))
        assertStringIncludes(cut, M)
        const diagnostic = readCompileDiagnostic(error.name, cut)
        assertEquals(diagnostic, { kind: 'SyntaxError' })
        const out = renderError(new TypeError(cut))
        assertNoMarker(out)
        assertEquals(out, 'TypeError: SyntaxError [source excerpt withheld]')
    })
})

Deno.test('#478 failures that are not compile diagnostics are untouched', async () => {
    await withFiles({}, async (dir) => {
        const missing = await rawFailure(join(dir, 'missing.ts'))
        assertEquals(
            readCompileDiagnostic(missing.name, missing.message),
            undefined,
        )
        assertStringIncludes(renderError(missing), 'Module not found')
    })
    const forged = new TypeError('SyntaxError: x')
    assertEquals(readCompileDiagnostic(forged.name, forged.message), undefined)
    assertEquals(renderError(forged), 'TypeError: SyntaxError: x')
    let parsed: Error | undefined
    try {
        JSON.parse('{"a": ')
    } catch (error) {
        assertInstanceOf(error, SyntaxError)
        parsed = error
    }
    assert(parsed !== undefined)
    assertEquals(readCompileDiagnostic(parsed.name, parsed.message), undefined)
})

Deno.test('#478 the gutter test is linear on a long line of spaces', () => {
    const text = `x\n${' '.repeat(1 << 20)}y`
    const start = performance.now()
    assertEquals(readCompileDiagnostic('Error', text), undefined)
    assert(performance.now() - start < 1000)
})

// ============================================================================
// importAppFile translates the failure where the app root is known
// ============================================================================

Deno.test('#478 importAppFile throws AppFileCompileError with a root-relative file', async () => {
    await withFiles({
        'app/controller/broken.ts': BROKEN['excerpt.ts'],
    }, async (root) => {
        const error = await assertRejects(
            () => importAppFile('app/controller/broken.ts', root),
            AppFileCompileError,
        )
        assertEquals(error.name, 'AppFileCompileError')
        assertEquals(error.kind, 'SyntaxError')
        assertEquals(error.file, join('app', 'controller', 'broken.ts'))
        assertEquals(error.line, 2)
        assertEquals(error.column, 19)
        assertEquals(
            error.message,
            `SyntaxError at ${
                join('app', 'controller', 'broken.ts')
            }:2:19 [source excerpt withheld]`,
        )
        assertEquals(error.cause, undefined)
        assertNoMarker(error.message)
        assertNoMarker(Deno.inspect(error))
        assert(!Deno.inspect(error).includes(root), 'absolute root leaked')
        assertNoMarker(renderError(error))
    })
})

Deno.test('#478 a broken dependency is located at the dependency', async () => {
    await withFiles({
        'app/controller/home.ts':
            "import '../lib/broken.ts'\nexport const home = 1\n",
        'app/lib/broken.ts': BROKEN['identifier_headline.ts'],
    }, async (root) => {
        const error = await assertRejects(
            () => importAppFile('app/controller/home.ts', root),
            AppFileCompileError,
        )
        assertEquals(error.file, join('app', 'lib', 'broken.ts'))
        assertEquals([error.line, error.column], [1, 24])
        assertNoMarker(Deno.inspect(error))
    })
})

Deno.test('#478 a link failure is translated too', async () => {
    await withFiles({ 'link.ts': BROKEN['link.ts'] }, async (root) => {
        const error = await assertRejects(
            () => importAppFile('link.ts', root),
            AppFileCompileError,
        )
        assertEquals([error.file, error.line, error.column], ['link.ts', 1, 10])
        assertNoMarker(Deno.inspect(error))
    })
})

Deno.test('#478 a file outside the root is shown absolute', async () => {
    await withFiles({ 'broken.ts': BROKEN['regex.ts'] }, async (dir) => {
        const elsewhere = await Deno.makeTempDir()
        try {
            const error = await assertRejects(
                () => importAppFile(join(dir, 'broken.ts'), elsewhere),
                AppFileCompileError,
            )
            assert(isAbsolute(error.file), error.file)
            assert(error.file.endsWith(join(dir, 'broken.ts')), error.file)
        } finally {
            await Deno.remove(elsewhere, { recursive: true })
        }
    })
})

Deno.test('#478 a missing file rejects with the original error', async () => {
    await withFiles({}, async (root) => {
        const error = await assertRejects(() =>
            importAppFile('missing.ts', root)
        )
        assert(!(error instanceof AppFileCompileError))
        assertStringIncludes(String(error), 'Module not found')
    })
})

Deno.test('#478 a hostile value thrown at evaluation is rethrown untouched', async () => {
    await withFiles({
        'hostile.ts':
            'throw new Proxy({}, { getPrototypeOf() { throw new Error("trap") } })\nexport {}\n',
    }, async (root) => {
        let caught: unknown
        try {
            await importAppFile('hostile.ts', root)
        } catch (error) {
            caught = error
        }
        assert(caught !== undefined)
        assert(typeof caught === 'object')
        // Not the trap's error, and not a translation: the thrown value itself.
        let threw = false
        try {
            Object.getPrototypeOf(caught)
        } catch {
            threw = true
        }
        assert(threw, 'expected the original Proxy back')
    })
})

// ============================================================================
// Review fold-in: the backstop's reach, the translation's strictness
// ============================================================================

Deno.test('#478 renderError withholds a V8 compile error wrapped in a plain Error', async () => {
    await withFiles({ 'regex.ts': BROKEN['regex.ts'] }, async (dir) => {
        const raw = await rawFailure(join(dir, 'regex.ts'))
        const wrapped = new Error(`load failed: ${raw.message}`)
        const out = renderError(wrapped)
        assertNoMarker(out)
        assert(out.startsWith('Error at file://'), out)
        assert(out.endsWith('/regex.ts:1:18 [source excerpt withheld]'), out)
    })
})

Deno.test('#478 importAppFile rethrows a runtime throw that only looks like an excerpt', async () => {
    await withFiles({
        'table.ts': 'throw new Error("table\\n  | row")\nexport {}\n',
    }, async (root) => {
        const error = await assertRejects(() => importAppFile('table.ts', root))
        assert(!(error instanceof AppFileCompileError), String(error))
        assertEquals((error as Error).message, 'table\n  | row')
    })
})

Deno.test('#478 a non-file location has its credential pairs redacted', async () => {
    // Derived from a real parse failure: only the module URL is swapped for
    // a remote one carrying a credential, as a broken remote import would.
    await withFiles({ 'excerpt.ts': BROKEN['excerpt.ts'] }, async (root) => {
        const raw = await rawFailure(join(root, 'excerpt.ts'))
        const remote = `https://cdn.example.com/mod.ts?token=${M}`
        const message = raw.message.replace(
            toFileUrl(join(root, 'excerpt.ts')).href,
            remote,
        )
        assertStringIncludes(message, remote)
        const error = translateImportFailure(raw.name, message, 'x.ts', root)
        assertInstanceOf(error, AppFileCompileError)
        assertEquals(error.file, 'https://cdn.example.com/mod.ts?token=***')
        assertNoMarker(error.message)
        assertNoMarker(Deno.inspect(error))
    })
})

Deno.test('#478 an unusable file location falls back to the imported file', async () => {
    await withFiles({ 'excerpt.ts': BROKEN['excerpt.ts'] }, async (root) => {
        const raw = await rawFailure(join(root, 'excerpt.ts'))
        const message = raw.message.replace(
            toFileUrl(join(root, 'excerpt.ts')).href,
            'file://elsewhere.example/excerpt.ts',
        )
        const error = translateImportFailure(
            raw.name,
            message,
            'app/x.ts',
            root,
        )
        assertInstanceOf(error, AppFileCompileError)
        assertEquals(error.file, join('app', 'x.ts'))
        assertEquals([error.line, error.column], [undefined, undefined])
        assertNoMarker(Deno.inspect(error))
    })
})

Deno.test('#478 a missing import with a trailing location renders unchanged', async () => {
    await withFiles({
        'importer.ts': "import './nope.ts'\nexport const a = 1\n",
    }, async (dir) => {
        const raw = await rawFailure(join(dir, 'importer.ts'))
        // The runtime colours this location, so it is read without ANSI.
        // deno-lint-ignore no-control-regex
        const plain = raw.message.replace(/\x1b\[[0-9;]*m/g, '')
        assertStringIncludes(plain, 'Module not found')
        assertStringIncludes(plain, '/importer.ts:1:8')
        assertEquals(readCompileDiagnostic(raw.name, raw.message), undefined)
        const out = renderError(raw)
        assert(!out.includes('[source excerpt withheld]'), out)
        assertStringIncludes(out, 'Module not found')
        assertStringIncludes(out, 'nope.ts')
    })
})

Deno.test('#494 a wrapped parse error with its newlines flattened is withheld', async () => {
    await withFiles(BROKEN, async (dir) => {
        for (const name of ['excerpt.ts', 'string_headline.ts']) {
            const raw = await rawFailure(join(dir, name))
            const flat = raw.message.replaceAll('\n', ' ')
            assertStringIncludes(flat, M)
            const out = renderError(new Error(`load failed: ${flat}`))
            const [line, column] = LOCATION[name]
            assertNoMarker(out, name)
            assert(
                out.endsWith(
                    `/${name}:${line}:${column} [source excerpt withheld]`,
                ),
                out,
            )
        }
    })
})

Deno.test('#494 a missing module still renders unchanged beside the SyntaxError signal', () => {
    // Hand-written on purpose: the real-file shape is pinned above; this pins
    // that the `SyntaxError: ` signal does not reach a message without it.
    const message =
        'Module not found "file:///a/nope.ts". at file:///a/b.ts:1:8'
    assertEquals(readCompileDiagnostic('TypeError', message), undefined)
    assertEquals(renderError(new TypeError(message)), `TypeError: ${message}`)
})

Deno.test('#478 a message that merely ends in a URL location is not withheld', () => {
    const error = new Error('request failed at http://a:1:1')
    assertEquals(renderError(error), 'Error: request failed at http://a:1:1')
})
