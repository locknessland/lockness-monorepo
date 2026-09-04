/**
 * @fileoverview In-memory fake table + assertions, so a test can check
 * persistence effects without a real database. Pair a {@link FakeTable} with
 * whatever repository/seam the code under test writes through.
 *
 * @module @lockness/testing/db_assertions
 */

import { assert, assertEquals } from '@std/assert'

/** A record row — an object keyed by column name. */
export type Row = Record<string, unknown>

/** A minimal in-memory table: insert rows, then assert against them. */
export class FakeTable<T extends Row = Row> {
    readonly #rows: T[] = []

    /** All rows currently stored (a copy). */
    get rows(): T[] {
        return [...this.#rows]
    }

    /**
     * Insert one row.
     * @param row - The row to store.
     * @returns This table, for chaining.
     */
    insert(row: T): this {
        this.#rows.push(row)
        return this
    }

    /** Whether any row matches every key/value in `match`. */
    #matches(match: Partial<T>): boolean {
        return this.#rows.some((row) =>
            Object.entries(match).every(([k, v]) => row[k] === v)
        )
    }

    /**
     * Assert a row matching `match` exists.
     * @param match - The key/values a row must contain.
     * @throws {Error} When no row matches.
     */
    assertHasRow(match: Partial<T>): void {
        assert(
            this.#matches(match),
            `expected a row matching ${JSON.stringify(match)}, found none in ${
                JSON.stringify(this.#rows)
            }`,
        )
    }

    /**
     * Assert no row matches `match`.
     * @param match - The key/values that must not be present.
     * @throws {Error} When a row matches.
     */
    assertMissingRow(match: Partial<T>): void {
        assert(
            !this.#matches(match),
            `expected no row matching ${JSON.stringify(match)}, but one exists`,
        )
    }

    /**
     * Assert the table holds exactly `count` rows.
     * @param count - The expected row count.
     * @throws {Error} When the count differs.
     */
    assertRowCount(count: number): void {
        assertEquals(this.#rows.length, count)
    }
}
