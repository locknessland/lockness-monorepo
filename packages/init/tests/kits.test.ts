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
    // The one file under app/view/ is no view: it is the JSON error handler,
    // at the path core reads it from (#479).
    const files = [...KITS.slim.base, ...KITS.slim.overlay].filter((f) =>
        f !== 'app/view/pages/errors/error_handler.tsx.stub'
    )

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

Deno.test('#503 every kit defines the build task its Dockerfile runs', async () => {
    // The shared Dockerfile stub runs `deno task build` for every kit. A kit
    // without one fails `docker build`; a build that skips routes:generate
    // ships whatever app/routes.ts the image context happened to hold.
    for (const kit of KIT_NAMES) {
        const denoJson = JSON.parse(
            await Deno.readTextFile(
                join(STUBS, 'kits', kit, 'deno.json.stub'),
            ),
        ) as { tasks?: Record<string, string> }
        const build = denoJson.tasks?.build ?? ''
        assertEquals(
            build.includes('deno task routes:generate'),
            true,
            `${kit}: build task "${build}" does not run routes:generate`,
        )
        // Only web has a stylesheet to build.
        assertEquals(
            build.includes('deno task css:build'),
            kit === 'web',
            `${kit}: build task "${build}" and css:build`,
        )
    }
})

/** The kits whose overlay ships a migrations folder. */
const MIGRATING_KITS = KIT_NAMES.filter((kit) =>
    KITS[kit].overlay.some((f) => f.startsWith('database/migrations/'))
)

Deno.test('#444 web and api ship migrations; slim ships none', () => {
    assertEquals(MIGRATING_KITS, ['web', 'api'])
})

Deno.test('#444 a migrating kit ships drizzle.config.ts and registers db:*', async () => {
    for (const kit of KIT_NAMES) {
        const migrates = MIGRATING_KITS.includes(kit)
        // Without the config, db:migrate and db:fresh have nothing
        // to read; without `lockness.packages`, `db:migrate` is an unknown
        // command — and the kit's README tells the user to run it.
        assertEquals(
            KITS[kit].base.includes('drizzle.config.ts.stub'),
            migrates,
            `${kit}: drizzle.config.ts`,
        )
        const denoJson = JSON.parse(
            await Deno.readTextFile(
                join(STUBS, 'kits', kit, 'deno.json.stub'),
            ),
        ) as { lockness?: { packages?: string[] } }
        assertEquals(
            denoJson.lockness?.packages?.includes('drizzle') ?? false,
            migrates,
            `${kit}: lockness.packages names drizzle`,
        )
    }
})

Deno.test('#444 drizzle.config.ts never falls back to an empty url', async () => {
    const config = await Deno.readTextFile(
        join(STUBS, 'init', 'drizzle.config.ts.stub'),
    )
    // `?? ''` type-checks, and db:fresh then accepts an empty url — the driver
    // falls back to its default connection, a target nobody chose.
    assertEquals(/(\?\?|\|\|)\s*(''|""|``)/.test(config), false)
    assertEquals(
        config.includes('...(url ? { dbCredentials: { url } } : {})'),
        true,
    )
})

Deno.test('#444 every shipped migration is in the journal, with its snapshot', async () => {
    const dir = 'database/migrations/'
    for (const kit of MIGRATING_KITS) {
        const overlay = KITS[kit].overlay
        const journalStub = `${dir}meta/_journal.json.stub`
        // drizzle-orm's migrator reads the journal, not the folder: a .sql
        // file it does not list is never applied, and no journal at all is
        // "Can't find meta/_journal.json file".
        assertEquals(overlay.includes(journalStub), true, `${kit}: journal`)
        const journal = JSON.parse(
            await Deno.readTextFile(join(STUBS, 'kits', kit, journalStub)),
        ) as { entries: { idx: number; tag: string }[] }

        const listed = journal.entries.map((e) => `${dir}${e.tag}.sql.stub`)
        const shipped = overlay.filter((f) =>
            f.startsWith(dir) && f.endsWith('.sql.stub')
        )
        assertEquals(shipped.sort(), listed.sort(), `${kit}: sql files`)
        for (const entry of journal.entries) {
            const snapshot = `${dir}meta/${
                String(entry.idx).padStart(4, '0')
            }_snapshot.json.stub`
            assertEquals(
                overlay.includes(snapshot),
                true,
                `${kit}: ${snapshot}`,
            )
        }
    }
})
