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
 * happens before the first `DROP`.
 *
 * @module @lockness/drizzle/reset
 * @since 0.4.1
 */

import type { Dialect, SchemaMaintenance } from './drivers.ts'

/**
 * `db:fresh` refused to act, and nothing was dropped.
 *
 * Every refusal happens before the first `DROP`: a configuration it cannot
 * act on, migrations it could not re-apply, a connection without the
 * maintenance capability, or a scope it cannot empty safely.
 *
 * @example
 * ```ts
 * throw new FreshRefusedError('`out` is not set in drizzle.config.ts')
 * ```
 */
export class FreshRefusedError extends Error {
    /**
     * @param reason - Why, in one sentence without a trailing period.
     * @param options - The underlying failure, when there is one.
     */
    constructor(reason: string, options?: ErrorOptions) {
        super(`db:fresh refused: ${reason}. Nothing was dropped.`, options)
        this.name = 'FreshRefusedError'
    }
}

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
 * @throws {FreshRefusedError} When a row is not of the expected shape.
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

/** The database the connection uses — `NULL` when none is selected. */
const MYSQL_DATABASE = 'SELECT DATABASE() AS name'

/** The tables and views of the connection's database. */
const MYSQL_CATALOGUE = 'SELECT TABLE_NAME AS name, TABLE_TYPE AS type ' +
    'FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ' +
    'ORDER BY TABLE_NAME'

/**
 * Plan the MySQL reset: every table and view of `DATABASE()`, the
 * bookkeeping table included.
 *
 * FK checks are turned off for the session so the order does not matter; the
 * session is destroyed afterwards (see `drivers.ts`), never pooled. MySQL DDL
 * auto-commits, so a failure part-way leaves a partial reset — reported, not
 * rolled back.
 *
 * @param rows - `information_schema.TABLES` rows: `name` and `type`.
 * @returns The statements for one dedicated session.
 * @throws {FreshRefusedError} When a row is not of the expected shape.
 *
 * @example
 * ```ts
 * planMysqlReset([{ name: 'users', type: 'BASE TABLE' }])
 * // ['SET FOREIGN_KEY_CHECKS = 0', 'DROP TABLE IF EXISTS `users`',
 * //  'SET FOREIGN_KEY_CHECKS = 1']
 * ```
 */
export function planMysqlReset(rows: readonly Row[]): string[] {
    const objects = rows.map((row) => ({
        name: text(row, 'name'),
        view: text(row, 'type') === 'VIEW',
    }))
    return [
        'SET FOREIGN_KEY_CHECKS = 0',
        ...objects.filter((o) => o.view).map((o) =>
            `DROP VIEW IF EXISTS ${backtick(o.name)}`
        ),
        ...objects.filter((o) => !o.view).map((o) =>
            `DROP TABLE IF EXISTS ${backtick(o.name)}`
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
 * The census: one count of the catalogue entries **outside** the scope.
 *
 * It is taken inside the reset transaction before the first `CASCADE` and
 * again after the last; any difference means a `CASCADE` escaped the scope,
 * and the whole transaction is rolled back. `pg_catalog`,
 * `information_schema`, `pg_toast*` and `pg_temp*` are left out: dropping a
 * table removes its toast relation, and the baseline itself lives in
 * `pg_temp`. Internal triggers are left out too — a foreign key from a table
 * in scope keeps two on the table it references, and they go with the key.
 *
 * Besides the entries the disposition names (`pg_class`, `pg_type`,
 * `pg_proc`, `pg_constraint`, `pg_trigger`, `pg_policy`), it counts columns
 * and column defaults: a `CASCADE` from a dropped type or routine removes a
 * column or a default of an outside table without touching the others.
 *
 * @param schemas - The scope schemas.
 * @returns A `SELECT … AS n` returning one `bigint`.
 *
 * @example
 * ```ts
 * postgresCensusSql(['public']) // "SELECT (SELECT count(*) FROM …) + … AS n"
 * ```
 */
export function postgresCensusSql(schemas: readonly string[]): string {
    const scope = schemas.map(literal).join(', ')
    const outside = (ns: string) =>
        `${ns}.nspname NOT IN (${scope}) ` +
        `AND ${ns}.nspname NOT IN ('pg_catalog', 'information_schema') ` +
        `AND ${ns}.nspname NOT LIKE 'pg\\_toast%' ` +
        `AND ${ns}.nspname NOT LIKE 'pg\\_temp%'`
    const ns = (alias: string, column: string) =>
        `JOIN pg_catalog.pg_namespace n ON n.oid = ${alias}.${column}`
    const onRelation = (alias: string, column: string) =>
        `JOIN pg_catalog.pg_class c ON c.oid = ${alias}.${column} ${
            ns('c', 'relnamespace')
        }`
    const counts = [
        `FROM pg_catalog.pg_class c ${ns('c', 'relnamespace')} WHERE ${
            outside('n')
        }`,
        `FROM pg_catalog.pg_attribute a ${
            onRelation('a', 'attrelid')
        } WHERE a.attnum > 0 AND NOT a.attisdropped AND ${outside('n')}`,
        `FROM pg_catalog.pg_attrdef f ${onRelation('f', 'adrelid')} WHERE ${
            outside('n')
        }`,
        `FROM pg_catalog.pg_type t ${ns('t', 'typnamespace')} WHERE ${
            outside('n')
        }`,
        `FROM pg_catalog.pg_proc p ${ns('p', 'pronamespace')} WHERE ${
            outside('n')
        }`,
        `FROM pg_catalog.pg_constraint k ${ns('k', 'connamespace')} WHERE ${
            outside('n')
        }`,
        `FROM pg_catalog.pg_trigger g ${
            onRelation('g', 'tgrelid')
        } WHERE NOT g.tgisinternal AND ${outside('n')}`,
        `FROM pg_catalog.pg_policy y ${onRelation('y', 'polrelid')} WHERE ${
            outside('n')
        }`,
    ]
    return `SELECT ${
        counts.map((from) => `(SELECT count(*) ${from})`).join(' + ')
    } AS n`
}

/**
 * Plan the postgres reset, for one transaction:
 *
 * 1. drop the bookkeeping table (no `CASCADE`: nothing may depend on it);
 * 2. keep a census of the catalogue outside the scope;
 * 3. drop each object in scope with `CASCADE`, keeping its schema — unless a
 *    migration creates that schema with a plain `CREATE SCHEMA`, in which case
 *    the schema is dropped instead, because the migration would fail on it;
 * 4. compare the census, and raise — rolling everything back — on any change.
 *
 * @param catalogue - The catalogue in scope, read before any DDL.
 * @param scope - The reset scope.
 * @returns The statements for one transaction.
 * @throws {FreshRefusedError} R6: a migration creates a schema outside the
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
    const inScope = new Set(scope.schemaFilter)
    const created = schemasCreatedBy(scope.statements)
    const outside = created.filter((schema) => !inScope.has(schema))
    if (outside.length > 0) {
        throw new FreshRefusedError(
            `a migration creates schema ${
                outside.map(quote).join(', ')
            } outside schemaFilter, so it could not run again; add it to schemaFilter`,
        )
    }
    const dropped = new Set(created)
    const holding = catalogue.extensionSchemas.filter((s) => dropped.has(s))
    if (holding.length > 0) {
        throw new FreshRefusedError(
            `schema ${
                holding.map(quote).join(', ')
            } would be dropped, and it holds extension members`,
        )
    }

    const bookkeeping = `${quote(scope.schema ?? 'public')}.${
        quote(scope.table)
    }`
    const kept = <T extends { schema: string }>(objects: readonly T[]) =>
        objects.filter((o) => !dropped.has(o.schema))
    const relations = kept(catalogue.relations).filter((r) =>
        !(r.schema === (scope.schema ?? 'public') && r.name === scope.table)
    )
    const census = postgresCensusSql(scope.schemaFilter)

    return [
        `DROP TABLE IF EXISTS ${bookkeeping}`,
        `CREATE TEMPORARY TABLE ${CENSUS_TABLE} ON COMMIT DROP AS ${census}`,
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
        censusCheck(census),
    ]
}

/**
 * The `DO` block that ends the postgres transaction.
 *
 * @param census - The census query.
 * @returns The block; it raises when the census changed.
 */
function censusCheck(census: string): string {
    return 'DO $lockness_fresh$\n' +
        'DECLARE\n' +
        '    baseline bigint;\n' +
        '    remaining bigint;\n' +
        'BEGIN\n' +
        `    SELECT n INTO baseline FROM pg_temp.${CENSUS_TABLE};\n` +
        `    SELECT census.n INTO remaining FROM (${census}) AS census;\n` +
        '    IF remaining <> baseline THEN\n' +
        "        RAISE EXCEPTION 'db:fresh: a CASCADE reached outside the " +
        'managed scope (% catalogue entries outside it before, % after); ' +
        "the reset was rolled back', baseline, remaining;\n" +
        '    END IF;\n' +
        'END\n' +
        '$lockness_fresh$'
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
        plan: async (maintenance) => {
            const [current] = await maintenance.query(MYSQL_DATABASE)
            if (current === undefined || current.name == null) {
                throw new FreshRefusedError(
                    'the connection has no database selected (DATABASE() is NULL); ' +
                        'name one in the url',
                )
            }
            return planMysqlReset(await maintenance.query(MYSQL_CATALOGUE))
        },
    },
    postgres: {
        describe: (scope) =>
            `postgres: every table, view, sequence, type and routine in schema ${
                scope.schemaFilter.map(quote).join(', ')
            }, plus the bookkeeping table ${quote(scope.schema ?? 'public')}.${
                quote(scope.table)
            }`,
        plan: async (maintenance, scope) => {
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
 * @throws {FreshRefusedError} R5 or R6, before any statement ran.
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
 * @throws {FreshRefusedError} When it is not a string: the catalogue did not
 *   answer as expected, and nothing is dropped on a guess.
 */
function text(row: Row, column: string): string {
    const value = row[column]
    if (typeof value !== 'string') {
        throw new FreshRefusedError(
            `the catalogue returned a row without a text \`${column}\``,
        )
    }
    return value
}

/**
 * A double-quoted identifier (sqlite, postgres).
 *
 * @param name - The identifier.
 * @returns It, quoted, with `"` doubled.
 */
function quote(name: string): string {
    return `"${name.replaceAll('"', '""')}"`
}

/**
 * A backtick-quoted identifier (MySQL).
 *
 * @param name - The identifier.
 * @returns It, quoted, with `` ` `` doubled.
 */
function backtick(name: string): string {
    return `\`${name.replaceAll('`', '``')}\``
}

/**
 * A standard SQL string literal (postgres, `standard_conforming_strings`).
 *
 * @param value - The text.
 * @returns It, single-quoted, with `'` doubled.
 */
function literal(value: string): string {
    return `'${value.replaceAll("'", "''")}'`
}
