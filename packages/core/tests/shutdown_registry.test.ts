/**
 * The shutdown registry — the single list of teardowns, and the single home of
 * two rules: what order they run in, and what happens when one throws.
 *
 * The ordering RULE lives here — the comparator, and the tests that pin it.
 * `shutdown_sequence.test.ts` also asserts an order, over the framework's
 * priority band; that is a test of what the constants mean, not a second
 * comparator. What would be a plan violation is a `.sort(` appearing in the
 * bootstrap step, in `App.shutdown()` or in the sequence.
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { ShutdownRegistry } from '../kernel/shutdown_registry.ts'

Deno.test('ShutdownRegistry - runs hooks in ASCENDING priority', async () => {
    // The inverse of runBootHooks, which sorts descending. Registered out of
    // order on purpose: a registry that simply preserved insertion order would
    // pass an ascending-registered fixture by accident.
    const order: string[] = []
    const registry = new ShutdownRegistry()

    registry.register('database', () => void order.push('database'), 100)
    registry.register('notify', () => void order.push('notify'), 0)
    registry.register('cache', () => void order.push('cache'), 50)

    await registry.run()

    assertEquals(order, ['notify', 'cache', 'database'])
})

Deno.test('ShutdownRegistry - equal priorities keep registration order', async () => {
    const order: string[] = []
    const registry = new ShutdownRegistry()

    for (const name of ['first', 'second', 'third', 'fourth']) {
        registry.register(name, () => void order.push(name), 10)
    }

    await registry.run()

    assertEquals(order, ['first', 'second', 'third', 'fourth'])
})

Deno.test('ShutdownRegistry - awaits an async hook before starting the next', async () => {
    // Sequential, not concurrent. A teardown at priority 100 may depend on one
    // at 50 having finished — that is the entire point of ordering them.
    const order: string[] = []
    const registry = new ShutdownRegistry()

    registry.register('slow', async () => {
        await new Promise((r) => setTimeout(r, 20))
        order.push('slow')
    }, 1)
    registry.register('fast', () => void order.push('fast'), 2)

    await registry.run()

    assertEquals(order, ['slow', 'fast'])
})

Deno.test('ShutdownRegistry - priority defaults to 0', async () => {
    const order: string[] = []
    const registry = new ShutdownRegistry()

    registry.register('explicit', () => void order.push('explicit'), 5)
    registry.register('defaulted', () => void order.push('defaulted'))

    await registry.run()

    assertEquals(order, ['defaulted', 'explicit'])
})

Deno.test('ShutdownRegistry - reports how many ran', async () => {
    const registry = new ShutdownRegistry()
    registry.register('a', () => {})
    registry.register('b', () => {})

    const result = await registry.run()

    assertEquals(result.ran, 2)
    assertEquals(result.failed, [])
})

Deno.test('ShutdownRegistry - an empty registry runs cleanly', async () => {
    const result = await new ShutdownRegistry().run()

    assertEquals(result.ran, 0)
    assertEquals(result.failed, [])
})

Deno.test('ShutdownRegistry - is frozen once run() starts', async () => {
    // Invariant 2. A hook registered mid-sequence would silently never run —
    // the registry has already taken its snapshot — so it is refused loudly
    // instead of being accepted and dropped.
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => void warnings.push(args.join(' '))

    try {
        const registry = new ShutdownRegistry()
        let lateRan = false

        registry.register('early', () => {
            registry.register('late', () => void (lateRan = true))
        })

        const result = await registry.run()

        assertEquals(result.ran, 1, 'only the hook registered before run()')
        assertEquals(lateRan, false, 'the late hook must never execute')
        assertEquals(warnings.length, 1, 'and the refusal is not silent')
        assertStringIncludes(warnings[0], 'late')
    } finally {
        console.warn = originalWarn
    }
})

Deno.test('ShutdownRegistry - a late registration name is encoded in the warning', async () => {
    // Same rule as the failure path: anything caller-supplied that reaches a log
    // line goes through safeForLog first. `App.onShutdown(name, ...)` takes an
    // arbitrary string, so this is a real boundary and not a hypothetical one.
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => void warnings.push(args.join(' '))

    try {
        const registry = new ShutdownRegistry()
        registry.register('early', () => {
            registry.register('evil\nFAKE LOG LINE', () => {})
        })

        await registry.run()

        assertEquals(warnings.length, 1)
        assertEquals(
            warnings[0].includes('\n'),
            false,
            'no real newline survived into the warning',
        )
        assertStringIncludes(warnings[0], '\\x0a')
    } finally {
        console.warn = originalWarn
    }
})
