/**
 * @fileoverview Tests for make:lang + registration — SC-006 (scaffold half, S2).
 *
 * i18n may not import `@lockness/cli` at runtime, so a rejected locale throws
 * the package's local failure class, recognised by shape (`exitCode`). The
 * conformance test drives the **real** `Cli.dispatch` — `@lockness/cli` is a
 * test-only dependency, invisible to the dependency scan — so a drifted local
 * class fails here rather than exiting 0 in a user's script (#436).
 *
 * @module @lockness/i18n/tests/cli_commands
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { Cli as RealCli } from '@lockness/cli'
import {
    type Cli,
    handleMakeLang,
    isContained,
    registerI18nCommands,
} from '../cli_commands.ts'

/** Run `fn` with `console.error` recorded instead of printed. */
async function captureErrors<T>(
    fn: () => Promise<T>,
): Promise<{ result: T; errors: unknown[][] }> {
    const errors: unknown[][] = []
    const original = console.error
    console.error = (...args: unknown[]) => void errors.push(args)
    try {
        return { result: await fn(), errors }
    } finally {
        console.error = original
    }
}

/** Assert `error` is the i18n package's one-line failure with exit code 1. */
function assertCommandFailure(error: Error, fragment: string): void {
    assertEquals(error.name, 'I18nCommandError')
    assertEquals((error as Error & { exitCode?: unknown }).exitCode, 1)
    assert(!error.message.includes('\n'), 'a failure message is one line')
    assert(
        error.message.includes(fragment),
        `"${error.message}" should mention "${fragment}"`,
    )
}

Deno.test('SC-006: make:lang fr-fr scaffolds resources/lang/fr_fr.ts', async () => {
    const dir = await Deno.makeTempDir()
    const prev = Deno.cwd()
    Deno.chdir(dir)
    try {
        const path = await handleMakeLang(['fr-fr'])
        assertEquals(path, 'resources/lang/fr_fr.ts') // join normalises the leading ./
        const written = await Deno.readTextFile(
            `${dir}/resources/lang/fr_fr.ts`,
        )
        assert(written.includes('export default'))
        assert(written.includes('fr-fr'))
    } finally {
        Deno.chdir(prev)
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('S2: make:lang rejects a traversal locale and writes nothing', async () => {
    const dir = await Deno.makeTempDir()
    const prev = Deno.cwd()
    Deno.chdir(dir)
    try {
        // Lower-cased before the shape check, so `EN_US` fails on its underscore.
        for (const bad of ['../../etc/x', 'fr/../../etc', 'EN_US']) {
            const error = await assertRejects(
                () => handleMakeLang([bad]),
                Error,
            )
            assertCommandFailure(error, 'Invalid locale')
        }
        // Nothing scaffolded.
        assertEquals(await Array.fromAsync(Deno.readDir(dir)), [])
    } finally {
        Deno.chdir(prev)
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('isContained rejects escapes and accepts children', () => {
    assert(isContained('./resources/lang', './resources/lang/fr_fr.ts'))
    assert(!isContained('./resources/lang', './resources/lang/../../etc'))
})

Deno.test('registerI18nCommands registers make:lang + i18n:extract', () => {
    const registered: string[] = []
    const cli: Cli = { register: (name) => void registered.push(name) }
    registerI18nCommands(cli)
    assert(registered.includes('make:lang'))
    assert(registered.includes('i18n:extract'))
})

Deno.test('make:lang with no locale throws a failure with exitCode 1 and prints nothing', async () => {
    const { result: error, errors } = await captureErrors(() =>
        assertRejects(() => handleMakeLang([]), Error)
    )
    assertCommandFailure(error, 'Please provide a locale')
    assertEquals(errors.length, 0, 'the dispatcher is the only printer')
})

Deno.test('make:lang through the real Cli.dispatch exits 1 with exactly one ❌ line', async () => {
    const cli = new RealCli()
    registerI18nCommands(cli)
    const { result: status, errors } = await captureErrors(() =>
        cli.dispatch(['make:lang'])
    )
    assertEquals(status, 1)
    assertEquals(errors.length, 1)
    const line = String(errors[0][0])
    assert(line.startsWith('❌ '), line)
    assertEquals(line.split('\n').length, 1)
    assert(line.includes('Please provide a locale'), line)
})
