/**
 * @fileoverview #435, #442 — what `db:migrate` and `db:fresh` read from
 * `drizzle.config.ts`, and every configuration they refuse before they touch
 * the database (R2, R3). `db:fresh` alone reads its reset scope,
 * `schemaFilter`, through `loadFreshSettings`.
 *
 * The config is passed straight to the parser through the loader seam. R3 is
 * proven against a real temporary folder, through the default reader, which
 * is drizzle-orm's own `readMigrationFiles`.
 *
 * @module @lockness/drizzle/tests/migration_settings
 */

import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import {
    loadFreshSettings,
    loadMigrationSettings,
    type MigrationReader,
} from '../migration_settings.ts'
import { RefusedError } from '../refusal.ts'
import { DIALECT_FROM_KIT } from '../generators/dialect_schema.ts'

/** A reader that returns one migration and records the folder it was asked. */
function reader(statements: string[][] = [['CREATE TABLE "t" ()']]) {
    const folders: string[] = []
    const read: MigrationReader = (folder) => {
        folders.push(folder)
        return Promise.resolve(statements)
    }
    return { folders, read }
}

const base = {
    dialect: 'postgresql',
    out: './database/migrations',
    schema: './app/model/*.ts',
    dbCredentials: { url: 'postgres://u:p@h:5432/app' },
}

Deno.test('#435 DIALECT_FROM_KIT maps every kit dialect db:fresh supports', () => {
    assertEquals(DIALECT_FROM_KIT, {
        postgresql: 'postgres',
        mysql: 'mysql',
        sqlite: 'sqlite',
        turso: 'sqlite',
    })
})

Deno.test('#435 settings carry the defaults drizzle-kit uses', async () => {
    const { folders, read } = reader([['A', 'B'], ['C']])

    const settings = await loadMigrationSettings(
        () => Promise.resolve(base),
        read,
    )

    assertEquals(settings, {
        dialect: 'postgres',
        kitDialect: 'postgresql',
        url: 'postgres://u:p@h:5432/app',
        folder: './database/migrations',
        table: '__drizzle_migrations',
        schema: 'drizzle',
        migrations: 2,
        statements: ['A', 'B', 'C'],
    })
    assertEquals(folders, ['./database/migrations'])
})

Deno.test('#442 MigrationSettings carries no schemaFilter: it is db:fresh’s reset scope', async () => {
    const settings = await loadMigrationSettings(
        () => Promise.resolve({ ...base, schemaFilter: ['app'] }),
        reader().read,
    )
    assertEquals(Object.hasOwn(settings, 'schemaFilter'), false)
    // @ts-expect-error — the field moved to db:fresh's own settings.
    assertEquals(settings.schemaFilter, undefined)
})

Deno.test('#442 loadFreshSettings adds the reset scope, from one import of the config', async () => {
    let loads = 0
    const { folders, read } = reader([['A']])
    const settings = await loadFreshSettings(() => {
        loads++
        return Promise.resolve({ ...base, schemaFilter: ['app', 'auth'] })
    }, read)

    assertEquals(loads, 1)
    assertEquals(folders, ['./database/migrations'])
    assertEquals(settings, {
        dialect: 'postgres',
        kitDialect: 'postgresql',
        url: 'postgres://u:p@h:5432/app',
        folder: './database/migrations',
        table: '__drizzle_migrations',
        schema: 'drizzle',
        schemaFilter: ['app', 'auth'],
        migrations: 1,
        statements: ['A'],
    })
})

Deno.test('#435 settings honour migrations.table and migrations.schema', async () => {
    const settings = await loadMigrationSettings(
        () =>
            Promise.resolve({
                ...base,
                migrations: { table: 'history', schema: 'meta' },
            }),
        reader().read,
    )

    assertEquals(settings.table, 'history')
    assertEquals(settings.schema, 'meta')
})

Deno.test('#435 schemaFilter defaults to public, and a single string is a one-schema scope', async () => {
    for (
        const [schemaFilter, expected] of [
            [undefined, ['public']],
            ['app', ['app']],
        ] as const
    ) {
        const settings = await loadFreshSettings(
            () => Promise.resolve({ ...base, schemaFilter }),
            reader().read,
        )
        assertEquals(settings.schemaFilter, expected)
    }
})

Deno.test('#435 a non-postgres scope ignores schemaFilter', async () => {
    const settings = await loadFreshSettings(
        () =>
            Promise.resolve({
                ...base,
                dialect: 'sqlite',
                dbCredentials: { url: 'file:./app.db' },
                schemaFilter: 42,
            }),
        reader().read,
    )
    assertEquals(settings.schemaFilter, ['public'])
})

Deno.test('#435 mysql and sqlite keep no bookkeeping schema', async () => {
    for (
        const [dialect, url] of [
            ['mysql', 'mysql://u:p@h/app'],
            ['sqlite', 'file:./app.db'],
            ['turso', 'libsql://app.turso.io'],
        ]
    ) {
        const settings = await loadMigrationSettings(
            () =>
                Promise.resolve({
                    ...base,
                    dialect,
                    dbCredentials: { url },
                    migrations: { table: 'history', schema: 'ignored' },
                }),
            reader().read,
        )
        assertEquals(settings.schema, undefined, dialect)
        assertEquals(settings.table, 'history', dialect)
    }
})

// -----------------------------------------------------------------------------
// R2 — a configuration db:fresh cannot act on
// -----------------------------------------------------------------------------

/** Assert a refusal naming `fragment`, and that the migrations were never read. */
async function assertRefused(
    config: () => Promise<unknown>,
    fragment: string,
): Promise<void> {
    const { folders, read } = reader()
    const error = await assertRejects(
        () => loadMigrationSettings(config, read),
        RefusedError,
    )
    assertEquals(
        error.message.includes(fragment),
        true,
        `"${error.message}" does not name "${fragment}"`,
    )
    assertEquals(folders, [], 'the migrations were read after a refusal')
}

Deno.test('#435 R2 refuses a drizzle.config.ts that cannot be imported, showing only the error name', async () => {
    await assertRefused(
        () => Promise.reject(new TypeError('Module not found "drizzle-kit"')),
        'drizzle.config.ts could not be imported (TypeError); its error is ' +
            'withheld because it may contain the DSN',
    )
})

/**
 * A DSN the import error quotes — assembled at runtime so no scanner reads a
 * credential into the source.
 */
const LEAKED_DSN = ['postgres://app', 'not-a-real-secret@db.example:5432/app']
    .join(':')

/** Every text a refusal exposes: message, name, and the whole cause chain. */
function exposed(error: unknown): string {
    const texts: string[] = []
    for (let e = error, depth = 0; e !== undefined && depth < 8; depth++) {
        if (!(e instanceof Error)) {
            texts.push(String(e))
            break
        }
        texts.push(e.name, e.message, e.stack ?? '')
        e = e.cause
    }
    return texts.join('\n')
}

for (
    const [label, thrown] of [
        [
            'an Error quoting the DSN',
            () => new Error(`cannot reach ${LEAKED_DSN}`),
        ],
        ['a string quoting the DSN', () => `cannot reach ${LEAKED_DSN}`],
        [
            'an Error whose name is the DSN',
            () => Object.assign(new Error('boom'), { name: LEAKED_DSN }),
        ],
        ['an Error whose name getter throws', () => {
            const error = new Error(`cannot reach ${LEAKED_DSN}`)
            Object.defineProperty(error, 'name', {
                get: () => {
                    throw new Error(LEAKED_DSN)
                },
            })
            return error
        }],
    ] as const
) {
    Deno.test(`#435 R2 withholds an import failure that may carry the DSN: ${label}`, async () => {
        const { folders, read } = reader()
        const error = await assertRejects(
            () => loadMigrationSettings(() => Promise.reject(thrown()), read),
            RefusedError,
        )

        assertStringIncludes(error.message, 'could not be imported')
        assertStringIncludes(error.message, 'withheld')
        const text = exposed(error)
        assertEquals(text.includes(LEAKED_DSN), false, text)
        assertEquals(text.includes('not-a-real-secret'), false, text)
        assertEquals(text.includes('db.example'), false, text)
        assertEquals(error.cause, undefined, 'the raw error rode along')
        assertEquals(folders, [], 'the migrations were read after a refusal')
    })
}

Deno.test('#435 R2 refuses a config that is not an object', async () => {
    await assertRefused(() => Promise.resolve(undefined), 'default export')
})

Deno.test('#435 R2 refuses a config without out', async () => {
    const { out: _out, ...config } = base
    await assertRefused(() => Promise.resolve(config), '`out`')
    await assertRefused(
        () => Promise.resolve({ ...base, out: '' }),
        '`out`',
    )
})

// #449 — each `dbCredentials` fault gets its own message, and none of them
// quotes the URL. A host the URL carries, assembled at runtime so no scanner
// reads a credential into the source.
const URL_HOST = ['secret-host', 'db.example'].join('.')

/** The R2 messages for each `dbCredentials` fault, one per fault (#449). */
const CREDENTIAL_FAULTS = {
    missing: '`dbCredentials` is not set, so no database is named; a config ' +
        'that builds it from an environment variable leaves it out when ' +
        'that variable is unset',
    notObject: '`dbCredentials` must be an object holding a `url`',
    noUrl: '`dbCredentials.url` is not set or is not a string; Lockness ' +
        'connects through `url` only',
    emptyUrl: '`dbCredentials.url` is empty, so no database is named; ' +
        'the environment variable it is built from is probably unset',
    extraKeys: '`dbCredentials` holds keys Lockness does not read: remove ' +
        'them; Lockness connects through `dbCredentials.url` only',
} as const

for (
    const [fault, cases] of [
        ['missing', [undefined]],
        ['notObject', [null, 'postgres://app', ['url']]],
        ['noUrl', [{}, { url: 42 }, { url: null }]],
        ['emptyUrl', [{ url: '' }, { url: ' ' }, { url: '\t\n ' }, {
            url: '  ',
        }]],
        ['extraKeys', [
            { url: `postgres://app@${URL_HOST}/app`, secretArn: 't' },
            // authToken is libsql's; on postgresql it is just an unknown key.
            { url: `postgres://app@${URL_HOST}/app`, authToken: 't' },
        ]],
    ] as const
) {
    Deno.test(`#449 R2 names the dbCredentials fault: ${fault}`, async () => {
        for (const dbCredentials of cases) {
            const { folders, read } = reader()
            const error = await assertRejects(
                () =>
                    loadMigrationSettings(
                        () => Promise.resolve({ ...base, dbCredentials }),
                        read,
                    ),
                RefusedError,
            )
            const label = JSON.stringify(dbCredentials) ?? 'undefined'
            assertEquals(
                error.reason,
                `drizzle.config.ts: ${CREDENTIAL_FAULTS[fault]}`,
                label,
            )
            assertEquals(error.kitOnly, false, label)
            assertEquals(error.message.includes('secret-host'), false, label)
            assertEquals(error.message.includes('postgres://'), false, label)
            assertEquals(folders, [], `${label}: the migrations were read`)
        }
    })
}

Deno.test('#449 R2 gives each dbCredentials fault a distinct message', () => {
    const messages = Object.values(CREDENTIAL_FAULTS)
    assertEquals(new Set(messages).size, messages.length)
})

Deno.test('#449 R2 keeps a url with surrounding blanks as written', async () => {
    const url = ' postgres://u:p@h:5432/app '
    const settings = await loadMigrationSettings(
        () => Promise.resolve({ ...base, dbCredentials: { url } }),
        reader().read,
    )
    assertEquals(settings.url, url)
})

// #456 — a url that names no database is refused, because the driver would
// fall back to a default target of its own (postgres.js: PGDATABASE, then the
// connecting user's database — the URL's username, or the OS user; libsql: a
// throwaway temporary database).

/** The one R2 message for a url that names no database (#456). */
const NO_DATABASE = '`dbCredentials.url` names no database in its path, so ' +
    'the driver would connect to a default of its own; the environment ' +
    'variable the database name is built from is probably unset, or the name ' +
    'is only in the query string: put it in the path'

/** Every url refused as naming no database, by the dialect it is read for. */
const NAMES_NO_DATABASE: readonly (readonly [string, readonly string[]])[] = [
    ['postgresql', [
        // The issue's list, in both scheme spellings.
        'postgres://',
        'postgres:///',
        'postgres://localhost:5432/',
        'postgres://localhost/',
        'postgresql://',
        'postgresql:///',
        'postgresql://localhost:5432/',
        'postgresql://localhost/',
        // A name only in the query string is not read (the path is the rule),
        // and an empty-userinfo form with no path is refused here, before R3.
        'postgres://localhost/?database=app',
        'postgres://:@:5432/',
        // postgres.js sends every query key as a startup parameter, so a
        // `database` key overrides the path, and an empty one sends none: the
        // server then picks the user's database. Refused for postgresql.
        `postgres://app@${URL_HOST}/app?database=`,
        `postgres://app@${URL_HOST}/app?database=other`,
        // postgres.js decodes a `%2C` in the host into a host list and rewrites
        // the URL, which can cut the database out of the path. No real host
        // holds a comma.
        `postgres://app@%2C${URL_HOST}:5432/,${URL_HOST}:5432`,
        `postgres://app@x%2c${URL_HOST}:5432/app`,
        // What `postgres://localhost:5432/${DB_NAME ?? ''}` becomes with
        // credentials and a query string around the missing name.
        `postgres://app:pw@${URL_HOST}:5432/`,
        `postgres://app:pw@${URL_HOST}:5432/?sslmode=require`,
        `postgres://${URL_HOST}?sslmode=require`,
        `postgres://${URL_HOST}#app`,
        // WHATWG drops a dot segment, percent-encoded or not, and postgres.js
        // reads the database from the WHATWG pathname.
        `postgres://${URL_HOST}/.`,
        `postgres://${URL_HOST}/..`,
        `postgres://${URL_HOST}/%2e`,
        `postgres://${URL_HOST}/%2E%2e/`,
        // Parsed under its own scheme: for a WHATWG special scheme `\` ends a
        // segment too, so this path is a dot segment and names nothing.
        `http://${URL_HOST}/.\\`,
        // A host list WHATWG cannot parse whole still names no database.
        `postgres://h1:5432,${URL_HOST}:5433/`,
        // Trailing blanks around a missing name.
        'postgres://localhost:5432/ ',
        // No `scheme://` authority to read a database after: postgres.js
        // parses `file:` with an empty path and falls back to PGDATABASE.
        'file:',
        'localhost',
    ]],
    ['mysql', [
        'mysql://localhost?database=app',
        'mysql://',
        'mysql:///',
        'mysql://localhost:3306/',
        `mysql://app:pw@${URL_HOST}/?ssl=true`,
        `mysql://${URL_HOST}/.`,
    ]],
    ['sqlite', [
        'file:',
        'file://',
        'FILE:',
        'file:?tls=0',
        'file://localhost',
    ]],
    ['turso', ['file:', 'file://']],
]

/** Every url that names its database, and is accepted. */
const NAMES_A_DATABASE: readonly (readonly [string, readonly string[]])[] = [
    ['postgresql', [
        'postgres://localhost:5432/app',
        'postgresql://localhost:5432/app',
        'postgres://localhost/app',
        `postgres://app:pw@${URL_HOST}:5432/app`,
        `postgres://app:pw@${URL_HOST}:5432/app?sslmode=require`,
        `postgres://${URL_HOST}/app?sslmode=require#x`,
        `postgres://h1:5432,${URL_HOST}:5433/app`,
        `postgres://[::1]:5432/app`,
        `postgres://${URL_HOST}/%61pp`,
        `postgres://${URL_HOST}/app/.`,
        // An encoded comma in the password is not in the host.
        `postgres://app:p%2Cw@${URL_HOST}:5432/app`,
    ]],
    ['mysql', [
        'mysql://localhost:3306/app',
        `mysql://app:pw@${URL_HOST}/app`,
        // mysql2 skips a query key it already has as an option: the path wins.
        `mysql://app:pw@${URL_HOST}/app?database=other`,
    ]],
    ['sqlite', [
        'file:./app.db',
        'file:app.db',
        'file:///var/db/app.db',
        'file://localhost/var/db/app.db',
        'FILE:app.db',
        'file::memory:',
        ':memory:',
    ]],
    ['turso', [
        'file:./app.db',
        `libsql://${URL_HOST}`,
        `https://${URL_HOST}`,
    ]],
]

for (const [dialect, urls] of NAMES_NO_DATABASE) {
    Deno.test(`#456 R2 refuses a ${dialect} url that names no database`, async () => {
        for (const url of urls) {
            const { folders, read } = reader()
            const error = await assertRejects(
                () =>
                    loadMigrationSettings(
                        () =>
                            Promise.resolve({
                                ...base,
                                dialect,
                                dbCredentials: { url },
                            }),
                        read,
                    ),
                RefusedError,
                undefined,
                url,
            )
            assertEquals(error.reason, `drizzle.config.ts: ${NO_DATABASE}`, url)
            assertEquals(error.kitOnly, false, url)
            const text = exposed(error)
            assertEquals(text.includes('secret-host'), false, url)
            assertEquals(text.includes('pw@'), false, url)
            assertEquals(text.includes('localhost'), false, url)
            assertEquals(error.cause, undefined, url)
            assertEquals(folders, [], `${url}: the migrations were read`)
        }
    })
}

for (const [dialect, urls] of NAMES_A_DATABASE) {
    Deno.test(`#456 R2 accepts a ${dialect} url that names its database`, async () => {
        for (const url of urls) {
            const settings = await loadMigrationSettings(
                () =>
                    Promise.resolve({
                        ...base,
                        dialect,
                        dbCredentials: { url },
                    }),
                reader().read,
            )
            assertEquals(settings.url, url)
        }
    })
}

Deno.test('#456 R2 gives a url that names no database its own message', () => {
    const messages: readonly string[] = Object.values(CREDENTIAL_FAULTS)
    assertEquals(messages.includes(NO_DATABASE), false)
})

// -----------------------------------------------------------------------------
// #442 — the credential forms Lockness does not take, recognised and refused
// in one pass, naming every recognised key and never quoting a value
// -----------------------------------------------------------------------------

/**
 * A value the refusals must never quote, assembled at runtime so no scanner
 * reads a credential into the source.
 */
const SENTINEL = ['sentinel', 'not-a-real-secret'].join('-')

/** Load a config through the loader, expecting a refusal; return it. */
async function refusalOf(config: unknown): Promise<RefusedError> {
    const { folders, read } = reader()
    const error = await assertRejects(
        () => loadMigrationSettings(() => Promise.resolve(config), read),
        RefusedError,
    )
    assertEquals(folders, [], 'the migrations were read after a refusal')
    assertEquals(exposed(error).includes(SENTINEL), false, exposed(error))
    return error
}

/** One refused form: the config, what its reason holds, and `kitOnly`. */
interface RefusedForm {
    readonly label: string
    readonly config: Record<string, unknown>
    readonly holds: readonly string[]
    readonly kitOnly: boolean
}

/** The base config with `dbCredentials` replaced, for `dialect`. */
function withCredentials(
    dialect: string,
    dbCredentials: Record<string, unknown>,
): Record<string, unknown> {
    return { ...base, dialect, dbCredentials }
}

/** The url each server dialect's host-field refusal offers instead. */
const HOST_ALTERNATIVE = {
    postgresql: '`postgresql://<user>:<password>@<host>:<port>/<database>`',
    mysql: '`mysql://<user>:<password>@<host>:<port>/<database>`',
} as const

/** Every refused form of the #442 table, by row. */
const REFUSED_FORMS: readonly RefusedForm[] = [
    ...(['postgresql', 'mysql'] as const).map((dialect): RefusedForm => ({
        label: `${dialect} host fields`,
        config: withCredentials(dialect, {
            host: SENTINEL,
            port: 5432,
            user: SENTINEL,
            password: SENTINEL,
            database: SENTINEL,
        }),
        holds: [
            '`dbCredentials` uses host fields (`host`, `port`, `user`, ' +
            '`password`, `database`), and Lockness connects through ' +
            '`dbCredentials.url` only',
            `write one url instead, ${HOST_ALTERNATIVE[dialect]}`,
            'with the password percent-encoded',
        ],
        kitOnly: false,
    })),
    {
        label: 'postgresql ssl mode with url',
        config: withCredentials('postgresql', {
            url: `postgres://app:${SENTINEL}@h/app`,
            ssl: 'require',
        }),
        holds: [
            '`dbCredentials.ssl` is set',
            "goes in the url's query string",
            '`?sslmode=require` or `?sslmode=verify-full`',
            '`&sslrootcert=system`',
        ],
        kitOnly: false,
    },
    {
        label: 'mysql ssl boolean with host fields',
        config: withCredentials('mysql', {
            host: SENTINEL,
            database: SENTINEL,
            ssl: true,
        }),
        holds: [
            'host fields (`host`, `database`)',
            '`dbCredentials.ssl` is set',
            '`?ssl=` followed by the percent-encoded JSON options',
        ],
        kitOnly: false,
    },
    {
        label: 'ssl certificate object',
        config: withCredentials('postgresql', {
            url: 'postgres://app@h/app',
            ssl: { ca: SENTINEL, rejectUnauthorized: true },
        }),
        holds: ['an `ssl` certificate cannot be written in a url'],
        kitOnly: true,
    },
    ...(['turso', 'sqlite'] as const).map((dialect): RefusedForm => ({
        label: `${dialect} authToken`,
        config: withCredentials(dialect, {
            url: 'libsql://app.example',
            authToken: SENTINEL,
        }),
        holds: [
            '`dbCredentials.authToken` is set, and Lockness connects through ' +
            '`dbCredentials.url` only',
            'append the token to the url as `?authToken=<token>`',
        ],
        kitOnly: false,
    })),
    {
        label: 'url and host fields together',
        config: withCredentials('postgresql', {
            url: 'postgres://app@h/app',
            host: SENTINEL,
            port: 5432,
        }),
        holds: [
            '`dbCredentials` sets both `url` and host fields (`host`, `port`)',
            'remove the host fields; the url alone names the database',
        ],
        kitOnly: false,
    },
    {
        label: 'an unknown key',
        config: withCredentials('postgresql', {
            url: 'postgres://app@h/app',
            [SENTINEL]: SENTINEL,
        }),
        holds: [
            '`dbCredentials` holds keys Lockness does not read',
            'remove them',
        ],
        kitOnly: false,
    },
    ...['aws-data-api', 'pglite', 'd1-http', 'expo', 'durable-sqlite'].map(
        (driver): RefusedForm => ({
            label: `driver ${driver}`,
            config: { ...base, driver },
            holds: [
                `\`driver\` is '${driver}', a client Lockness does not run; ` +
                'it connects through postgres.js, mysql2 and libsql only',
            ],
            kitOnly: true,
        }),
    ),
    {
        label: 'an unknown driver',
        config: { ...base, driver: SENTINEL },
        holds: [
            '`driver` is set; Lockness connects with the default client of ' +
            'the dialect only',
            'remove `driver`',
        ],
        kitOnly: false,
    },
    ...['singlestore', 'gel'].map((dialect): RefusedForm => ({
        label: `dialect ${dialect}`,
        config: { ...base, dialect },
        holds: [
            `\`dialect\` is '${dialect}', which Lockness does not run; it ` +
            'supports postgresql, mysql, sqlite and turso',
        ],
        kitOnly: true,
    })),
    {
        label: 'out not set',
        config: { ...base, out: undefined },
        holds: [
            '`out` (the migrations folder) is not set. drizzle-kit defaulted ' +
            'it to `./drizzle`; Lockness does not',
            'set `out` to your migrations folder',
        ],
        kitOnly: false,
    },
]

for (const form of REFUSED_FORMS) {
    Deno.test(`#442 R2 recognises and refuses: ${form.label}`, async () => {
        const error = await refusalOf(form.config)
        assertEquals(
            error.reason.startsWith('drizzle.config.ts: '),
            true,
            error.reason,
        )
        for (const fragment of form.holds) {
            assertStringIncludes(error.reason, fragment)
        }
        assertEquals(error.kitOnly, form.kitOnly, error.reason)
        assertEquals(error.message, error.reason)
    })
}

Deno.test('#442 R2 names every recognised dbCredentials form in one refusal', async () => {
    const error = await refusalOf(withCredentials('postgresql', {
        host: SENTINEL,
        password: SENTINEL,
        ssl: { cert: SENTINEL, key: SENTINEL },
        [SENTINEL]: 1,
    }))
    assertStringIncludes(error.reason, 'host fields (`host`, `password`)')
    assertStringIncludes(error.reason, 'holds a certificate (`cert`, `key`)')
    assertStringIncludes(error.reason, 'keys Lockness does not read')
    assertEquals(error.kitOnly, true, 'a certificate makes it drizzle-kit only')
})

Deno.test('#442 R2 never names an unknown dialect value', async () => {
    for (const dialect of [SENTINEL, undefined, 42]) {
        const error = await refusalOf({ ...base, dialect })
        assertStringIncludes(
            error.reason,
            '`dialect` must be postgresql, mysql, sqlite or turso',
        )
        assertEquals(error.kitOnly, false)
    }
})

Deno.test('#442 R2 accepts the documented url alternatives verbatim', async () => {
    for (
        const [dialect, url] of [
            ['turso', 'libsql://app.example?authToken=<token>'],
            [
                'postgresql',
                'postgresql://app@h:5432/app?sslmode=verify-full&sslrootcert=system',
            ],
            [
                'mysql',
                'mysql://app@h:3306/app?ssl=%7B%22rejectUnauthorized%22%3Atrue%7D',
            ],
        ]
    ) {
        const settings = await loadMigrationSettings(
            () => Promise.resolve(withCredentials(dialect, { url })),
            reader().read,
        )
        assertEquals(settings.url, url)
    }
})

Deno.test('#435 R2 refuses a malformed migrations entry', async () => {
    await assertRefused(
        () => Promise.resolve({ ...base, migrations: { table: '' } }),
        '`migrations.table`',
    )
    await assertRefused(
        () => Promise.resolve({ ...base, migrations: { schema: 3 } }),
        '`migrations.schema`',
    )
})

Deno.test('#442 a malformed schemaFilter refuses db:fresh’s settings only, before the journal is read', async () => {
    for (const schemaFilter of [[], 42, ['public', 1]]) {
        const config = () => Promise.resolve({ ...base, schemaFilter })
        const { folders, read } = reader()
        const error = await assertRejects(
            () => loadFreshSettings(config, read),
            RefusedError,
        )
        assertEquals(
            error.reason,
            'drizzle.config.ts: `schemaFilter` must be a schema name or a ' +
                'list of them',
        )
        assertEquals(folders, [], 'the migrations were read after a refusal')

        const settings = await loadMigrationSettings(config, reader().read)
        assertEquals(settings.url, base.dbCredentials.url)
    }
})

// -----------------------------------------------------------------------------
// R3 — never wipe a database whose migrations cannot be read
// -----------------------------------------------------------------------------

Deno.test('#435 R3 refuses a migrations folder without a journal', async () => {
    const dir = await Deno.makeTempDir()
    try {
        await Deno.writeTextFile(join(dir, '0000_init.sql'), 'SELECT 1;')
        const error = await assertRejects(
            () =>
                loadMigrationSettings(
                    () => Promise.resolve({ ...base, out: dir }),
                ),
            RefusedError,
        )
        assertEquals(error.message.includes('_journal.json'), true)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('#435 R3 refuses a journal that lists a missing file', async () => {
    const dir = await Deno.makeTempDir()
    try {
        await Deno.mkdir(join(dir, 'meta'))
        await Deno.writeTextFile(
            join(dir, 'meta', '_journal.json'),
            JSON.stringify({
                entries: [{ tag: '0000_gone', when: 1, breakpoints: true }],
            }),
        )
        const error = await assertRejects(
            () =>
                loadMigrationSettings(
                    () => Promise.resolve({ ...base, out: dir }),
                ),
            RefusedError,
        )
        assertEquals(error.message.includes('0000_gone'), true)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('#435 the default reader returns each migration’s statements', async () => {
    const dir = await Deno.makeTempDir()
    try {
        await Deno.mkdir(join(dir, 'meta'))
        await Deno.writeTextFile(
            join(dir, 'meta', '_journal.json'),
            JSON.stringify({
                entries: [{ tag: '0000_init', when: 1, breakpoints: true }],
            }),
        )
        await Deno.writeTextFile(
            join(dir, '0000_init.sql'),
            'CREATE SCHEMA "auth";\n--> statement-breakpoint\nSELECT 1;',
        )

        const settings = await loadMigrationSettings(
            () => Promise.resolve({ ...base, out: dir }),
        )

        assertEquals(settings.migrations, 1)
        assertEquals(settings.statements, [
            'CREATE SCHEMA "auth";\n',
            '\nSELECT 1;',
        ])
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
