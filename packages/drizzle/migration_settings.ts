/**
 * @fileoverview What `db:fresh` reads from `drizzle.config.ts` (#435), and the
 * configurations it refuses before anything is dropped.
 *
 * `db:fresh` resets and migrates in one process, over one connection, so it
 * reads the same file `drizzle-kit migrate` reads — `out`,
 * `dbCredentials.url`, `dialect`, `migrations.table`, `migrations.schema`
 * and `schemaFilter` — and nothing else:
 *
 * - **R2** — the file cannot be imported (its error is withheld, since it may
 *   quote the DSN; only an identifier-shaped error name is shown); `out` is
 *   absent; `dbCredentials` is missing, holds anything besides `url`, or its
 *   `url` is missing, not a string, empty or blank (#449); a `driver` is
 *   named; or the dialect is not postgresql, mysql, sqlite or turso.
 * - **R3** — the journal, or a file it lists, is missing. The migrations are
 *   read up front with drizzle-orm's own `readMigrationFiles`: a database is
 *   never wiped that could not then be migrated.
 *
 * @module @lockness/drizzle/migration_settings
 * @since 0.4.1
 */

import { join, toFileUrl } from '@std/path'
import type { Dialect } from './drivers.ts'
import {
    DIALECT_FROM_KIT,
    type KitDialect,
} from './generators/dialect_schema.ts'
import { vettedErrorName } from './error_name.ts'
import { FreshRefusedError } from './reset.ts'

/**
 * Loads the `drizzle.config.ts` default export. The seam `db:fresh` reads its
 * configuration through; a test passes the config object directly.
 *
 * @returns The default export, unvalidated.
 */
export type MigrationConfigLoader = () => Promise<unknown>

/**
 * Reads a migrations folder and returns each migration's statements, in
 * journal order. Throws when the journal or a listed file is missing.
 *
 * @param folder - The migrations folder.
 * @returns One statement list per journal entry.
 */
export type MigrationReader = (
    folder: string,
) => Promise<readonly (readonly string[])[]>

/**
 * Everything `db:fresh` acts on, read once from `drizzle.config.ts`.
 */
export interface MigrationSettings {
    /** The runtime dialect the connection is opened with. */
    readonly dialect: Dialect
    /** The dialect as `drizzle.config.ts` names it. */
    readonly kitDialect: KitDialect
    /** `dbCredentials.url`. Never printed. */
    readonly url: string
    /** `out`: the migrations folder, only ever read. */
    readonly folder: string
    /** `migrations.table`, default `__drizzle_migrations`. */
    readonly table: string
    /** postgres only: `migrations.schema`, default `drizzle`. */
    readonly schema: string | undefined
    /** postgres only: `schemaFilter`, default `['public']` — the reset scope. */
    readonly schemaFilter: readonly string[]
    /** How many migrations the journal lists. */
    readonly migrations: number
    /** Every migration statement, in order. */
    readonly statements: readonly string[]
}

/** The bookkeeping table drizzle-kit and drizzle-orm default to. */
const DEFAULT_TABLE = '__drizzle_migrations'

/** The postgres bookkeeping schema drizzle-kit and drizzle-orm default to. */
const DEFAULT_SCHEMA = 'drizzle'

/** The postgres scope drizzle-kit defaults `schemaFilter` to. */
const DEFAULT_SCHEMA_FILTER: readonly string[] = ['public']

/**
 * The production loader: imports `drizzle.config.ts` from the working
 * directory, the file `drizzle-kit` reads.
 *
 * @returns The config's default export.
 * @throws Whatever the import throws.
 */
export const defaultLoadMigrationConfig: MigrationConfigLoader = async () =>
    (await import(toFileUrl(join(Deno.cwd(), 'drizzle.config.ts')).href))
        .default

/**
 * The production reader: drizzle-orm's own `readMigrationFiles`, the function
 * its migrator runs first — so a folder it accepts here is one the migrate
 * step accepts too. Loaded on demand through a fixed literal (S2).
 *
 * @param folder - The migrations folder.
 * @returns One statement list per journal entry.
 * @throws When the journal or a listed file is missing.
 */
const defaultReadMigrations: MigrationReader = async (folder) => {
    const { readMigrationFiles } = await import('drizzle-orm/migrator')
    return readMigrationFiles({ migrationsFolder: folder }).map((m) => m.sql)
}

/**
 * Read and validate the `db:fresh` settings. Nothing touches the database
 * here; every failure is a refusal.
 *
 * @param loadConfig - Loads the `drizzle.config.ts` default export.
 * @param readMigrations - Reads the migrations folder; drizzle-orm's reader
 *   by default.
 * @returns The validated settings.
 * @throws {FreshRefusedError} R2 when the configuration cannot be acted on;
 *   R3 when the migrations cannot be read.
 *
 * @example
 * ```ts
 * const settings = await loadMigrationSettings(defaultLoadMigrationConfig)
 * settings.folder // './database/migrations'
 * ```
 */
export async function loadMigrationSettings(
    loadConfig: MigrationConfigLoader,
    readMigrations: MigrationReader = defaultReadMigrations,
): Promise<MigrationSettings> {
    let config: unknown
    try {
        config = await loadConfig()
    } catch (error) {
        throw importRefused(error)
    }
    const parsed = parseConfig(config)

    let migrations: readonly (readonly string[])[]
    try {
        migrations = await readMigrations(parsed.folder)
    } catch (error) {
        throw new FreshRefusedError(
            `the migrations in ${parsed.folder} cannot be read (${
                messageOf(error)
            })`,
            { cause: error },
        )
    }
    return {
        ...parsed,
        migrations: migrations.length,
        statements: migrations.flat(),
    }
}

/**
 * The R2 refusal for a `drizzle.config.ts` that cannot be imported.
 *
 * The import error is withheld whole, the way #425 withholds a driver
 * failure: the file builds `dbCredentials.url`, so its error may quote the
 * DSN, and no password is known yet to check it for. Only the error's name
 * is shown, when it is identifier-shaped. The raw error is not attached as
 * the cause either, so nothing downstream can print it.
 *
 * @param error - Whatever the import threw.
 * @returns The refusal to throw.
 */
function importRefused(error: unknown): FreshRefusedError {
    const name = vettedErrorName(error, [])
    return new FreshRefusedError(
        `drizzle.config.ts could not be imported${
            name === undefined ? '' : ` (${name})`
        }; its error is withheld because it may contain the DSN`,
    )
}

/**
 * Validate the config object (R2).
 *
 * @param config - The `drizzle.config.ts` default export.
 * @returns Every setting except those read from the migrations folder.
 * @throws {FreshRefusedError} On the first field `db:fresh` cannot act on.
 */
function parseConfig(
    config: unknown,
): Omit<MigrationSettings, 'migrations' | 'statements'> {
    if (!isRecord(config)) {
        throw refused('its default export is not a config object')
    }
    const kitDialect = config.dialect
    if (
        typeof kitDialect !== 'string' ||
        !Object.hasOwn(DIALECT_FROM_KIT, kitDialect)
    ) {
        throw refused(
            '`dialect` must be postgresql, mysql, sqlite or turso',
        )
    }
    if (config.driver !== undefined) {
        throw refused(
            '`driver` is set; db:fresh connects with the default driver only',
        )
    }
    if (typeof config.out !== 'string' || config.out === '') {
        throw refused('`out` (the migrations folder) is not set')
    }
    const url = credentialsUrl(config.dbCredentials)
    const migrations = config.migrations === undefined ? {} : config.migrations
    if (!isRecord(migrations)) {
        throw refused('`migrations` is not an object')
    }
    const table = optionalName(migrations.table, '`migrations.table`') ??
        DEFAULT_TABLE
    const schema = optionalName(migrations.schema, '`migrations.schema`') ??
        DEFAULT_SCHEMA
    const postgres = kitDialect === 'postgresql'
    return {
        dialect: DIALECT_FROM_KIT[kitDialect as KitDialect],
        kitDialect: kitDialect as KitDialect,
        url,
        folder: config.out,
        table,
        schema: postgres ? schema : undefined,
        schemaFilter: postgres
            ? schemaFilterOf(config.schemaFilter)
            : DEFAULT_SCHEMA_FILTER,
    }
}

/**
 * Read `dbCredentials.url`, the one database a destructive command may reach
 * (#449).
 *
 * An empty or blank URL is refused, not passed on: a driver given no URL
 * falls back to its own default target, so a reset would start against a
 * database the config never named. That URL is what
 * `Deno.env.get('DATABASE_URL') ?? ''` yields with the variable unset.
 *
 * Each fault gets its own message, so the user fixes the field that is wrong.
 * No message quotes the URL or any part of it: it carries the password.
 *
 * @param credentials - The raw `dbCredentials`.
 * @returns The URL, as written.
 * @throws {FreshRefusedError} When `dbCredentials` is missing or not an
 *   object, when `url` is missing, not a string, empty or blank, or when any
 *   key besides `url` is present.
 */
function credentialsUrl(credentials: unknown): string {
    if (credentials === undefined) {
        throw refused(
            '`dbCredentials` is not set, so no database is named; a config ' +
                'that builds it from an environment variable leaves it out ' +
                'when that variable is unset',
        )
    }
    if (!isRecord(credentials)) {
        throw refused('`dbCredentials` must be an object holding a `url`')
    }
    const url = credentials.url
    if (typeof url !== 'string') {
        throw refused(
            '`dbCredentials.url` is not set or is not a string; db:fresh ' +
                'connects through `url` only',
        )
    }
    if (url.trim() === '') {
        throw refused(
            '`dbCredentials.url` is empty, so no database is named; the ' +
                'environment variable it is built from is probably unset',
        )
    }
    if (Object.keys(credentials).some((key) => key !== 'url')) {
        throw refused(
            '`dbCredentials` holds keys besides `url`; db:fresh connects ' +
                'through `url` only',
        )
    }
    return url
}

/**
 * Normalise `schemaFilter`: a string, or a non-empty array of strings.
 *
 * @param value - The raw `schemaFilter`.
 * @returns The scope schemas.
 * @throws {FreshRefusedError} When it is anything else.
 */
function schemaFilterOf(value: unknown): readonly string[] {
    if (value === undefined) return DEFAULT_SCHEMA_FILTER
    const names = typeof value === 'string' ? [value] : value
    if (
        !Array.isArray(names) || names.length === 0 ||
        !names.every((name) => typeof name === 'string' && name !== '')
    ) {
        throw refused('`schemaFilter` must be a schema name or a list of them')
    }
    return names
}

/**
 * An optional non-empty string field.
 *
 * @param value - The raw value.
 * @param label - The field, as the refusal names it.
 * @returns The value, or `undefined` when it is not set.
 * @throws {FreshRefusedError} When it is set to anything but a non-empty
 *   string.
 */
function optionalName(value: unknown, label: string): string | undefined {
    if (value === undefined) return undefined
    if (typeof value !== 'string' || value === '') {
        throw refused(`${label} must be a non-empty string`)
    }
    return value
}

/**
 * An R2 refusal about `drizzle.config.ts`.
 *
 * @param reason - What is wrong with the file.
 * @returns The refusal to throw.
 */
function refused(reason: string): FreshRefusedError {
    return new FreshRefusedError(`drizzle.config.ts: ${reason}`)
}

/**
 * Whether a value is a plain object whose fields can be read.
 *
 * @param value - Anything.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The message of a thrown value.
 *
 * @param error - Whatever was thrown.
 * @returns Its message, or its string form.
 */
function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
