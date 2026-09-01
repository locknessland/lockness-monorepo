/**
 * A bootstrap step that registers a shutdown teardown must run AFTER the app
 * exists.
 *
 * This guards a defect that shipped and was invisible: `steps/database.ts` is
 * order 100, `context.app = new App()` happens in `steps/app_init.ts` at order
 * 200, and the registration was written as `context.app?.onShutdown(...)`. The
 * optional chain evaluated to `undefined` — no throw, no warning — so the
 * database connection core opens itself was never released, while the shutdown
 * report happily said everything ran.
 *
 * The whole suite was green. Nothing here booted a real app with a database,
 * and `?.` turned a wiring error into silence.
 */

import { assertEquals } from '@std/assert'
import { getDefaultSteps } from '../kernel/bootstrap/registry.ts'
import { appInitStep } from '../kernel/bootstrap/steps/app_init.ts'

Deno.test('bootstrap - every step that registers a teardown runs after the App exists', async () => {
    // Enumerated by SEARCH over the step sources, not by listing the two I know
    // about — the point is to catch the next one, written by someone who has
    // never read this comment.
    const dir = new URL('../kernel/bootstrap/steps/', import.meta.url)
    const offenders: string[] = []

    for await (const entry of Deno.readDir(dir)) {
        if (!entry.name.endsWith('.ts')) continue

        const source = await Deno.readTextFile(new URL(entry.name, dir))
        // Comments stripped: the guidance in shutdown_hooks.ts mentions
        // onShutdown in prose, and prose is not a call.
        const code = source
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '')

        // Per EXPORTED STEP, not per file. `database.ts` holds two — the
        // connect step at 100 and the teardown step at 210 — so a file-wide
        // regex would read the first `order:` it found and clear a file that
        // still contains the defect.
        for (const block of code.split(/export const /).slice(1)) {
            if (!/\.onShutdown\s*\(/.test(block)) continue

            const name = block.match(/^(\w+)/)?.[1] ?? entry.name
            const match = block.match(/order:\s*(\d+)/)
            if (!match) {
                offenders.push(`${entry.name}:${name} (no order found)`)
                continue
            }

            const order = Number(match[1])
            if (order <= appInitStep.order) {
                offenders.push(
                    `${entry.name}:${name} order ${order} <= app_init ${appInitStep.order}`,
                )
            }
        }
    }

    assertEquals(
        offenders,
        [],
        'these steps register a teardown before context.app exists, so the ' +
            'optional chain silently drops it',
    )
})

Deno.test('bootstrap - the database teardown step is registered and ordered correctly', () => {
    const steps = getDefaultSteps()
    const step = steps.find((s) => s.id === 'database_teardown')

    assertEquals(
        step !== undefined,
        true,
        'the step is wired into the registry',
    )
    assertEquals(
        (step?.order ?? 0) > appInitStep.order,
        true,
        'it must run after the App is created',
    )
})
