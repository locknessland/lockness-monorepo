/**
 * @fileoverview The `db:fresh` reset policy (#435): what "empty" means per
 * dialect, the catalogue reads, the pure planners that turn catalogue rows
 * into statements, and every refusal made before anything is dropped.
 *
 * "Fresh" empties a **managed scope**, not "what the migrations created" —
 * that cannot be computed:
 *
 * | Dialect         | Scope                                                            |
 * | :-------------- | :--------------------------------------------------------------- |
 * | sqlite / libsql | every table and view of `main`, except `sqlite_%` and `libsql_%` |
 * | mysql           | every table and view of `DATABASE()`                             |
 * | postgres        | the objects of `schemaFilter`, plus the bookkeeping table        |
 *
 * The mechanism — sessions, transactions, the migrator — lives in
 * `drivers.ts`; this module only decides. Each planner reads the catalogue
 * first and refuses before returning a single statement, so every refusal
 * happens before the first `DROP`. A system target is never in scope: a
 * MySQL `DATABASE()` naming `mysql`, `sys`, `performance_schema` or
 * `information_schema` — what the session selected, whatever the url says —
 * and a postgres `schemaFilter` or `migrations.schema` naming
 * `information_schema` or any `pg_*` schema, are refused.
 *
 * @module @lockness/drizzle/reset
 * @since 0.4.1
 */

import type { Dialect, SchemaMaintenance } from './drivers.ts'
import { DEFAULT_BOOKKEEPING_SCHEMA } from './migration_settings.ts'
import { RefusedError } from './refusal.ts'
import { backtick, literal, quote } from './sql_text.ts'

/**
 * What a reset needs to know — a subset of the `db:fresh` settings.
 */
export interface ResetScope {
    /** The dialect whose policy applies. */
    readonly dialect: Dialect
    /** The bookkeeping table. */
    readonly table: string
    /** postgres only: the bookkeeping schema. */
    readonly schema: string | undefined
    /** postgres only: the schemas whose objects are dropped. */
    readonly schemaFilter: readonly string[]
    /** Every migration statement, read to find the schemas they create. */
    readonly statements: readonly string[]
}

/**
 * The postgres bookkeeping schema of a scope: the configured one, or the
 * default drizzle-orm's migrator writes to. The settings always fill it in for
 * postgres; the fallback keeps one default rather than a second one (#448).
 *
 * @param scope - The reset scope.
 * @returns The schema holding the bookkeeping table.
 */
function bookkeepingSchema(scope: ResetScope): string {
    return scope.schema ?? DEFAULT_BOOKKEEPING_SCHEMA
}

/** A catalogue row, as `SchemaMaintenance.query` returns it. */
type Row = Readonly<Record<string, unknown>>

/**
 * One dialect's policy: the line that names its scope, and the plan — read
 * from the catalogue, refused or returned before anything runs.
 */
interface ResetPolicy {
    /** The scope, in words, for the one line `db:fresh` prints. */
    describe(scope: ResetScope): string
    /** Read the catalogue and return the statements; refuse instead. */
    plan(
        maintenance: Pick<SchemaMaintenance, 'query'>,
        scope: ResetScope,
    ): Promise<readonly string[]>
}

// =============================================================================
// sqlite / libsql
// =============================================================================

/** The tables and views of `main`, without the engine's own. */
const SQLITE_CATALOGUE =
    "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view') " +
    "AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' " +
    "AND name NOT LIKE 'libsql\\_%' ESCAPE '\\' ORDER BY rowid"

/**
 * Plan the sqlite / libsql reset: every table and view of `main`.
 *
 * FKs are on by default in libsql, and dropping a parent first fails — so the
 * plan defers the checks to the end of the batch, where nothing references
 * anything any more. Triggers and indexes go with their table.
 *
 * @param rows - `sqlite_master` rows: `type` and `name`.
 * @returns The statements for one write batch.
 * @throws {RefusedError} When a row is not of the expected shape.
 *
 * @example
 * ```ts
 * planSqliteReset([{ type: 'table', name: 'users' }])
 * // ['PRAGMA defer_foreign_keys = ON', 'DROP TABLE IF EXISTS "users"']
 * ```
 */
export function planSqliteReset(rows: readonly Row[]): string[] {
    const objects = rows
        .map((row) => ({ type: text(row, 'type'), name: text(row, 'name') }))
        .filter(({ name }) => !/^(sqlite|libsql)_/.test(name))
    return [
        'PRAGMA defer_foreign_keys = ON',
        ...objects.filter((o) => o.type === 'view').map((o) =>
            `DROP VIEW IF EXISTS ${quote(o.name)}`
        ),
        ...objects.filter((o) => o.type === 'table').map((o) =>
            `DROP TABLE IF EXISTS ${quote(o.name)}`
        ),
    ]
}

// =============================================================================
// mysql
// =============================================================================

/**
 * The databases MySQL itself owns, lower-cased. A url that selects one is
 * refused: emptying it would break the server, not reset an application.
 */
const MYSQL_SYSTEM_DATABASES: ReadonlySet<string> = new Set([
    'mysql',
    'sys',
    'performance_schema',
    'information_schema',
])

/**
 * The database the connection uses and its tables and views, in **one**
 * statement — two reads from a pool may come from two connections. The
 * anchor row keeps `DATABASE()` in the answer when the database is empty,
 * and when none is selected (then `db` is `NULL`).
 */
const MYSQL_CATALOGUE = [
    'SELECT DATABASE() AS db, t.TABLE_NAME AS name, t.TABLE_TYPE AS type',
    'FROM (SELECT 1 AS anchor) AS a',
    'LEFT JOIN information_schema.TABLES AS t ON t.TABLE_SCHEMA = DATABASE()',
    'ORDER BY t.TABLE_NAME',
].join('\n')

/**
 * Plan the MySQL reset: every table and view of the database the catalogue
 * read names, the bookkeeping table included.
 *
 * Every `DROP` is qualified with that database, so the plan empties the
 * database that was read even if the dedicated session it runs on selects
 * another. The bookkeeping table is dropped first and always, whether the
 * catalogue listed it or not.
 *
 * FK checks are turned off for the session so the order does not matter; the
 * session is destroyed afterwards (see `drivers.ts`), never pooled. MySQL DDL
 * auto-commits, so a failure part-way leaves a partial reset — reported, not
 * rolled back.
 *
 * @param rows - The rows of the one catalogue read: `db`, and `name` and
 *   `type` (both `NULL` on the anchor row of an empty database).
 * @param table - The bookkeeping table (`migrations.table`).
 * @returns The statements for one dedicated session.
 * @throws {RefusedError} R5: no database is selected; the rows name more
 *   than one database or none; the database is a system database; or a row
 *   is not of the expected shape.
 *
 * @example
 * ```ts
 * planMysqlReset([{ db: 'app', name: 'users', type: 'BASE TABLE' }], '__drizzle_migrations')
 * // ['SET FOREIGN_KEY_CHECKS = 0',
 * //  'DROP TABLE IF EXISTS `app`.`__drizzle_migrations`',
 * //  'DROP TABLE IF EXISTS `app`.`users`',
 * //  'SET FOREIGN_KEY_CHECKS = 1']
 * ```
 */
export function planMysqlReset(
    rows: readonly Row[],
    table: string,
): string[] {
    if (rows.length === 0) {
        throw new RefusedError(
            'the catalogue returned no row, not even the database name',
        )
    }
    if (rows.some((row) => row.db == null)) {
        throw new RefusedError(
            'the connection has no database selected (DATABASE() is NULL); ' +
                'name one in the url',
        )
    }
    const databases = new Set(rows.map((row) => text(row, 'db')))
    if (databases.size > 1) {
        throw new RefusedError(
            'the catalogue named more than one database ' +
                `(${[...databases].map(backtick).join(', ')})`,
        )
    }
    const [database] = databases
    if (MYSQL_SYSTEM_DATABASES.has(database.toLowerCase())) {
        throw new RefusedError(
            `the connection selects the system database ${
                backtick(database)
            }; name an application database in the url`,
        )
    }

    const qualified = (name: string) =>
        `${backtick(database)}.${backtick(name)}`
    const objects = rows
        .filter((row) => row.name != null)
        .map((row) => ({
            name: text(row, 'name'),
            view: text(row, 'type') === 'VIEW',
        }))
        .filter((o) => o.name !== table)
    return [
        'SET FOREIGN_KEY_CHECKS = 0',
        `DROP TABLE IF EXISTS ${qualified(table)}`,
        ...objects.filter((o) => o.view).map((o) =>
            `DROP VIEW IF EXISTS ${qualified(o.name)}`
        ),
        ...objects.filter((o) => !o.view).map((o) =>
            `DROP TABLE IF EXISTS ${qualified(o.name)}`
        ),
        'SET FOREIGN_KEY_CHECKS = 1',
    ]
}

// =============================================================================
// postgres
// =============================================================================

/** A relation in scope: `relkind` is one of `r p v m S f`. */
export interface PostgresRelation {
    /** Its schema. */
    readonly schema: string
    /** Its name. */
    readonly name: string
    /** Its `pg_class.relkind`. */
    readonly kind: string
}

/** A standalone type in scope: `typtype` is one of `e d r m c`. */
export interface PostgresType {
    /** Its schema. */
    readonly schema: string
    /** Its name. */
    readonly name: string
    /** Its `pg_type.typtype`. */
    readonly kind: string
}

/** A routine in scope. */
export interface PostgresRoutine {
    /** Its schema. */
    readonly schema: string
    /** Its name. */
    readonly name: string
    /** `pg_get_function_identity_arguments`, which identifies an overload. */
    readonly args: string
}

/**
 * The postgres catalogue in scope, read before any DDL. Extension members,
 * sequences owned by a column, table rowtypes and routines a type owns are
 * already excluded by the queries.
 */
export interface PostgresCatalogue {
    /** Tables, partitioned tables, views, materialized views, sequences, foreign tables. */
    readonly relations: readonly PostgresRelation[]
    /** Enums, domains, ranges, multiranges, standalone composites. */
    readonly types: readonly PostgresType[]
    /** Functions, procedures, aggregates. */
    readonly routines: readonly PostgresRoutine[]
    /** The scope schemas that hold an extension or an extension member. */
    readonly extensionSchemas: readonly string[]
}

/** The DROP keyword per `relkind`, in the order the plan drops them. */
const RELATION_DROP: ReadonlyArray<readonly [string, string]> = [
    ['v', 'VIEW'],
    ['m', 'MATERIALIZED VIEW'],
    ['r', 'TABLE'],
    ['p', 'TABLE'],
    ['f', 'FOREIGN TABLE'],
    ['S', 'SEQUENCE'],
]

/**
 * The DROP keyword per `typtype`, in the order the plan drops them. A
 * multirange goes last: its range owns it, and dropping the range first
 * takes it along.
 */
const TYPE_DROP: ReadonlyArray<readonly [string, string]> = [
    ['e', 'TYPE'],
    ['d', 'DOMAIN'],
    ['c', 'TYPE'],
    ['r', 'TYPE'],
    ['m', 'TYPE'],
]

/** The temporary table the census baseline is kept in, for this transaction only. */
const CENSUS_TABLE = 'lockness_fresh_census'

/**
 * The catalogue reads the postgres plan is made from.
 *
 * Each excludes extension members (`pg_depend.deptype = 'e'`), so an
 * extension's objects in `public` (postgis, pgcrypto, vector) are kept.
 *
 * @param schemas - The scope schemas.
 * @returns One query per catalogue part.
 *
 * @example
 * ```ts
 * const { relations } = postgresCatalogueQueries(['public'])
 * ```
 */
export function postgresCatalogueQueries(schemas: readonly string[]): {
    readonly relations: string
    readonly types: string
    readonly routines: string
    readonly extensions: string
} {
    const scope = `(${schemas.map(literal).join(', ')})`
    const notMember = (catalogue: string, oid: string, deptypes: string) =>
        'NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d ' +
        `WHERE d.classid = 'pg_catalog.${catalogue}'::regclass ` +
        `AND d.objid = ${oid} AND d.deptype ${deptypes})`
    const member = (catalogue: string, alias: string, namespace: string) =>
        `SELECT n.nspname AS schema FROM pg_catalog.${catalogue} ${alias} ` +
        `JOIN pg_catalog.pg_namespace n ON n.oid = ${alias}.${namespace} ` +
        `JOIN pg_catalog.pg_depend d ON d.classid = 'pg_catalog.${catalogue}'::regclass ` +
        `AND d.objid = ${alias}.oid AND d.deptype = 'e' ` +
        `WHERE n.nspname IN ${scope}`
    return {
        relations:
            'SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind ' +
            'FROM pg_catalog.pg_class c ' +
            'JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace ' +
            `WHERE n.nspname IN ${scope} ` +
            "AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f') " +
            "AND NOT (c.relkind = 'S' AND EXISTS (" +
            'SELECT 1 FROM pg_catalog.pg_depend d ' +
            "WHERE d.classid = 'pg_catalog.pg_class'::regclass " +
            'AND d.objid = c.oid ' +
            "AND d.refclassid = 'pg_catalog.pg_class'::regclass " +
            "AND d.deptype IN ('a', 'i'))) " +
            `AND ${notMember('pg_class', 'c.oid', "= 'e'")} ` +
            'ORDER BY n.nspname, c.relname',
        types:
            'SELECT n.nspname AS schema, t.typname AS name, t.typtype AS kind ' +
            'FROM pg_catalog.pg_type t ' +
            'JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace ' +
            `WHERE n.nspname IN ${scope} ` +
            "AND (t.typtype IN ('e', 'd', 'r', 'm') OR (t.typtype = 'c' " +
            'AND EXISTS (SELECT 1 FROM pg_catalog.pg_class c ' +
            "WHERE c.oid = t.typrelid AND c.relkind = 'c'))) " +
            `AND ${notMember('pg_type', 't.oid', "= 'e'")} ` +
            'ORDER BY n.nspname, t.typname',
        routines: 'SELECT n.nspname AS schema, p.proname AS name, ' +
            'pg_catalog.pg_get_function_identity_arguments(p.oid) AS args ' +
            'FROM pg_catalog.pg_proc p ' +
            'JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace ' +
            `WHERE n.nspname IN ${scope} ` +
            `AND ${notMember('pg_proc', 'p.oid', "IN ('e', 'i')")} ` +
            'ORDER BY n.nspname, p.proname',
        extensions:
            'SELECT n.nspname AS schema FROM pg_catalog.pg_extension e ' +
            'JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace ' +
            `WHERE n.nspname IN ${scope} ` +
            `UNION ${member('pg_class', 'c', 'relnamespace')} ` +
            `UNION ${member('pg_type', 't', 'typnamespace')} ` +
            `UNION ${member('pg_proc', 'p', 'pronamespace')}`,
    }
}

/**
 * The deptypes by which an object without a schema of its own belongs to
 * another: auto, internal, partition-primary and partition-secondary. A
 * trigger, a policy, a rule or a column default is in scope when the object
 * owning it through one of these is.
 */
const OWNER_DEPTYPES = "('a', 'i', 'P', 'S')"

/**
 * Whether a schema is left out of the census: the scope itself, the system
 * schemas, and `pg_toast*` / `pg_temp*` — dropping a table removes its toast
 * relation, and the baseline itself lives in `pg_temp`.
 *
 * @param column - The schema column to test.
 * @param scope - The scope schemas, as a list of literals.
 * @returns A parenthesised boolean expression.
 */
function excludedSchema(column: string, scope: string): string {
    return `(${column} IN (${scope}) ` +
        `OR ${column} IN ('pg_catalog', 'information_schema') ` +
        `OR ${column} LIKE 'pg\\_toast%' ` +
        `OR ${column} LIKE 'pg\\_temp%')`
}

/**
 * The R7 baseline: the identity `(classid, objid, objsubid)` of every user
 * object outside the scope that `pg_depend` records as a dependent, with its
 * `pg_identify_object` type and identity for the error message.
 *
 * It is a set drawn from `pg_depend`, not a list of catalogues: a `CASCADE`
 * walks only `pg_depend`, so every object it can reach outside the scope is
 * in the baseline — whatever catalogue it lives in. An object with a schema
 * is outside when that schema is; one without (a trigger, a policy, a rule, a
 * column default, an event trigger) is outside unless an owner it depends on
 * through {@link OWNER_DEPTYPES} sits in an excluded schema.
 *
 * Taken inside the reset transaction, after the bookkeeping drop and before
 * the first `CASCADE`; it lives in a temporary table dropped on commit.
 *
 * @param schemas - The scope schemas.
 * @returns The `CREATE TEMPORARY TABLE … AS SELECT …` statement.
 */
function censusBaseline(schemas: readonly string[]): string {
    const scope = schemas.map(literal).join(', ')
    return [
        `CREATE TEMPORARY TABLE ${CENSUS_TABLE} ON COMMIT DROP AS`,
        'SELECT DISTINCT d.classid, d.objid, d.objsubid, o.type, o.identity',
        'FROM pg_catalog.pg_depend d',
        'CROSS JOIN LATERAL pg_catalog.pg_identify_object(d.classid, d.objid, d.objsubid) o',
        'WHERE d.classid <> 0 AND d.objid >= 16384',
        'AND NOT CASE',
        `WHEN o.schema IS NOT NULL THEN ${excludedSchema('o.schema', scope)}`,
        'ELSE EXISTS (SELECT 1 FROM pg_catalog.pg_depend w',
        'CROSS JOIN LATERAL pg_catalog.pg_identify_object(w.refclassid, w.refobjid, w.refobjsubid) r',
        'WHERE (w.classid, w.objid, w.objsubid) = (d.classid, d.objid, d.objsubid)',
        `AND w.deptype IN ${OWNER_DEPTYPES} AND ${
            excludedSchema('r.schema', scope)
        })`,
        'END',
    ].join('\n')
}

/** A baseline row whose object `pg_depend` no longer records — it was dropped. */
const ESCAPED = `FROM pg_temp.${CENSUS_TABLE} c\n` +
    'WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d ' +
    'WHERE d.classid = c.classid AND d.objid = c.objid ' +
    'AND d.objsubid = c.objsubid)'

/**
 * The `DO` block that ends the postgres transaction: any baseline object with
 * no `pg_depend` row left was dropped by a `CASCADE` that escaped the scope,
 * and the block raises — rolling the whole reset back — with their count and
 * the first ten of them by type and identity.
 *
 * It probes `pg_depend` by index and never re-runs the census, so objects
 * created by another session during the reset are never compared.
 */
const CENSUS_CHECK = [
    'DO $lockness_fresh$',
    'DECLARE',
    '    escaped bigint;',
    '    labels text;',
    'BEGIN',
    `    SELECT count(*) INTO escaped ${ESCAPED};`,
    '    IF escaped > 0 THEN',
    "        SELECT string_agg(e.label, ', ' ORDER BY e.label) INTO labels",
    "        FROM (SELECT concat_ws(' ', c.type, c.identity) AS label " +
    `${ESCAPED}`,
    '        ORDER BY 1 LIMIT 10) AS e;',
    "        RAISE EXCEPTION 'db:fresh: a CASCADE reached outside the managed " +
    'scope and dropped % object(s) outside it (%); the reset was rolled ' +
    "back', escaped, labels;",
    '    END IF;',
    'END',
    '$lockness_fresh$',
].join('\n')

/**
 * Plan the postgres reset, for one transaction:
 *
 * 1. drop the bookkeeping table (no `CASCADE`: nothing may depend on it);
 * 2. keep the census: every object outside the scope `pg_depend` records;
 * 3. drop each object in scope with `CASCADE`, keeping its schema — unless a
 *    migration creates that schema with a plain `CREATE SCHEMA`, in which case
 *    the schema is dropped instead, because the migration would fail on it;
 * 4. raise — rolling everything back — when any object of the census is
 *    gone, naming the first ten of them (R7).
 *
 * @param catalogue - The catalogue in scope, read before any DDL.
 * @param scope - The reset scope.
 * @returns The statements for one transaction.
 * @throws {RefusedError} When `schemaFilter` or `migrations.schema`
 *   names a system schema; R6: a migration creates a schema outside the
 *   scope, or a schema that would be dropped holds extension members.
 *
 * @example
 * ```ts
 * planPostgresReset(catalogue, scope).at(-1) // 'DO $lockness_fresh$ …'
 * ```
 */
export function planPostgresReset(
    catalogue: PostgresCatalogue,
    scope: ResetScope,
): string[] {
    refuseSystemSchemas(scope)
    const inScope = new Set(scope.schemaFilter)
    const created = schemasCreatedBy(scope.statements)
    const outside = created.filter((schema) => !inScope.has(schema))
    if (outside.length > 0) {
        throw new RefusedError(
            `a migration creates schema ${
                outside.map(quote).join(', ')
            } outside schemaFilter, so it could not run again; add it to schemaFilter`,
        )
    }
    const dropped = new Set(created)
    const holding = catalogue.extensionSchemas.filter((s) => dropped.has(s))
    if (holding.length > 0) {
        throw new RefusedError(
            `schema ${
                holding.map(quote).join(', ')
            } would be dropped, and it holds extension members`,
        )
    }

    const schema = bookkeepingSchema(scope)
    const bookkeeping = `${quote(schema)}.${quote(scope.table)}`
    const kept = <T extends { schema: string }>(objects: readonly T[]) =>
        objects.filter((o) => !dropped.has(o.schema))
    const relations = kept(catalogue.relations).filter((r) =>
        !(r.schema === schema && r.name === scope.table)
    )
    return [
        `DROP TABLE IF EXISTS ${bookkeeping}`,
        censusBaseline(scope.schemaFilter),
        ...scope.schemaFilter.filter((s) => dropped.has(s)).map((s) =>
            `DROP SCHEMA IF EXISTS ${quote(s)} CASCADE`
        ),
        ...byKind(relations, RELATION_DROP),
        ...kept(catalogue.routines).map((r) =>
            `DROP ROUTINE IF EXISTS ${quote(r.schema)}.${
                quote(r.name)
            }(${r.args}) CASCADE`
        ),
        ...byKind(kept(catalogue.types), TYPE_DROP),
        CENSUS_CHECK,
    ]
}

/**
 * Whether a postgres schema belongs to the server: `information_schema`, or
 * any `pg_*` — `pg_catalog`, `pg_toast`, `pg_temp_N` and every name postgres
 * reserves. Compared case-insensitively: a quoted `"PG_Catalog"` is a
 * different schema to postgres, but no reset is worth the doubt.
 *
 * @param schema - A schema name, unquoted.
 * @returns True for a system schema.
 */
function isSystemSchema(schema: string): boolean {
    const name = schema.toLowerCase()
    return name === 'information_schema' || name.startsWith('pg_')
}

/**
 * Refuse a scope or a bookkeeping schema that names a system schema, before
 * anything is read or dropped.
 *
 * @param scope - The reset scope.
 * @throws {RefusedError} When `schemaFilter` or `migrations.schema`
 *   names a system schema.
 */
function refuseSystemSchemas(scope: ResetScope): void {
    const named = [...scope.schemaFilter, bookkeepingSchema(scope)]
        .filter(isSystemSchema)
    if (named.length > 0) {
        throw new RefusedError(
            `${
                [...new Set(named)].map(quote).join(', ')
            } is a system schema; schemaFilter and migrations.schema ` +
                'must name application schemas',
        )
    }
}

/**
 * `DROP <keyword> IF EXISTS "schema"."name" CASCADE` per object, grouped in
 * the order of `order`. `IF EXISTS` because an earlier `CASCADE` may already
 * have taken an object along (a partition, a multirange).
 *
 * @param objects - The objects to drop.
 * @param order - Each kind and its keyword, in drop order.
 * @returns The statements.
 */
function byKind(
    objects: readonly { schema: string; name: string; kind: string }[],
    order: ReadonlyArray<readonly [string, string]>,
): string[] {
    return order.flatMap(([kind, keyword]) =>
        objects.filter((o) => o.kind === kind).map((o) =>
            `DROP ${keyword} IF EXISTS ${quote(o.schema)}.${
                quote(o.name)
            } CASCADE`
        )
    )
}

/** A plain `CREATE SCHEMA`, quoted or not — the form drizzle-kit generates. */
const CREATE_SCHEMA =
    /\bCREATE\s+SCHEMA\s+(IF\s+NOT\s+EXISTS\s+)?("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)/gi

/**
 * The schemas the migrations create with a plain `CREATE SCHEMA` — the ones
 * that would fail to re-run if they survived the reset. `IF NOT EXISTS`
 * re-runs cleanly, so it is ignored.
 *
 * @param statements - Every migration statement.
 * @returns The schema names, unquoted, without duplicates.
 */
function schemasCreatedBy(statements: readonly string[]): string[] {
    const names = new Set<string>()
    for (const statement of statements) {
        for (const match of statement.matchAll(CREATE_SCHEMA)) {
            if (match[1] !== undefined) continue
            const name = match[2]
            names.add(
                name.startsWith('"')
                    ? name.slice(1, -1).replaceAll('""', '"')
                    : name.toLowerCase(),
            )
        }
    }
    return [...names]
}

// =============================================================================
// Policies
// =============================================================================

/**
 * The reset policy per dialect, mirroring `defaultDriverFactories`.
 */
const RESET_POLICIES: Record<Dialect, ResetPolicy> = {
    sqlite: {
        describe: () =>
            'sqlite: every table and view of the main database, ' +
            'the bookkeeping table included',
        plan: async (maintenance) =>
            planSqliteReset(await maintenance.query(SQLITE_CATALOGUE)),
    },
    mysql: {
        describe: () =>
            "mysql: every table and view of the connection's database, " +
            'the bookkeeping table included',
        plan: async (maintenance, scope) =>
            planMysqlReset(
                await maintenance.query(MYSQL_CATALOGUE),
                scope.table,
            ),
    },
    postgres: {
        describe: (scope) =>
            `postgres: every table, view, sequence, type and routine in schema ${
                scope.schemaFilter.map(quote).join(', ')
            }, plus the bookkeeping table ${quote(bookkeepingSchema(scope))}.${
                quote(scope.table)
            }`,
        plan: async (maintenance, scope) => {
            // Refused before the catalogue is read, as well as in the planner.
            refuseSystemSchemas(scope)
            const queries = postgresCatalogueQueries(scope.schemaFilter)
            const [relations, types, routines, extensions] = [
                await maintenance.query(queries.relations),
                await maintenance.query(queries.types),
                await maintenance.query(queries.routines),
                await maintenance.query(queries.extensions),
            ]
            return planPostgresReset({
                relations: relations.map((row) => ({
                    schema: text(row, 'schema'),
                    name: text(row, 'name'),
                    kind: text(row, 'kind'),
                })),
                types: types.map((row) => ({
                    schema: text(row, 'schema'),
                    name: text(row, 'name'),
                    kind: text(row, 'kind'),
                })),
                routines: routines.map((row) => ({
                    schema: text(row, 'schema'),
                    name: text(row, 'name'),
                    args: text(row, 'args'),
                })),
                extensionSchemas: extensions.map((row) => text(row, 'schema')),
            }, scope)
        },
    },
}

/**
 * The one line `db:fresh` prints before it resets: the dialect and the
 * scope. It is built from the scope only, so it can never carry the DSN.
 *
 * @param scope - The reset scope.
 * @returns The line, without an icon.
 *
 * @example
 * ```ts
 * describeResetScope(settings)
 * // 'postgres: every table, view, sequence, type and routine in schema "public", …'
 * ```
 */
export function describeResetScope(scope: ResetScope): string {
    return RESET_POLICIES[scope.dialect].describe(scope)
}

/**
 * Empty the managed scope: read the catalogue, plan, refuse or run the plan
 * in one dedicated session.
 *
 * @param maintenance - The connection's maintenance capability.
 * @param scope - The reset scope.
 * @returns Resolves once the scope is empty.
 * @throws {RefusedError} R5, R6, or a system target (a MySQL system
 *   database, a postgres system schema), before any statement ran.
 * @throws Whatever the plan's execution throws — on postgres the census
 *   check (R7) among them, after which nothing was kept.
 *
 * @example
 * ```ts
 * await resetDatabase(maintenance, settings)
 * await maintenance.migrate({ folder: settings.folder, table: settings.table })
 * ```
 */
export async function resetDatabase(
    maintenance: SchemaMaintenance,
    scope: ResetScope,
): Promise<void> {
    const statements = await RESET_POLICIES[scope.dialect].plan(
        maintenance,
        scope,
    )
    await maintenance.execute(statements)
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Read a string column from a catalogue row.
 *
 * @param row - The row.
 * @param column - The column.
 * @returns The value.
 * @throws {RefusedError} When it is not a string: the catalogue did not
 *   answer as expected, and nothing is dropped on a guess.
 */
function text(row: Row, column: string): string {
    const value = row[column]
    if (typeof value !== 'string') {
        throw new RefusedError(
            `the catalogue returned a row without a text \`${column}\``,
        )
    }
    return value
}
