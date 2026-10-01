/**
 * Every core site that reports an app file failing to load goes through
 * `renderError`, so neither a source excerpt nor a credential pair reaches
 * the terminal (#478).
 *
 * The broken files are REAL files written under the working directory and
 * imported by the site under test: the recogniser depends on the runtime's own
 * message, so a hand-written string would prove nothing. Every secret is a
 * fake marker assembled at run time, so the secret scan never sees one.
 */

import { assert, assertRejects, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { ControllerDiscovery } from '../routing/discovery.ts'
import { loadControllers } from '../ssg/enumerate.ts'
import { listenersStep } from '../kernel/bootstrap/steps/listeners.ts'

const HEAD = 'FA' + 'KE'
const TAIL = 'MA' + 'RK'
/** The fake secret. */
const M = HEAD + TAIL

/** A source that fails to parse on a line quoting the marker. */
const UNPARSEABLE = `export const a = 1\nexport const x = {{ apiKey: "${M}" }\n`

/** A source that throws a credential pair while it evaluates. */
const LEAKY =
    `throw new Error("fetch https://api.example.com/?token=${M}")\nexport {}\n`

/** Assert that no part of the marker survived into `out`. */
function assertNoMarker(out: string): void {
    assert(!out.includes(M), `marker leaked: ${out}`)
    assert(!out.includes(HEAD), `marker head leaked: ${out}`)
    assert(!out.includes(TAIL), `marker tail leaked: ${out}`)
}

/**
 * Create `<cwd>/tmp/<unique>/` with `files` in it, hand its cwd-relative and
 * absolute paths to `run`, and remove it afterwards. Under the working
 * directory because listener discovery resolves its directory against it.
 */
async function withDir(
    files: Record<string, string>,
    run: (dir: { rel: string; abs: string }) => Promise<void>,
): Promise<void> {
    const rel = `tmp/load-failure-${crypto.randomUUID().slice(0, 8)}`
    const abs = join(Deno.cwd(), rel)
    await Deno.mkdir(abs, { recursive: true })
    try {
        for (const [name, source] of Object.entries(files)) {
            await Deno.writeTextFile(join(abs, name), source)
        }
        await run({ rel, abs })
    } finally {
        await Deno.remove(abs, { recursive: true })
    }
}

/** Run `body` and return everything it wrote to the console. */
async function captured(body: () => Promise<unknown>): Promise<string> {
    const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    }
    const lines: string[] = []
    const record = (...args: unknown[]) => {
        lines.push(
            args.map((arg) => typeof arg === 'string' ? arg : Deno.inspect(arg))
                .join(' '),
        )
    }
    console.log = console.warn = console.error = record
    try {
        await body()
    } finally {
        Object.assign(console, original)
    }
    return lines.join('\n')
}

Deno.test('#478 ControllerDiscovery logs a broken controller by location, never its source', async () => {
    await withDir(
        { 'broken_controller.ts': UNPARSEABLE },
        async ({ rel, abs }) => {
            const output = await captured(() =>
                new ControllerDiscovery().discover(rel)
            )
            assertNoMarker(output)
            assertStringIncludes(output, 'AppFileCompileError: SyntaxError at')
            assertStringIncludes(output, 'broken_controller.ts:2:19')
            assert(!output.includes(abs), output)
        },
    )
})

Deno.test('#478 ControllerDiscovery redacts a credential pair a controller throws', async () => {
    await withDir({ 'leaky_controller.ts': LEAKY }, async ({ rel }) => {
        const output = await captured(() =>
            new ControllerDiscovery().discover(rel)
        )
        assertNoMarker(output)
        assertStringIncludes(output, 'token=***')
    })
})

Deno.test('#478 loadControllers (ssg) wraps a compile failure with no source in message or inspect', async () => {
    await withDir({ 'broken_controller.ts': UNPARSEABLE }, async ({ abs }) => {
        const error = await assertRejects(() => loadControllers(abs), Error)
        assertStringIncludes(
            error.message,
            'SSG could not import controller "broken_controller.ts"',
        )
        assertStringIncludes(error.message, 'SyntaxError at')
        assertNoMarker(error.message)
        // The CLI dispatcher prints the cause raw; it is an
        // AppFileCompileError, which carries no excerpt and no cause.
        assertNoMarker(Deno.inspect(error))
    })
})

Deno.test('#478 loadControllers (ssg) renders a credential pair, never embeds it raw', async () => {
    await withDir({ 'leaky_controller.ts': LEAKY }, async ({ abs }) => {
        const error = await assertRejects(() => loadControllers(abs), Error)
        assertNoMarker(error.message)
        assertStringIncludes(error.message, 'token=***')
    })
})

Deno.test('#478 the listeners boot step logs a broken listener rendered, not as an object', async () => {
    await withDir({ 'broken_listener.ts': UNPARSEABLE }, async ({ rel }) => {
        const context = {
            config: { listenersDir: rel },
        } as unknown as Parameters<
            typeof listenersStep.run
        >[0]
        const output = await captured(() =>
            Promise.resolve(listenersStep.run(context))
        )
        assertStringIncludes(output, 'Error discovering listeners: ')
        assertStringIncludes(output, 'SyntaxError at')
        assertNoMarker(output)
        // The object form printed a stack; the rendered line has none.
        assert(!output.includes('    at '), output)
    })
})

Deno.test('#478 the listeners boot step redacts a credential pair a listener throws', async () => {
    await withDir({ 'leaky_listener.ts': LEAKY }, async ({ rel }) => {
        const context = {
            config: { listenersDir: rel },
        } as unknown as Parameters<
            typeof listenersStep.run
        >[0]
        const output = await captured(() =>
            Promise.resolve(listenersStep.run(context))
        )
        assertNoMarker(output)
        assertStringIncludes(output, 'token=***')
    })
})
