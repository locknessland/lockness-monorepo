/**
 * @fileoverview `init` reports failure under the CLI exit contract (#436,
 * FR-002, FR-005, FR-010): it throws, never calls `Deno.exit()`, and a failed
 * run prints exactly one `❌` line and exits non-zero — registered on a `Cli`
 * and run standalone as `jsr:@lockness/init` alike.
 *
 * @module @lockness/init/tests/init_failure
 */

import { assert, assertEquals, assertMatch } from '@std/assert'
import { existsSync } from '@std/fs'
import { fromFileUrl, join } from '@std/path'
import { Cli } from '@lockness/cli'
import { registerInitCommand } from '../mod.ts'

const ENTRY = fromFileUrl(new URL('../mod.ts', import.meta.url))

/**
 * Dispatch `init <args>` on a real `Cli` inside a fresh temporary directory,
 * with console output recorded, and return the status, what `console.error`
 * received and the directory it ran in (the caller removes it).
 */
async function dispatchInit(
    args: string[],
    prepare?: (dir: string) => Promise<void>,
): Promise<
    { status: number; errors: unknown[][]; logs: string[]; dir: string }
> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness-init-fail-' })
    await prepare?.(dir)
    const errors: unknown[][] = []
    const logs: string[] = []
    const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        cwd: Deno.cwd(),
    }
    console.log = (...a: unknown[]) => void logs.push(a.join(' '))
    console.warn = (...a: unknown[]) => void errors.push(a)
    console.error = (...a: unknown[]) => void errors.push(a)
    Deno.chdir(dir)
    try {
        const cli = new Cli()
        registerInitCommand(cli)
        const status = await cli.dispatch(['init', ...args])
        return { status, errors, logs, dir }
    } finally {
        Deno.chdir(original.cwd)
        console.log = original.log
        console.warn = original.warn
        console.error = original.error
    }
}

/** Run `jsr:@lockness/init`'s entry as a subprocess in `cwd`. */
async function runEntry(
    args: string[],
    cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
    const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
        args: ['run', '-A', ENTRY, ...args],
        cwd,
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    const decoder = new TextDecoder()
    return {
        code,
        stdout: decoder.decode(stdout),
        stderr: decoder.decode(stderr),
    }
}

/** The lines of `text` that carry the failure glyph. */
function failureLines(text: string): string[] {
    return text.split('\n').filter((line) => line.includes('❌'))
}

Deno.test('init - an unknown --kit fails with one line, writing nothing', async () => {
    const { status, errors, dir } = await dispatchInit(['app', '--kit', 'nope'])
    try {
        assertEquals(status, 1)
        assertEquals(errors, [[
            '❌ Unknown kit "nope". Available kits: web, api, slim.',
        ]])
        assertEquals([...Deno.readDirSync(dir)], [])
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('init - a rejected --use fails with one line, writing nothing', async () => {
    const { status, errors, dir } = await dispatchInit(['app', '--use', 'x.y'])
    try {
        assertEquals(status, 1)
        assertEquals(errors.length, 1)
        const line = String(errors[0][0])
        assertMatch(line, /^❌ Invalid version format: "x\.y"/)
        assert(!line.includes('\n'), line)
        assertEquals([...Deno.readDirSync(dir)], [])
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('init - a failed step does not stop the others, then fails naming it', async () => {
    // A directory where the file should go makes exactly that write fail.
    const { status, errors, logs, dir } = await dispatchInit(
        ['app', '--kit', 'slim'],
        (d) =>
            Deno.mkdir(join(d, 'app', '.env.production.local'), {
                recursive: true,
            }),
    )
    try {
        assertEquals(status, 1)
        assertEquals(errors.length, 1)
        assertMatch(
            String(errors[0][0]),
            /^❌ 1 of \d+ steps failed: \.env\.production\.local caused by: /,
        )
        // The steps before and after it ran; success was not announced.
        assert(existsSync(join(dir, 'app', 'deno.json')))
        assert(existsSync(join(dir, 'app', '.env')))
        assert(!logs.some((line) => line.includes('✅ Done')))
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('init - --help and --version return without scaffolding', async () => {
    for (const flag of ['--help', '--version']) {
        const { status, errors, logs, dir } = await dispatchInit([flag])
        try {
            assertEquals(status, 0, flag)
            assertEquals(errors, [], flag)
            assert(logs.length > 0, flag)
            assertEquals([...Deno.readDirSync(dir)], [], flag)
        } finally {
            await Deno.remove(dir, { recursive: true })
        }
    }
})

Deno.test('init entry (subprocess) - an unknown --kit exits non-zero with one ❌ line and no uncaught error', async () => {
    const dir = await Deno.makeTempDir({ prefix: 'lockness-init-entry-' })
    try {
        const { code, stdout, stderr } = await runEntry(
            ['app', '--kit', 'nope'],
            dir,
        )
        assertEquals(code, 1)
        assertEquals(failureLines(stdout + stderr), [
            '❌ Unknown kit "nope". Available kits: web, api, slim.',
        ])
        assert(!stderr.includes('error: Uncaught'), stderr)
        assertEquals([...Deno.readDirSync(dir)], [])
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('init entry (subprocess) - --help and --version exit 0 without scaffolding', async () => {
    for (const flag of ['--help', '--version']) {
        const dir = await Deno.makeTempDir({ prefix: 'lockness-init-entry-' })
        try {
            const { code, stderr } = await runEntry([flag], dir)
            assertEquals(code, 0, `${flag}: ${stderr}`)
            assertEquals(failureLines(stderr), [], flag)
            assertEquals([...Deno.readDirSync(dir)], [], flag)
        } finally {
            await Deno.remove(dir, { recursive: true })
        }
    }
})
