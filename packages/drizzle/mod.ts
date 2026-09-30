/**
 * @fileoverview Drizzle ORM integration for Lockness framework.
 *
 * Provides database connection management and Drizzle ORM setup for PostgreSQL
 * (default), MySQL, and SQLite — the dialect is resolved from config/URL and its
 * driver is loaded on demand. This module exports the main Database service and
 * CLI command registration.
 *
 * @module @lockness/drizzle
 *
 * @example
 * ```ts
 * import { Database } from '@lockness/drizzle'
 * import { container } from '@lockness/contract'
 *
 * const db = container.get<Database>(Database)
 * await db.connect(Deno.env.get('DATABASE_URL')!)
 *
 * // Use db.db for Drizzle queries
 * const users = await db.db.select().from(usersTable)
 *
 * await db.close()
 * ```
 */

import { Service } from '@lockness/container'
import { renderError } from '@lockness/contract'
import {
    ClientUnavailableError,
    defaultDriverFactories,
    type Dialect,
    type DialectDatabase,
    type DriverFactory,
    resolveDialect,
    type SchemaMaintenance,
} from './drivers.ts'
import { inspectDsn, INVALID_DSN_MESSAGE } from './dsn.ts'

export { registerDrizzleCommands } from './cli_commands.ts'
export type {
    CommandRunner,
    CommandSpec,
    DbConnection,
    DrizzleCommandDeps,
    SeederLoader,
} from './cli_commands.ts'
export { Factory } from './factory.ts'
export type { FactoryCreateOptions } from './factory.ts'
export {
    ALLOW_PRODUCTION_FLAG,
    assertNotProduction,
} from './production_guard.ts'
export {
    decodeCursor,
    encodeCursor,
    MalformedCursorError,
    paginate,
} from './paginate.ts'
export type {
    CursorPaginateOptions,
    DecodedCursor,
    OffsetPaginateOptions,
} from './paginate.ts'
export { CLIENT_PACKAGE, resolveDialect } from './drivers.ts'
export type {
    DatabaseSchema,
    Dialect,
    DialectDatabase,
    DriverFactory,
    DriverHandle,
    MigrateOptions,
    SchemaMaintenance,
} from './drivers.ts'

// =============================================================================
// Types
// =============================================================================

/**
 * Connection options for the Database service.
 */
export interface ConnectionOptions {
    /** Whether to suppress the success message */
    readonly silent?: boolean
    /**
     * The SQL dialect to connect through. When omitted, it is inferred from the
     * URL scheme (falling back to `postgres`) — see {@link resolveDialect}. The
     * boot path passes `DatabaseConfig.driver` here; the CLI path relies on
     * inference.
     */
    readonly driver?: Dialect
}

/**
 * Result of a database connection attempt.
 */
export interface ConnectionResult {
    /** Whether the connection was successful */
    readonly success: boolean
    /** Error message if connection failed */
    readonly error?: string
}

// =============================================================================
// Database Service
// =============================================================================

/**
 * Database service for managing PostgreSQL connections via Drizzle ORM.
 *
 * This service is registered as a singleton in the DI container and provides
 * a managed connection to PostgreSQL with automatic Drizzle ORM setup.
 *
 * @example
 * ```ts
 * // In a controller or service
 * @Controller('/users')
 * class UserController {
 *   constructor(private database: Database) {}
 *
 *   @Get('/')
 *   async list() {
 *     const users = await this.database.db.select().from(usersTable)
 *     return { users }
 *   }
 * }
 * ```
 */
@Service()
export class Database<D extends Dialect = 'postgres'> {
    /**
     * Drizzle ORM database instance, typed by the dialect. Defaults to
     * `PostgresJsDatabase` (dialect `postgres`), so an unparameterised
     * `Database` and every existing `db.select()` call site is unchanged.
     */
    public db!: DialectDatabase<D>

    /** The per-dialect driver factories (overridable via {@link Database.setDriverFactory}). */
    #factories: Record<Dialect, DriverFactory> = { ...defaultDriverFactories }
    /** The configured client's close/probe closures, set at connect time. */
    #close: (() => Promise<void>) | undefined
    #probe: (() => Promise<void>) | undefined
    /** The handle's maintenance capability, when its factory offers one. */
    #maintenance: SchemaMaintenance | undefined
    /**
     * What a `probe()` failure must not carry: the DSN the configured client
     * was built from, and every known form of its password (#425).
     */
    #held: Held = NOTHING_HELD
    #connected = false

    /**
     * Override the driver factory for one dialect — the seam for unit tests
     * (a fake driver, no live DB) and for registering a custom driver.
     *
     * A factory must only **construct** its client: a round trip inside it
     * brings back the boot-time wake-up #420 removed. See
     * {@link DriverFactory}.
     *
     * @param dialect - The dialect to override.
     * @param factory - The factory to use for it.
     */
    setDriverFactory(dialect: Dialect, factory: DriverFactory): void {
        this.#factories[dialect] = factory
    }

    /**
     * Configure the database client for the resolved dialect. **Makes no round
     * trip.**
     *
     * The dialect is resolved by {@link resolveDialect} (`options.driver` >
     * URL scheme > `postgres`); the matching driver + client are loaded on
     * demand and the client is constructed. The clients are lazy, so nothing
     * reaches the database until the first query or an explicit
     * {@link Database.probe}: on a scale-to-zero database, booting an app must
     * not wake (and bill) the compute (#420). The name is kept for API
     * stability — it configures, it does not connect.
     *
     * `success: false` therefore means one of three things only, each with a
     * message that cannot carry the DSN's password (#425):
     *
     * - **The DSN was refused** before any driver saw it, because a driver
     *   could misparse where its password ends. The user and password may
     *   hold only `A-Za-z0-9-._~!$&'()*+,;=:` and `%XX`; every other
     *   character must be percent-encoded — for example `^ | { } [ ] < > "
     *   \`, a backtick, a space, a non-ASCII character, a raw `@`, and a `%`
     *   not followed by two hex digits. A raw `@` in the path or query
     *   string, a control character, and a scheme with no `//` (other than
     *   `file:` and `sqlite:`) are refused too. The message is fixed and
     *   quotes nothing from the DSN.
     * - **The client package is missing.** The message names the package and
     *   the import error, which never holds the DSN — unless the import error
     *   holds the password (`postgres:postgres` names the package), in which
     *   case it is withheld behind a fixed sentence.
     * - **The client could not be built from the DSN.** Its message may quote
     *   the DSN in a rewritten form, so it is withheld: only the error's name
     *   is shown, only when it is identifier-shaped and holds no form of the
     *   password, and as `[unreadable name]` when reading it threw.
     *
     * An unreachable host, bad credentials or a database that is down surface
     * at {@link Database.probe} (and so at `/ready`) or at the first query.
     *
     * @param url - Connection URL / DSN.
     * @param options - Optional dialect + silence.
     * @returns Whether the client was configured, and the safe error if not.
     *
     * @example
     * ```ts
     * const db = container.get<Database>(Database)
     * const result = await db.connect(Deno.env.get('DATABASE_URL')!)
     * if (!result.success) console.error('Failed to configure:', result.error)
     * await db.probe() // the one round trip — only where checking is the job
     * ```
     */
    public async connect(
        url: string,
        options: ConnectionOptions = {},
    ): Promise<ConnectionResult> {
        const dialect = resolveDialect(options.driver, url)
        const inspection = inspectDsn(url)
        if (!inspection.ok) return failed(INVALID_DSN_MESSAGE)
        const held: Held = { dsn: url, passwords: inspection.secrets }

        let handle
        try {
            handle = await this.#factories[dialect](url)
        } catch (error) {
            return failed(configurationFailure(dialect, error, held))
        }

        this.db = handle.db as DialectDatabase<D>
        this.#close = () => handle.close()
        this.#probe = () => handle.probe()
        this.#maintenance = handle.maintenance
        this.#held = held
        this.#connected = true

        if (!options.silent) {
            console.log(`✅ Database configured (${dialect})`)
        }
        return { success: true }
    }

    /**
     * Close the database client. Safe to call when not configured, and safe to
     * call twice; afterwards {@link Database.probe} rejects as not connected.
     *
     * @returns Resolves once the client has closed; immediately when no client
     *   is configured.
     *
     * @example
     * ```ts
     * await db.close()
     * ```
     */
    public async close(): Promise<void> {
        const close = this.#close
        if (!close) return
        this.#close = undefined
        this.#probe = undefined
        this.#maintenance = undefined
        this.#connected = false
        await close()
    }

    /**
     * The configured client's schema-maintenance capability — what
     * `db:fresh` resets and migrates through (#435) — or `undefined` when its
     * driver factory offers none (a custom factory need not).
     *
     * Every failure is re-thrown the way {@link Database.probe} re-throws
     * one: head-only, the exact DSN replaced whole, and the whole message
     * withheld when any known form of the password occurs in it (#425).
     *
     * @returns The redacting capability, or `undefined` when there is none.
     * @throws {Error} `Database is not connected` before `connect()` and after
     *   {@link Database.close}.
     *
     * @example
     * ```ts
     * const maintenance = db.maintenance
     * if (maintenance) await maintenance.query('SELECT 1')
     * ```
     */
    public get maintenance(): SchemaMaintenance | undefined {
        if (!this.#connected) {
            throw new Error('Database is not connected')
        }
        const inner = this.#maintenance
        if (!inner) return undefined
        const held = this.#held
        const redacted = async <T>(run: () => Promise<T>): Promise<T> => {
            try {
                return await run()
            } catch (error) {
                throw new Error(
                    renderFailure(error, held, maintenanceWithheld),
                )
            }
        }
        return {
            query: (sql) => redacted(() => inner.query(sql)),
            execute: (statements) => redacted(() => inner.execute(statements)),
            migrate: (options) => redacted(() => inner.migrate(options)),
        }
    }

    /**
     * Verify connectivity by issuing a lightweight `SELECT 1` through the
     * configured driver. **The only method that makes a round trip** — call it
     * where checking is the job (`/ready`, `db:check`, an `@OnBoot` hook that
     * wants boot to fail when the database is down), never on a hot path.
     *
     * A driver failure is re-thrown as a new `Error` carrying a redacted,
     * head-only render: the exact DSN replaced whole, then the shared
     * pattern; no cause chain, and none of the original error object's
     * properties. Driver text is never edited around the password: when any
     * known form of it occurs in the message or the name, the message is
     * withheld whole behind a fixed sentence that shows only a vetted name.
     *
     * @returns Resolves when the probe succeeds.
     * @throws {Error} `Database is not connected` when no client is configured
     *   or after {@link Database.close}; otherwise the redacted driver failure.
     *
     * @example
     * ```ts
     * await db.probe()
     * ```
     */
    public async probe(): Promise<void> {
        const probe = this.#probe
        if (!probe) {
            throw new Error('Database is not connected')
        }
        try {
            await probe()
        } catch (error) {
            throw new Error(renderFailure(error, this.#held, probeWithheld))
        }
    }

    /**
     * Check whether a client is configured and not closed.
     *
     * Since #420 this says nothing about reachability, because
     * {@link Database.connect} makes no round trip. Use {@link Database.probe}
     * to know whether the database answers.
     *
     * @returns True between a successful `connect()` and `close()`.
     */
    public isConnected(): boolean {
        return this.#connected
    }
}

// =============================================================================
// Failure rendering
// =============================================================================

/**
 * What a failure render holds about the configured DSN (#425).
 *
 * The two are treated oppositely. The exact DSN is replaced whole: it is long
 * and unique, so replacing it tells a reader nothing. A password is never
 * replaced: replacing by value turns the replacement into a detector — the
 * password `postgres` masks `user "postgres"`, `5432` masks a port — so text
 * holding one is withheld whole instead.
 */
interface Held {
    /** The exact DSN, replaced whole by {@link DSN_MARKER}. Empty: none. */
    readonly dsn: string
    /** Every known form of the password, none empty. */
    readonly passwords: readonly string[]
}

/** Nothing held: before any `connect()`. */
const NOTHING_HELD: Held = { dsn: '', passwords: [] }

/** What replaces the exact DSN in driver text. */
const DSN_MARKER = '<dsn redacted>'

/** The name shown when reading an error's name threw. */
const UNREADABLE_NAME = '[unreadable name]'

/**
 * The error name a failure may show: a plain identifier, so a name an
 * application assigned cannot smuggle text in. It also rejects `[`, space and
 * `]`, so no name can forge {@link UNREADABLE_NAME}.
 */
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]{0,63}$/

/**
 * Log a `connect()` failure and return it as the result.
 *
 * Not a silent path: the failure is logged at ERROR and returned as an
 * explicit `success: false`, whatever `silent` says (#427 owns that option).
 *
 * @param message - A message already known to carry no part of the password.
 * @returns The failed result.
 */
function failed(message: string): ConnectionResult {
    console.error('❌ Database connection failed:', message)
    return { success: false, error: message }
}

/**
 * What a factory failure is: a missing client package, or anything else with
 * the name it may show.
 */
type Classified =
    | { readonly kind: 'missing'; readonly error: ClientUnavailableError }
    | { readonly kind: 'other'; readonly name: string | undefined }

/**
 * Classify a factory failure, reading nothing from it outside one guard.
 *
 * `instanceof` walks the prototype chain, and a Proxy can throw there; a
 * `name` getter can throw too. Either would make `connect()` reject instead of
 * returning `success: false`. So the checks, the read and the identifier test
 * all run under one `try`, whose catch answers {@link UNREADABLE_NAME}. That
 * marker goes into the one failure line, which is always logged at ERROR and
 * returned — the failure is reported, not swallowed.
 *
 * @param error - Whatever a factory threw.
 * @param passwords - Every known form of the password.
 * @returns `missing` for a {@link ClientUnavailableError}; otherwise `other`
 *   with the name to show, or `undefined` when there is none to show.
 */
function classify(error: unknown, passwords: readonly string[]): Classified {
    try {
        if (error instanceof ClientUnavailableError) {
            return { kind: 'missing', error }
        }
        const name = error instanceof Error ? error.name : undefined
        return { kind: 'other', name: shownName(name, passwords) }
    } catch {
        return { kind: 'other', name: UNREADABLE_NAME }
    }
}

/**
 * The name a failure may show: identifier-shaped, and holding no form of the
 * password. A name is driver text like the message, so it is shown verbatim or
 * dropped — never edited.
 *
 * @param name - The error's `name`, as read.
 * @param passwords - Every known form of the password.
 * @returns The name, or `undefined` when it may not be shown.
 */
function shownName(
    name: unknown,
    passwords: readonly string[],
): string | undefined {
    if (typeof name !== 'string' || !IDENTIFIER.test(name)) return undefined
    return holdsPassword(name, passwords) ? undefined : name
}

/**
 * Whether a text holds any known form of the password.
 *
 * @param text - Driver text: a name, or a piece of a message.
 * @param passwords - Every known form of the password, none empty.
 * @returns True when any of them occurs in `text`.
 */
function holdsPassword(text: string, passwords: readonly string[]): boolean {
    return passwords.some((password) => text.includes(password))
}

/**
 * Word a failure of the driver factory.
 *
 * A missing client package is named, with the import error: an import error
 * names a module and never holds the DSN — but it may hold a password that is
 * also a package name (`postgres`), so it takes the same check as a probe
 * failure. Anything else — the client constructor rejecting the DSN, or any
 * error from a custom factory — may quote the DSN in a form the driver
 * rewrote, which no exact match can find. So its message, code and cause are
 * withheld, and only its name is shown (#425).
 *
 * @param dialect - The dialect whose factory failed.
 * @param error - Whatever the factory threw.
 * @param held - The DSN and the password forms to check an import error for.
 * @returns The message for the log and the result.
 */
function configurationFailure(
    dialect: Dialect,
    error: unknown,
    held: Held,
): string {
    const classified = classify(error, held.passwords)
    if (classified.kind === 'missing') {
        const head = classified.error.message
        return renderFailure(
            classified.error.cause,
            held,
            () =>
                `${head}; the import error is withheld because it contains ` +
                'the database password',
            (text) => `${head}: ${text}`,
        )
    }
    return `The '${dialect}' driver could not be configured${
        parenthesised(classified.name)
    }; its message is withheld because it may contain the DSN`
}

/**
 * The fixed sentence a probe failure holding the password renders as.
 *
 * @param name - The vetted error name to show, if any.
 * @returns The sentence; it quotes no driver text but that name.
 */
function probeWithheld(name: string | undefined): string {
    return `The database probe failed${
        parenthesised(name)
    }; its message is withheld because it contains the database password`
}

/**
 * The fixed sentence a maintenance failure holding the password renders as.
 *
 * @param name - The vetted error name to show, if any.
 * @returns The sentence; it quotes no driver text but that name.
 */
function maintenanceWithheld(name: string | undefined): string {
    return `The schema maintenance statement failed${
        parenthesised(name)
    }; its message is withheld because it contains the database password`
}

/**
 * ` (name)`, or nothing when there is no name to show.
 *
 * @param name - A vetted error name.
 * @returns The fragment that follows a sentence's subject.
 */
function parenthesised(name: string | undefined): string {
    return name === undefined ? '' : ` (${name})`
}

/**
 * Render a driver failure against what is held: shown verbatim, or withheld
 * whole — never edited around the password.
 *
 * When a DSN is held:
 *
 * 1. The name and message are read under one guard.
 * 2. The message is split on the exact DSN.
 * 3. If any known form of the password occurs in the name or in any piece,
 *    the fixed `withheld` sentence is returned.
 * 4. Otherwise the pieces are joined with {@link DSN_MARKER} and rendered by
 *    `renderError`, whose pattern is the net for a DSN nobody holds.
 *
 * The check runs on the RAW text, before the pattern and before truncation,
 * so neither can hide an occurrence from it. Fragments of a password are never
 * looked for: since #425 a DSN whose password a driver could split is refused
 * at `connect()`, so the driver holds the same password this does. One bit
 * remains — "withheld" says the password occurs in the text — and that is the
 * price of never saying where.
 *
 * When no DSN is held there is no password either, and the failure goes to
 * `renderError` untouched. `followCause: false` then alone keeps it
 * head-only: this string is RETURNED as `ConnectionResult.error` or re-thrown
 * by `probe()`, not only logged, so an application may put it somewhere a log
 * line would never go. That is the same distinction `@lockness/telemetry`
 * draws for a span.
 *
 * @param raw - The driver failure.
 * @param held - The DSN to replace and the password forms to check for.
 * @param withheld - The fixed sentence, given the name that may be shown.
 * @param shown - Frames the rendered text when it is shown; identity by
 *   default.
 * @returns The redacted, head-only render, or the withheld sentence.
 */
function renderFailure(
    raw: unknown,
    held: Held,
    withheld: (name: string | undefined) => string,
    shown: (text: string) => string = (text) => text,
): string {
    // No DSN held, so no password either: nothing to check, and the failure
    // goes to `renderError` untouched — `followCause: false` alone keeps it
    // head-only.
    let error = raw
    if (held.dsn !== '') {
        // Read once and rebuilt, so a getter cannot answer the check with one
        // text and the render with another.
        const head = readHead(raw)
        if (head === undefined) return shown(UNRENDERABLE)
        const pieces = head.message.split(held.dsn)
        const holds = (text: string): boolean =>
            holdsPassword(text, held.passwords)
        if (
            (head.name !== undefined && holds(head.name)) || pieces.some(holds)
        ) {
            return withheld(shownName(head.name, held.passwords))
        }
        const message = pieces.join(DSN_MARKER)
        error = head.name === undefined
            ? message
            : Object.assign(new Error(message), { name: head.name })
    }
    return shown(renderError(error, { followCause: false }))
}

/** A thrown value's name and message, read once. */
interface Head {
    /** The name of an `Error`; `undefined` for any other thrown value. */
    readonly name: string | undefined
    /** The message of an `Error`, or the string form of any other value. */
    readonly message: string
}

/** What a failure whose name or message cannot be read renders as. */
const UNRENDERABLE = '[unrenderable error]'

/**
 * Read a thrown value's name and message under one guard.
 *
 * Reading an arbitrary thrown value can throw: a hostile `message` getter, a
 * Proxy, a `toString` that throws. `renderError` answers that with a sentinel
 * rather than a throw, and so does this: the caller renders
 * {@link UNRENDERABLE}, which reaches the result and the log, so the failure
 * is reported, not swallowed.
 *
 * @param raw - Whatever was thrown.
 * @returns The head, or `undefined` when reading it threw.
 */
function readHead(raw: unknown): Head | undefined {
    try {
        if (raw instanceof Error) {
            // Same coercions as `renderError`: an application subclass can
            // assign a non-string `name` or `message`.
            return {
                name: typeof raw.name === 'string' ? raw.name : 'Error',
                message: String(raw.message),
            }
        }
        return { name: undefined, message: String(raw) }
    } catch {
        return undefined
    }
}
