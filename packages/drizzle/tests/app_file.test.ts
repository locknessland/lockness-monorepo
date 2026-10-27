/**
 * Drizzle imports the app's seeders and `drizzle.config.ts` through
 * `importAppFile` (#477).
 *
 * `db:seed` built `` import(`file://${Deno.cwd()}/${path}`) ``, a template
 * literal `deno publish` rewrites into a relative path — from JSR, a request
 * to the registry for the app's own path. That half cannot fail here, where
 * drizzle loads from disk; `kits:smoke --registry` covers the registry. These
 * tests pin the other half: each production loader imports from a directory
 * whose path holds a `#` and a space.
 *
 * @module @lockness/drizzle/tests/app_file
 */

import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { defaultLoadSeeder } from '../seeder_loader.ts'
import { defaultLoadMigrationConfig } from '../migration_settings.ts'

/** A directory name holding both characters `file://${…}` mis-parses. */
const AWKWARD = 'app#dir with space'

/**
 * Create `<cwd>/tmp/<unique>/<AWKWARD>/` with `files` in it, hand its
 * cwd-relative and absolute paths to `run`, and remove it afterwards.
 */
async function withAwkwardDir(
    files: Record<string, string>,
    run: (dir: { rel: string; abs: string }) => Promise<void>,
): Promise<void> {
    const base = `tmp/drizzle-app-file-${crypto.randomUUID().slice(0, 8)}`
    const rel = `${base}/${AWKWARD}`
    const abs = join(Deno.cwd(), rel)
    await Deno.mkdir(abs, { recursive: true })
    try {
        for (const [name, source] of Object.entries(files)) {
            await Deno.mkdir(join(abs, name, '..'), { recursive: true })
            await Deno.writeTextFile(join(abs, name), source)
        }
        await run({ rel, abs })
    } finally {
        await Deno.remove(join(Deno.cwd(), base), { recursive: true })
    }
}

Deno.test("defaultLoadSeeder (db:seed) - imports a seeder under a path with '#' and a space", async () => {
    await withAwkwardDir({
        'database/seeders/database_seeder.ts':
            'export class DatabaseSeeder { async run() {} }\n',
    }, async ({ rel }) => {
        const module = await defaultLoadSeeder(
            `${rel}/database/seeders/database_seeder.ts`,
        )
        assertEquals(typeof module.DatabaseSeeder, 'function')
    })
})

Deno.test("defaultLoadMigrationConfig (db:fresh) - imports drizzle.config.ts under a path with '#' and a space", async () => {
    await withAwkwardDir({
        'drizzle.config.ts':
            "export default { dialect: 'postgresql', out: './drizzle' }\n",
    }, async ({ abs }) => {
        const config = await defaultLoadMigrationConfig(abs)
        assertEquals(config, { dialect: 'postgresql', out: './drizzle' })
    })
})
