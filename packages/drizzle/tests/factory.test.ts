/**
 * @fileoverview Tests for the faker-agnostic `Factory` base — pure make/makeMany
 * (no I/O), and create/createMany inserting through a faked `Database`.
 *
 * @module @lockness/drizzle/tests/factory
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { container } from '@lockness/container'
import { Database, Factory } from '../mod.ts'

/**
 * Run `fn` with `APP_ENV` forced to `value`, restoring the prior value (or
 * absence) afterwards so environment mutation never leaks between tests.
 */
async function withAppEnv(
    value: string | undefined,
    fn: () => Promise<void>,
): Promise<void> {
    const prev = Deno.env.get('APP_ENV')
    const prevDeno = Deno.env.get('DENO_ENV')
    Deno.env.delete('DENO_ENV')
    if (value === undefined) Deno.env.delete('APP_ENV')
    else Deno.env.set('APP_ENV', value)
    try {
        await fn()
    } finally {
        if (prev === undefined) Deno.env.delete('APP_ENV')
        else Deno.env.set('APP_ENV', prev)
        if (prevDeno === undefined) Deno.env.delete('DENO_ENV')
        else Deno.env.set('DENO_ENV', prevDeno)
    }
}

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

Deno.test('create() refuses to insert under APP_ENV=production without override', async () => {
    const recorded = fakeInserts()
    await withAppEnv('production', async () => {
        await assertRejects(
            () => new CounterFactory().create(),
            Error,
            'production',
        )
    })
    // The write must never have reached the database.
    assertEquals(recorded.length, 0)
})

Deno.test('createMany() refuses to insert under APP_ENV=production without override', async () => {
    const recorded = fakeInserts()
    await withAppEnv('production', async () => {
        await assertRejects(
            () => new CounterFactory().createMany(3),
            Error,
            'production',
        )
    })
    assertEquals(recorded.length, 0)
})

Deno.test('create() inserts under production when { allowProduction: true } is passed', async () => {
    const recorded = fakeInserts()
    await withAppEnv('production', async () => {
        const row = await new CounterFactory().create(
            { email: 'forced@x.test' },
            { allowProduction: true },
        )
        assertEquals(row.email, 'forced@x.test')
    })
    assertEquals(recorded.length, 1)
})

Deno.test('createMany() inserts under production when { allowProduction: true } is passed', async () => {
    const recorded = fakeInserts()
    await withAppEnv('production', async () => {
        const rows = await new CounterFactory().createMany(
            2,
            {},
            { allowProduction: true },
        )
        assertEquals(rows.length, 2)
    })
    assertEquals(recorded.length, 1)
})
