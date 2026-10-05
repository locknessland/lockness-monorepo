/**
 * @fileoverview The failure branches of {@link Cli.discoverCommands} (#440).
 *
 * | Case                                   | Printed                                    |
 * | :------------------------------------- | :----------------------------------------- |
 * | a command file fails to load           | `⚠️ Failed to load command <file>: <why>`  |
 * | the directory cannot be scanned        | `⚠️ Failed to scan <dir> for commands: <why>` |
 * | the directory does not exist           | nothing                                    |
 *
 * A thrown value that is not an `Error` still reads as itself in both
 * warnings, never as `undefined` — (e) of #440.
 *
 * @module @lockness/cli/tests/discover_commands
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { Cli } from '../mod.ts'

/**
 * The lines `console.warn` / `console.error` printed while `fn` ran, one
 * entry per call with its arguments joined by a space.
 */
async function warnings(fn: () => Promise<void>): Promise<string[]> {
    const lines: string[] = []
    const original = { warn: console.warn, error: console.error }
    const record = (...args: unknown[]) => void lines.push(args.join(' '))
    console.warn = record
    console.error = record
    try {
        await fn()
        return lines
    } finally {
        console.warn = original.warn
        console.error = original.error
    }
}

/** Run `fn` against a fresh temporary directory, removed afterwards. */
async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness_discover_' })
    try {
        await fn(dir)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
}

/**
 * Whether `cli` has a command `name`: dispatching it exits 0, where an unknown
 * command exits 1. The output of either is discarded.
 */
async function isRegistered(cli: Cli, name: string): Promise<boolean> {
    const original = { log: console.log, error: console.error }
    console.log = () => {}
    console.error = () => {}
    try {
        return await cli.dispatch([name]) === 0
    } finally {
        console.log = original.log
        console.error = original.error
    }
}

/** A command file that registers, so a failing sibling is seen to be skipped. */
const GOOD_COMMAND = `
export class GoodCommand {
    static _commandName = 'good'
    static _commandDescription = 'Loads fine'
    handle() {}
}
`

/**
 * Run `fn` with `Deno.readDir` replaced by `fake`, restoring it afterwards.
 * `Deno.readDir` is a non-writable property, hence `defineProperty`.
 */
async function withReadDir(
    fake: typeof Deno.readDir,
    fn: () => Promise<void>,
): Promise<void> {
    const original = Deno.readDir
    const install = (value: typeof Deno.readDir) =>
        Object.defineProperty(Deno, 'readDir', {
            value,
            configurable: true,
            writable: true,
        })
    install(fake)
    try {
        await fn()
    } finally {
        install(original)
    }
}

Deno.test('discoverCommands - a file that fails to load is reported, and its siblings still register', async () => {
    await withTempDir(async (dir) => {
        await Deno.writeTextFile(join(dir, 'good_command.ts'), GOOD_COMMAND)
        await Deno.writeTextFile(
            join(dir, 'bad_command.ts'),
            "throw new Error('load boom')\n",
        )
        const cli = new Cli()

        const lines = await warnings(() => cli.discoverCommands(dir))

        assertEquals(lines.length, 1, lines.join('\n'))
        assertStringIncludes(
            lines[0],
            '⚠️ Failed to load command bad_command.ts: ',
        )
        assertStringIncludes(lines[0], 'load boom')
        assertEquals(await isRegistered(cli, 'good'), true)
    })
})

Deno.test('discoverCommands - a non-Error load failure reads as itself, not undefined', async () => {
    await withTempDir(async (dir) => {
        await Deno.writeTextFile(
            join(dir, 'odd_command.ts'),
            "throw 'plain load failure'\n",
        )
        const cli = new Cli()

        const lines = await warnings(() => cli.discoverCommands(dir))

        assertEquals(lines, [
            '⚠️ Failed to load command odd_command.ts: plain load failure',
        ])
    })
})

Deno.test('discoverCommands - a scan error other than NotFound is reported', async () => {
    await withTempDir(async (dir) => {
        // A file where a directory is expected: `readDir` fails, and not with
        // `NotFound`, so the commands it would have held are reported missing.
        const file = join(dir, 'not_a_directory')
        await Deno.writeTextFile(file, '')
        const cli = new Cli()

        const lines = await warnings(() => cli.discoverCommands(file))

        assertEquals(lines.length, 1, lines.join('\n'))
        assertStringIncludes(
            lines[0],
            `⚠️ Failed to scan ${file} for commands: `,
        )
        assertEquals(lines[0].includes('undefined'), false, lines[0])
    })
})

Deno.test('discoverCommands - a non-Error scan failure reads as itself, not undefined', async () => {
    const fake: typeof Deno.readDir = () => {
        throw 'plain scan failure'
    }
    await withReadDir(fake, async () => {
        const cli = new Cli()

        const lines = await warnings(() => cli.discoverCommands('app/command'))

        assertEquals(lines, [
            '⚠️ Failed to scan app/command for commands: plain scan failure',
        ])
    })
})

Deno.test('discoverCommands - a missing directory is silent', async () => {
    await withTempDir(async (dir) => {
        const cli = new Cli()

        const lines = await warnings(() =>
            cli.discoverCommands(join(dir, 'missing'))
        )

        assertEquals(lines, [])
    })
})
