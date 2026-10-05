/**
 * @fileoverview The upgrade command line run in-process (#436): help, the
 * one-line failures, and the dry-run and applied summaries. The version
 * provider is a fake, so no case reaches the network. `cli.test.ts` runs the
 * same tool as a subprocess to pin the exit status.
 *
 * @module @lockness/upgrade/tests/cli_main
 */

import {
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { join } from '@std/path'
import { main } from '../cli.ts'
import type { VersionProvider } from '../types.ts'

/** A provider that answers every package with `version`. */
function fixedProvider(version: string): VersionProvider {
    return { getLatestVersion: () => Promise.resolve(version) }
}

/** Run `fn` in a temp dir holding `denoJson`, capturing `console.log`. */
async function inProject(
    denoJson: unknown | undefined,
    fn: (dir: string, logs: string[]) => Promise<void>,
): Promise<void> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness_upgrade_main_' })
    const previous = Deno.cwd()
    const log = console.log
    const logs: string[] = []
    console.log = (...args: unknown[]) => logs.push(args.join(' '))
    try {
        if (denoJson !== undefined) {
            await Deno.writeTextFile(
                join(dir, 'deno.json'),
                JSON.stringify(denoJson),
            )
        }
        Deno.chdir(dir)
        await fn(dir, logs)
    } finally {
        console.log = log
        Deno.chdir(previous)
        await Deno.remove(dir, { recursive: true })
    }
}

const PROJECT = {
    imports: { '@lockness/core': 'jsr:@lockness/core@^0.1.0' },
}

Deno.test('upgrade main - --help prints usage and touches nothing', async () => {
    await inProject(undefined, async (_dir, logs) => {
        await main(['--help'], fixedProvider('9.9.9'))
        assertStringIncludes(logs.join('\n'), 'Lockness Upgrade Tool')
    })
})

Deno.test('upgrade main - no Lockness package is a command failure', async () => {
    await inProject(
        { imports: { '@std/path': 'jsr:@std/path@^1' } },
        async () => {
            const error = await assertRejects(
                () => main([], fixedProvider('9.9.9')),
                Error,
            )
            assertEquals((error as Error & { exitCode?: number }).exitCode, 1)
        },
    )
})

Deno.test('upgrade main - a missing deno.json propagates as itself', async () => {
    await inProject(undefined, async () => {
        const error = await assertRejects(() =>
            main([], fixedProvider('9.9.9'))
        )
        assertInstanceOf(error, Deno.errors.NotFound)
    })
})

Deno.test('upgrade main - a dry run lists the upgrades and writes nothing', async () => {
    await inProject(PROJECT, async (dir, logs) => {
        await main(['--dry-run'], fixedProvider('0.5.0'))
        const out = logs.join('\n')
        assertStringIncludes(out, 'Would upgrade 1 package(s)')
        assertStringIncludes(out, '0.1.0 → 0.5.0')
        assertStringIncludes(out, 'This was a dry run')
        const written = JSON.parse(
            await Deno.readTextFile(join(dir, 'deno.json')),
        )
        assertEquals(written, PROJECT)
    })
})

Deno.test('upgrade main - an applied upgrade rewrites deno.json', async () => {
    await inProject(PROJECT, async (dir, logs) => {
        await main([], fixedProvider('0.5.0'))
        assertStringIncludes(logs.join('\n'), 'deno.json updated successfully')
        const written = await Deno.readTextFile(join(dir, 'deno.json'))
        assertStringIncludes(written, 'jsr:@lockness/core@^0.5.0')
    })
})

Deno.test('upgrade main - packages already current say so', async () => {
    await inProject(PROJECT, async (_dir, logs) => {
        await main(['0.1.0'], fixedProvider('9.9.9'))
        assertStringIncludes(logs.join('\n'), 'already up to date')
    })
})
