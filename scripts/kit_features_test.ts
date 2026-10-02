/**
 * @fileoverview #505 — every optional feature a kit's kernel configures is a
 * package the kit declares.
 *
 * Since #505 a kernel key whose package does not resolve refuses the boot. A
 * kit that sets `cache: config.cache` without declaring `@lockness/cache` is
 * therefore a kit that cannot start — which is exactly what the web and api
 * kits were, minus the refusal: they printed "not found - skipping" and ran
 * without a cache. This reads the stubs, not a scaffold, so it runs in the
 * gate in milliseconds; `kits:smoke` owns booting the result.
 *
 * @module
 */

import { assert, assertEquals } from '@std/assert'
import { type KitName, KITS } from '@lockness/init'
import {
    OPTIONAL_FEATURES,
    type OptionalFeature,
} from '../packages/core/kernel/bootstrap/optional_packages.ts'

const STUBS = new URL('../packages/init/stubs/', import.meta.url)

/** The stub a kit's file comes from: its overlay if it has one, else the base. */
async function kitStub(kit: KitName, path: string): Promise<string> {
    try {
        return await Deno.readTextFile(new URL(`kits/${kit}/${path}`, STUBS))
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error
        return await Deno.readTextFile(new URL(`init/${path}`, STUBS))
    }
}

/**
 * The top-level keys of the `@Kernel({ … })` object in a kernel stub.
 *
 * @param source - The kernel stub's text.
 * @returns The keys, in order.
 *
 * @example
 * ```ts
 * kernelKeys('@Kernel({\n    cache: config.cache,\n})') // ['cache']
 * ```
 */
export function kernelKeys(source: string): string[] {
    const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
    const start = code.indexOf('@Kernel({')
    assert(start >= 0, 'no @Kernel({ … }) in the kernel stub')
    const end = code.indexOf('\n})', start)
    const body = code.slice(start, end)
    return [...body.matchAll(/^ {4}(\w+)\s*:/gm)].map((m) => m[1])
}

Deno.test('kernelKeys - reads the top-level keys and skips comments', () => {
    assertEquals(
        kernelKeys(
            '/** @Kernel({ session: x }) */\n@Kernel({\n    /** c */\n    cache: config.cache,\n    // devtools: true,\n    compile: { a: 1 },\n})\nclass K {}',
        ),
        ['cache', 'compile'],
    )
})

for (const kit of Object.keys(KITS) as KitName[]) {
    Deno.test(`#505 ${kit}: every optional feature its kernel sets is a declared package`, async () => {
        const keys = kernelKeys(await kitStub(kit, 'app/kernel.ts.stub'))
        const config = JSON.parse(await kitStub(kit, 'deno.json.stub')) as {
            imports?: Record<string, string>
            unstable?: string[]
        }
        const imports = config.imports ?? {}

        const features = keys.filter((k): k is OptionalFeature =>
            k in OPTIONAL_FEATURES
        )
        for (const feature of features) {
            const pkg = OPTIONAL_FEATURES[feature]
            assertEquals(
                imports[pkg],
                `jsr:${pkg}@{{ locknessVersion }}`,
                `the ${kit} kernel sets \`${feature}\`, so its deno.json.stub must declare ${pkg} at the framework's version`,
            )
        }

        if (features.includes('cache')) {
            // The deno-kv driver (the production default in config/cache.ts)
            // throws on first use without the flag.
            assert(
                config.unstable?.includes('kv'),
                `the ${kit} kernel sets \`cache\`, so its deno.json.stub needs "unstable": ["kv"]`,
            )
        }
    })
}
