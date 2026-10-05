/**
 * @fileoverview How a name or a value is written into SQL text, per dialect:
 * the one owner of the quoting grammar the schema commands share.
 *
 * `db:fresh` (`reset.ts`) and `db:status` (`migration_status.ts`) both build
 * statements around names read from `drizzle.config.ts` or from the
 * catalogue. They use the same rule, so a fix to it has to reach both: that
 * is why it lives here and not beside either command's policy. Internal: no
 * `exports` entry lists this module.
 *
 * @module @lockness/drizzle/sql_text
 * @internal
 * @since 0.5.0
 */

/**
 * A double-quoted identifier (sqlite, postgres).
 *
 * @param name - The identifier.
 * @returns It, quoted, with `"` doubled.
 *
 * @example
 * ```ts
 * quote('a"b') // '"a""b"'
 * ```
 */
export function quote(name: string): string {
    return `"${name.replaceAll('"', '""')}"`
}

/**
 * A backtick-quoted identifier (MySQL).
 *
 * @param name - The identifier.
 * @returns It, quoted, with `` ` `` doubled.
 *
 * @example
 * ```ts
 * backtick('a`b') // '`a``b`'
 * ```
 */
export function backtick(name: string): string {
    return `\`${name.replaceAll('`', '``')}\``
}

/**
 * A standard SQL string literal (postgres, `standard_conforming_strings`).
 * Not for MySQL: its default `sql_mode` reads a backslash in a literal as an
 * escape.
 *
 * @param value - The text.
 * @returns It, single-quoted, with `'` doubled.
 *
 * @example
 * ```ts
 * literal("o'brien") // "'o''brien'"
 * ```
 */
export function literal(value: string): string {
    return `'${value.replaceAll("'", "''")}'`
}
