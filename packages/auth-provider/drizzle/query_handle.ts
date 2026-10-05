/**
 * @fileoverview The structural view of a Drizzle database handle that the
 * token and remember-me storage steps query through. Internal: not
 * re-exported from any entry point.
 *
 * @module
 * @internal
 */

// Hard-rule-#2 exception: drizzle-orm is not published on JSR. The range
// matches `@lockness/drizzle` and the kits, so an app resolves one copy.
import type { SQL, Table } from 'drizzle-orm'

/**
 * The subset of the Drizzle query builder the storage steps use — the part
 * the pg, mysql and sqlite builders share. No `RETURNING`: mysql lacks it, so
 * an insert is followed by a re-select on the row's unique hash.
 *
 * @typeParam NewRow - The row an insert writes.
 * @typeParam Row - The row a select reads back.
 */
export interface QueryHandle<NewRow, Row> {
    insert(table: Table): {
        values(row: NewRow): PromiseLike<unknown>
    }
    select(fields: Readonly<Record<string, unknown>>): {
        from(table: Table): {
            where(condition: SQL | undefined): {
                limit(count: number): PromiseLike<Row[]>
            }
        }
    }
    update(table: Table): {
        set(values: Partial<Row>): {
            where(condition: SQL | undefined): PromiseLike<unknown>
        }
    }
    delete(table: Table): {
        where(condition: SQL | undefined): PromiseLike<unknown>
    }
}

/**
 * View a resolved Drizzle handle through {@link QueryHandle}.
 *
 * The one cast the Drizzle storage steps make. `DrizzleDatabase<D>` is a
 * deferred conditional type, and the union of the three dialect builders it
 * resolves to has no callable `insert`/`select` — TypeScript cannot unify
 * their overloads. Every builder implements the subset above, so the handle is
 * viewed through it, here and nowhere else.
 *
 * @param db - The handle a `db` resolver just returned.
 * @returns The same object, typed as the subset.
 */
export function asQueryHandle<NewRow, Row>(
    db: unknown,
): QueryHandle<NewRow, Row> {
    return db as QueryHandle<NewRow, Row>
}
