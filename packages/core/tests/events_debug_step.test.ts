/**
 * The bootstrap step that switches emitter debugging on.
 *
 * It exists so that `@lockness/events` needs no `--allow-env`. The parsing rule
 * is an allowlist, matching `SCHEDULER_ENABLED`: a denylist fails open, and a
 * switch that ignores what you typed is worse than none because you believe it
 * worked.
 */

import { assertEquals, assertThrows } from '@std/assert'
import { isDebugEnabled, setEventsDebug } from '@lockness/events'
import { eventsDebugStep } from '../kernel/bootstrap/steps/events_debug.ts'
import { getDefaultSteps } from '../kernel/bootstrap/registry.ts'
import type { BootstrapContext } from '../kernel/bootstrap/types.ts'

/** The step reads only the environment; the context is unused. */
const context = {} as BootstrapContext

/** Run the step with one value of the variable, then put everything back. */
function withEnv(value: string | undefined, run: () => void): void {
    const previous = Deno.env.get('LOCKNESS_EVENTS_DEBUG')
    const previousFlag = isDebugEnabled()
    if (value === undefined) Deno.env.delete('LOCKNESS_EVENTS_DEBUG')
    else Deno.env.set('LOCKNESS_EVENTS_DEBUG', value)
    try {
        run()
    } finally {
        if (previous === undefined) Deno.env.delete('LOCKNESS_EVENTS_DEBUG')
        else Deno.env.set('LOCKNESS_EVENTS_DEBUG', previous)
        setEventsDebug(previousFlag)
    }
}

Deno.test('eventsDebugStep - unset leaves the switch alone', () => {
    // Set it TRUE first. Setting it false and asserting false would pass for a
    // step that unconditionally forces it off — i.e. for a step that does not
    // leave it alone, which is the only thing this test is named for.
    withEnv(undefined, () => {
        setEventsDebug(true)
        eventsDebugStep.run(context)
        assertEquals(isDebugEnabled(), true, 'the step must not touch it')
    })
})

Deno.test('eventsDebugStep - an empty value leaves the switch alone too', () => {
    withEnv('', () => {
        setEventsDebug(true)
        eventsDebugStep.run(context)
        assertEquals(isDebugEnabled(), true)
    })
})

Deno.test('eventsDebugStep - a DENIED env permission reads as off, never throws', async () => {
    // plan.md:104 requires it, and it was neither implemented nor tested:
    // `Deno.env.get` raises NotCapable rather than returning undefined, and
    // this step runs at bootstrap order 10 — so a `deno compile` binary with a
    // narrowed permission set failed to boot over a feature that is off by
    // default.
    //
    // Asserted by running a real Deno with no --allow-env, because the throw
    // only happens when the permission is genuinely absent; there is no way to
    // fake that in-process.
    // Written INSIDE the repository so the workspace import map resolves
    // `@lockness/events`; a file in the system temp directory has its own
    // module scope and cannot see it.
    const dir = `${Deno.cwd()}/tmp`
    await Deno.mkdir(dir, { recursive: true })
    const file = `${dir}/events-debug-no-env-${
        crypto.randomUUID().slice(0, 8)
    }.ts`

    const step = new URL(
        '../kernel/bootstrap/steps/events_debug.ts',
        import.meta.url,
    ).href

    try {
        await Deno.writeTextFile(
            file,
            `import { eventsDebugStep } from '${step}'\n` +
                `eventsDebugStep.run({})\n` +
                `console.log('BOOTED')\n`,
        )

        const { success, stdout, stderr } = await new Deno.Command(
            Deno.execPath(),
            {
                args: ['run', '--allow-read', file],
                cwd: Deno.cwd(),
                stdout: 'piped',
                stderr: 'piped',
            },
        ).output()

        const out = new TextDecoder().decode(stdout)
        const err = new TextDecoder().decode(stderr)

        assertEquals(
            success,
            true,
            `the step threw without --allow-env:\n${err}`,
        )
        assertEquals(out.includes('BOOTED'), true)
    } finally {
        await Deno.remove(file).catch(() => {})
    }
})

Deno.test('eventsDebugStep - every ON value enables it', () => {
    for (const value of ['1', 'true', 'on', 'yes', 'TRUE', '  on  ']) {
        withEnv(value, () => {
            setEventsDebug(false)
            eventsDebugStep.run(context)
            assertEquals(isDebugEnabled(), true, `"${value}" should enable`)
        })
    }
})

Deno.test('eventsDebugStep - every OFF value disables it', () => {
    for (const value of ['0', 'false', 'off', 'no', 'FALSE', ' off ']) {
        withEnv(value, () => {
            setEventsDebug(true)
            eventsDebugStep.run(context)
            assertEquals(isDebugEnabled(), false, `"${value}" should disable`)
        })
    }
})

Deno.test('eventsDebugStep - a trailing space or a CRLF still parses', () => {
    // The shape that motivates trimming: a value copied into a .env file on
    // Windows arrives as "true\r". A denylist would read that as "not off,
    // therefore on" — right by accident here, wrong for "false\r".
    withEnv('false\r\n', () => {
        setEventsDebug(true)
        eventsDebugStep.run(context)
        assertEquals(isDebugEnabled(), false, 'a CRLF must not defeat OFF')
    })
})

Deno.test('eventsDebugStep - an unrecognised value throws AT BOOT', () => {
    // Loud, and here rather than in the emitter. `isDebugEnabled()` is
    // consulted on every dispatch and lifecycle_middleware emits on every
    // request, so the same throw inside the library would turn one environment
    // typo into a 500 on every request instead of one failure at startup.
    withEnv('verbose', () => {
        assertThrows(
            () => eventsDebugStep.run(context),
            TypeError,
            'is not recognised',
        )
    })
})

Deno.test('eventsDebugStep - runs before anything can emit', () => {
    // The events step, which dispatches KernelBooted, is order 400. A switch
    // read after that would miss the boot it was turned on to diagnose.
    assertEquals(eventsDebugStep.order, 10)
    assertEquals(eventsDebugStep.id, 'events_debug')
})

Deno.test('eventsDebugStep - is actually wired into the bootstrap registry', () => {
    // Asserting the step's own `order` and `id` says nothing about whether any
    // application runs it. Delete one line from registry.ts and the whole debug
    // feature is dead in every running app, with the suite fully green — the
    // same failure mode `events_reachability.test.ts` catches on the export
    // side, left open on the wiring side.
    const steps = getDefaultSteps()
    const step = steps.find((s) => s.id === 'events_debug')

    assertEquals(step !== undefined, true, 'the step is registered')
    assertEquals(step?.order, 10)

    // And it runs before anything can emit: nothing with a lower order exists.
    const earlier = steps.filter((s) => s.order < 10).map((s) => s.id)
    assertEquals(earlier, [], 'no step precedes the debug switch')
})
