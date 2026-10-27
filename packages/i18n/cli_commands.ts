/**
 * @fileoverview CLI command registration for `@lockness/i18n` — `make:lang`
 * and `i18n:extract`.
 *
 * `registerI18nCommands(cli)` follows the package-command pattern
 * (`loadPackageCommands` discovers it via `lockness.packages`) with a local
 * stub reader + a **structural `Cli` interface** — no `@lockness/cli` import.
 * The `make:lang` locale argument is validated against a strict shape and its
 * output path verified contained within `resources/lang/` (no traversal, S2).
 *
 * @module @lockness/i18n/cli_commands
 */

import { dirname, fromFileUrl, isAbsolute, join, relative } from '@std/path'
import { walkKeys } from './extract.ts'

/** A CLI command handler. */
type CommandHandler = (args: string[]) => void | Promise<void>

/** The minimal CLI surface used here — structural, so no `@lockness/cli` import. */
export interface Cli {
    /**
     * Register a named command.
     *
     * @param name - The command name.
     * @param handler - The handler.
     * @param description - A one-line description.
     */
    register(name: string, handler: CommandHandler, description?: string): void
}

/**
 * A failed i18n command. `@lockness/cli` recognises a failure by its shape — an
 * integer `exitCode` — so i18n raises one without importing the CLI: the
 * dispatcher prints the message once and exits with this status. Deliberately
 * not exported (#436, D1).
 */
class I18nCommandError extends Error {
    /** The process exit status the dispatcher maps this failure to. */
    readonly exitCode = 1
    override readonly name = 'I18nCommandError'
}

/** Where catalogs are scaffolded. */
export const LANG_DIR = './resources/lang'
/** A strict locale-argument shape (security S2). */
const LOCALE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/

/** Resolved stubs directory (local or JSR). */
const STUBS_PATH: string = import.meta.url.startsWith('file://')
    ? join(dirname(fromFileUrl(import.meta.url)), 'stubs')
    : new URL('./stubs', import.meta.url).href

/** Whether `target` resolves inside `root` (no traversal / escape). */
export function isContained(root: string, target: string): boolean {
    const rel = relative(root, target)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** Read a stub and apply `{{ key }}` replacements. */
async function processStub(
    stubName: string,
    replacements: Record<string, string>,
): Promise<string> {
    const stubPath = join(STUBS_PATH, `${stubName}.stub`)
    let content = await Deno.readTextFile(stubPath)
    for (const [key, value] of Object.entries(replacements)) {
        content = content.replaceAll(`{{${key}}}`, value)
    }
    return content
}

/**
 * `make:lang <locale>` — scaffold a catalog module for a locale.
 *
 * Internal: reached through `registerI18nCommands`, not the package barrel.
 *
 * @param args - CLI args; the first non-flag token is the locale.
 * @returns The path written.
 * @throws {I18nCommandError} When the locale is missing or malformed, or its
 *   path would leave {@link LANG_DIR}.
 */
export async function handleMakeLang(args: string[]): Promise<string> {
    const locale = args.find((a) => !a.startsWith('-'))?.toLowerCase()
    if (!locale) {
        throw new I18nCommandError('Please provide a locale (e.g. fr-fr)')
    }
    if (!LOCALE_RE.test(locale)) {
        throw new I18nCommandError(
            `Invalid locale "${locale}" — use a BCP-47-like tag (e.g. en, fr-fr)`,
        )
    }
    const fileName = `${locale.replaceAll('-', '_')}.ts`
    const filePath = join(LANG_DIR, fileName)
    // Defence in depth: the shape allowlist already forbids separators, but
    // verify containment against the resolved lang dir before writing (S2).
    if (!isContained(LANG_DIR, filePath)) {
        throw new I18nCommandError(`Refusing to write outside ${LANG_DIR}`)
    }

    const content = await processStub('lang', { locale })
    await Deno.mkdir(dirname(filePath), { recursive: true })
    await Deno.writeTextFile(filePath, content)
    console.log(`✅ Catalog created at ${filePath}`)
    return filePath
}

/**
 * `i18n:extract [dir]` — report translation keys used in source.
 *
 * @param args - CLI args; the first non-flag token is the source dir (default `./app`).
 */
export async function handleExtract(args: string[]): Promise<void> {
    const dir = args.find((a) => !a.startsWith('-')) ?? './app'
    const used = await walkKeys(dir)
    console.log(`🔎 ${used.size} translation key(s) used under ${dir}:`)
    for (const key of [...used].sort()) console.log(`   ${key}`)
    // A catalog diff (missing/unused) is available programmatically via the
    // exported `diffKeys(used, catalogKeys)`; the command reports the used set.
}

/**
 * Register the i18n CLI commands.
 *
 * @param cli - The CLI instance to register on.
 */
export function registerI18nCommands(cli: Cli): void {
    cli.register(
        'make:lang',
        // The handler returns the path for tests; the CLI discards it.
        async (args) => {
            await handleMakeLang(args)
        },
        'Scaffold a translation catalog for a locale',
    )
    cli.register(
        'i18n:extract',
        handleExtract,
        'Report translation keys used in source',
    )
}
