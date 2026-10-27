/**
 * The listeners boot step against the fail-loud rule (#518).
 *
 * The step used to swallow an import failure whose message said "Cannot
 * resolve" and log every other one before carrying on. Discovery imports every
 * file before it registers any, so one broken listener dropped every listener
 * in the directory — and the explicit `config.listeners` sat in the same `try`,
 * so they went too. Events then fired into an empty dispatcher.
 *
 * The only tolerated failure now is an absent directory. Everything else
 * refuses the boot, naming the file.
 *
 * The broken listeners are REAL files written under the working directory and
 * imported by the step: the failure shapes come from the runtime, so a
 * hand-built error would prove nothing.
 */

import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { join } from '@std/path'
import { BaseEvent, dispatcher, Listener } from '@lockness/events'
import { listenersStep } from '../kernel/bootstrap/steps/listeners.ts'
import {
    discoverListeners,
    ListenerLoadError,
} from '../events/listener_discovery.ts'
import type { KernelConfig } from '../kernel/kernel_decorators.ts'

/** A listener whose import names a package no import map resolves. */
const UNRESOLVABLE =
    `import 'lockness-518-no-such-package'\nexport class Unresolvable {}\n`

/** A listener whose module throws while it evaluates. */
const THROWING = `throw new Error('listener exploded at load')\nexport {}\n`

/** A listener that loads cleanly and registers nothing. */
const HEALTHY = `export class Healthy {}\n`

/** The step's context, built from the only field it reads. */
function contextFor(
    config: KernelConfig,
): Parameters<typeof listenersStep.run>[0] {
    return { config } as unknown as Parameters<typeof listenersStep.run>[0]
}

/**
 * Create `<cwd>/tmp/<unique>/` with `files` in it, hand its cwd-relative path
 * to `run`, and remove it afterwards. Under the working directory because
 * discovery resolves `listenersDir` against it.
 */
async function withDir(
    files: Record<string, string>,
    run: (rel: string) => Promise<void>,
): Promise<void> {
    const rel = `tmp/listeners-518-${crypto.randomUUID().slice(0, 8)}`
    const abs = join(Deno.cwd(), rel)
    await Deno.mkdir(abs, { recursive: true })
    try {
        for (const [name, source] of Object.entries(files)) {
            await Deno.mkdir(join(abs, name, '..'), { recursive: true })
            await Deno.writeTextFile(join(abs, name), source)
        }
        await run(rel)
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

Deno.test('#518 a listener importing an unresolvable specifier refuses the boot, naming the file', async () => {
    await withDir(
        { 'healthy.ts': HEALTHY, 'unresolvable_listener.ts': UNRESOLVABLE },
        async (rel) => {
            const error = await assertRejects(
                () =>
                    Promise.resolve(
                        listenersStep.run(contextFor({ listenersDir: rel })),
                    ),
                ListenerLoadError,
            )
            assertEquals(error.file, `${rel}/unresolvable_listener.ts`)
            assertStringIncludes(
                error.message,
                `"${rel}/unresolvable_listener.ts"`,
            )
            assertStringIncludes(error.message, 'lockness-518-no-such-package')
        },
    )
})

Deno.test('#518 a listener that throws while it loads refuses the boot, naming the file', async () => {
    await withDir({ 'nested/throwing_listener.ts': THROWING }, async (rel) => {
        const error = await assertRejects(
            () =>
                Promise.resolve(
                    listenersStep.run(contextFor({ listenersDir: rel })),
                ),
            ListenerLoadError,
        )
        assertEquals(error.file, `${rel}/nested/throwing_listener.ts`)
        assertStringIncludes(error.message, 'listener exploded at load')
    })
})

Deno.test('#518 a listener module that throws NotFound is a broken file, not an absent directory', async () => {
    // A module reading a missing file at load throws Deno.errors.NotFound —
    // the very class an absent directory throws. It must not pass as one.
    const source =
        `Deno.readTextFileSync('./lockness-518-no-such-file')\nexport {}\n`
    await withDir({ 'reads_missing.ts': source }, async (rel) => {
        const error = await assertRejects(
            () =>
                Promise.resolve(
                    listenersStep.run(contextFor({ listenersDir: rel })),
                ),
            ListenerLoadError,
        )
        assertEquals(error.file, `${rel}/reads_missing.ts`)
    })
})

Deno.test('#518 the error carries no cause, so an uncaught refusal prints only the rendered line', async () => {
    await withDir({ 'throwing.ts': THROWING }, async (rel) => {
        const error = await assertRejects(
            () => discoverListeners(rel),
            ListenerLoadError,
        )
        assertEquals(error.cause, undefined)
    })
})

Deno.test('#518 an absent listeners directory boots silently', async () => {
    const output = await captured(() =>
        Promise.resolve(
            listenersStep.run(
                contextFor({ listenersDir: './tmp/listeners-518-absent' }),
            ),
        )
    )
    assertEquals(output, '')
})

Deno.test('#518 discoverListeners reports an absent directory as NotFound and lets the caller decide', async () => {
    await assertRejects(
        () => discoverListeners('./tmp/listeners-518-absent'),
        Deno.errors.NotFound,
    )
})

/** The event the explicit-listener tests dispatch. */
class ExplicitProbe extends BaseEvent {}

/** Every ExplicitProbe the explicit listener received. */
const received: ExplicitProbe[] = []

/** A listener a kernel names in `config.listeners`, not in a directory. */
class ExplicitListener {
    @Listener(ExplicitProbe)
    onProbe(event: ExplicitProbe): void {
        received.push(event)
    }
}

Deno.test('#518 explicit listeners register when the listeners directory is absent', async () => {
    received.length = 0
    try {
        await captured(() =>
            Promise.resolve(
                listenersStep.run(
                    contextFor({
                        listenersDir: './tmp/listeners-518-absent',
                        listeners: [ExplicitListener],
                    }),
                ),
            )
        )
        await dispatcher().emit(new ExplicitProbe())
        assertEquals(received.length, 1)
    } finally {
        dispatcher().removeAllListeners(ExplicitProbe)
    }
})

Deno.test('#518 explicit listeners register alongside a healthy listeners directory', async () => {
    received.length = 0
    try {
        await withDir({ 'healthy.ts': HEALTHY }, async (rel) => {
            const output = await captured(() =>
                Promise.resolve(
                    listenersStep.run(
                        contextFor({
                            listenersDir: rel,
                            listeners: [ExplicitListener],
                        }),
                    ),
                )
            )
            assertStringIncludes(
                output,
                'Registered 1 explicit event listener(s)',
            )
        })
        await dispatcher().emit(new ExplicitProbe())
        assertEquals(received.length, 1)
    } finally {
        dispatcher().removeAllListeners(ExplicitProbe)
    }
})

Deno.test('#518 a refused boot names the file outside a stack trace', async () => {
    await withDir({ 'broken.ts': UNRESOLVABLE }, async (rel) => {
        const error = await assertRejects(
            () => discoverListeners(rel),
            ListenerLoadError,
        )
        assertInstanceOf(error, Error)
        assertEquals(error.name, 'ListenerLoadError')
        // The rendered line is one line: the runtime's own message spans
        // several and quotes absolute paths; renderError escapes the breaks.
        assert(!error.message.includes('\n'), error.message)
    })
})
