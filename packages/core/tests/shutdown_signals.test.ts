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

import { assertEquals, assertStringIncludes } from '@std/assert'
import { exitCodeFor } from '../kernel/signals.ts'

/** Where a probe script lives. Inside the repo, so the import map resolves. */
const DIR = `${Deno.cwd()}/tmp`

/**
 * Run one probe: write it, start it, wait for READY, signal it, collect.
 */
async function probe(
    source: string,
    signal: Deno.Signal,
    { twice = false } = {},
): Promise<{ code: number; out: string }> {
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
    // is installed would measure a race, not the behaviour.
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
        const { value, done } = await reader.read()
        if (done) break
        chunks.push(decoder.decode(value))
        if (chunks.join('').includes('READY')) break
    }

    child.kill(signal)
    if (twice) {
        await new Promise((r) => setTimeout(r, 30))
        try {
            child.kill(signal)
        } catch {
            // Already gone — which is itself a pass for the "exits" assertions.
        }
    }

    // Drain the rest so the pipe closes and the child can exit.
    try {
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

    return { code: status.code, out: chunks.join('') + errText }
}

/** A probe app: real App, real listen(), one hook that reports it ran. */
function appSource(port: number, extra = ''): string {
    const core = new URL('../mod.ts', import.meta.url).href
    return `
import { App } from '${core}'
const app = new App()
await app.init({ controllers: [] })
app.onShutdown('probe-hook', () => { console.log('HOOK_RAN') })
${extra}
app.listen(${port})
console.log('READY')
setTimeout(() => { console.log('TIMED_OUT'); Deno.exit(99) }, 20000)
`
}

Deno.test('signals - SIGTERM runs the hooks and exits 0', async () => {
    const { code, out } = await probe(appSource(8931), 'SIGTERM')

    assertStringIncludes(out, 'HOOK_RAN')
    assertEquals(code, 0)
    assertEquals(out.includes('TIMED_OUT'), false, 'it must not hang')
})

Deno.test('signals - SIGINT runs the hooks and exits 0', async () => {
    const { code, out } = await probe(appSource(8932), 'SIGINT')

    assertStringIncludes(out, 'HOOK_RAN')
    assertEquals(code, 0)
})

Deno.test('signals - the process exits even with NO hooks registered', async () => {
    // The regression that matters most. Registering a handler suppresses
    // Deno's default exit, so an app with nothing to tear down must still be
    // killed by Ctrl-C — otherwise this feature makes every trivial app worse.
    const core = new URL('../mod.ts', import.meta.url).href
    const { code, out } = await probe(
        `
import { App } from '${core}'
const app = new App()
await app.init({ controllers: [] })
app.listen(8933)
console.log('READY')
setTimeout(() => { console.log('TIMED_OUT'); Deno.exit(99) }, 20000)
`,
        'SIGINT',
    )

    assertEquals(code, 0)
    assertEquals(out.includes('TIMED_OUT'), false)
})

Deno.test('signals - a failing hook still exits, with code 1', async () => {
    const { code, out } = await probe(
        appSource(
            8934,
            `app.onShutdown('boom', () => { throw new Error('x') })`,
        ),
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
            8935,
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
app.listen(8936)
console.log('READY')
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
app.listen(8937)
console.log('READY')
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
