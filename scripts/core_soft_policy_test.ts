/**
 * @fileoverview `@lockness/core`'s optional peers are exactly the packages
 * core loads at runtime through a variable specifier (#505, #591).
 *
 * An optional peer in `packages/core/package.json` (`peerDependencies` +
 * `peerDependenciesMeta.<name>.optional`) is how the dependency graph learns
 * about an edge `deno info` cannot see: a package core imports through a
 * variable. That declaration is the fact; `deps.policy.jsonc` `core.soft` is
 * only the permission, and `deps:analyze` checks the fact against it. Since
 * #505 there is exactly one such site, `optional_packages.ts`, and the packages
 * it loads are `OPTIONAL_FEATURES` plus `@lockness/redis` (the scheduler lock).
 * The declaration and the loader used to be kept in step by hand, and drifted:
 * `events` sat in the soft list while core imported it statically, which is
 * the shape that hid `KernelBooted` never firing in a JSR-installed app. This
 * test holds them equal, with no exemption.
 *
 * @module scripts/core_soft_policy_test
 */

import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import { OPTIONAL_FEATURES } from '../packages/core/kernel/bootstrap/optional_packages.ts'
import { optionalPeersOf } from './deps_analyzer.ts'

/** Packages core loads through `importRequiredPackage` without a kernel key. */
const DRIVER_PACKAGES = ['redis']

/**
 * Core's optional peers, by short name, sorted.
 *
 * @returns The names from `packages/core/package.json`.
 */
async function corePeers(): Promise<string[]> {
    const manifest: unknown = JSON.parse(
        await Deno.readTextFile(
            new URL('../packages/core/package.json', import.meta.url),
        ),
    )
    return optionalPeersOf(manifest).sort()
}

const LOADED = [
    ...Object.values(OPTIONAL_FEATURES).map((p) =>
        p.slice('@lockness/'.length)
    ),
    ...DRIVER_PACKAGES,
].sort()

test('core optional peers - exactly the packages the loader can import', async () => {
    assertEquals(
        await corePeers(),
        LOADED,
        'an optional peer no loader produces must go; a loaded package must be declared',
    )
})

test('core optional peers - events is not one: core imports it statically', async () => {
    assertEquals((await corePeers()).includes('events'), false)
})
