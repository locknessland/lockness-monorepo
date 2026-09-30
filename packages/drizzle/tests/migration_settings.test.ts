/**
 * @fileoverview #435 — what `db:fresh` reads from `drizzle.config.ts`, and
 * every configuration it refuses before anything is dropped (R2, R3).
 *
 * The config is passed straight to the parser through the loader seam. R3 is
 * proven against a real temporary folder, through the default reader, which
 * is drizzle-orm's own `readMigrationFiles`.
 *
 * @module @lockness/drizzle/tests/migration_settings
 */

import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import {
    loadMigrationSettings,
    type MigrationReader,
} from '../migration_settings.ts'
import { FreshRefusedError } from '../reset.ts'
import { DIALECT_FROM_KIT } from '../generators/dialect_schema.ts'

/** A reader that returns one migration and records the folder it was asked. */
function reader(statements: string[][] = [['CREATE TABLE "t" ()']]) {
    const folders: string[] = []
    const read: MigrationReader = (folder) => {
        folders.push(folder)
        return Promise.resolve(statements)
    }
    return { folders, read }
}

const base = {
    dialect: 'postgresql',
    out: './database/migrations',
    schema: './app/model/*.ts',
    dbCredentials: { url: 'postgres://u:p@h:5432/app' },
}

Deno.test('#435 DIALECT_FROM_KIT maps every kit dialect db:fresh supports', () => {
    assertEquals(DIALECT_FROM_KIT, {
        postgresql: 'postgres',
        mysql: 'mysql',
        sqlite: 'sqlite',
        turso: 'sqlite',
    })
})

Deno.test('#435 settings carry the defaults drizzle-kit uses', async () => {
    const { folders, read } = reader([['A', 'B'], ['C']])

    const settings = await loadMigrationSettings(
        () => Promise.resolve(base),
        read,
    )

    assertEquals(settings, {
        dialect: 'postgres',
        kitDialect: 'postgresql',
        url: 'postgres://u:p@h:5432/app',
        folder: './database/migrations',
        table: '__drizzle_migrations',
        schema: 'drizzle',
        schemaFilter: ['public'],
        migrations: 2,
        statements: ['A', 'B', 'C'],
    })
    assertEquals(folders, ['./database/migrations'])
})

Deno.test('#435 settings honour migrations.table, migrations.schema and schemaFilter', async () => {
    const settings = await loadMigrationSettings(
        () =>
            Promise.resolve({
                ...base,
                schemaFilter: ['app', 'auth'],
                migrations: { table: 'history', schema: 'meta' },
            }),
        reader().read,
    )

    assertEquals(settings.table, 'history')
    assertEquals(settings.schema, 'meta')
    assertEquals(settings.schemaFilter, ['app', 'auth'])
})

Deno.test('#435 a single schemaFilter string is a one-schema scope', async () => {
    const settings = await loadMigrationSettings(
        () => Promise.resolve({ ...base, schemaFilter: 'app' }),
        reader().read,
    )
    assertEquals(settings.schemaFilter, ['app'])
})

Deno.test('#435 mysql and sqlite keep no bookkeeping schema', async () => {
    for (
        const [dialect, url] of [
            ['mysql', 'mysql://u:p@h/app'],
            ['sqlite', 'file:./app.db'],
            ['turso', 'libsql://app.turso.io'],
        ]
    ) {
        const settings = await loadMigrationSettings(
            () =>
                Promise.resolve({
                    ...base,
                    dialect,
                    dbCredentials: { url },
                    migrations: { table: 'history', schema: 'ignored' },
                }),
            reader().read,
        )
        assertEquals(settings.schema, undefined, dialect)
        assertEquals(settings.table, 'history', dialect)
    }
})

// -----------------------------------------------------------------------------
// R2 — a configuration db:fresh cannot act on
// -----------------------------------------------------------------------------

/** Assert a refusal naming `fragment`, and that the migrations were never read. */
async function assertRefused(
    config: () => Promise<unknown>,
    fragment: string,
): Promise<void> {
    const { folders, read } = reader()
    const error = await assertRejects(
        () => loadMigrationSettings(config, read),
        FreshRefusedError,
    )
    assertEquals(
        error.message.includes(fragment),
        true,
        `"${error.message}" does not name "${fragment}"`,
    )
    assertEquals(folders, [], 'the migrations were read after a refusal')
}

Deno.test('#435 R2 refuses a drizzle.config.ts that cannot be imported', async () => {
    await assertRefused(
        () => Promise.reject(new Error('Module not found "drizzle-kit"')),
        'drizzle.config.ts could not be imported: Module not found',
    )
})

Deno.test('#435 R2 refuses a config that is not an object', async () => {
    await assertRefused(() => Promise.resolve(undefined), 'default export')
})

Deno.test('#435 R2 refuses a config without out', async () => {
    const { out: _out, ...config } = base
    await assertRefused(() => Promise.resolve(config), '`out`')
    await assertRefused(
        () => Promise.resolve({ ...base, out: '' }),
        '`out`',
    )
})

Deno.test('#435 R2 refuses dbCredentials other than a url', async () => {
    for (
        const dbCredentials of [
            undefined,
            {},
            { url: 42 },
            { url: 'libsql://x', authToken: 't' },
            { host: 'h', port: 5432, database: 'app' },
        ]
    ) {
        await assertRefused(
            () => Promise.resolve({ ...base, dbCredentials }),
            '`dbCredentials`',
        )
    }
})

Deno.test('#435 R2 refuses a config that names a driver', async () => {
    await assertRefused(
        () => Promise.resolve({ ...base, driver: 'pglite' }),
        '`driver`',
    )
})

Deno.test('#435 R2 refuses an unsupported dialect', async () => {
    for (const dialect of ['singlestore', 'gel', undefined]) {
        await assertRefused(
            () => Promise.resolve({ ...base, dialect }),
            '`dialect`',
        )
    }
})

Deno.test('#435 R2 refuses a malformed migrations or schemaFilter entry', async () => {
    await assertRefused(
        () => Promise.resolve({ ...base, migrations: { table: '' } }),
        '`migrations.table`',
    )
    await assertRefused(
        () => Promise.resolve({ ...base, migrations: { schema: 3 } }),
        '`migrations.schema`',
    )
    await assertRefused(
        () => Promise.resolve({ ...base, schemaFilter: [] }),
        '`schemaFilter`',
    )
    await assertRefused(
        () => Promise.resolve({ ...base, schemaFilter: ['public', 1] }),
        '`schemaFilter`',
    )
})

// -----------------------------------------------------------------------------
// R3 — never wipe a database whose migrations cannot be read
// -----------------------------------------------------------------------------

Deno.test('#435 R3 refuses a migrations folder without a journal', async () => {
    const dir = await Deno.makeTempDir()
    try {
        await Deno.writeTextFile(join(dir, '0000_init.sql'), 'SELECT 1;')
        const error = await assertRejects(
            () =>
                loadMigrationSettings(
                    () => Promise.resolve({ ...base, out: dir }),
                ),
            FreshRefusedError,
        )
        assertEquals(error.message.includes('_journal.json'), true)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('#435 R3 refuses a journal that lists a missing file', async () => {
    const dir = await Deno.makeTempDir()
    try {
        await Deno.mkdir(join(dir, 'meta'))
        await Deno.writeTextFile(
            join(dir, 'meta', '_journal.json'),
            JSON.stringify({
                entries: [{ tag: '0000_gone', when: 1, breakpoints: true }],
            }),
        )
        const error = await assertRejects(
            () =>
                loadMigrationSettings(
                    () => Promise.resolve({ ...base, out: dir }),
                ),
            FreshRefusedError,
        )
        assertEquals(error.message.includes('0000_gone'), true)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('#435 the default reader returns each migration’s statements', async () => {
    const dir = await Deno.makeTempDir()
    try {
        await Deno.mkdir(join(dir, 'meta'))
        await Deno.writeTextFile(
            join(dir, 'meta', '_journal.json'),
            JSON.stringify({
                entries: [{ tag: '0000_init', when: 1, breakpoints: true }],
            }),
        )
        await Deno.writeTextFile(
            join(dir, '0000_init.sql'),
            'CREATE SCHEMA "auth";\n--> statement-breakpoint\nSELECT 1;',
        )

        const settings = await loadMigrationSettings(
            () => Promise.resolve({ ...base, out: dir }),
        )

        assertEquals(settings.migrations, 1)
        assertEquals(settings.statements, [
            'CREATE SCHEMA "auth";\n',
            '\nSELECT 1;',
        ])
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
