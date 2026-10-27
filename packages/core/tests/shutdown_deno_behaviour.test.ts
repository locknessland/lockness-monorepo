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

/** A delay `setTimeout` honours exactly, to race the out-of-range one against. */
const REFERENCE_DELAY_MS = 50

/**
 * Schedule `delay`, then a valid {@link REFERENCE_DELAY_MS} timer, and report
 * which fires first. Both are cleared either way, so a delay that IS honoured
 * leaves no 24-day timer behind for the sanitizer to flag.
 *
 * The out-of-range timer is scheduled FIRST on purpose: its deadline is then
 * at or before the reference's for any reference of at least 1ms, however long
 * the process stalls between the two calls.
 */
function firstToFire(delay: number): Promise<'out-of-range' | 'reference'> {
    return new Promise((resolve) => {
        const timers: ReturnType<typeof setTimeout>[] = []
        const settle = (winner: 'out-of-range' | 'reference') => {
            for (const timer of timers) clearTimeout(timer)
            resolve(winner)
        }
        timers.push(setTimeout(() => settle('out-of-range'), delay))
        timers.push(setTimeout(() => settle('reference'), REFERENCE_DELAY_MS))
    })
}

Deno.test('deno - setTimeout clamps out-of-range delays instead of honouring them', async () => {
    // Why resolveDeadlineMs rejects instead of passing values through.
    // `deadlineMs: Infinity` written to mean "never time out" would otherwise
    // become the SHORTEST possible deadline, silently.
    //
    // ORDER, NOT ELAPSED TIME (#455). This used to assert `elapsed < 50` on the
    // wall clock, which measured the machine's scheduling latency as well as
    // the clamp. Sampled on Deno 2.9.6 inside the core suite, with kits:smoke
    // running alongside: p50 2.6ms, p99 11.7ms, and 1 run in 40 still failed —
    // setTimeout(NaN) after 121ms. Adding busy loops at 4x the core count: p99
    // 25ms, max 85ms in the samples, and 2 runs in 24 failed at 89ms and 96ms.
    // Every failure was the first timer measured, and the tail has no ceiling
    // under load: a wider bound would only have moved the cliff.
    //
    // Two timers in the same queue fire in deadline order, so a stall delays
    // both and cannot swap them. That is the HTML timer contract, not only an
    // observation: a timer started earlier with an equal or shorter timeout
    // runs first. Across 6,855 such races, sampled idle and under every load
    // above, the clamped timer never lost, even to a 2ms reference. If a delay
    // were honoured (24 days for 2**31), the 50ms reference would win and this
    // would fail, at a cost of 50ms rather than a hang.
    for (const outOfRange of [NaN, Infinity, 2 ** 31]) {
        assertEquals(
            await firstToFire(outOfRange),
            'out-of-range',
            `setTimeout(${outOfRange}) fired after a ${REFERENCE_DELAY_MS}ms timer ` +
                `scheduled after it, so it was honoured as a long delay instead of ` +
                `being clamped to ~1ms, which is the whole reason the deadline is validated`,
        )
    }
})
