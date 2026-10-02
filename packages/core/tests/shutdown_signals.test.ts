/**
 * Signal handling, measured against a real process.
 *
 * These cannot be tested in-process. `Deno.addSignalListener` is global, so a
 * test that sent itself a SIGINT would hijack the test runner's own handler,
 * and `Deno.exit` would end the run. The technique — spawn a `Deno.Command`
 * and observe what it prints and what code it leaves with — is the one already
 * used at `packages/core/tests/events_debug_step.test.ts:53`.
 *
 * The headline fact these guard: **installing a handler removes Deno's default
 * exit.** Measured on 2.9.6 — with a SIGINT listener registered, Ctrl-C runs
 * the handler and the process stays alive. So a path that fails to exit turns a
 * working Ctrl-C into a hang, which is strictly worse than before the feature.
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
    assertThrows,
} from '@std/assert'
import { exitCodeFor } from '../kernel/signals.ts'

/** Where a probe script lives. Inside the repo, so the import map resolves. */
const DIR = `${Deno.cwd()}/tmp`

/**
 * How a probe app starts listening and says so.
 *
 * Port 0, never a literal: the OS assigns a free port, so a probe's outcome
 * depends only on the shutdown behaviour under test, not on which ports a
 * parallel suite, a second worktree's gate, or any local process holds. With
 * fixed ports a taken one made the child exit 1 before READY, which read as a
 * shutdown failure (#493, the same class of gate flake as #455).
 *
 * `App.listen()` returns a promise wearing a server's type, so it is awaited
 * before the bound port is read off `addr`.
 */
const LISTEN = `const server = await app.listen(0)
console.log('READY ' + server.addr.port)`

/**
 * The ready line: `READY`, then the bound port when the probe listens. The
 * trailing newline is required so a port split across two stdout chunks is
 * never read half-written.
 */
const READY_LINE = /^READY(?: (\d+))?\r?\n/m

/** What one probe run left behind. */
interface ProbeResult {
    /** The child's exit code. */
    code: number
    /** Its stdout followed by its stderr. */
    out: string
    /** The port the OS bound, from the ready line; `null` if it never listens. */
    port: number | null
}

/** How long a probe may take to print its ready line. */
const READY_DEADLINE_MS = 15_000

/** What {@link readWithin} resolves to when the time ran out first. */
const EXPIRED = Symbol('expired')

/**
 * Wait for a pending stdout read, but no longer than `ms`.
 *
 * A bare `reader.read()` blocks for as long as the child stays silent, so a
 * deadline checked only between reads never fires for a child that prints
 * nothing at all (#495). The read is left pending on expiry, not abandoned:
 * the caller still owns it and must await it once the child is stopped.
 */
async function readWithin(
    pending: Promise<ReadableStreamReadResult<Uint8Array>>,
    ms: number,
): Promise<ReadableStreamReadResult<Uint8Array> | typeof EXPIRED> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const expiry = new Promise<typeof EXPIRED>((resolve) => {
        timer = setTimeout(() => resolve(EXPIRED), ms)
    })
    try {
        return await Promise.race([pending, expiry])
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Signal a child, tolerating only that it has already exited.
 *
 * `Deno.ChildProcess.kill()` throws a `TypeError` once the child's exit has
 * been observed, and a probe child may exit between any two lines here. That
 * one condition is benign — a child that is gone needs no signal — and must
 * not skip the cleanup that follows. Every other error is a real fault, the
 * other `TypeError`s included (an invalid signal is one), so it re-throws.
 *
 * @param child The probe child to signal.
 * @param signal The signal to send.
 * @throws {unknown} Anything `kill()` throws except "already terminated".
 */
function killIfRunning(child: Deno.ChildProcess, signal: Deno.Signal): void {
    try {
        child.kill(signal)
    } catch (error) {
        const alreadyExited = error instanceof TypeError &&
            error.message.includes('already terminated')
        if (!alreadyExited) throw error
    }
}

/**
 * Run one probe: write it, start it, wait for READY, signal it, collect.
 *
 * @param deadlineMs How long the child has to print its ready line. Only the
 * test that proves the deadline itself shortens it, to keep the suite fast.
 * @throws {Error} "probe did not start" when the child ends, or the wait runs
 * out, without printing its ready line. Signalling a probe that never started
 * would measure its startup failure and report it as a shutdown one.
 */
async function probe(
    source: string,
    signal: Deno.Signal,
    { twice = false, deadlineMs = READY_DEADLINE_MS } = {},
): Promise<ProbeResult> {
    await Deno.mkdir(DIR, { recursive: true })
    const file = `${DIR}/shutdown-probe-${crypto.randomUUID().slice(0, 8)}.ts`
    await Deno.writeTextFile(file, source)

    const child = new Deno.Command(Deno.execPath(), {
        args: ['run', '--allow-all', file],
        cwd: Deno.cwd(),
        stdout: 'piped',
        stderr: 'piped',
    }).spawn()

    const chunks: string[] = []
    const decoder = new TextDecoder()
    const reader = child.stdout.getReader()

    // Wait for the probe to say it is listening. Signalling before the handler
    // is installed would measure a race, not the behaviour. Every read races
    // the time left, so a silent child cannot hold the wait past the deadline.
    const deadline = Date.now() + deadlineMs
    let ready: RegExpMatchArray | null = null
    let ended = false
    let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null
    while (Date.now() < deadline) {
        pending ??= reader.read()
        const result = await readWithin(pending, deadline - Date.now())
        if (result === EXPIRED) break
        pending = null
        if (result.done) {
            ended = true
            break
        }
        chunks.push(decoder.decode(result.value))
        ready = chunks.join('').match(READY_LINE)
        if (ready) break
    }

    if (ready) {
        killIfRunning(child, signal)
        if (twice) {
            await new Promise((r) => setTimeout(r, 30))
            // Already gone is itself a pass for the "exits" assertions.
            killIfRunning(child, signal)
        }
    } else if (!ended) {
        // Alive but never ready: stop it so the drain below can finish.
        killIfRunning(child, 'SIGKILL')
    }

    // Drain the rest so the pipe closes and the child can exit. A read left
    // pending by an expired deadline comes first, or its chunk would be lost.
    try {
        if (pending) {
            const { value, done } = await pending
            if (!done) chunks.push(decoder.decode(value))
        }
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            chunks.push(decoder.decode(value))
        }
    } catch {
        // Reader closed under us; what we have is enough.
    }
    reader.releaseLock()

    // stderr READ, not cancelled. Every diagnostic this feature emits — the
    // deadline warning, the per-hook failure line, the platform-refusal warning
    // — goes to stderr, and discarding it left several behaviours with no cheap
    // assertion available.
    const errText = decoder.decode(
        new Uint8Array(await new Response(child.stderr).arrayBuffer()),
    )
    const status = await child.status
    await Deno.remove(file).catch(() => {})

    const out = chunks.join('') + errText
    if (!ready) {
        throw new Error(
            `probe did not start: no READY line (exit code ${status.code})\n${out}`,
        )
    }

    return {
        code: status.code,
        out,
        port: ready[1] === undefined ? null : Number(ready[1]),
    }
}

/** A probe app: real App, real listen(), one hook that reports it ran. */
function appSource(extra = ''): string {
    const core = new URL('../mod.ts', import.meta.url).href
    return `
import { App } from '${core}'
const app = new App()
await app.init({ controllers: [] })
app.onShutdown('probe-hook', () => { console.log('HOOK_RAN') })
${extra}
${LISTEN}
setTimeout(() => { console.log('TIMED_OUT'); Deno.exit(99) }, 20000)
`
}

Deno.test('signals - SIGTERM runs the hooks and exits 0', async () => {
    const { code, out } = await probe(appSource(), 'SIGTERM')

    assertStringIncludes(out, 'HOOK_RAN')
    assertEquals(code, 0)
    assertEquals(out.includes('TIMED_OUT'), false, 'it must not hang')
})

Deno.test('signals - SIGINT runs the hooks and exits 0', async () => {
    const { code, out } = await probe(appSource(), 'SIGINT')

    assertStringIncludes(out, 'HOOK_RAN')
    assertEquals(code, 0)
})

/** A probe app with no shutdown hook at all. */
function noHooksSource(): string {
    const core = new URL('../mod.ts', import.meta.url).href
    return `
import { App } from '${core}'
const app = new App()
await app.init({ controllers: [] })
${LISTEN}
setTimeout(() => { console.log('TIMED_OUT'); Deno.exit(99) }, 20000)
`
}

Deno.test('signals - the process exits even with NO hooks registered', async () => {
    // The regression that matters most. Registering a handler suppresses
    // Deno's default exit, so an app with nothing to tear down must still be
    // killed by Ctrl-C — otherwise this feature makes every trivial app worse.
    const { code, out } = await probe(noHooksSource(), 'SIGINT')

    assertEquals(code, 0)
    assertEquals(out.includes('TIMED_OUT'), false)
})

Deno.test('signals - probes pass while the ports they once hard-coded are held', async () => {
    // #493. The SIGINT and no-hooks probes used to bind these two ports, and a
    // second worktree's gate holding either one failed them for reasons that
    // had nothing to do with shutdown. The only literal ports left in the
    // file, on purpose: they name the collision this test reproduces.
    const formerlyHardCoded = [8932, 8933]
    const held: Deno.Listener[] = []
    try {
        for (const port of formerlyHardCoded) {
            try {
                held.push(Deno.listen({ port }))
            } catch (error) {
                // Already held by someone else is the very condition under
                // test, so it counts; anything else is a real failure.
                if (!(error instanceof Deno.errors.AddrInUse)) throw error
            }
        }

        const sigint = await probe(appSource(), 'SIGINT')
        assertStringIncludes(sigint.out, 'HOOK_RAN')
        assertEquals(sigint.code, 0)

        const noHooks = await probe(noHooksSource(), 'SIGINT')
        assertEquals(noHooks.code, 0)
        assertEquals(noHooks.out.includes('TIMED_OUT'), false)

        for (const { port } of [sigint, noHooks]) {
            assert(port !== null, 'the probe reports its bound port')
            assertEquals(
                formerlyHardCoded.includes(port),
                false,
                'the OS assigned the probe a free port',
            )
        }
    } finally {
        for (const listener of held) listener.close()
    }
})

Deno.test('probe - a child that never prints READY fails as "did not start"', async () => {
    // A probe that dies before it is ready must not be signalled and then
    // judged on shutdown: its failure is a startup one, and says so.
    await assertRejects(
        () => probe(`console.log('no ready line'); Deno.exit(3)`, 'SIGTERM'),
        Error,
        'probe did not start',
    )
})

/** Start a bare child with no pipes, so only its exit status needs awaiting. */
function spawnBare(code: string): Deno.ChildProcess {
    return new Deno.Command(Deno.execPath(), {
        args: ['eval', code],
        stdout: 'null',
        stderr: 'null',
    }).spawn()
}

Deno.test('probe - killing a child that has already exited is tolerated', async () => {
    // #495. A bare child.kill() throws here, and inside probe() that skipped
    // the drain, the status await and the temp-file removal.
    const child = spawnBare('')
    await child.status

    killIfRunning(child, 'SIGTERM')
})

Deno.test('probe - any other kill error still surfaces', async () => {
    // Also a TypeError, so a helper that tolerated the class instead of the
    // one condition would swallow it. Only "already terminated" is benign.
    const child = spawnBare('setTimeout(() => {}, 60_000)')
    try {
        assertThrows(
            () => killIfRunning(child, 'SIGBOGUS' as Deno.Signal),
            TypeError,
            'Invalid signal',
        )
    } finally {
        killIfRunning(child, 'SIGKILL')
        await child.status
    }
})

Deno.test('probe - a child whose listen() never settles fails as "did not start"', async () => {
    // #495. The child's TIMED_OUT safety timer is armed after listen(), so it
    // never fires here, and the child prints nothing: only the parent's
    // deadline can end this probe. The interval keeps the child's event loop
    // alive; without it Deno rejects the unresolved top-level await and exits
    // on its own, which is the case the test above already covers.
    await assertRejects(
        () =>
            probe(
                appSource(`setInterval(() => {}, 60_000)
await new Promise(() => {})`),
                'SIGTERM',
                { deadlineMs: 1_000 },
            ),
        Error,
        'probe did not start',
    )
})

Deno.test('signals - a failing hook still exits, with code 1', async () => {
    const { code, out } = await probe(
        appSource(`app.onShutdown('boom', () => { throw new Error('x') })`),
        'SIGTERM',
    )

    assertStringIncludes(out, 'HOOK_RAN')
    assertEquals(
        code,
        1,
        'a failed teardown is a degraded stop, not a clean one',
    )
})

Deno.test('signals - a hook that hangs is bounded by the deadline', async () => {
    // Without this the process would sit forever: the hook never resolves, and
    // Deno's default exit is gone because a handler is installed.
    const { code, out } = await probe(
        appSource(
            `app.configureShutdown({ deadlineMs: 300 })
app.onShutdown('hangs', () => new Promise(() => {}))`,
        ),
        'SIGTERM',
    )

    assertEquals(code, 1, 'a timed-out shutdown is not a clean one')
    assertEquals(out.includes('TIMED_OUT'), false, 'the deadline fired first')
})

Deno.test("signals - signals:false leaves today's behaviour untouched", async () => {
    // An application that wires its own handler opts out and keeps it whole.
    // Without the opt-out the framework's exit would truncate it mid-drain.
    const core = new URL('../mod.ts', import.meta.url).href
    const { code, out } = await probe(
        `
import { App } from '${core}'
const app = new App()
await app.init({ controllers: [] })
app.configureShutdown({ signals: false })
Deno.addSignalListener('SIGTERM', async () => {
    console.log('AUTHOR_HANDLER_START')
    await new Promise((r) => setTimeout(r, 100))
    console.log('AUTHOR_HANDLER_COMPLETED')
    Deno.exit(7)
})
${LISTEN}
setTimeout(() => { console.log('TIMED_OUT'); Deno.exit(99) }, 20000)
`,
        'SIGTERM',
    )

    assertStringIncludes(out, 'AUTHOR_HANDLER_COMPLETED')
    assertEquals(code, 7, 'the author owns the exit when they opt out')
})

Deno.test('exitCodeFor - maps a report onto a process exit code', () => {
    assertEquals(exitCodeFor({ failed: [], timedOut: false }), 0)
    assertEquals(exitCodeFor({ failed: ['x'], timedOut: false }), 1)
    assertEquals(exitCodeFor({ failed: [], timedOut: true }), 1)
})

Deno.test('FR-012 - a second signal exits immediately, without waiting', async () => {
    // The `twice` option existed on the probe helper from the start and NO
    // call site ever passed it, so the `if (sequence.isShuttingDown)` branch in
    // signals.ts — the whole of FR-012 — had no test at all. Dead harness reads
    // exactly like coverage.
    const core = new URL('../mod.ts', import.meta.url).href
    const { code, out } = await probe(
        `
import { App } from '${core}'
const app = new App()
await app.init({ controllers: [] })
app.configureShutdown({ deadlineMs: 30000 })
// Long enough that the FIRST signal cannot have finished when the second lands.
app.onShutdown('slow', () => new Promise((r) => setTimeout(r, 25000)))
${LISTEN}
setTimeout(() => { console.log('TIMED_OUT'); Deno.exit(99) }, 20000)
`,
        'SIGINT',
        { twice: true },
    )

    assertEquals(code, 1, 'the second signal exits 1 without waiting')
    assertEquals(
        out.includes('TIMED_OUT'),
        false,
        'it must not have waited for the 25s hook or the 30s deadline',
    )
    assertStringIncludes(out, 'Second SIGINT')
})

Deno.test('FR-010 - installShutdownSignals reports what it installed', async () => {
    // In a SUBPROCESS, deliberately. Calling installShutdownSignals in this
    // process would register real SIGINT/SIGTERM handlers on the test runner —
    // suppressing its default exit for every test after this one, and leaving
    // them behind. A test that breaks Ctrl-C for the suite is not worth the
    // coverage.
    const signalsMod = new URL('../kernel/signals.ts', import.meta.url).href
    const seqMod = new URL('../kernel/shutdown_sequence.ts', import.meta.url)
        .href

    const { code, out } = await probe(
        `
import { installShutdownSignals } from '${signalsMod}'
import { ShutdownSequence } from '${seqMod}'
const installed = installShutdownSignals(new ShutdownSequence())
console.log('INSTALLED=' + installed.join(','))
console.log('READY')
Deno.exit(0)
`,
        'SIGTERM',
    )

    assertStringIncludes(out, 'INSTALLED=SIGINT,SIGTERM')
    assertEquals(code, 0)
})
