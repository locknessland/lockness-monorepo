/**
 * @fileoverview `Factory` — a model-row generator for tests and seeders.
 *
 * **Faker-agnostic on purpose.** The base only orchestrates build/persist; the
 * concrete subclass supplies attribute values in {@link Factory.definition},
 * where the app imports whatever faker it chose. So `@lockness/drizzle` gains no
 * faker dependency — faker is the app's, imported only by the generated factory.
 *
 * `make`/`makeMany` are pure (no I/O — usable with no connection open);
 * `create`/`createMany` insert through the `Database` service.
 *
 * @module @lockness/drizzle/factory
 * @since 0.2.1
 *
 * @example
 * ```typescript
 * class UserFactory extends Factory<NewUser> {
 *     protected readonly table = users
 *     protected definition(): NewUser {
 *         return { email: faker.internet.email(), name: faker.person.fullName() }
 *     }
 * }
 * await new UserFactory().createMany(50) // 50 realistic rows
 * ```
 */

import { container } from '@lockness/container'
import { Database } from './mod.ts'
import { assertNotProduction } from './production_guard.ts'

/** The minimal insert surface shared by every Drizzle dialect. */
interface InsertCapable {
    insert(table: unknown): { values(rows: unknown): PromiseLike<unknown> }
}

/**
 * Options for the DB-writing factory methods ({@link Factory.create},
 * {@link Factory.createMany}).
 */
export interface FactoryCreateOptions {
    /**
     * Explicitly permit the insert to run against a production environment.
     * Off by default: `create()`/`createMany()` refuse to write when
     * `DENO_ENV`/`APP_ENV` is `'production'` unless this is `true`. Read-only
     * `make()`/`makeMany()` are never gated.
     */
    readonly allowProduction?: boolean
}

/**
 * A faker-backed generator of rows for one model.
 *
 * @typeParam TModel - The insert shape of the model (e.g. `typeof table.$inferInsert`).
 */
export abstract class Factory<TModel extends Record<string, unknown>> {
    /** The Drizzle table rows are inserted into. */
    protected abstract readonly table: unknown

    /**
     * One record's default attributes. Called **fresh per row**, so faker
     * produces distinct values each time. Implement it in the subclass.
     *
     * @returns The default attribute object for a single row.
     */
    protected abstract definition(): TModel

    /**
     * Build one attribute object — `definition()` merged with `overrides`.
     * Pure: no database, no connection needed.
     *
     * @param overrides - Fields to override on the generated record.
     * @returns The attribute object.
     */
    make(overrides: Partial<TModel> = {}): TModel {
        return { ...this.definition(), ...overrides }
    }

    /**
     * Build `count` attribute objects. Pure.
     *
     * @param count - How many to build.
     * @param overrides - Fields to override on every record.
     * @returns The attribute objects.
     */
    makeMany(count: number, overrides: Partial<TModel> = {}): TModel[] {
        return Array.from({ length: count }, () => this.make(overrides))
    }

    /**
     * Build one record and insert it through the `Database` service.
     *
     * Returns the attributes that were inserted (not a DB-assigned row — RETURNING
     * is not uniform across dialects; query separately for a generated id).
     *
     * Refuses to run against a production environment unless
     * `{ allowProduction: true }` is passed — see {@link assertNotProduction}.
     *
     * @param overrides - Fields to override.
     * @param options - Write options (e.g. `allowProduction` to bypass the
     *   production guard).
     * @returns The inserted attributes.
     * @throws {Error} When the environment is production and `allowProduction`
     *   is not set.
     */
    async create(
        overrides: Partial<TModel> = {},
        options: FactoryCreateOptions = {},
    ): Promise<TModel> {
        const [row] = await this.createMany(1, overrides, options)
        return row
    }

    /**
     * Build and insert `count` records in one statement.
     *
     * Refuses to run against a production environment unless
     * `{ allowProduction: true }` is passed — see {@link assertNotProduction}.
     *
     * @param count - How many to insert.
     * @param overrides - Fields to override on every record.
     * @param options - Write options (e.g. `allowProduction` to bypass the
     *   production guard).
     * @returns The inserted attributes.
     * @throws {Error} When the environment is production and `allowProduction`
     *   is not set.
     */
    async createMany(
        count: number,
        overrides: Partial<TModel> = {},
        options: FactoryCreateOptions = {},
    ): Promise<TModel[]> {
        assertNotProduction('factory create()', options.allowProduction)
        const rows = this.makeMany(count, overrides)
        const db = (container.get(Database).db as unknown) as InsertCapable
        await db.insert(this.table).values(rows)
        return rows
    }
}
