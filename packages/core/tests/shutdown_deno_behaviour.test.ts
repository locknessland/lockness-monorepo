/**
 * The three Deno facts the shutdown design rests on.
 *
 * Each was measured before the design was fixed, and each changed it. They are
 * pinned here so that a future Deno release which alters one fails a test,
 * rather than a production shutdown.
 *
 * Without facts 2 and 3 this feature would be a regression: installing signal
 * handlers removes Deno's default exit, and the server drain can never finish,
 * so an unbounded implementation turns a working Ctrl-C into a permanent hang.
 */

import { assertEquals } from '@std/assert'

Deno.test('deno - addSignalListener needs no permission', async () => {
    // Unlike Deno.env.get, which raises NotCapable and cost the events feature
    // a boot failure at bootstrap order 10. Run in a child with ZERO flags,
    // because this process has them all.
    const dir = `${Deno.cwd()}/tmp`
    await Deno.mkdir(dir, { recursive: true })
    const file = `${dir}/perm-probe-${crypto.randomUUID().slice(0, 8)}.ts`

    try {
        await Deno.writeTextFile(
            file,
            `for (const s of ['SIGINT', 'SIGTERM'] as const) {
                 const h = () => {}
                 Deno.addSignalListener(s, h)
                 Deno.removeSignalListener(s, h)
             }
             console.log(Deno.build.os)
             Deno.exit(0)\n`,
        )

        const { success, stderr } = await new Deno.Command(Deno.execPath(), {
            args: ['run', '--no-prompt', file],
            cwd: Deno.cwd(),
            stdout: 'piped',
            stderr: 'piped',
        }).output()

        assertEquals(
            success,
            true,
            `the shutdown path must need no permission:\n${
                new TextDecoder().decode(stderr)
            }`,
        )
    } finally {
        await Deno.remove(file).catch(() => {})
    }
})

Deno.test('deno - SIGKILL cannot be bound, and says so with a TypeError', () => {
    // The reachable throw that justifies a try/catch per signal rather than a
    // Deno.build.os check. A platform check encodes a belief about which OS
    // supports what; the catch is right either way.
    let thrown: unknown
    try {
        Deno.addSignalListener('SIGKILL' as Deno.Signal, () => {})
    } catch (error) {
        thrown = error
    }

    assertEquals(thrown instanceof TypeError, true)
})

Deno.test('deno - setTimeout clamps out-of-range delays to 1ms', async () => {
    // Why resolveDeadlineMs rejects instead of passing values through.
    // `deadlineMs: Infinity` written to mean "never time out" would otherwise
    // become the SHORTEST possible deadline, silently.
    for (const bad of [NaN, Infinity, 2 ** 31]) {
        const started = performance.now()
        await new Promise<void>((resolve) => setTimeout(resolve, bad))
        const elapsed = performance.now() - started

        assertEquals(
            elapsed < 50,
            true,
            `setTimeout(${bad}) fired after ${elapsed}ms — it was expected to be ` +
                `clamped to ~1ms, which is the whole reason the deadline is validated`,
        )
    }
})
