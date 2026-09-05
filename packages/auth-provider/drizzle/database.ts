/**
 * @fileoverview The dialect-agnostic Drizzle handle type the auth providers bind
 * to (#259).
 *
 * The three Drizzle providers used to pin their `db` field to
 * `PostgresJsDatabase`, so a `mysql` or `sqlite` handle from the #214 multi-DB
 * `Database` service could not feed auth persistence. This module carries the
 * one conditional type — mirroring `@lockness/drizzle`'s `DialectDatabase` — that
 * maps a dialect literal to its Drizzle database type, so every provider keys
 * off a single source of truth.
 *
 * It deliberately targets the `drizzle-orm` adapters **directly**, matching the
 * package's established posture (the Kysely subpath targets its library
 * directly too) — the ORM-agnostic auth-provider does not take a runtime
 * dependency on the framework's `@lockness/drizzle` integration just to borrow a
 * type. Each adapter is imported type-only, so nothing is loaded at runtime and
 * a consumer only needs the client for the dialect it actually uses.
 *
 * @module @lockness/auth-provider/drizzle/database
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'

/**
 * The Drizzle schema shape the dialect database types are parameterised by. The
 * providers never introspect the schema — they only carry the handle through to
 * the caller's lookup callbacks — so the open record is the right bound.
 */
export type DrizzleAuthSchema = Record<string, unknown>

/**
 * The SQL dialects a Drizzle auth provider accepts a handle for. `pg` is the
 * default so the historical (Postgres-only) instantiation is unchanged.
 */
export type DrizzleDialect = 'pg' | 'mysql' | 'sqlite'

/**
 * The Drizzle database handle type for a given dialect. `pg` (the default) maps
 * to `PostgresJsDatabase`, so an unparameterised `DrizzleDatabase` — and every
 * existing Postgres call site — is byte-for-byte the previous type.
 *
 * @typeParam D - The SQL dialect the handle connects through.
 *
 * @example
 * ```ts
 * // A handle from the #214 multi-DB Database service, any dialect:
 * const db: DrizzleDatabase<'mysql'> = database.db
 * ```
 */
export type DrizzleDatabase<D extends DrizzleDialect = 'pg'> = D extends 'mysql'
    ? MySql2Database<DrizzleAuthSchema>
    : D extends 'sqlite' ? LibSQLDatabase<DrizzleAuthSchema>
    : PostgresJsDatabase<DrizzleAuthSchema>
