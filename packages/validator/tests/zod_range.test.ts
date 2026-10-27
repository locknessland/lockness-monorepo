/**
 * Guards the zod range `@lockness/validator` declares to its consumers (#464).
 *
 * Validator hands its schemas to `@hono/zod-validator` through
 * `@lockness/hono/zod-validator`. zod schemas are identity-bound to the zod
 * instance that built them, so the declared range must sit inside the bridge's
 * peer range: a consumer resolving a zod version the bridge does not accept
 * gets a second copy, and the bridge then rejects the app's schemas.
 */

import { assert, assertEquals, assertMatch } from '@std/assert'

/** The bridge version whose zod peer range {@link BRIDGE_ZOD_FLOOR} records. */
const BRIDGE_VERSION = '0.7.6'

/**
 * The floor of `@hono/zod-validator@0.7.6`'s peer range for zod 3
 * (`^3.25.0 || ^4.0.0`). Update it together with {@link BRIDGE_VERSION}.
 */
const BRIDGE_ZOD_FLOOR: readonly [number, number, number] = [3, 25, 0]

Deno.test('the lockfile resolves the bridge whose peer floor this guard records', async () => {
    const lock = JSON.parse(
        await Deno.readTextFile(new URL('../../../deno.lock', import.meta.url)),
    ) as { specifiers: Record<string, string> }
    const resolved = Object.entries(lock.specifiers)
        .filter(([specifier]) =>
            specifier.startsWith('npm:@hono/zod-validator@')
        )
        .map(([, version]) => version.split('_')[0])

    assertEquals(
        resolved,
        [BRIDGE_VERSION],
        `@hono/zod-validator moved off ${BRIDGE_VERSION}: re-check its zod ` +
            'peer range, then update BRIDGE_ZOD_FLOOR and BRIDGE_VERSION',
    )
})

Deno.test('validator declares a zod floor inside the bridge peer range', async () => {
    const manifest = JSON.parse(
        await Deno.readTextFile(new URL('../deno.json', import.meta.url)),
    ) as { imports: Record<string, string> }
    const spec = manifest.imports['zod']

    const [major, minor, patch] = caretFloor(spec)

    assert(
        major === BRIDGE_ZOD_FLOOR[0] &&
            (minor > BRIDGE_ZOD_FLOOR[1] ||
                (minor === BRIDGE_ZOD_FLOOR[1] &&
                    patch >= BRIDGE_ZOD_FLOOR[2])),
        `zod range "${spec}" admits versions below the bridge's peer floor ` +
            `${BRIDGE_ZOD_FLOOR.join('.')}; a consumer on one would get a ` +
            `second zod copy`,
    )
})

/**
 * Assert `spec` is a caret npm range for zod and return its floor.
 *
 * @param spec - The import-map value, e.g. `npm:zod@^3.25.0`.
 * @returns The `[major, minor, patch]` of the range's lowest version.
 */
function caretFloor(spec: string): [number, number, number] {
    const pattern = /^npm:zod@\^(\d+)\.(\d+)\.(\d+)$/
    assertMatch(spec, pattern)
    const [, major, minor, patch] = spec.match(pattern) as RegExpMatchArray
    return [Number(major), Number(minor), Number(patch)]
}
