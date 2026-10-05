/**
 * @fileoverview The kits' shipped migrations folders are what drizzle-kit
 * generates from their schema stubs, and what drizzle-orm can read (#444).
 *
 * For each kit that ships migrations, an app is scaffolded through
 * `registerInitCommand` exactly as a user gets it, then:
 *
 * 1. drizzle-orm's own `readMigrationFiles` reads its folder — the call
 *    `db:fresh` makes, and the one that threw "Can't find
 *    meta/_journal.json file" on the folder #444 was filed against;
 * 2. a fresh `drizzle-kit generate` from the kit's schema stub matches the
 *    shipped folder (`diffKitMigrations`);
 * 3. the app's next `db:generate` — drizzle-kit over the scaffolded schema,
 *    config and folder — reports no changes and writes nothing.
 *
 * Steps 2 and 3 spawn the pinned npm drizzle-kit, so they need its package.
 * On a cold offline machine they skip with a printed reason — only on a
 * recognised network error, the #157 pattern of
 * `packages/vite/tests/e2e_smoke.test.ts`; any other failure fails.
 *
 * @module
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { type KitName, registerInitCommand } from '@lockness/init'
import type { Cli } from '@lockness/cli'
import {
    compareMigrations,
    diffKitMigrations,
    diffTree,
    DrizzleKitError,
    drizzleProject,
    migratingKits,
    MIGRATIONS_DIR,
    readTree,
    runDrizzleKit,
    shippedKitMigrations,
} from './kit_migrations.ts'

/** A network failure fetching the npm package — the only reason to skip. */
const OFFLINE =
    /error sending request|failed to fetch|dns error|tcp connect error|connection refused|network is unreachable|os error (50|51|65|111)|error trying to connect/i

/**
 * Whether a drizzle-kit failure is the machine being offline.
 *
 * @param output - What drizzle-kit (or Deno fetching it) printed.
 * @returns True on a recognised network error.
 */
function offline(output: string): boolean {
    return OFFLINE.test(output)
}

/**
 * Scaffold a kit through `init`'s own command into an absolute directory —
 * no `chdir`, so nothing else in the suite sees a moved working directory.
 *
 * @param kit - The kit.
 * @param parent - An existing directory to scaffold into.
 * @returns The project directory.
 */
async function scaffold(kit: KitName, parent: string): Promise<string> {
    const project = join(parent, `${kit}-app`)
    let handler: ((args: string[]) => Promise<void>) | undefined
    registerInitCommand({
        register: (_name: string, fn: (args: string[]) => Promise<void>) => {
            handler = fn
        },
    } as unknown as Cli)
    assert(handler, 'registerInitCommand registered no handler')
    await handler([project, '--kit', kit])
    return project
}

// -----------------------------------------------------------------------------
// The comparison — pure, no drizzle-kit
// -----------------------------------------------------------------------------

/** A folder shaped like drizzle-kit's output. */
function folder(when: number, id: string, sql: string): Map<string, string> {
    return new Map([
        ['0000_create_users.sql', sql],
        [
            'meta/_journal.json',
            JSON.stringify({
                version: '7',
                dialect: 'postgresql',
                entries: [{
                    idx: 0,
                    version: '7',
                    when,
                    tag: '0000_create_users',
                    breakpoints: true,
                }],
            }),
        ],
        [
            'meta/0000_snapshot.json',
            JSON.stringify({ id, prevId: '0', tables: { 'public.users': {} } }),
        ],
    ])
}

const NOW = 1_800_000_000_000
const SQL = 'CREATE TABLE "users" ();\n'

Deno.test('#444 compare: a regeneration differs only by id and when', () => {
    assertEquals(
        compareMigrations(
            folder(NOW - 1, 'a', SQL),
            folder(NOW, 'b', SQL),
            NOW,
        ),
        [],
    )
})

Deno.test('#444 compare: SQL must be byte-identical', () => {
    assertEquals(
        compareMigrations(
            folder(NOW, 'a', SQL),
            folder(NOW, 'a', `${SQL}\n`),
            NOW,
        ),
        ['differs: 0000_create_users.sql'],
    )
})

Deno.test('#444 compare: a future or non-integer when is refused', () => {
    // drizzle-orm applies a migration only when its `when` is later than the
    // last one applied: a shipped stamp in the future would make the user's
    // next migrations skip silently.
    const future = compareMigrations(
        folder(NOW + 1, 'a', SQL),
        folder(NOW, 'a', SQL),
        NOW,
    )
    assertEquals(future.length, 1)
    assertStringIncludes(future[0], 'meta/_journal.json: when')
    assertEquals(
        compareMigrations(folder(1.5, 'a', SQL), folder(NOW, 'a', SQL), NOW)
            .length,
        1,
    )
})

Deno.test('#450 diffTree: an unchanged tree has no difference', () => {
    assertEquals(diffTree(folder(NOW, 'a', SQL), folder(NOW, 'a', SQL)), [])
})

Deno.test('#450 diffTree: every added, removed and rewritten path is named', () => {
    // "No schema changes" means the folder is unchanged — not merely the same
    // size: a rewritten journal or snapshot is a write too.
    const before = folder(NOW, 'a', SQL)
    const after = folder(NOW + 1, 'a', SQL)
    after.delete('meta/0000_snapshot.json')
    after.set('0001_next.sql', SQL)
    assertEquals(diffTree(before, after), [
        'added: 0001_next.sql',
        'removed: meta/0000_snapshot.json',
        'changed: meta/_journal.json',
    ])
})

Deno.test('#444 compare: the file set must be identical', () => {
    const shipped = folder(NOW, 'a', SQL)
    shipped.set('0001_extra.sql', SQL)
    const generated = folder(NOW, 'a', SQL)
    generated.delete('meta/0000_snapshot.json')
    assertEquals(compareMigrations(shipped, generated, NOW), [
        'not generated: 0001_extra.sql',
        'not generated: meta/0000_snapshot.json',
    ])
    assertEquals(compareMigrations(generated, shipped, NOW), [
        'missing: 0001_extra.sql',
        'missing: meta/0000_snapshot.json',
    ])
})

Deno.test('#444 compare: a snapshot differing beyond its id is drift', () => {
    const shipped = folder(NOW, 'a', SQL)
    shipped.set(
        'meta/0000_snapshot.json',
        JSON.stringify({ id: 'a', prevId: '0', tables: {} }),
    )
    assertEquals(compareMigrations(shipped, folder(NOW, 'b', SQL), NOW), [
        'differs (ignoring id): meta/0000_snapshot.json',
    ])
})

// -----------------------------------------------------------------------------
// The shipped folders
// -----------------------------------------------------------------------------

Deno.test('#444 the kit list is read from KITS: web and api', () => {
    assertEquals(migratingKits(), ['web', 'api'])
})

Deno.test('#444 api: access_tokens.user_id references users, cascading, indexed', async () => {
    const snapshot = JSON.parse(
        (await shippedKitMigrations('api')).get('meta/0000_snapshot.json') ??
            '{}',
    ) as {
        tables: Record<string, {
            foreignKeys: Record<string, {
                tableTo: string
                columnsFrom: string[]
                columnsTo: string[]
                onDelete: string
            }>
            indexes: Record<string, unknown>
        }>
    }
    const tokens = snapshot.tables['public.access_tokens']
    assertEquals(
        Object.values(tokens.foreignKeys).map((fk) => ({
            tableTo: fk.tableTo,
            columnsFrom: fk.columnsFrom,
            columnsTo: fk.columnsTo,
            onDelete: fk.onDelete,
        })),
        [{
            tableTo: 'users',
            columnsFrom: ['user_id'],
            columnsTo: ['id'],
            onDelete: 'cascade',
        }],
    )
    // The UNIQUE constraint on `hash` already indexes it; a second index on
    // the same column is write cost for nothing.
    assertEquals(Object.keys(tokens.indexes), ['access_tokens_user_id_idx'])
})

for (const kit of migratingKits()) {
    Deno.test(`#444 ${kit}: a scaffolded app's migrations are readable, current and complete`, async (t) => {
        const parent = await Deno.makeTempDir({ prefix: 'lockness-444-' })
        try {
            const project = await scaffold(kit, parent)
            const migrations = join(project, MIGRATIONS_DIR)

            await t.step('drizzle-orm reads the folder', async () => {
                const read = readMigrationFiles({
                    migrationsFolder: migrations,
                })
                const files = await readTree(migrations)
                const sql = [...files.keys()].filter((f) => f.endsWith('.sql'))
                assertEquals(read.length, sql.length, 'one entry per .sql')
                const journal = JSON.parse(
                    files.get('meta/_journal.json') ?? '{}',
                ) as { entries: { tag: string }[] }
                for (const { tag } of journal.entries) {
                    assert(files.has(`${tag}.sql`), `${tag}.sql is missing`)
                }
            })

            await t.step(
                'the shipped folder is what drizzle-kit generates',
                async () => {
                    let differences: string[]
                    try {
                        differences = await diffKitMigrations(kit)
                    } catch (error) {
                        if (
                            error instanceof DrizzleKitError &&
                            offline(error.run.output)
                        ) {
                            console.warn(
                                `[#444] skipped ${kit} regeneration — drizzle-kit unavailable offline`,
                            )
                            return
                        }
                        throw error
                    }
                    assertEquals(
                        differences,
                        [],
                        `${kit}: run \`deno task kits:migrations\``,
                    )
                },
            )

            await t.step(
                'the next db:generate reports no changes',
                async () => {
                    const denoJson = JSON.parse(
                        await Deno.readTextFile(join(project, 'deno.json')),
                    ) as { imports: Record<string, string> }
                    const files = new Map<string, string>()
                    files.set(
                        'drizzle.config.ts',
                        await Deno.readTextFile(
                            join(project, 'drizzle.config.ts'),
                        ),
                    )
                    for (
                        const [path, content] of await readTree(
                            join(project, 'app/model'),
                        )
                    ) files.set(`app/model/${path}`, content)
                    for (const [path, content] of await readTree(migrations)) {
                        files.set(`${MIGRATIONS_DIR}/${path}`, content)
                    }
                    const dir = await drizzleProject(files, {
                        'drizzle-orm': denoJson.imports['drizzle-orm'],
                        'drizzle-kit': denoJson.imports['drizzle-kit'],
                    })
                    try {
                        const before = await readTree(join(dir, MIGRATIONS_DIR))
                        const run = await runDrizzleKit(
                            dir,
                            denoJson.imports['drizzle-kit'],
                            ['generate'],
                        )
                        if (run.code !== 0 && offline(run.output)) {
                            console.warn(
                                `[#444] skipped ${kit} db:generate — drizzle-kit unavailable offline`,
                            )
                            return
                        }
                        assertEquals(run.code, 0, run.output)
                        assertStringIncludes(run.output, 'No schema changes')
                        assertEquals(
                            await readTree(join(dir, MIGRATIONS_DIR)),
                            before,
                            'db:generate wrote a migration',
                        )
                    } finally {
                        await Deno.remove(dir, { recursive: true })
                    }
                },
            )
        } finally {
            await Deno.remove(parent, { recursive: true })
        }
    })
}
