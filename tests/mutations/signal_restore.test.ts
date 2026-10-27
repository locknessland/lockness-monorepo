/**
 * @fileoverview #356 — `runBattery` leaves no live mutant behind on any
 * catchable signal, and no signal listener behind when it ends.
 *
 * Four guarantees, each of which the pre-#356 harness broke:
 *
 * - **SIGHUP restores.** Closing the terminal a battery runs in delivers
 *   `SIGHUP`, whose default action exits without the restore. Witnessed by a
 *   subprocess: a real battery, a real signal, the source read back afterwards,
 *   and the exit code `128 + 1` a handled SIGHUP reports.
 * - **No async write to a guarded file.** A signal landing while an async
 *   mutant write is pending runs the synchronous restore first, and the late
 *   write then puts the mutant back. The race itself is a scheduling accident
 *   and cannot be reproduced on demand, so the test pins its precondition
 *   instead: `runBattery` calls none of `Deno.writeTextFile`, `Deno.writeFile`
 *   or `Deno.open`.
 * - **Listeners are removed on return AND on throw.** Listeners run in
 *   registration order, so a stale one that exits first pre-empts a later
 *   run's restore.
 * - **A failed restore keeps the lock.** Released over a live mutant, the lock
 *   no longer tells the next run that a run died on that file.
 *
 * Each fixture is a one-line subject and a one-test suite in a temp dir, so
 * the harness is exercised end to end without touching a source in the repo.
 *
 * @module tests/mutations/signal_restore
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { fromFileUrl } from '@std/path'
import { spy, stub } from '@std/testing/mock'
import { type Mutation, runBattery } from './harness.ts'

// Widened, so the suite's `x === 3` still type-checks against `1`.
const ORIGINAL = 'export const x: number = 1\n'
const TEST_NAME = 'fixture: x is one'

/**
 * A mutant `x = 3` holds the suite open until the source is restored, so a
 * signal sent to the battery lands while `runSuites` is pending — the window a
 * real interruption hits. Bounded, so an orphaned `deno test` whose battery
 * died unrestored cannot outlive the test by more than the deadline.
 */
const SUITE = `import { x } from './subject.ts'

Deno.test('${TEST_NAME}', async () => {
    const source = new URL('./subject.ts', import.meta.url)
    const deadline = Date.now() + 20_000
    while (x === 3 && Date.now() < deadline) {
        const now = await Deno.readTextFile(source).catch(() => '')
        if (!now.includes('= 3')) break
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    if (x !== 1) throw new Error('x is not one')
})
`

/** Paths of one fixture: a subject, its suite, and the dir holding both. */
interface Fixture {
    dir: string
    subject: URL
    suite: string
}

/** Build a fixture in a fresh temp dir, run `body`, then remove the dir. */
async function withFixture(
    body: (fixture: Fixture) => Promise<void>,
): Promise<void> {
    const dir = await Deno.realPath(
        await Deno.makeTempDir({ prefix: 'lockness-356-' }),
    )
    try {
        await Deno.writeTextFile(`${dir}/subject.ts`, ORIGINAL)
        await Deno.writeTextFile(`${dir}/subject.test.ts`, SUITE)
        await body({
            dir,
            subject: new URL(`file://${dir}/subject.ts`),
            suite: `${dir}/subject.test.ts`,
        })
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
}

/**
 * Assert that every signal listener added was removed, the same function for
 * the same signal, and that SIGINT, SIGTERM and SIGHUP were all covered.
 */
function assertListenersBalanced(
    added: unknown[][],
    removed: unknown[][],
): void {
    assertEquals(
        added.map(([signal]) => signal).sort(),
        ['SIGHUP', 'SIGINT', 'SIGTERM'],
        'the restore must be installed for every catchable hang-up signal',
    )
    for (const [signal, handler] of added) {
        assert(
            removed.some(([s, h]) => s === signal && h === handler),
            `the ${signal} listener was left installed after the run`,
        )
    }
}

/** The row every in-process fixture run uses: killed at once by the suite. */
function fixtureRow(subject: URL): Mutation {
    return {
        label: 'x becomes 2',
        file: subject,
        edits: [['= 1', '= 2']],
        killedBy: TEST_NAME,
    }
}

Deno.test('#356 runBattery removes its signal listeners on return', async () => {
    await withFixture(async ({ subject, suite }) => {
        using add = spy(Deno, 'addSignalListener')
        using remove = spy(Deno, 'removeSignalListener')
        const unexpected = await runBattery('#356 fixture', [suite], [
            fixtureRow(subject),
        ])
        assertEquals(unexpected, 0, 'the fixture row is killed as recorded')
        assertListenersBalanced(
            add.calls.map((call) => call.args),
            remove.calls.map((call) => call.args),
        )
        assertEquals(await Deno.readTextFile(subject), ORIGINAL)
    })
})

Deno.test('#356 runBattery writes nothing asynchronously', async () => {
    // Every async write API the harness could reach. Any of them, pending when
    // a signal lands, can complete after the synchronous restore.
    await withFixture(async ({ subject, suite }) => {
        using writeTextFile = spy(Deno, 'writeTextFile')
        using writeFile = spy(Deno, 'writeFile')
        using open = spy(Deno, 'open')
        const unexpected = await runBattery('#356 fixture', [suite], [
            fixtureRow(subject),
        ])
        assertEquals(unexpected, 0, 'the fixture row is killed as recorded')
        const asyncWrites = [
            ...writeTextFile.calls,
            ...writeFile.calls,
            ...open.calls,
        ].map((call) => String(call.args[0]))
        assertEquals(
            asyncWrites,
            [],
            'an async write to a guarded file can land after a signal’s ' +
                'synchronous restore and put the mutant back',
        )
        assertEquals(await Deno.readTextFile(subject), ORIGINAL)
    })
})

Deno.test('#356 runBattery removes its signal listeners when it throws', async () => {
    await withFixture(async ({ dir, suite }) => {
        using add = spy(Deno, 'addSignalListener')
        using remove = spy(Deno, 'removeSignalListener')
        await assertRejects(
            () =>
                runBattery('#356 fixture', [suite], [{
                    label: 'a row over a file that does not exist',
                    file: new URL(`file://${dir}/missing.ts`),
                    edits: [['= 1', '= 2']],
                    killedBy: TEST_NAME,
                }]),
            Deno.errors.NotFound,
        )
        assertListenersBalanced(
            add.calls.map((call) => call.args),
            remove.calls.map((call) => call.args),
        )
    })
})

Deno.test('#356 a restore that fails keeps the lock over the still-mutated file', async () => {
    // Releasing the lock over a live mutant hands the next run a mutated
    // source with nothing to say a run died on it: its baseline would read
    // the mutant as the pristine file.
    await withFixture(async ({ dir, subject, suite }) => {
        const write = Deno.writeTextFileSync
        {
            using _failingRestore = stub(
                Deno,
                'writeTextFileSync',
                (
                    path: string | URL,
                    data: string | ReadableStream<string>,
                    options?: Deno.WriteFileOptions,
                ) => {
                    if (data === ORIGINAL) {
                        throw new Deno.errors.PermissionDenied(
                            'a failing restore',
                        )
                    }
                    write.call(Deno, path, data as string, options)
                },
            )
            await assertRejects(
                () =>
                    runBattery('#356 fixture', [suite], [fixtureRow(subject)]),
                Deno.errors.PermissionDenied,
            )
        }
        assertEquals(
            await Deno.readTextFile(subject),
            ORIGINAL.replace('= 1', '= 2'),
            'the failing restore left the mutant, as the fixture intends',
        )
        assertEquals(
            (await Deno.stat(`${dir}/subject.ts.mutation-lock`)).isFile,
            true,
            'the lock was released over a file that still holds a mutant',
        )
    })
})

/** Resolve after `ms`, to pace a poll. */
function tick(ms: number): Promise<'tick'> {
    return new Promise((resolve) => setTimeout(() => resolve('tick'), ms))
}

Deno.test('#356 a SIGHUP mid-mutant restores the source, and the battery exits 128 + 1', async () => {
    await withFixture(async ({ dir, subject, suite }) => {
        const battery = `${dir}/battery.ts`
        const harness = new URL('./harness.ts', import.meta.url).href
        await Deno.writeTextFile(
            battery,
            `import { runBattery } from '${harness}'\n` +
                `Deno.exit(await runBattery('#356 SIGHUP fixture', ` +
                `[${JSON.stringify(suite)}], [{ label: 'x becomes 3', ` +
                `file: new URL(${JSON.stringify(subject.href)}), ` +
                `edits: [['= 1', '= 3']], killedBy: '${TEST_NAME}' }]))\n`,
        )
        // The battery lives in a temp dir, outside the workspace: the repo's
        // config is named so the harness's bare imports still resolve.
        const config = fromFileUrl(
            new URL('../../deno.jsonc', import.meta.url),
        )
        const child = new Deno.Command(Deno.execPath(), {
            args: ['run', '-A', '--config', config, battery],
            cwd: dir,
            stdout: 'piped',
            stderr: 'piped',
        }).spawn()
        const exited = child.status.then(() => 'exited' as const)
        let failure: unknown
        try {
            // The mutant on disk means the listeners are installed and the
            // battery is awaiting its suite: the window a hang-up hits. The
            // poll races the child's exit, so a battery that dies first fails
            // here, with its output, rather than after the whole deadline.
            const deadline = Date.now() + 60_000
            while (!(await Deno.readTextFile(subject)).includes('= 3')) {
                const next = await Promise.race([exited, tick(25)])
                assert(
                    next !== 'exited',
                    'the battery exited before its mutant reached disk',
                )
                assert(Date.now() < deadline, 'the mutant never reached disk')
            }
            child.kill('SIGHUP')
        } catch (error) {
            failure = error
            try {
                child.kill('SIGKILL')
            } catch (killError) {
                // The child already exited — the race above reports that.
                console.warn('SIGKILL not delivered to the battery:', killError)
            }
        }
        const status = await child.output()
        const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
        const out = `stdout:\n${decode(status.stdout)}\nstderr:\n` +
            decode(status.stderr)
        if (failure !== undefined) {
            const why = failure instanceof Error
                ? failure.message
                : String(failure)
            throw new Error(`${why}\n${out}`, { cause: failure })
        }
        assertEquals(
            await Deno.readTextFile(subject),
            ORIGINAL,
            `SIGHUP left the mutant on disk (exit ${status.code}, signal ` +
                `${status.signal}):\n${out}`,
        )
        assertEquals(
            status.signal,
            null,
            `the battery died of the signal instead of handling it:\n${out}`,
        )
        assertEquals(
            status.code,
            129,
            `a handled SIGHUP exits 128 + 1:\n${out}`,
        )
        assertEquals(
            (await Deno.stat(`${dir}/subject.ts.mutation-lock`)).isFile,
            true,
            'a handled signal exits without disposal, so the lock stays for ' +
                'the next run to reclaim',
        )
    })
})
