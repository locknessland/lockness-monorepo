/**
 * @fileoverview #356 — `MutantGuard` on its own, outside any battery.
 *
 * `runBattery` exercises the guard only on its happy path: every mutant it
 * writes is restored by `restore` before disposal runs, so the disposal restore
 * — the one an exception between `mutate` and `restore` relies on — was never
 * witnessed. These tests drive the guard directly:
 *
 * - disposal writes back a mutant still in flight;
 * - `restore` on a file the guard never mutated leaves it alone;
 * - a `restore` whose write fails keeps the file in flight, so disposal tries
 *   it again;
 * - a constructor that fails partway removes the listeners it had installed.
 *
 * The fixture sits in a directory whose name holds a space: a guard that keys
 * its files by the percent-encoded URL pathname cannot write that path back.
 *
 * @module tests/mutations/mutant_guard
 */

import { assertEquals, assertThrows } from '@std/assert'
import { toFileUrl } from '@std/path'
import { spy, stub } from '@std/testing/mock'
import { MutantGuard } from './harness.ts'

const ORIGINAL = 'export const x = 1\n'
const MUTANT = 'export const x = 2\n'

/** Write a pristine subject in a fresh temp dir, run `body`, remove the dir. */
async function withSubject(
    body: (subject: URL, path: string) => Promise<void>,
): Promise<void> {
    const dir = await Deno.realPath(
        await Deno.makeTempDir({ prefix: 'lockness 356 guard ' }),
    )
    try {
        const path = `${dir}/subject.ts`
        await Deno.writeTextFile(path, ORIGINAL)
        await body(toFileUrl(path), path)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
}

Deno.test('#356 MutantGuard disposal restores a mutant still in flight', async () => {
    await withSubject(async (subject, path) => {
        {
            using guard = new MutantGuard()
            guard.mutate(subject, ORIGINAL, MUTANT)
            assertEquals(
                await Deno.readTextFile(path),
                MUTANT,
                'the mutant reached disk',
            )
        }
        assertEquals(
            await Deno.readTextFile(path),
            ORIGINAL,
            'an exception between mutate and restore leaves only disposal ' +
                'to put the source back',
        )
    })
})

Deno.test('#356 MutantGuard.restore on a file it never mutated is a no-op', async () => {
    await withSubject(async (subject, path) => {
        const edited = 'export const x = 1 // edited by hand\n'
        await Deno.writeTextFile(path, edited)
        using guard = new MutantGuard()
        guard.restore(subject)
        assertEquals(
            await Deno.readTextFile(path),
            edited,
            'a restore with no original on record must write nothing',
        )
    })
})

Deno.test('#356 a failed MutantGuard.restore stays in flight, so disposal retries it', async () => {
    await withSubject(async (subject, path) => {
        {
            using guard = new MutantGuard()
            guard.mutate(subject, ORIGINAL, MUTANT)
            {
                using _failing = stub(Deno, 'writeTextFileSync', () => {
                    throw new Deno.errors.PermissionDenied('a failing restore')
                })
                assertThrows(
                    () => guard.restore(subject),
                    Deno.errors.PermissionDenied,
                )
            }
            assertEquals(await Deno.readTextFile(path), MUTANT)
        }
        assertEquals(
            await Deno.readTextFile(path),
            ORIGINAL,
            'a restore that failed dropped the file from the guard, and ' +
                'disposal left the mutant on disk',
        )
    })
})

Deno.test('#356 a MutantGuard whose constructor fails removes the listeners it installed', () => {
    const install = Deno.addSignalListener
    let calls = 0
    using add = stub(
        Deno,
        'addSignalListener',
        (signal: Deno.Signal, handler: () => void) => {
            calls++
            if (calls === 3) {
                throw new Error('the third listener cannot be installed')
            }
            install.call(Deno, signal, handler)
        },
    )
    using remove = spy(Deno, 'removeSignalListener')
    assertThrows(() => new MutantGuard(), Error, 'the third listener')
    const installed = add.calls.slice(0, 2).map((call) => call.args)
    assertEquals(installed.length, 2)
    for (const [signal, handler] of installed) {
        assertEquals(
            remove.calls.some(({ args: [s, h] }) =>
                s === signal && h === handler
            ),
            true,
            `the ${signal} listener leaked from a guard that was never built`,
        )
    }
})
