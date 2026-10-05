/**
 * @fileoverview The dialect surface for schema *authoring* — the counterpart to
 * `drivers.ts` (which owns the runtime *connection* surface). It maps a Lockness
 * {@link Dialect} to the string `drizzle-kit` expects, resolves the dialect the
 * `make:model` generator should emit for, and supplies the per-dialect fragments
 * the model stub is rendered with (table function, `id` primary key, timestamp
 * columns, and the `drizzle-orm/*-core` import line).
 *
 * Kept out of `drivers.ts` on purpose: connection concerns (client factories,
 * credential redaction) and generation concerns (stub fragments) are different
 * axes, and only the CLI/install path pulls this module in.
 *
 * @module @lockness/drizzle/generators/dialect_schema
 * @since 0.2.2
 */

import { type Dialect, resolveDialect } from '../drivers.ts'

/**
 * The dialect string `drizzle-kit` expects in `drizzle.config.ts`. It differs
 * from the runtime {@link Dialect}: `postgres` becomes `postgresql`.
 */
export const DRIZZLE_KIT_DIALECT: Record<Dialect, string> = {
    postgres: 'postgresql',
    mysql: 'mysql',
    sqlite: 'sqlite',
}

/**
 * The one `drizzle-kit` every Lockness surface runs and maps (#437): the
 * `db:*` shell-outs, the import map `install.ts` writes, the init kit stubs
 * and the repository's own `deno.jsonc`. A test checks that they agree.
 *
 * Hard-rule-2 exception: drizzle-kit publishes no JSR build, so `npm:` is
 * the only registry that ships it. It is pinned **exactly**, not to a range:
 * the `db:*` exit contract (#428) maps drizzle-kit's exit codes straight to
 * the command's status, and `db:validate`'s wording rests on what
 * `drizzle-kit check` does in this version — a release that changes either
 * must not reach an app silently. The 1.0 betas are out of scope until 1.0 is
 * stable.
 *
 * A bump also re-checks #445, where `db:generate` and `db:push` fail on any
 * stderr because drizzle-kit swallows their errors and exits 0. Run
 * `deno task kits:smoke` for the rename refusal and `deno task test:postgres`
 * for the push suite. Check that `kit_outcome.ts`'s TTY refusal sentence still
 * matches the prompt library's. Check that the generate, `pgPush` and
 * `sqlitePush` catch-alls still write to stderr.
 */
export const DRIZZLE_KIT_SPECIFIER = 'npm:drizzle-kit@0.31.10' as const

/** A `drizzle.config.ts` dialect `db:fresh` can reset (#435). */
export type KitDialect = 'postgresql' | 'mysql' | 'sqlite' | 'turso'

/**
 * The reverse of {@link DRIZZLE_KIT_DIALECT}: the runtime {@link Dialect} a
 * `drizzle.config.ts` dialect connects through. `turso` is libSQL, so it
 * takes the `sqlite` driver. A kit dialect missing here (`singlestore`,
 * `gel`) is one `db:fresh` refuses.
 */
export const DIALECT_FROM_KIT: Record<KitDialect, Dialect> = {
    postgresql: 'postgres',
    mysql: 'mysql',
    sqlite: 'sqlite',
    turso: 'sqlite',
}

/**
 * The dialect-specific fragments the model stub is rendered with. Each field is
 * substituted into a `{{placeholder}}` of `stubs/model.stub`, so the generated
 * schema uses the target dialect's idiomatic table function, primary key and
 * timestamp helpers.
 */
export interface ModelStubParts {
    /** The `drizzle-orm/*-core` import line for the dialect's helpers. */
    readonly tableImports: string
    /** The table-builder function (`pgTable` / `mysqlTable` / `sqliteTable`). */
    readonly tableFn: string
    /** The auto-incrementing primary-key column definition. */
    readonly idColumn: string
    /** The `createdAt` timestamp column definition. */
    readonly createdAtColumn: string
    /** The `updatedAt` timestamp column definition. */
    readonly updatedAtColumn: string
}

/** The idiomatic model-stub fragments for each dialect. */
const MODEL_PARTS: Record<Dialect, ModelStubParts> = {
    postgres: {
        tableImports:
            "import { pgTable, serial, timestamp } from 'drizzle-orm/pg-core'",
        tableFn: 'pgTable',
        idColumn: "id: serial('id').primaryKey(),",
        createdAtColumn: "createdAt: timestamp('created_at').defaultNow(),",
        updatedAtColumn: "updatedAt: timestamp('updated_at').defaultNow(),",
    },
    mysql: {
        tableImports:
            "import { int, mysqlTable, timestamp } from 'drizzle-orm/mysql-core'",
        tableFn: 'mysqlTable',
        idColumn: "id: int('id').autoincrement().primaryKey(),",
        createdAtColumn: "createdAt: timestamp('created_at').defaultNow(),",
        updatedAtColumn: "updatedAt: timestamp('updated_at').defaultNow(),",
    },
    sqlite: {
        tableImports:
            "import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'",
        tableFn: 'sqliteTable',
        idColumn: "id: integer('id').primaryKey({ autoIncrement: true }),",
        createdAtColumn:
            "createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),",
        updatedAtColumn:
            "updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),",
    },
}

/**
 * The idiomatic model-stub fragments for a dialect.
 *
 * @param dialect - The target dialect.
 * @returns The fragments to render `stubs/model.stub` with.
 *
 * @example
 * ```typescript
 * const parts = modelStubParts('sqlite')
 * parts.tableFn // 'sqliteTable'
 * ```
 */
export function modelStubParts(dialect: Dialect): ModelStubParts {
    return MODEL_PARTS[dialect]
}

/**
 * Normalise a user-supplied `--dialect` value to a {@link Dialect}. Accepts the
 * common spellings (`postgres` / `postgresql` / `pg`, `mysql`, `sqlite`);
 * anything else — including `undefined` — yields `undefined` so the caller can
 * fall back to URL inference.
 *
 * @param value - The raw `--dialect` flag value, if any.
 * @returns The matching dialect, or `undefined` when unrecognised.
 */
export function normalizeDialect(
    value: string | undefined,
): Dialect | undefined {
    switch (value?.toLowerCase()) {
        case 'postgres':
        case 'postgresql':
        case 'pg':
            return 'postgres'
        case 'mysql':
            return 'mysql'
        case 'sqlite':
            return 'sqlite'
        default:
            return undefined
    }
}

/**
 * Resolve the dialect the generator should emit for: an explicit `--dialect`
 * flag wins (after normalisation), else the dialect is inferred from the
 * connection URL scheme, else `postgres`. Delegates the URL inference and the
 * default to {@link resolveDialect}, so the CLI and the runtime agree.
 *
 * @param flag - The raw `--dialect` flag value, if any.
 * @param url - The configured connection URL (e.g. `DATABASE_URL`), if any.
 * @returns The resolved dialect.
 *
 * @example
 * ```typescript
 * resolveGeneratorDialect('mysql', 'postgres://h') // 'mysql' (flag wins)
 * resolveGeneratorDialect(undefined, 'file:app.db') // 'sqlite' (URL scheme)
 * resolveGeneratorDialect(undefined, undefined)     // 'postgres' (default)
 * ```
 */
export function resolveGeneratorDialect(
    flag: string | undefined,
    url: string | undefined,
): Dialect {
    return resolveDialect(normalizeDialect(flag), url ?? '')
}
