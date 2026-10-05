/**
 * @fileoverview #439 — the `db:status` policy, without a database: drizzle-orm
 * 0.36.4's high-water rule as a pure comparison, the `created_at` and `hash`
 * normalisation, the exact catalogue and bookkeeping SQL per dialect, the
 * table-presence check, and the rendered report.
 *
 * The rule is pinned here against hand-built rows; `status_libsql.test.ts`
 * pins that it agrees with the real migrator.
 *
 * @module @lockness/drizzle/tests/migration_status
 */

import {
    assertEquals,
    assertRejects,
    assertStringIncludes,
    assertThrows,
} from '@std/assert'
import type { MaintenanceConnection } from '../drivers.ts'
import type { MigrationEntry } from '../migration_settings.ts'
import {
    type BookkeepingLocation,
    bookkeepingName,
    type BookkeepingRow,
    catalogueQuery,
    computeMigrationStatus,
    readBookkeeping,
    renderMigrationStatus,
    rowsQuery,
    toBookkeepingRow,
} from '../migration_status.ts'

/** A journal entry timestamped `when`, hashed `h<when>` unless told. */
function entry(tag: string, when: number, hash = `h${when}`): MigrationEntry {
    return { tag, when, hash }
}

/** A bookkeeping row, as the migrator writes it for `entry`. */
function row(
    createdAt: number | bigint,
    hash = `h${createdAt}`,
): BookkeepingRow {
    return { hash, createdAt: BigInt(createdAt) }
}

const JOURNAL: readonly MigrationEntry[] = [
    entry('0000_init', 100),
    entry('0001_users', 200),
    entry('0002_posts', 300),
]

/** The states of a status, as `tag:state[:edited]`, in journal order. */
function states(
    entries: readonly MigrationEntry[],
    rows: readonly BookkeepingRow[] | undefined,
): string[] {
    return computeMigrationStatus(entries, rows).entries.map((s) =>
        `${s.entry.tag}:${s.state}${s.edited ? ':edited' : ''}`
    )
}

// -----------------------------------------------------------------------------
// The comparison — drizzle-orm's rule: pending ⇔ when > max(created_at)
// -----------------------------------------------------------------------------

Deno.test('#439 an absent bookkeeping table: every entry pending, never migrated', () => {
    const status = computeMigrationStatus(JOURNAL, undefined)
    assertEquals(status.tableExists, false)
    assertEquals(status.unknownRows, [])
    assertEquals(states(JOURNAL, undefined), [
        '0000_init:pending',
        '0001_users:pending',
        '0002_posts:pending',
    ])
})

Deno.test('#439 an empty bookkeeping table: every entry pending, but the table exists', () => {
    const status = computeMigrationStatus(JOURNAL, [])
    assertEquals(status.tableExists, true)
    assertEquals(states(JOURNAL, []), [
        '0000_init:pending',
        '0001_users:pending',
        '0002_posts:pending',
    ])
})

Deno.test('#439 every entry has its row: all applied', () => {
    assertEquals(states(JOURNAL, [row(100), row(200), row(300)]), [
        '0000_init:applied',
        '0001_users:applied',
        '0002_posts:applied',
    ])
})

Deno.test('#439 entries newer than the latest row are pending', () => {
    assertEquals(states(JOURNAL, [row(100)]), [
        '0000_init:applied',
        '0001_users:pending',
        '0002_posts:pending',
    ])
})

Deno.test('#439 an unmatched entry older than the latest row is out of order', () => {
    assertEquals(states(JOURNAL, [row(100), row(300)]), [
        '0000_init:applied',
        '0001_users:out-of-order',
        '0002_posts:applied',
    ])
})

Deno.test('#439 the boundary: an entry at exactly max(created_at) is applied, one past it pending, one short of it out of order', () => {
    // drizzle-orm applies an entry only when `created_at < when`, strictly:
    // an entry sitting on the high-water mark is not re-applied. A `>=` in
    // the comparison would call it pending.
    const journal = [entry('a', 499), entry('b', 500), entry('c', 501)]
    assertEquals(states(journal, [row(500)]), [
        'a:out-of-order',
        'b:applied',
        'c:pending',
    ])
})

Deno.test('#439 a row matches its entry by created_at, not by position or hash', () => {
    assertEquals(states(JOURNAL, [row(300), row(100), row(200)]), [
        '0000_init:applied',
        '0001_users:applied',
        '0002_posts:applied',
    ])
})

Deno.test('#439 an applied entry whose file changed is edited, and still applied', () => {
    const status = computeMigrationStatus(JOURNAL, [
        row(100),
        row(200, 'stale-hash'),
        row(300),
    ])
    assertEquals(status.entries.map((s) => s.edited), [false, true, false])
    assertEquals(status.entries[1].state, 'applied')
})

Deno.test('#439 a row no entry matches is unknown, and raises the high-water mark', () => {
    // A branch merged a migration whose file this checkout does not have: its
    // row sits above 0001 and 0002, so db:migrate will never apply them.
    const status = computeMigrationStatus(JOURNAL, [row(100), row(999)])
    assertEquals(status.unknownRows, [row(999)])
    assertEquals(states(JOURNAL, [row(100), row(999)]), [
        '0000_init:applied',
        '0001_users:out-of-order',
        '0002_posts:out-of-order',
    ])
})

Deno.test('#439 an empty journal over an empty table: nothing to report', () => {
    const status = computeMigrationStatus([], [])
    assertEquals(status.entries, [])
    assertEquals(status.unknownRows, [])
})

Deno.test('#439 an empty journal over recorded rows: every row unknown', () => {
    const status = computeMigrationStatus([], [row(1), row(2)])
    assertEquals(status.unknownRows, [row(1), row(2)])
})

// -----------------------------------------------------------------------------
// Normalising a bookkeeping row — postgres.js, mysql2 and libsql disagree
// -----------------------------------------------------------------------------

Deno.test('#439 created_at normalises to BigInt from a string, a number or a bigint', () => {
    // postgres.js returns int8 as a string, mysql2 BIGINT and libsql numeric
    // as a number, a client in bigint mode as a bigint.
    for (
        const createdAt of [
            '1700000000000',
            1_700_000_000_000,
            1_700_000_000_000n,
        ]
    ) {
        assertEquals(
            toBookkeepingRow({ hash: 'h', created_at: createdAt }),
            { hash: 'h', createdAt: 1_700_000_000_000n },
            String(typeof createdAt),
        )
    }
})

Deno.test('#439 a string created_at beyond 2^53 keeps every digit', () => {
    assertEquals(
        toBookkeepingRow({ hash: 'h', created_at: '9007199254740993' })
            .createdAt,
        9_007_199_254_740_993n,
    )
})

for (
    const [label, value] of [
        ['null', null],
        ['missing', undefined],
        ['fractional', 1.5],
        ['an unsafe number', 2 ** 60],
        ['NaN', Number.NaN],
        ['a non-numeric string', '17e11'],
        ['an empty string', ''],
        ['a boolean', true],
    ] as const
) {
    Deno.test(`#439 a row whose created_at is ${label} fails, never guessed at`, () => {
        const error = assertThrows(
            () => toBookkeepingRow({ hash: 'h', created_at: value }),
            Error,
        )
        assertStringIncludes(error.message, 'created_at is not an integer')
    })
}

for (
    const [label, value] of [['null', null], ['a number', 7], [
        'missing',
        undefined,
    ]] as const
) {
    Deno.test(`#439 a row whose hash is ${label} fails`, () => {
        const error = assertThrows(
            () => toBookkeepingRow({ hash: value, created_at: 1 }),
            Error,
        )
        assertStringIncludes(error.message, 'hash is not text')
    })
}

// -----------------------------------------------------------------------------
// The SQL — fixed catalogue text per dialect; quoted identifiers only
// -----------------------------------------------------------------------------

const POSTGRES: BookkeepingLocation = {
    dialect: 'postgres',
    table: '__drizzle_migrations',
    schema: 'drizzle',
}
const MYSQL: BookkeepingLocation = {
    dialect: 'mysql',
    table: '__drizzle_migrations',
    schema: undefined,
}
const SQLITE: BookkeepingLocation = {
    dialect: 'sqlite',
    table: '__drizzle_migrations',
    schema: undefined,
}

Deno.test('#439 the catalogue query is fixed text per dialect', () => {
    assertEquals(
        catalogueQuery('postgres'),
        'SELECT schemaname AS schema, tablename AS name FROM pg_catalog.pg_tables',
    )
    assertEquals(
        catalogueQuery('mysql'),
        'SELECT table_name AS name FROM information_schema.tables ' +
            'WHERE table_schema = DATABASE()',
    )
    assertEquals(
        catalogueQuery('sqlite'),
        "SELECT name FROM sqlite_master WHERE type = 'table'",
    )
})

Deno.test('#439 the bookkeeping read, per dialect, with the default names', () => {
    assertEquals(
        rowsQuery(POSTGRES),
        'SELECT hash, created_at FROM "drizzle"."__drizzle_migrations" ' +
            'ORDER BY created_at',
    )
    assertEquals(
        rowsQuery(MYSQL),
        'SELECT hash, created_at FROM `__drizzle_migrations` ORDER BY created_at',
    )
    assertEquals(
        rowsQuery(SQLITE),
        'SELECT hash, created_at FROM "__drizzle_migrations" ORDER BY created_at',
    )
})

/** A name holding every character a quoting rule must survive. */
const AWKWARD = 'a"b`c\'d\\e'

Deno.test('#439 awkward identifiers are quoted per dialect, never embedded raw', () => {
    assertEquals(
        rowsQuery({ dialect: 'postgres', table: AWKWARD, schema: AWKWARD }),
        `SELECT hash, created_at FROM "a""b\`c'd\\e"."a""b\`c'd\\e" ORDER BY created_at`,
    )
    assertEquals(
        rowsQuery({ dialect: 'mysql', table: AWKWARD, schema: undefined }),
        'SELECT hash, created_at FROM `a"b``c\'d\\e` ORDER BY created_at',
    )
    assertEquals(
        rowsQuery({ dialect: 'sqlite', table: AWKWARD, schema: undefined }),
        `SELECT hash, created_at FROM "a""b\`c'd\\e" ORDER BY created_at`,
    )
})

Deno.test('#439 a custom postgres schema and table are both honoured', () => {
    assertEquals(
        bookkeepingName({
            dialect: 'postgres',
            table: 'history',
            schema: 'meta',
        }),
        '"meta"."history"',
    )
    assertEquals(
        bookkeepingName({
            dialect: 'mysql',
            table: 'history',
            schema: undefined,
        }),
        '`history`',
    )
})

// -----------------------------------------------------------------------------
// Reading through the maintenance connection — one fake function
// -----------------------------------------------------------------------------

/** A `query` that answers each statement from a table, and records it. */
function fakeQuery(
    answers: Readonly<Record<string, readonly Record<string, unknown>[]>>,
) {
    const asked: string[] = []
    const maintenance: Pick<MaintenanceConnection, 'query'> = {
        query: (sql) => {
            asked.push(sql)
            const rows = answers[sql]
            return rows === undefined
                ? Promise.reject(new Error(`unexpected query: ${sql}`))
                : Promise.resolve(rows)
        },
    }
    return { asked, maintenance }
}

Deno.test('#439 postgres: a missing table is read from the catalogue, and no row query runs', async () => {
    const { asked, maintenance } = fakeQuery({
        [catalogueQuery('postgres')]: [
            // The right table in another schema, and the right schema with
            // another table: neither is the bookkeeping table.
            { schema: 'public', name: '__drizzle_migrations' },
            { schema: 'drizzle', name: 'other' },
        ],
    })
    assertEquals(await readBookkeeping(maintenance, POSTGRES), undefined)
    assertEquals(asked, [catalogueQuery('postgres')])
})

Deno.test('#439 postgres: a present table is read whole and normalised', async () => {
    const { asked, maintenance } = fakeQuery({
        [catalogueQuery('postgres')]: [{
            schema: 'drizzle',
            name: '__drizzle_migrations',
        }],
        [rowsQuery(POSTGRES)]: [
            { hash: 'a', created_at: '100' },
            { hash: 'b', created_at: '200' },
        ],
    })
    assertEquals(await readBookkeeping(maintenance, POSTGRES), [
        { hash: 'a', createdAt: 100n },
        { hash: 'b', createdAt: 200n },
    ])
    assertEquals(asked, [catalogueQuery('postgres'), rowsQuery(POSTGRES)])
})

Deno.test('#439 the names are compared exactly, in TypeScript, never put in the SQL', async () => {
    const location: BookkeepingLocation = {
        dialect: 'postgres',
        table: AWKWARD,
        schema: AWKWARD,
    }
    const { asked, maintenance } = fakeQuery({
        [catalogueQuery('postgres')]: [
            { schema: AWKWARD.toUpperCase(), name: AWKWARD },
            { schema: AWKWARD, name: AWKWARD },
        ],
        [rowsQuery(location)]: [],
    })
    assertEquals(await readBookkeeping(maintenance, location), [])
    assertEquals(asked[0].includes(AWKWARD), false)
})

Deno.test('#439 mysql and sqlite match the table name alone', async () => {
    for (const location of [MYSQL, SQLITE]) {
        const present = fakeQuery({
            [catalogueQuery(location.dialect)]: [{
                name: '__drizzle_migrations',
            }],
            [rowsQuery(location)]: [{ hash: 'a', created_at: 100 }],
        })
        assertEquals(
            await readBookkeeping(present.maintenance, location),
            [{ hash: 'a', createdAt: 100n }],
            location.dialect,
        )
        const absent = fakeQuery({
            [catalogueQuery(location.dialect)]: [{ name: 'users' }],
        })
        assertEquals(
            await readBookkeeping(absent.maintenance, location),
            undefined,
            location.dialect,
        )
    }
})

Deno.test('#439 a catalogue row without a text name fails the read', async () => {
    const { maintenance } = fakeQuery({
        [catalogueQuery('sqlite')]: [{ name: 42 }],
    })
    const error = await assertRejects(
        () => readBookkeeping(maintenance, SQLITE),
        Error,
    )
    assertStringIncludes(error.message, 'catalogue')
})

Deno.test('#439 a malformed bookkeeping row fails the read and names the table, not the value', async () => {
    const { maintenance } = fakeQuery({
        [catalogueQuery('sqlite')]: [{ name: '__drizzle_migrations' }],
        [rowsQuery(SQLITE)]: [{ hash: 'a', created_at: 'not-a-number' }],
    })
    const error = await assertRejects(
        () => readBookkeeping(maintenance, SQLITE),
        Error,
    )
    assertStringIncludes(error.message, '"__drizzle_migrations"')
    assertEquals(error.message.includes('not-a-number'), false)
})

// -----------------------------------------------------------------------------
// The report — human lines, the count last
// -----------------------------------------------------------------------------

Deno.test('#439 the report lists every state, the warnings, and fails with the count', () => {
    const journal = [
        entry('0000_init', 100),
        entry('0001_users', 200),
        entry('0002_posts', 400),
        entry('0003_tags', 250),
    ]
    const recordedAt = Date.UTC(2026, 8, 30, 10)
    const status = computeMigrationStatus(journal, [
        row(100),
        row(200, 'stale'),
        row(300),
        row(recordedAt),
    ])
    const report = renderMigrationStatus(status, POSTGRES)
    assertEquals(report.lines, [
        '📊 Migration status (bookkeeping table "drizzle"."__drizzle_migrations")',
        '  applied        0000_init',
        '  applied        0001_users     ⚠️ edited after it was applied; db:migrate will not re-run it',
        '  out of order   0002_posts     ⚠️ older than the latest applied migration; db:migrate will not apply it',
        '  out of order   0003_tags      ⚠️ older than the latest applied migration; db:migrate will not apply it',
        '  ⚠️ 2 applied migrations are not in the journal (recorded at 1970-01-01T00:00:00.300Z, 2026-09-30T10:00:00.000Z)',
    ])
    assertEquals(
        report.failure,
        '2 of 4 migrations are not applied: 2 out of order',
    )
})

Deno.test('#439 the report names pending and out-of-order counts together', () => {
    const journal = [
        entry('a', 100),
        entry('b', 200),
        entry('c', 300),
        entry('d', 50),
    ]
    const report = renderMigrationStatus(
        computeMigrationStatus(journal, [row(100), row(200)]),
        SQLITE,
    )
    assertEquals(report.lines.slice(1), [
        '  applied        a',
        '  applied        b',
        '  pending        c',
        '  out of order   d     ⚠️ older than the latest applied migration; db:migrate will not apply it',
    ])
    assertEquals(
        report.failure,
        '2 of 4 migrations are not applied: 1 pending, 1 out of order',
    )
})

Deno.test('#439 all applied: one ✅ line, no failure', () => {
    const report = renderMigrationStatus(
        computeMigrationStatus(JOURNAL, [row(100), row(200), row(300)]),
        MYSQL,
    )
    assertEquals(
        report.lines[0],
        '📊 Migration status (bookkeeping table `__drizzle_migrations`)',
    )
    assertEquals(report.lines.at(-1), '✅ All 3 migrations are applied')
    assertEquals(report.failure, undefined)
})

Deno.test('#439 one migration, applied or pending: the count reads in the singular', () => {
    const one = [entry('0000_init', 100)]
    assertEquals(
        renderMigrationStatus(computeMigrationStatus(one, [row(100)]), SQLITE)
            .lines.at(-1),
        '✅ The one migration is applied',
    )
    assertEquals(
        renderMigrationStatus(computeMigrationStatus(one, undefined), SQLITE)
            .failure,
        '1 of 1 migration is not applied: 1 pending',
    )
})

Deno.test('#439 never migrated: says so, lists everything pending, and fails', () => {
    const report = renderMigrationStatus(
        computeMigrationStatus(JOURNAL, undefined),
        SQLITE,
    )
    assertEquals(report.lines, [
        '📊 Migration status (bookkeeping table "__drizzle_migrations")',
        '  The bookkeeping table does not exist: this database has never been migrated',
        '  pending        0000_init',
        '  pending        0001_users',
        '  pending        0002_posts',
    ])
    assertEquals(report.failure, '3 of 3 migrations are not applied: 3 pending')
})

Deno.test('#439 an empty journal: one ✅ line, exit 0, even with no table', () => {
    for (const rows of [undefined, []]) {
        const report = renderMigrationStatus(
            computeMigrationStatus([], rows),
            SQLITE,
        )
        assertEquals(report.lines.at(-1), '✅ The journal lists no migrations')
        assertEquals(report.failure, undefined)
    }
})

Deno.test('#439 an unknown row with a created_at no Date can hold is shown as recorded', () => {
    const report = renderMigrationStatus(
        computeMigrationStatus([entry('a', 1)], [row(1), row(10n ** 18n)]),
        SQLITE,
    )
    assertStringIncludes(
        report.lines.join('\n'),
        '⚠️ 1 applied migration is not in the journal (recorded at created_at 1000000000000000000)',
    )
    assertEquals(report.failure, undefined)
})
