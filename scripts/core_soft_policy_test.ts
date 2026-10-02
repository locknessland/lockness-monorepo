/**
 * @fileoverview `deps.policy.jsonc`'s `core.soft` agrees with what core
 * actually loads at runtime (#505).
 *
 * `core.soft` is how the dependency graph learns about edges `deno info`
 * cannot see: the packages core imports through a variable specifier. Since
 * #505 there is exactly one such site, `optional_packages.ts`, and the packages
 * it loads are `OPTIONAL_FEATURES` plus `@lockness/redis` (the scheduler lock).
 * The two lists used to be kept in step by hand, and drifted: `events` sat in
 * `soft` while core imported it statically, which is the shape that hid
 * `KernelBooted` never firing in a JSR-installed app.
 *
 * @module scripts/core_soft_policy_test
 */

import { assertEquals } from '@std/assert'
import { parse } from '@std/jsonc'
import { OPTIONAL_FEATURES } from '../packages/core/kernel/bootstrap/optional_packages.ts'

/**
 * Entries `core.soft` carries that no loader call site produces, each with the
 * reason it stays. An entry here is a named exemption, not a silent one.
 */
const EXEMPT: Readonly<Record<string, string>> = {
    container:
        'a hard dependency declared soft before #505; stale, left for the core.soft cleanup the #505 disposition names',
    'deprecation-contracts':
        "declared so core/deno.json's existing specifier is visible in the graph (#392 review); no call site loads it yet",
}

/** Packages core loads through `importRequiredPackage` without a kernel key. */
const DRIVER_PACKAGES = ['redis']

async function coreSoft(): Promise<string[]> {
    const policy = parse(
        await Deno.readTextFile(
            new URL('../deps.policy.jsonc', import.meta.url),
        ),
    ) as { packages: { core: { soft?: string[] } } }
    return policy.packages.core.soft ?? []
}

const LOADED = [
    ...Object.values(OPTIONAL_FEATURES).map((p) =>
        p.slice('@lockness/'.length)
    ),
    ...DRIVER_PACKAGES,
].sort()

Deno.test('core.soft - every package the loader can import is declared soft', async () => {
    const soft = await coreSoft()
    assertEquals(LOADED.filter((p) => !soft.includes(p)), [])
})

Deno.test('core.soft - every other entry is a named exemption', async () => {
    const soft = await coreSoft()
    assertEquals(
        soft.filter((p) => !LOADED.includes(p) && !(p in EXEMPT)),
        [],
        'a soft edge no loader produces must be removed or exempted with a reason',
    )
})

Deno.test('core.soft - events is not soft: core imports it statically', async () => {
    assertEquals((await coreSoft()).includes('events'), false)
})
