/**
 * @fileoverview Dialect-aware `make:model` tests — the generator dialect
 * resolver, the drizzle-kit dialect mapping, the per-dialect model-stub parts,
 * the rendered model stub for each dialect (pg → `pgTable`/`serial`, mysql →
 * `mysqlTable`/`int`+`autoincrement`, sqlite → `sqliteTable`/`integer`), and the
 * dialect carried into `drizzle.config.ts`.
 *
 * @module @lockness/drizzle/tests/make_model_dialect
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { processStub } from '../cli_commands.ts'
import {
    DRIZZLE_KIT_DIALECT,
    modelStubParts,
    resolveGeneratorDialect,
} from '../generators/dialect_schema.ts'
import { createDrizzleConfig } from '../install.ts'

/**
 * Render the model stub for a dialect exactly as `createModelFile` does, so a
 * test asserts the real generation path.
 */
async function renderModel(
    dialect: 'postgres' | 'mysql' | 'sqlite',
): Promise<string> {
    const parts = modelStubParts(dialect)
    return await processStub('model', {
        ModelName: 'Post',
        tableName: 'posts',
        ...parts,
    })
}

Deno.test('resolveGeneratorDialect: --dialect flag > URL scheme > postgres', () => {
    // Explicit flag wins, and its spellings normalise.
    assertEquals(resolveGeneratorDialect('mysql', 'postgres://h/db'), 'mysql')
    assertEquals(
        resolveGeneratorDialect('postgresql', 'mysql://h/db'),
        'postgres',
    )
    assertEquals(resolveGeneratorDialect('pg', undefined), 'postgres')
    assertEquals(resolveGeneratorDialect('sqlite', undefined), 'sqlite')
    // No flag → infer from the URL scheme.
    assertEquals(resolveGeneratorDialect(undefined, 'mysql://h/db'), 'mysql')
    assertEquals(resolveGeneratorDialect(undefined, 'file:local.db'), 'sqlite')
    assertEquals(
        resolveGeneratorDialect(undefined, 'postgres://h/db'),
        'postgres',
    )
    // No flag, no URL, unknown flag → default postgres.
    assertEquals(resolveGeneratorDialect(undefined, undefined), 'postgres')
    assertEquals(resolveGeneratorDialect('nope', undefined), 'postgres')
})

Deno.test('DRIZZLE_KIT_DIALECT maps to the strings drizzle-kit expects', () => {
    assertEquals(DRIZZLE_KIT_DIALECT.postgres, 'postgresql')
    assertEquals(DRIZZLE_KIT_DIALECT.mysql, 'mysql')
    assertEquals(DRIZZLE_KIT_DIALECT.sqlite, 'sqlite')
})

Deno.test('make:model stub — postgres uses pgTable + serial + pg-core', async () => {
    const content = await renderModel('postgres')
    assertStringIncludes(content, "from 'drizzle-orm/pg-core'")
    assertStringIncludes(content, "export const posts = pgTable('posts', {")
    assertStringIncludes(content, "id: serial('id').primaryKey(),")
    assertStringIncludes(content, "timestamp('created_at').defaultNow()")
    // No cross-dialect helper leaked in.
    assert(!content.includes('mysqlTable'))
    assert(!content.includes('sqliteTable'))
})

Deno.test('make:model stub — mysql uses mysqlTable + int/autoincrement + mysql-core', async () => {
    const content = await renderModel('mysql')
    assertStringIncludes(content, "from 'drizzle-orm/mysql-core'")
    assertStringIncludes(content, "export const posts = mysqlTable('posts', {")
    assertStringIncludes(content, "id: int('id').autoincrement().primaryKey(),")
    assert(!content.includes('pgTable'))
    assert(!content.includes('sqliteTable'))
})

Deno.test('make:model stub — sqlite uses sqliteTable + integer PK + sqlite-core', async () => {
    const content = await renderModel('sqlite')
    assertStringIncludes(content, "from 'drizzle-orm/sqlite-core'")
    assertStringIncludes(content, "export const posts = sqliteTable('posts', {")
    assertStringIncludes(
        content,
        "id: integer('id').primaryKey({ autoIncrement: true }),",
    )
    assert(!content.includes('pgTable'))
    assert(!content.includes('mysqlTable'))
})

Deno.test('make:model stub — leaves no unrendered placeholders', async () => {
    for (const d of ['postgres', 'mysql', 'sqlite'] as const) {
        const content = await renderModel(d)
        assert(
            !content.includes('{{'),
            `dialect ${d} left an unrendered placeholder`,
        )
    }
})

Deno.test('createDrizzleConfig carries the resolved drizzle-kit dialect', async () => {
    const cwd = Deno.cwd()
    const tmp = await Deno.makeTempDir()
    const prevUrl = Deno.env.get('DATABASE_URL')
    try {
        Deno.chdir(tmp)
        Deno.env.set('DATABASE_URL', 'mysql://root@localhost:3306/app')
        assertEquals(await createDrizzleConfig(), true)
        const content = await Deno.readTextFile('./drizzle.config.ts')
        assertStringIncludes(content, "dialect: 'mysql'")
    } finally {
        Deno.chdir(cwd)
        if (prevUrl === undefined) Deno.env.delete('DATABASE_URL')
        else Deno.env.set('DATABASE_URL', prevUrl)
        await Deno.remove(tmp, { recursive: true })
    }
})
