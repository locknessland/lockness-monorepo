/**
 * @fileoverview Tests for the faker-agnostic `Factory` base — pure make/makeMany
 * (no I/O), and create/createMany inserting through a faked `Database`.
 *
 * @module @lockness/drizzle/tests/factory
 */

import { assert, assertEquals } from '@std/assert'
import { container } from '@lockness/container'
import { Database, Factory } from '../mod.ts'

type Row = {
    email: string
    name: string
}

// A factory whose definition uses a plain counter (NOT faker) — proving the
// base needs no faker and calls definition() fresh per row.
class CounterFactory extends Factory<Row> {
    protected readonly table: unknown = { _table: 'users' }
    #n = 0
    protected definition(): Row {
        this.#n++
        return { email: `u${this.#n}@x.test`, name: `N${this.#n}` }
    }
}

/** Install a fake insert-capable `db` on the container's Database singleton. */
function fakeInserts(): { table: unknown; rows: unknown }[] {
    const recorded: { table: unknown; rows: unknown }[] = []
    const svc = container.get(Database)
    ;(svc as unknown as { db: unknown }).db = {
        insert: (table: unknown) => ({
            values: (rows: unknown) => {
                recorded.push({ table, rows })
                return Promise.resolve()
            },
        }),
    }
    return recorded
}

Deno.test('make() builds one record and applies overrides — pure, no connection', () => {
    const f = new CounterFactory()
    const a = f.make()
    assertEquals(a, { email: 'u1@x.test', name: 'N1' })
    const b = f.make({ name: 'Override' })
    assertEquals(b, { email: 'u2@x.test', name: 'Override' })
})

Deno.test('makeMany(n) builds n distinct records (definition called fresh each)', () => {
    const rows = new CounterFactory().makeMany(3)
    assertEquals(rows.map((r) => r.email), [
        'u1@x.test',
        'u2@x.test',
        'u3@x.test',
    ])
})

Deno.test('createMany inserts through the Database service and returns the rows', async () => {
    const recorded = fakeInserts()
    const rows = await new CounterFactory().createMany(2, { name: 'Same' })
    assertEquals(rows.length, 2)
    assert(rows.every((r) => r.name === 'Same'))
    // One insert statement, carrying the table and the 2 rows.
    assertEquals(recorded.length, 1)
    assertEquals((recorded[0].table as { _table: string })._table, 'users')
    assertEquals((recorded[0].rows as Row[]).length, 2)
})

Deno.test('create() inserts one and returns it', async () => {
    const recorded = fakeInserts()
    const row = await new CounterFactory().create({ email: 'once@x.test' })
    assertEquals(row.email, 'once@x.test')
    assertEquals(recorded.length, 1)
    assertEquals((recorded[0].rows as Row[]).length, 1)
})
