/**
 * The kit manifest, and its agreement with the stub tree.
 *
 * The integrity test here is the important one. A kit is a *list of paths*, and
 * a list of paths goes stale the moment a stub is renamed — silently, because
 * nothing in a type system connects a string to a file. `deno task kits:smoke`
 * would catch it, but it scaffolds and boots three applications; this catches
 * the same class of mistake in milliseconds, on every commit.
 */

import { assertEquals, assertThrows } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { DEFAULT_KIT, type KitName, KITS, resolveKit } from '../kits.ts'

const STUBS = join(dirname(fromFileUrl(import.meta.url)), '..', 'stubs')
const KIT_NAMES = Object.keys(KITS) as KitName[]

/** Does this path exist? */
async function exists(path: string): Promise<boolean> {
    try {
        await Deno.stat(path)
        return true
    } catch {
        return false
    }
}

Deno.test('every file a kit lists actually exists', async () => {
    const missing: string[] = []

    for (const kit of KIT_NAMES) {
        for (const file of [...KITS[kit].base, ...KITS[kit].binaries]) {
            if (!await exists(join(STUBS, 'init', file))) {
                missing.push(`${kit}: stubs/init/${file}`)
            }
        }
        for (const file of KITS[kit].overlay) {
            if (!await exists(join(STUBS, 'kits', kit, file))) {
                missing.push(`${kit}: stubs/kits/${kit}/${file}`)
            }
        }
    }

    assertEquals(missing, [], `manifest names files that are not on disk`)
})

Deno.test('every overlay file on disk is claimed by its kit', async () => {
    // The other direction: a stub written and then never listed is dead weight
    // that reads like shipped code.
    const orphans: string[] = []

    for (const kit of KIT_NAMES) {
        const root = join(STUBS, 'kits', kit)
        if (!await exists(root)) continue

        const claimed = new Set(KITS[kit].overlay)
        for await (const path of walk(root)) {
            const relative = path.slice(root.length + 1)
            if (!claimed.has(relative)) orphans.push(`${kit}: ${relative}`)
        }
    }

    assertEquals(orphans, [], 'stub files nothing scaffolds')
})

/** Every file under a directory, as paths. */
async function* walk(dir: string): AsyncGenerator<string> {
    for await (const entry of Deno.readDir(dir)) {
        const path = join(dir, entry.name)
        if (entry.isDirectory) yield* walk(path)
        else if (entry.isFile) yield path
    }
}

Deno.test('resolveKit - defaults, accepts, and refuses', () => {
    assertEquals(resolveKit(undefined), DEFAULT_KIT)
    assertEquals(resolveKit(''), DEFAULT_KIT)
    for (const kit of KIT_NAMES) assertEquals(resolveKit(kit), kit)

    // Tolerant of shape, not of meaning.
    assertEquals(resolveKit('  API  '), 'api')

    // A typo must never fall back to the default: someone who asked for slim
    // and silently got a full Tailwind scaffold has no way to tell why.
    assertThrows(() => resolveKit('slm'), TypeError, 'Unknown kit "slm"')
    assertThrows(() => resolveKit('nope'), TypeError, 'web, api, slim')
})

Deno.test('slim ships none of what it says it omits', () => {
    const files = [...KITS.slim.base, ...KITS.slim.overlay]

    for (
        const forbidden of ['app/view/', 'postcss', 'public/img', 'database/']
    ) {
        assertEquals(
            files.filter((f) => f.includes(forbidden)),
            [],
            `slim must not scaffold ${forbidden}`,
        )
    }
    assertEquals(KITS.slim.binaries, [], 'no favicons without a browser')
})

Deno.test('api ships no view layer and no session', () => {
    const files = [...KITS.api.base, ...KITS.api.overlay]

    for (const forbidden of ['app/view/', 'postcss', 'config/session']) {
        assertEquals(
            files.filter((f) => f.includes(forbidden)),
            [],
            `api must not scaffold ${forbidden}`,
        )
    }
})

Deno.test('web is the default, and the only kit with binaries', () => {
    assertEquals(DEFAULT_KIT, 'web')
    for (const kit of KIT_NAMES) {
        if (kit === 'web') continue
        assertEquals(KITS[kit].binaries.length, 0)
    }
})

Deno.test('each kit scaffolds a deno.json, a kernel and a smoke test', () => {
    // The three files without which "it boots" cannot be true.
    for (const kit of KIT_NAMES) {
        const files = [...KITS[kit].base, ...KITS[kit].overlay]
        for (
            const required of [
                'deno.json.stub',
                'app/kernel.ts.stub',
                'app/routes.ts.stub',
                'main.ts.stub',
                'README.md.stub',
                'tests/smoke.test.ts.stub',
            ]
        ) {
            assertEquals(
                files.includes(required),
                true,
                `${kit} is missing ${required}`,
            )
        }
    }
})

Deno.test('a kit never lists the same path twice within one tree', () => {
    // A duplicate is harmless at runtime — the second write wins with identical
    // content — but it means someone edited the manifest twice for one file,
    // and the next edit will only find one of them.
    for (const kit of KIT_NAMES) {
        for (const [where, list] of Object.entries(KITS[kit])) {
            if (!Array.isArray(list)) continue
            assertEquals(
                new Set(list).size,
                list.length,
                `${kit}.${where} has a duplicate entry`,
            )
        }
    }
})
